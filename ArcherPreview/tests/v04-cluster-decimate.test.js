import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterDecimate,decimateToBudget} from '../src/v04/cluster-decimate.js';

// A lumpy sphere: enough triangles to decimate, with a uv attribute.
function sphere(rings=24,segments=32){
 const positions=[],uv=[],indices=[];
 for(let r=0;r<=rings;r++)for(let s=0;s<=segments;s++){const a=Math.PI*r/rings,b=2*Math.PI*s/segments;positions.push(Math.sin(a)*Math.cos(b),Math.cos(a)*.6+.6,Math.sin(a)*Math.sin(b));uv.push(s/segments,r/rings);}
 for(let r=0;r<rings;r++)for(let s=0;s<segments;s++){const i=r*(segments+1)+s;indices.push(i,i+1,i+segments+1,i+1,i+segments+2,i+segments+1);}
 return {positions:new Float32Array(positions),indices,attributes:{uv:{data:new Float32Array(uv),size:2}}};
}
const bounds=p=>{const b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i+=3)for(let k=0;k<3;k++){b[k]=Math.min(b[k],p[i+k]);b[k+3]=Math.max(b[k+3],p[i+k]);}return b;};

test('decimation keeps the outline, valid indices and matching attributes',()=>{
 const source=sphere(),result=clusterDecimate(source,5);
 assert.ok(result.triangles>8&&result.triangles<source.indices.length/3/4,'far fewer triangles: '+result.triangles);
 assert.equal(result.indices.length%3,0);assert.equal(result.attributes.uv.data.length/2,result.positions.length/3);
 for(const i of result.indices)assert.ok(i>=0&&i<result.positions.length/3);
 for(let i=0;i<result.indices.length;i+=3)assert.equal(new Set(result.indices.slice(i,i+3)).size,3,'no collapsed triangle');
 // One texture coordinate per triangle (no interpolation across atlas islands).
 const uv=result.attributes.uv.data;for(let i=0;i<result.indices.length;i+=3){const [p,q,r]=result.indices.slice(i,i+3);assert.equal(uv[p*2],uv[q*2]);assert.equal(uv[p*2+1],uv[r*2+1]);}
 const a=bounds(source.positions),b=bounds(result.positions);
 for(let k=0;k<6;k++)assert.ok(Math.abs(a[k]-b[k])<.36,'outline kept on axis '+k);
});
test('a budget picks the finest grid that fits, and nothing when even the coarsest is too big',()=>{
 const source=sphere(),mid=decimateToBudget(source,220),far=decimateToBudget(source,40);
 assert.ok(mid.triangles<=220&&far.triangles<=40&&mid.triangles>far.triangles);assert.ok(mid.cells>far.cells);
 assert.equal(decimateToBudget(source,2),null);
});
