import test from 'node:test';
import assert from 'node:assert/strict';
import { VILLAGE_ASSET_IDS, VILLAGE_HOMES, VILLAGE_PLACEMENTS, VILLAGE_SPAWN, VILLAGE_RING_ROAD, villageObstacles, isVillageRoute } from '../src/village-layout.js';
import { createVillageTerrain } from '../src/village-terrain.js';
import { VillageNavigation } from '../src/village-navigation.js';
import { ArenaNavigation } from '../src/navigation.js';
import { ARENA_RADIUS } from '../src/world-limits.js';
import { safeQueryBounds, stableOcclusion } from '../src/village-occlusion.js';
import { VillageVisibility } from '../src/village-visibility.js';
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { villageRenderRange } from '../src/village-policy.js';

test('village uses exactly the 25 authored assets and 20 homes in the agreed mix',()=>{
  assert.equal(new Set(VILLAGE_ASSET_IDS).size,25);
  assert.deepEqual([...new Set(VILLAGE_PLACEMENTS.map(p=>p.asset))].sort(),[...VILLAGE_ASSET_IDS].sort());
  assert.equal(VILLAGE_HOMES.length,20);
  assert.deepEqual(VILLAGE_ASSET_IDS.slice(0,4).map(id=>VILLAGE_HOMES.filter(p=>p.asset===id).length),[10,2,4,4]);
  assert.equal(new Set(VILLAGE_PLACEMENTS.map(p=>p.id)).size,VILLAGE_PLACEMENTS.length);
  assert.equal(VILLAGE_PLACEMENTS.filter(p=>p.asset==='chapel').length,1);
  assert.equal(VILLAGE_PLACEMENTS.filter(p=>p.asset==='well').length,1);
});

test('village route does not change the existing v2 arena',()=>{
  assert.equal(ARENA_RADIUS,22);
  assert.equal(isVillageRoute('?character=warrior-v2'),false);
  assert.equal(isVillageRoute('?character=warrior-v3'),true);
  assert.equal(isVillageRoute('?character=archer'),false);
});

test('village scenery is fully inside fog before mobile or desktop distance culling',()=>{
  for(const touch of [false,true]){
    const p=villageRenderRange(touch);assert.ok(p.fogStart<p.fogEnd);assert.ok(p.fogEnd<p.cellCull);assert.ok(p.cellCull<p.meshCull);
    assert.ok(p.maxCameraRadius<p.fogStart,'maximum gameplay zoom must keep the player outside the fog');
    assert.ok(p.meshCull-p.fogEnd>=10,'large tree silhouette must fade before its center selects the null LOD');
  }
  assert.equal(villageRenderRange(true).fogEnd,80);
  assert.equal(villageRenderRange(false).fogEnd,105);
});

test('the player and a large enemy can traverse the open southern road and gate',()=>{
  const nav=new VillageNavigation(villageObstacles());
  assert.ok(nav.free(VILLAGE_SPAWN,.7,48));
  assert.ok(nav.segmentClear(VILLAGE_SPAWN,{x:0,z:47},.7));
  for(const x of [-2.4,0,2.4])for(let z=39;z<=45;z+=.5)assert.ok(nav.free({x,z},.7,48),`gate blocked at ${x},${z}`);
  assert.equal(nav.free({x:0,z:-42},.32,48),false,'rear gate must remain closed');
  assert.equal(nav.free({x:38,z:0},.32,48),false,'east stone wall must stop movement');
  assert.equal(nav.free({x:0,z:0},.32,48),false,'well must have a collider');
  assert.ok(nav.segmentClear({x:0,z:-4},{x:0,z:-39},.7),'north main road must remain open');
  assert.ok(nav.segmentClear({x:4,z:0},{x:35,z:0},.7),'east main road must remain open');
  assert.ok(nav.segmentClear({x:-4,z:0},{x:-35,z:0},.7),'west main road must remain open');
  for(let i=1;i<VILLAGE_RING_ROAD.length;i++){
    const a=VILLAGE_RING_ROAD[i-1],b=VILLAGE_RING_ROAD[i];
    assert.ok(nav.segmentClear({x:a[0],z:a[1]},{x:b[0],z:b[1]},.7),'circulation street must stay connected');
  }
});

test('village spatial index preserves original analytic collision and sight rules',()=>{
  const obstacles=villageObstacles().filter(o=>o.shape!=='box'),a=new ArenaNavigation(obstacles),b=new VillageNavigation(obstacles);
  let state=62719;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  for(let i=0;i<700;i++){
    const from={x:(random()-.5)*96,z:(random()-.5)*96},to={x:from.x+(random()-.5)*18,z:from.z+(random()-.5)*18},radius=[.32,.7,1.7][i%3];
    assert.equal(b.free(from,radius,48),a.free(from,radius,48));
    assert.equal(b.segmentClear(from,to,radius,i%2===0),a.segmentClear(from,to,radius,i%2===0));
  }
});

test('dressed home yards keep every front door connected to the central plaza',()=>{
  const nav=new VillageNavigation(villageObstacles());
  for(const home of VILLAGE_HOMES){
    const front=home.colliderFootprint[1]*home.scale*.5+.7;
    const door={x:home.x+Math.sin(home.yaw)*front,z:home.z+Math.cos(home.yaw)*front};
    assert.ok(nav.free(door,.32,48),`${home.id}: dressing obstructs the doorway`);
    const path=nav.path(door,VILLAGE_SPAWN,.32,48);
    assert.ok(path.length,`${home.id}: fencing seals the front yard`);
    let previous=door;
    for(const point of path){assert.ok(nav.segmentClear(previous,point,.32));previous=point;}
    assert.deepEqual(path.at(-1),VILLAGE_SPAWN);
  }
  for(const chip of VILLAGE_PLACEMENTS.filter(p=>p.kind==='ground-detail')){
    assert.ok(chip.scale*2.2<=.23,'decorative stones must remain below ankle height');
    assert.deepEqual(villageObstacles([chip]),[],'small ground cover must not add hidden movement barriers');
  }
});

