import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRecord, formatComparison} from '../scripts/compare-performance-records.mjs';

function second(n, map, {frames = 60, scene = 9, active = 2, draw = 5, rtt = 1, boss = .1, worst = 20} = {}) {
 return {second: n, frames, frameTotalMs: 1000, workTotalMs: frames * 10, maxIntervalMs: worst, maxWorkMs: 12,
  sum: {sceneCallMs: scene * frames, bossUpdateMs: boss * frames}, max: {},
  render: {sceneMs: scene * frames, activeMeshesMs: active * frames, drawSubmissionMs: draw * frames, renderTargetsMs: rtt * frames, drawCalls: 100 * frames, submittedTriangles: 0},
  renderMax: {sceneMs: scene}, probe: n % 10 === 0 ? {map} : undefined};
}
function record({map = 'great-plains', boss = .1, turns} = {}) {
 const seconds = [];
 for (let i = 0; i < 20; i++) seconds.push(second(i, i < 10 ? 'village' : map, {boss: i < 10 ? 0 : boss}));
 seconds.push(second(20, map, {frames: 12}));
 return {startedAt: 'x', startMs: 0, metadata: {build: ['main.js'], userAgent: 'S23'}, seconds,
  detailFrames: [{startMs: 15500, render: {drawCpu: {groups: {bufferUpdate: {calls: 130, ms: .6}, candidateSelection: {calls: 1, ms: .4}}}}}],
  events: [], critical: [{startMs: 12100}], ...(turns ? {cameraTurns: turns} : {})};
}

test('seconds inherit the last probed map and short seconds do not drive the medians', () => {
 const s = summarizeRecord(record());
 assert.deepEqual(Object.keys(s.maps).sort(), ['great-plains', 'village']);
 const plains = s.maps['great-plains'];
 assert.equal(plains.seconds, 11);
 assert.equal(plains.fullSeconds, 10);
 assert.equal(plains.fpsMedian, 60);
 assert.equal(plains.sceneRestMs, 1);
 assert.equal(plains.bossUpdateMs, .1);
 assert.equal(plains.bufferUpdateCalls, 130);
 assert.equal(plains.candidateSelectionMs, .4);
 assert.equal(plains.stalls200, 1);
 assert.equal(plains.turns, null, 'an old record has no turn data, not zero turns');
});

test('the comparison lists both records per map with the difference', () => {
 const before = summarizeRecord(record({boss: 1.6, turns: [{map: 'great-plains', worstFrameMs: 41, framesOver33: 2}]}));
 const after = summarizeRecord(record({boss: .9, turns: [{map: 'great-plains', worstFrameMs: 22, framesOver33: 0}, {map: 'great-plains', worstFrameMs: 30, framesOver33: 0, partial: true}]}));
 assert.equal(after.maps['great-plains'].turns, 1, 'a partial window at the end is not counted');
 const text = formatComparison(before, after, {map: 'great-plains'});
 assert.match(text, /## great-plains/);
 assert.doesNotMatch(text, /## village/);
 assert.match(text, /\| 몬스터 갱신 ms \| 1\.60 \| 0\.90 \| -0\.70 \|/);
 assert.match(text, /\| 회전 직후 최악 프레임 ms \(최대\) \| 41\.0 \| 22\.0 \| -19\.0 \|/);
});
