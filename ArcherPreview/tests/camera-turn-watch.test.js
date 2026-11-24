import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraTurnWatch} from '../src/camera-turn-watch.js';
import {LongFrameRecording} from '../src/long-frame-recording.js';

// Feed one frame every 16.7 ms; yawAt(ms) gives the camera yaw.
function run(watch, ms, yawAt, frameMs = () => 16.7, map = 'great-plains', wakesAt = () => 0) {
 for (let t = 0; t <= ms; t += 16.7) watch.frame(t, yawAt(t), frameMs(t), frameMs(t) / 2, map, wakesAt(t));
}

test('a 180 degree swing within 0.3 s is one turn with the worst frame of the next half second', () => {
 const watch = new CameraTurnWatch();
 const yawAt = t => t < 1000 ? 0 : t < 1300 ? Math.PI * (t - 1000) / 300 : Math.PI;
 const frameMs = t => t > 1350 && t < 1360 ? 48 : 16.7;
 run(watch, 3000, yawAt, frameMs, 'great-plains', t => t > 1400 && t < 1410 ? 2 : 0);
 assert.equal(watch.turns.length, 1);
 const [turn] = watch.turns;
 assert.equal(turn.map, 'great-plains');
 assert.ok(Math.abs(turn.degrees - 180) <= 2, String(turn.degrees));
 assert.ok(turn.atSecond >= 1.1 && turn.atSecond <= 1.3, String(turn.atSecond));
 assert.equal(turn.worstFrameMs, 48);
 assert.equal(turn.framesOver33, 1);
 assert.equal(turn.wakes, 2);
 assert.ok(turn.frames >= 28 && turn.frames <= 32, String(turn.frames));
});

test('slow orbiting, small jitter and wrap-around are not turns', () => {
 // 90 degrees a second: never 120 within 0.4 s.
 const orbit = new CameraTurnWatch();
 run(orbit, 4000, t => { const yaw = Math.PI / 2 * t / 1000; return Math.atan2(Math.sin(yaw), Math.cos(yaw)); });
 assert.equal(orbit.turns.length, 0);
 // Jitter on the -pi/pi seam.
 const jitter = new CameraTurnWatch();
 run(jitter, 2000, t => { const yaw = Math.PI - .02 + (Math.floor(t / 16.7) % 2) * .04; return Math.atan2(Math.sin(yaw), Math.cos(yaw)); });
 assert.equal(jitter.turns.length, 0);
});

test('a turn across the -pi/pi seam is measured by the short way round', () => {
 const watch = new CameraTurnWatch();
 run(watch, 2000, t => { const yaw = t < 500 ? 2.5 : t < 700 ? 2.5 + 2.6 * (t - 500) / 200 : 5.1; return Math.atan2(Math.sin(yaw), Math.cos(yaw)); });
 assert.equal(watch.turns.length, 1);
 assert.ok(Math.abs(watch.turns[0].degrees - 149) <= 3, String(watch.turns[0].degrees));
});

test('the long recording keeps camera turns in its snapshot and across a page reload', () => {
 let now = 1000, yaw = 0;
 const recording = new LongFrameRecording({now: () => now});
 recording.probe = () => ({map: 'village'}); recording.cameraYaw = () => yaw;
 recording.start({});
 const frame = (interval = 16.7) => { now += interval; recording.record({startMs: now, intervalMs: interval, workMs: 5, targetFps: 60, metrics: null, sections: {}, context: () => ({})}); };
 for (let i = 0; i < 30; i++) frame();
 for (let i = 0; i < 12; i++) { yaw += Math.PI / 12; frame(); }
 frame(40);
 for (let i = 0; i < 40; i++) frame();
 const snapshot = recording.snapshot();
 assert.equal(snapshot.cameraTurns.length, 1);
 assert.equal(snapshot.cameraTurns[0].map, 'village');
 assert.equal(snapshot.cameraTurns[0].worstFrameMs, 40);
 assert.match(snapshot.cameraTurnRule, /120 deg/);
 const saved = JSON.parse(JSON.stringify(recording.exportState('page-reload')));
 const next = new LongFrameRecording({now: () => now});
 assert.equal(next.importState(saved), true);
 assert.equal(next.snapshot().cameraTurns.length, 1);
 // Without a yaw source nothing is recorded and nothing throws.
 const plain = new LongFrameRecording({now: () => now}); plain.start({});
 plain.record({startMs: now + 1, intervalMs: 16.7, workMs: 4, targetFps: 60, metrics: null, sections: {}, context: () => ({})});
 assert.deepEqual(plain.snapshot().cameraTurns, []);
});