test('body colliders fit measured footprints, preserve building corners and stop rocks and carts',()=>{
  for(const p of VILLAGE_PLACEMENTS.filter(p=>p.footprint||p.colliderFootprint)){
    const [width,depth]=(p.colliderFootprint??p.footprint).map(n=>n*p.scale),[ox,oz]=(p.colliderOffset??[0,0]).map(n=>n*p.scale);
    for(const o of villageObstacles([p])){
      const dx=o.x-p.x,dz=o.z-p.z,x=dx*Math.cos(p.yaw)-dz*Math.sin(p.yaw)-ox,z=dx*Math.sin(p.yaw)+dz*Math.cos(p.yaw)-oz;
      const angle=(o.yaw??p.yaw)-p.yaw,ex=o.shape==='box'?Math.abs(Math.cos(angle))*o.halfWidth+Math.abs(Math.sin(angle))*o.halfDepth:o.radius,ez=o.shape==='box'?Math.abs(Math.sin(angle))*o.halfWidth+Math.abs(Math.cos(angle))*o.halfDepth:o.radius;
      assert.ok(Math.abs(x)+ex<=width*.5+1e-8,`${p.id} collider too wide`);
      assert.ok(Math.abs(z)+ez<=depth*.5+1e-8,`${p.id} collider too deep`);
    }
  }
  for(const home of VILLAGE_HOMES){
    const [o]=villageObstacles([home]),nav=new VillageNavigation([o]);
    const lx=o.halfWidth-.03,lz=o.halfDepth-.03;
    assert.equal(nav.free({x:o.x+lx*Math.cos(o.yaw)+lz*Math.sin(o.yaw),z:o.z-lx*Math.sin(o.yaw)+lz*Math.cos(o.yaw)},.32,80),false,'actual rectangular wall corners must stop the player');
  }
  const nav=new VillageNavigation(villageObstacles());
  for(const p of VILLAGE_PLACEMENTS.filter(p=>p.kind==='rock'||['handcart','firewood','crate-barrel-cluster'].includes(p.asset)))assert.equal(nav.free(p,.32,80),false,`${p.id} must block movement`);
});

test('cart shafts block walking but preserve open space and combat sight above the low handles',()=>{
  for(const asset of ['covered-wagon','handcart']){
    const source=VILLAGE_PLACEMENTS.find(p=>p.asset===asset),p={...source,x:0,z:0,yaw:0,scale:1},nav=new VillageNavigation(villageObstacles([p]));
    assert.ok(nav.free(asset==='handcart'?{x:0,z:1.3}:{x:.8,z:2.2},.32,48),'space beside/between shafts must remain walkable');
    const z=asset==='handcart'?1.3:2.2;
    assert.equal(nav.segmentClear({x:-2,z},{x:2,z},.32),false,'low shafts must still stop feet');
    assert.equal(nav.segmentClear({x:-2,z},{x:2,z},0,true),true,'low shafts must not block higher combat sight');
  }
});

test('occlusion fails open inside a box or when its front is clipped by the near plane',()=>{
  const min={x:-1,y:0,z:2},max={x:1,y:2,z:4},plane={normal:{x:0,y:0,z:1},d:-.1};
  assert.equal(safeQueryBounds(min,max,{x:0,y:1,z:3},plane),false);
  assert.equal(safeQueryBounds(min,max,{x:0,y:1,z:0},{normal:{x:0,y:0,z:1},d:-2.1}),false);
  assert.equal(safeQueryBounds(min,max,{x:0,y:1,z:0},plane),true);
  assert.equal(stableOcclusion(stableOcclusion(0,false),false),2);
  assert.equal(stableOcclusion(2,true),0);
});

test('turning the camera restores newly visible cells without waiting for the idle timer',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('view',new Vector3(0,1,0),scene);
  camera.minZ=.05;camera.maxZ=120;scene.activeCamera=camera;
  const root=new TransformNode('building',scene),record={root,meshes:[],placement:{x:0,z:20,kind:'building'},min:new Vector3(-1,0,19),max:new Vector3(1,2,21)};
  const visibility=new VillageVisibility({scene,camera,shadows:{addShadowCaster(){},removeShadowCaster(){}}},[record]);
  const update=target=>{camera.setTarget(target);camera.getViewMatrix(true);visibility.update(camera.globalPosition,Vector3.Zero(),.001);};
  update(new Vector3(0,1,-20));assert.equal(root.isEnabled(),false);
  update(new Vector3(0,1,20));assert.equal(root.isEnabled(),true);
  visibility.dispose();scene.dispose();engine.dispose();
});

test('building foundations sit on flat pads while outer hills remain visible',()=>{
  const terrain=createVillageTerrain();
  assert.equal(terrain.size,160);assert.equal(terrain.heightAt(0,0),terrain.heightAt(0,5));
  assert.ok(terrain.heightAt(45,30)>1,'retain the outer hillside');
  for(const p of VILLAGE_HOMES){
    const [w,d]=p.footprint,heights=[];
    for(const x of [-w*.48,w*.48])for(const z of [-d*.48,d*.48]){
      heights.push(terrain.heightAt(p.x+x*Math.cos(p.yaw)+z*Math.sin(p.yaw),p.z-x*Math.sin(p.yaw)+z*Math.cos(p.yaw)));
    }
    assert.ok(Math.max(...heights)-Math.min(...heights)<.05,`${p.id} has an uneven foundation`);
  }
});
