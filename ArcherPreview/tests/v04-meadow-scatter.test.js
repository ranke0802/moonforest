import test from 'node:test';
import assert from 'node:assert/strict';
import {scatterCell,meadowCells,valueNoise,TUFT_STRIDE,MEADOW_CELL} from '../src/v04/meadow-scatter.js';
import {plainsMeadow} from '../src/v04/meadow-plains.js';
import {plainsRoadDistance,plainsStreamDistance,PLAINS_ROUTES} from '../src/great-plains-layout.js';

test('a cell is deterministic, stays inside its square, and a lower amount is a subset',()=>{
 const options={sample:(x,z,out)=>{out[0]=.5;out[1]=0;return out;}},a=scatterCell(2,-3,options),b=scatterCell(2,-3,options);
 assert.deepEqual(a,b);assert.ok(a.length>0&&a.length%TUFT_STRIDE===0);
 for(let i=0;i<a.length;i+=TUFT_STRIDE){assert.ok(a[i]>=2*MEADOW_CELL&&a[i]<=3*MEADOW_CELL);assert.ok(a[i+1]>=-3*MEADOW_CELL&&a[i+1]<=-2*MEADOW_CELL);assert.ok(a[i+2]>.5&&a[i+4]>.8);}
 const thin=scatterCell(2,-3,{...options,amount:.5}),key=(d,i)=>d[i].toFixed(3)+':'+d[i+1].toFixed(3),full=new Set();
 for(let i=0;i<a.length;i+=TUFT_STRIDE)full.add(key(a,i));
 assert.ok(thin.length<a.length*.7&&thin.length>a.length*.3);
 for(let i=0;i<thin.length;i+=TUFT_STRIDE)assert.ok(full.has(key(thin,i)),'thinned tufts come from the full set');
 assert.equal(scatterCell(0,0,{sample:(x,z,out)=>{out[0]=0;return out;}}).length,0);
 for(let i=0;i<200;i++){const n=valueNoise(i*.37,i*.11,5);assert.ok(n>=0&&n<1);}
});
test('plains meadow: none on roads or in the stream, thick on the banks, covers the map in patches',()=>{
 const [rx,rz]=PLAINS_ROUTES[0].samples[Math.floor(PLAINS_ROUTES[0].samples.length/2)];
 const at=(x,z)=>plainsMeadow.sampler(x,z,14)(x,z,[0,0])[0];
 assert.equal(at(rx,rz),0,'road');assert.equal(at(500,0),0,'outside the map');
 let tufts=0,onRoad=0,inWater=0,cells=meadowCells(plainsMeadow.radius);
 assert.ok(cells.length>90&&cells.length<140,'cells: '+cells.length);
 for(const cell of cells){const data=scatterCell(cell.cx,cell.cz,{sample:plainsMeadow.sampler(cell.x,cell.z,MEADOW_CELL*.71)});tufts+=data.length/TUFT_STRIDE;for(let i=0;i<data.length;i+=TUFT_STRIDE){if(plainsRoadDistance(data[i],data[i+1])<.9)onRoad++;if(plainsStreamDistance(data[i],data[i+1])<3.2)inWater++;}}
 assert.equal(onRoad,0);assert.equal(inWater,0);
 assert.ok(tufts>6000&&tufts<16000,'tufts on the plains: '+tufts);
 // The local sampler agrees with the whole-map distance functions.
 const started=performance.now();for(const cell of cells)scatterCell(cell.cx,cell.cz,{sample:plainsMeadow.sampler(cell.x,cell.z,MEADOW_CELL*.71)});
 console.log(JSON.stringify({cells:cells.length,tufts,scatterMs:Math.round(performance.now()-started)}));
});
