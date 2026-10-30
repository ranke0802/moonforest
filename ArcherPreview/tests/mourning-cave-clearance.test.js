import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mourningCaveClearance} from '../src/mourning-cave-clearance.js';
import {MOURNING_CAVE_CLEARANCE_DATA as data} from '../src/mourning-cave-clearance-data.js';
import {ELENA_HOME,MOURNING_SIZE_SCALE} from '../src/elena-spec.js';
test('full-pose mask fingerprints match the delivered geometry, layout and animator',()=>{
 for(const [path,expected]of Object.entries(data.hashes)){const actual=createHash('sha256').update(readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n?/g,'\n')).digest('hex');assert.equal(actual,expected,path);}
 assert.equal(data.sizeScale,MOURNING_SIZE_SCALE);assert.ok(data.poseSamples>=200);assert.ok(Math.max(...data.bands.map(b=>b.radius))>5.8);
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
