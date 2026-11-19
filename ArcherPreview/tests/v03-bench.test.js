import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,verdict} from '../src/v03/bench.js';
test('bench summary reports fps, 1% low and stalls',()=>{
 const r=summarize([...Array(99).fill(16.7),200]);
 assert.equal(r.frames,100);assert.equal(r.stallsOver100ms,1);assert.equal(r.fps1Low,5);assert.ok(r.fpsAvg>40&&r.fpsAvg<60);assert.equal(r.frameMsMedian,16.7);
});
test('resolution sweep tells a GPU limit from a CPU limit',()=>{
 assert.equal(verdict([{scale:1,frameMsMedian:22},{scale:1.4,frameMsMedian:18},{scale:2,frameMsMedian:15}]),'gpu');
 assert.equal(verdict([{scale:1,frameMsMedian:21},{scale:1.4,frameMsMedian:20.5},{scale:2,frameMsMedian:20}]),'cpu');
 assert.equal(verdict([]),'unknown');
 assert.equal(verdict([{scale:1,frameMsMedian:16.7},{scale:2,frameMsMedian:16.6}]),'none');
});
