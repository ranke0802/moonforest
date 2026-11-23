import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {feralLiveClipsText,WOLF_V02_FERAL_LIVE_NAMES} from '../scripts/wolf-v02-live-clips.mjs';
import {WOLF_V02_ACTIVE_CLIPS} from '../src/wolf-v02-authored-clips.js';
import {WOLF_V02_FERAL_CLIPS} from '../src/wolf-v02-authored-history.js';
import predator from '../src/wolf-v02-predator-clips.json' with {type:'json'};
import combatR13 from '../src/wolf-v02-combat-r13-clips.json' with {type:'json'};
import momentumR14 from '../src/wolf-v02-momentum-r14-clips.json' with {type:'json'};

const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');

test('the shipped R10 file is exactly the live subset of the preserved source file',()=>{
 assert.equal(read('wolf-v02-feral-live-clips.json'),feralLiveClipsText(read('wolf-v02-feral-clips.json')),'regenerate with node scripts/wolf-v02-live-clips.mjs');
 const source=JSON.parse(read('wolf-v02-feral-clips.json'));assert.equal(source.clips.length,4,'the review source keeps all four R10 clips');
 assert.equal(WOLF_V02_FERAL_CLIPS.length,4);
});

test('the game plays the same clips, in the same order, with byte-identical keys as before the split',()=>{
 const source=JSON.parse(read('wolf-v02-feral-clips.json'));
 // The selection the game used until 2026-11-23 (filter over the full R10 file).
 const before=[...source.clips.filter(c=>c.name==='Wolf_Orbit_Step_V02'||c.name==='Wolf_Orbit_Step_Left_V02'),...predator.clips,...combatR13.clips,...momentumR14.clips];
 assert.deepEqual(WOLF_V02_ACTIVE_CLIPS.map(c=>c.name),before.map(c=>c.name));
 assert.equal(JSON.stringify(WOLF_V02_ACTIVE_CLIPS),JSON.stringify(before));
 assert.deepEqual([...WOLF_V02_FERAL_LIVE_NAMES].sort(),source.clips.filter(c=>WOLF_V02_FERAL_LIVE_NAMES.includes(c.name)).map(c=>c.name).sort());
});

test('no game module imports the full R10 file; only the review module does',()=>{
 assert.doesNotMatch(read('wolf-v02-authored-clips.js'),/wolf-v02-feral-clips\.json/);
 assert.match(read('wolf-v02-authored-history.js'),/^\/\/ Node\/offline review exports\. Never import this module from game runtime\./);
 assert.ok(read('wolf-v02-feral-live-clips.json').length<read('wolf-v02-feral-clips.json').length*.6);
});
