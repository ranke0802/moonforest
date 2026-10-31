import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CAVE_PLACEMENTS,CAVE_POOLS,CAVE_WATERFALLS,caveFlowRows,caveWaterWeight} from '../src/witch-cave-layout.js';
import {caveFlowGeometry} from '../src/witch-cave-water.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {caveSurface} from '../src/witch-cave-layout.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readAccessor} from '../scripts/web-geometry.js';
const base=new URL('../public/assets/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base)));

test('spillway strips share every seam, join receiving pools and stay within the opaque-water triangle budget',()=>{
  let triangles=4*64;
  for(const p of CAVE_WATERFALLS){
    const rows=caveFlowRows(p),g=caveFlowGeometry(p);triangles+=g.indices.length/3;
    assert.equal(g.positions.length,rows.length*6);
    assert.equal(g.indices.length,(rows.length-1)*6);
    assert.ok(CAVE_PLACEMENTS.some(r=>r.spillway&&r.x===p.x&&r.z===p.z&&r.yaw===p.yaw));
    for(const [row,index]of [[rows[0],p.sourcePool],[rows.at(-1),p.targetPool]]){
      const pool=CAVE_POOLS[index];assert.ok(Math.hypot((row[0]-pool.x)/pool.rx,(row[2]-pool.z)/pool.rz)<.88,'join inside the irregular pool edge');
      assert.ok(row[1]<pool.height&&row[1]>pool.height-.02,'slight submerged overlap avoids a seam');
    }
    for(let i=0;i<g.indices.length;i+=3){
      const [a,b,c]=g.indices.slice(i,i+3).map(j=>g.positions.slice(j*3,j*3+3));
      const u=b.map((n,j)=>n-a[j]),v=c.map((n,j)=>n-a[j]);
      assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-7);
    }
  }
  assert.ok(triangles<=300);
});

// Probe the delivered geometry, not just authored coordinates: LOD changes
// must not expose rock fragments through either connected water ribbon.
test('water clears actual rock surfaces at all three existing LODs, including upstream and downstream joins',async t=>{
  const config=manifest.assets['cave-s03-dry-spillway-rock'];let samples=0,clearance=Infinity;
  for(const lod of config.lods){
    const {gltf,files}=await readRuntimeGltf(new URL(lod.model,base));
    assert.ok(gltf.nodes.every(n=>!n.matrix&&!n.translation&&!n.rotation&&!n.scale));
    const prim=gltf.meshes[0].primitives[0],pos=readAccessor(gltf,files,prim.attributes.POSITION),ix=readAccessor(gltf,files,prim.indices),tris=[];
    for(let i=0;i<ix.length;i+=3){
      const [a,b,c]=Array.from(ix.slice(i,i+3),j=>Array.from(pos.slice(j*3,j*3+3)));
      const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
      if(Math.abs(den)>1e-10)tris.push({a,b,c,den,minX:Math.min(a[0],b[0],c[0]),maxX:Math.max(a[0],b[0],c[0]),minZ:Math.min(a[2],b[2],c[2]),maxZ:Math.max(a[2],b[2],c[2])});
    }
    for(const p of CAVE_WATERFALLS){
      const rows=caveFlowRows(p).map(([x,y,z,w])=>{const dx=(x-p.x)/p.scale,dz=(z-p.z)/p.scale;return [Math.cos(p.yaw)*dx-Math.sin(p.yaw)*dz,(y-p.elevation+.025)/p.scale,Math.sin(p.yaw)*dx+Math.cos(p.yaw)*dz,w/p.scale];});
      for(let i=1;i<rows.length;i++)for(let k=0;k<=24;k++)for(let j=0;j<=10;j++){
        const a=rows[i-1],b=rows[i],f=k/24,w=a[3]+(b[3]-a[3])*f,x=a[0]+(b[0]-a[0])*f+w*(j/10-.5),z=a[2]+(b[2]-a[2])*f,y=a[1]+(b[1]-a[1])*f;
        let top=-Infinity;
        for(const tr of tris){
          if(x<tr.minX||x>tr.maxX||z<tr.minZ||z>tr.maxZ)continue;
          const {a,b,c,den}=tr,u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
          if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)top=Math.max(top,u*a[1]+v*b[1]+(1-u-v)*c[1]);
        }
        if(Number.isFinite(top)){samples++;clearance=Math.min(clearance,(y-top)*p.scale);assert.ok(y-top>.008,`LOD${lod.level} section${i} x${x} z${z}: rock ${top} water ${y}`);}
      }
    }
  }
  assert.ok(samples>5000);t.diagnostic(JSON.stringify({waterRockSamples:samples,minimumWorldClearance:clearance}));
});

test('water-facing solid foundations extend below their basin and retain original texture and LOD budgets',()=>{
  const config=manifest.assets['cave-s01-solid-cliff-base'],foundations=CAVE_PLACEMENTS.filter(p=>p.foundation&&caveWaterWeight(p.x,p.z)>.45);let checked=0;
  for(const p of foundations){
    const pool=CAVE_POOLS.reduce((a,b)=>Math.hypot((p.x-a.x)/a.rx,(p.z-a.z)/a.rz)<Math.hypot((p.x-b.x)/b.rx,(p.z-b.z)/b.rz)?a:b);
    assert.ok(p.topElevation-config.height*p.scale-.025<pool.height-.25,`unsupported base ${p.id}`);checked++;
  }
  assert.ok(foundations.length>0,'water-facing support remains in the revised layout');assert.equal(checked,foundations.length,'every currently placed basin foundation reaches below its water surface');
  for(const id of ['cave-s01-solid-cliff-base','cave-s03-dry-spillway-rock']){
    const a=manifest.assets[id];assert.equal(a.category,'rock');assert.equal(a.lods.length,3);
    assert.equal(a.highTextures.textures.albedo.width,4096);assert.equal(a.lods[0].textureSize,1024);
    assert.equal(a.mobileNear.model,a.lods[0].model);assert.ok(a.lods[0].triangles<=5000);
  }
});

test('visible open channels are not blocked by the terrain; raised walking shelves remain above the feeder',()=>{
  const terrain=createWitchCaveTerrain();let exposed=0,underShelf=0;
  for(const p of CAVE_WATERFALLS){
    const rows=caveFlowRows(p);
    for(let i=1;i<rows.length;i++)for(let k=0;k<=40;k++){
      const a=rows[i-1],b=rows[i],t=k/40,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t;
      const {distance}=caveSurface(x,z),ground=terrain.heightAt(x,z);
      if(distance>4.4){assert.ok(ground<y-.025,`blocked open water ${x},${z} ground${ground} water${y}`);exposed++;}
      if(distance<0){assert.ok(ground>y+.5,'feeder passes beneath the intact walking shelf');underShelf++;}
    }
  }
  assert.ok(exposed>250);assert.ok(underShelf>10);
});
