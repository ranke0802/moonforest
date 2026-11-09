import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mourningCaveClearance} from '../src/mourning-cave-clearance.js';
import {MOURNING_CAVE_CLEARANCE_DATA as data} from '../src/mourning-cave-clearance-data.js';
import {ELENA_HOME,MOURNING_SIZE_SCALE} from '../src/elena-spec.js';
import {assertOriginalInputFingerprint} from './helpers/mobile-profile-contract.js';
test('full-pose mask fingerprints retain approved collision geometry, layout and animator across render-only budgets and mobile color profiles',()=>{
 for(const [path,expected]of Object.entries(data.hashes))assertOriginalInputFingerprint(path,readFileSync(new URL(path,import.meta.url),'utf8'),expected);
 for(const path of ['../src/mourning-death-knee.js','../src/mourning-death-knee-data.js','../src/mourning-death-depth.js','../src/mourning-death-depth-data.js','../src/mourning-elena-encounter.js'])assert.ok(data.hashes[path],`actual prepared correction must invalidate the bake: ${path}`);
 assert.equal(data.sizeScale,MOURNING_SIZE_SCALE);assert.ok(data.poseSamples>=541);assert.ok(Math.max(...data.bands.map(b=>b.radius))>4.5);
});

test('manual summon source revision preserves every nonplacement encounter method and the existing full-pose grid',()=>{
 const revision=data.sourceRevision;assert.equal(revision.revision,'manual-elena-summon-placement-v1');assert.equal(revision.path,'../src/mourning-elena-encounter.js');assert.equal(revision.previousCommit,'89c2eed');
 const sha=text=>createHash('sha256').update(text).digest('hex'),source=readFileSync(new URL(revision.path,import.meta.url),'utf8').replace(/\r\n?/g,'\n'),starts=[...source.matchAll(/^  (?:(?:async|get) )?([A-Za-z]\w*)\(/gm)],methods=Object.fromEntries(starts.map((match,i)=>[match[1],{start:match.index,end:starts[i+1]?.index??source.length,text:source.slice(match.index,starts[i+1]?.index??source.length)}]));
 const unchanged=source.slice(0,methods.summon.start)+source.slice(methods.summon.end);
 assert.equal(revision.beforeSha256,'38a212819d23f106011127220013a8c1ed3ee1eee3e461dc1264a0cfd4c1503c');
 assert.equal(revision.unchangedNonSummonSha256,'b1467a131a9952b989052fe732aa8bc9d88b29a9949f9ecfe075da2bfc598585');assert.equal(sha(unchanged),revision.unchangedNonSummonSha256,'Only summon() placement/lifecycle may differ from the historical bake source');
 assert.equal(sha(source),revision.afterSha256);assert.equal(data.hashes[revision.path],revision.afterSha256);
 for(const [name,expected]of Object.entries(revision.unchangedClassMethods))assert.equal(sha(methods[name].text),expected,name+' pose/preparation method changed');
 const payload={step:data.step,minX:data.minX,minZ:data.minZ,width:data.width,height:data.height,ground:data.ground,groundTolerance:data.groundTolerance,margin:data.margin,sizeScale:data.sizeScale,bands:data.bands,runs:data.runs};
 assert.equal(revision.cellPayloadSha256,'e5f982e62688dbdefd75c1d6709eda228bfcafe5dd48c1b3139073e57fd3eb66');assert.equal(sha(JSON.stringify(payload)),revision.cellPayloadSha256,'Manual summoning must not rebake or relax the full-pose cells');
});
test('local death correction preserves the delivered living combat safety region',()=>{
 // The new prepared pose envelope is unioned with the previous conservative
 // bands. Keep the complete cell union, not only a few accepted home samples.
 assert.equal(data.runs.filter((_,i)=>i%2).reduce((a,b)=>a+b,0),2590);
 assert.equal(createHash('sha256').update(JSON.stringify(data.runs)).digest('hex'),'7d3ff2e93a8fd1e215c7eae8665f593b0e8a562d2eb9d46770c59e0879a2698f');
});
test('full-body safety keeps the relocated home and a complete 6.3m charge corridor',()=>{
 assert.ok(mourningCaveClearance(ELENA_HOME.x,ELENA_HOME.z)>.08);
 for(let x=25.5;x<=31.8;x+=.025)assert.ok(mourningCaveClearance(x,-24.125)>.08,`${x}, -24.125`);
 assert.ok(mourningCaveClearance(29,-35)<0,'altar must reject the whole character');
 assert.ok(mourningCaveClearance(29,-16)<0,'southern wall/cliff must reject the whole character');
 assert.ok(mourningCaveClearance(0,0)<0);assert.ok(mourningCaveClearance(NaN,0)<0);
});
test('positive clearance never escapes the conservatively baked cell union',()=>{
 const safe=new Uint8Array(data.width*data.height);for(let i=0;i<data.runs.length;i+=2)safe.fill(1,data.runs[i],data.runs[i]+data.runs[i+1]);let positive=0;
 for(let z=-35;z<-17;z+=.137)for(let x=18;x<40;x+=.131){const c=mourningCaveClearance(x,z);assert.ok(Number.isFinite(c));if(c>0){positive++;const col=Math.floor((x-data.minX)/data.step),row=Math.floor((z-data.minZ)/data.step);assert.equal(safe[row*data.width+col],1,`${x},${z}`);}}
 assert.ok(positive>1500);
});
