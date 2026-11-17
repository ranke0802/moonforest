import test from 'node:test';
import assert from 'node:assert/strict';
import {lodCoverageFor,VILLAGE_LOD_COVERAGE,villageLodTier} from '../src/village-lod.js';

test('0.3 keeps its tier thresholds; 0.4 holds the sharper tiers farther out',()=>{
 assert.deepEqual(lodCoverageFor('/moonforest-0.3.html'),{mid:.22,far:.035});
 assert.deepEqual(lodCoverageFor('/x/ArcherPreviewSite/moonforest-0.4.html'),{mid:.08,far:.006});
 assert.deepEqual(lodCoverageFor(undefined),{mid:.22,far:.035});
 // Outside a browser the module uses the 0.3 values.
 assert.deepEqual(VILLAGE_LOD_COVERAGE,{mid:.22,far:.035});assert.deepEqual([1,.1,.01].map(villageLodTier),[0,1,2]);
});
test('0.4 thresholds stay above the derived far tiers',()=>{
 const v4=lodCoverageFor('/moonforest-0.4.html');
 assert.ok(v4.mid>v4.far);
 // src/v04/detail-lod.js switches its first derived tier at .0009 of the screen.
 assert.ok(v4.far>.0009,'authored far tier must switch before a derived tier');
});
