import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {CaveCameraGuard,caveSafeCameraRadius,caveCameraBlocked,caveCameraRockBlocked} from '../src/witch-cave-camera.js';
import {CAVE_CAMERA_DATA} from '../src/witch-cave-camera-data.js';
import {CAVE_PLACEMENTS,CAVE_ROUTES,caveSurface} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {zoomCamera} from '../src/camera-zoom.js';
import {CAVE_FOG_COVER_FRAGMENT} from '../src/cave-fog-cover.js';

test('camera field matches current actual source layout and preserves arched clearance by height',()=>{
 const hash=createHash('sha256');for(const file of ['witch-cave-layout.js','witch-cave-terrain.js'])hash.update(readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/\r\n?/g,'\n'));
 assert.equal(CAVE_CAMERA_DATA.fingerprint,hash.digest('hex'));
 assert.equal(caveCameraRockBlocked(-35,1.7,32,0),false);
 assert.ok(CAVE_CAMERA_DATA.profiles.length>100);
 assert.doesNotMatch(CAVE_FOG_COVER_FRAGMENT,/if\(caveForegroundCutaway/,'unknown-space enclosure never gets a camera hole');
 const lower=CAVE_PLACEMENTS.filter(p=>p.lowerShoulder);assert.equal(lower.length,14);
 for(const p of lower){assert.equal(p.asset,'cave-01-eroded-wall');assert.ok(caveSurface(p.x,p.z).distance>4);assert.ok(Math.hypot(p.x-29,p.z+30)>=25);}
});

test('actual route eyes remain outside solid terrain, near-LOD rocks and ceiling at close/wide/upward angles',()=>{
 const terrain=createWitchCaveTerrain();let cases=0,clamped=0;
 for(const route of CAVE_ROUTES)for(const [x,z]of route){const base={x,z,y:terrain.heightAt(x,z)+1.55};
  for(const beta of [.25,1.18,1.78,Math.PI-.035])for(const requested of [8,82])for(let a=0;a<8;a++){
   const alpha=a*Math.PI/4,r=caveSafeCameraRadius(terrain,base,alpha,beta,requested),lift=Math.max(0,-.35-r*Math.cos(beta));
   const eye=[x+Math.cos(alpha)*Math.sin(beta)*r,base.y+lift+Math.cos(beta)*r,z+Math.sin(alpha)*Math.sin(beta)*r];
   assert.ok(r>0&&r<=requested);assert.equal(caveCameraBlocked(terrain,...eye),false,JSON.stringify({x,z,beta,alpha,r,eye}));cases++;if(r<requested)clamped++;
  }
 }
 assert.ok(cases>1500);assert.ok(clamped>500);
});

test('render guard preserves requested zoom/pinch, rendered matrices and outside-cave camera state',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;const terrain=createWitchCaveTerrain(),base=new Vector3(-42,terrain.heightAt(-42,43)+1.05,43),camera=new ArcRotateCamera('guard',Math.PI/2,1.18,82,base.clone(),scene),world={scene,camera,terrain,cave:true},guard=new CaveCameraGuard(world);
 try{
  guard.follow(base,.016);assert.ok(guard.beginFrame());assert.ok(camera.radius<12);const rendered=camera.globalPosition.clone();scene.render(false);guard.endFrame();assert.equal(camera.radius,82);assert.ok(camera.target.equals(base));assert.ok(camera.globalPosition.equals(rendered),'deferred HUD uses rendered matrix');
  zoomCamera(camera,.8);const requested=camera.radius;guard.follow(base,.016);guard.beginFrame();guard.endFrame();assert.equal(camera.radius,requested,'pinch sees requested radius, not obstruction distance');
  const sceneCounts=[scene.meshes.length,scene.materials.length,scene.geometries.length];for(let i=0;i<100;i++){guard.follow(base,.016);guard.beginFrame();guard.endFrame();}assert.deepEqual([scene.meshes.length,scene.materials.length,scene.geometries.length],sceneCounts);
  world.cave=false;assert.equal(guard.beginFrame(),false);assert.equal(camera.radius,requested);
  world.cave=true;world.caveFog={playerRoot:{position:base.clone()}};
  const blockedPan=new Vector3(-54,base.y,43);camera.setTarget(blockedPan,false,false,true);guard.follow(blockedPan,.016);guard.beginFrame();assert.ok(guard.base.x>-51,'pivot stops before a tall wall instead of lifting onto its top');assert.ok(guard.base.y<base.y+.6);assert.equal(caveCameraBlocked(terrain,camera.globalPosition.x,camera.globalPosition.y,camera.globalPosition.z),false);guard.endFrame();assert.ok(camera.target.equals(blockedPan),'requested pan remains available when moving away');
  world.cave=true;guard.beginFrame();guard.dispose();assert.equal(camera.radius,requested);assert.equal(guard.applied,false);
 }finally{guard.dispose();scene.dispose();engine.dispose();}
});
