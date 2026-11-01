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
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {createVillageTransform} from '../src/village-environment.js';

test('camera field matches current actual source layout and preserves arched clearance by height',()=>{
 const hash=createHash('sha256');for(const file of ['witch-cave-layout.js','witch-cave-terrain.js'])hash.update(readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/\r\n?/g,'\n'));
 assert.equal(CAVE_CAMERA_DATA.fingerprint,hash.digest('hex'));
 assert.equal(caveCameraRockBlocked(-35,1.7,32,0),false);
 assert.ok(CAVE_CAMERA_DATA.profiles.length>100);
 assert.doesNotMatch(CAVE_FOG_COVER_FRAGMENT,/if\(caveForegroundCutaway/,'unknown-space enclosure never gets a camera hole');
 const masses=CAVE_PLACEMENTS.filter(p=>p.rockShoulder||p.outerMass);assert.ok(masses.length>0,'the revised cave is enclosed by actual rock masses');
 for(const p of masses){assert.equal(p.asset,'cave-01-eroded-wall');assert.equal(p.kind,'rock','camera/sight baking must include every enclosure mass');assert.ok(Number.isFinite(p.topElevation));if(p.rockShoulder)assert.ok(caveSurface(p.x,p.z).distance>.6,'broad shoulders stay outside the through walking shelf');}
});

test('actual route eyes remain outside solid terrain, near-LOD rocks and ceiling at close/wide/upward angles',()=>{
 const terrain=createWitchCaveTerrain();let cases=0,clamped=0;
 for(const focusHeight of [1.05,1.55])for(const route of CAVE_ROUTES)for(const [x,z]of route){const base={x,z,y:terrain.heightAt(x,z)+focusHeight};
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

test('the actual landmark entrance participates in camera clearance without filling its arch opening',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;t.after(()=>engine.dispose());
 const terrain=createWitchCaveTerrain(),base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base))),placement=CAVE_PLACEMENTS.find(p=>p.asset==='forest-06-witch-cave-mouth'),config=manifest.assets[placement.asset];
 assert.equal(placement.kind,'landmark','story classification does not exempt a structural rock');
 const {gltf,files}=await readRuntimeGltf(new URL(config.lods[0].model,base));for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},''),{root,facing}=createVillageTransform({scene,terrain},placement,config),instances=container.instantiateModelsToScene(n=>n+'-camera-regression',false,{doNotInstantiate:false});for(const node of instances.rootNodes)node.parent=facing;
 let checked=0;
 for(const mesh of root.getChildMeshes().filter(m=>m.getTotalVertices())){const world=mesh.computeWorldMatrix(true),raw=mesh.getVerticesData('position'),indices=mesh.getIndices(),vertices=[];for(let i=0;i<raw.length;i+=3)vertices.push(Vector3.TransformCoordinates(Vector3.FromArray(raw,i),world));for(let i=0;i<indices.length;i+=3){const p=vertices[indices[i]].add(vertices[indices[i+1]]).add(vertices[indices[i+2]]).scale(1/3);assert.equal(caveCameraRockBlocked(p.x,p.y,p.z,.05),true,'actual entrance triangle '+i/3+' is represented');checked++;}}
 assert.ok(checked>4000);
 const focus={x:-42,z:43,y:terrain.heightAt(-42,43)+1.05},beta=1.18,alpha=Math.PI*.75,r=caveSafeCameraRadius(terrain,focus,alpha,beta,8);
 assert.ok(r>4&&r<6,'the former 8m eye crossed the entrance surface');assert.equal(caveCameraBlocked(terrain,focus.x+Math.cos(alpha)*Math.sin(beta)*r,focus.y+Math.cos(beta)*r,focus.z+Math.sin(alpha)*Math.sin(beta)*r),false);
 assert.equal(caveCameraRockBlocked(-42,focus.y,43,.05),false,'the actual arrival location remains air');
});
