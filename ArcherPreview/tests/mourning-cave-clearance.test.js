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
