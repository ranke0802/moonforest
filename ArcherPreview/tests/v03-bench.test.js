import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,verdict} from '../src/v03/bench.js';
import {disabledComparisonFeatures} from '../src/performance-comparison.js';
test('recordings identify opted-out feature comparisons without saving unrelated URL fields',()=>{
 assert.deepEqual(disabledComparisonFeatures(),[]);
 assert.deepEqual(disabledComparisonFeatures('?game=moonforest-0.3.html&pets=0&chapterCamps=1&vista=0&unrelated=0'),['pets','vista']);
 assert.deepEqual(disabledComparisonFeatures('?itemIcons=0&leaves=0&chapterCamps=0&riding=0'),['riding','chapterCamps','leaves','itemIcons']);
});
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
