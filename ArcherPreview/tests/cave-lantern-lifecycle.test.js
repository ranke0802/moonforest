import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,MeshBuilder,PBRMaterial,Vector3} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {cavePlayerFillFactor} from '../src/cave-player-fill.js';
import {applyVillageToon} from '../src/village-toon.js';
import {prepareMapMaterials} from '../src/map-shader-cache.js';
import {applyCharacterSurfaceStyle,setSceneCharacterStyles} from '../src/character-style.js';

const report={scope:'Actual RawTexture upload bytes/bilinear emulation and real retained PBR bind/readiness lifecycle; no GPU pixels/device thermals.',checks:{}};
function save(){const dir=new URL('../reports/cave-repeat-review-2026-11-02/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('lighting-lifecycle.json',dir),JSON.stringify(report,null,2));}
function rawSample(runtime,p){
 const f=runtime.fog,u=(p.x-f.minX)/(f.cols*f.cellSize),v=(p.z-f.minZ)/(f.rows*f.cellSize);
 if(u<0||v<0||u>1||v>1)return [0,0,0,0];
 const gx=Math.max(0,Math.min(f.cols-1,u*f.cols-.5)),gz=Math.max(0,Math.min(f.rows-1,v*f.rows-.5)),x0=Math.floor(gx),z0=Math.floor(gz),x1=Math.min(f.cols-1,x0+1),z1=Math.min(f.rows-1,z0+1),a=gx-x0,b=gz-z0;
 return [0,1,2,3].map(c=>{const A=f.rgba[(z0*f.cols+x0)*4+c],B=f.rgba[(z0*f.cols+x1)*4+c],C=f.rgba[(z1*f.cols+x0)*4+c],D=f.rgba[(z1*f.cols+x1)*4+c];return ((A+(B-A)*a)*(1-b)+(C+(D-C)*a)*b)/255;});
}
function ready(world){for(const texture of [world.caveFog.texture,world.scene.metadata.cavePaintLighting.texture,caveFogFallback(world.scene)])if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;}
function captureRealBind(mesh){
 const material=mesh.material,buffer=material._uniformBuffer,calls={},float4=buffer.updateFloat4,float2=buffer.updateFloat2,float=buffer.updateFloat,texture=buffer.setTexture;
 buffer.updateFloat2=function(k,...v){calls[k]=v;return float2.call(this,k,...v);};
 buffer.updateFloat4=function(k,...v){calls[k]=v;return float4.call(this,k,...v);};buffer.updateFloat=function(k,v){calls[k]=v;return float.call(this,k,v);};buffer.setTexture=function(k,v){calls[k]=v;return texture.call(this,k,v);};
 try{mesh.getScene().updateTransformMatrix(true);assert.equal(material.isReadyForSubMesh(mesh,mesh.subMeshes[0],true),true);material.bindForSubMesh(mesh.computeWorldMatrix(true),mesh,mesh.subMeshes[0]);}
 finally{buffer.updateFloat4=float4;buffer.updateFloat2=float2;buffer.updateFloat=float;buffer.setTexture=texture;}
 return calls;
}

test('actual bilinear FoW upload keeps fully blocked and explored-memory samples dark for moving fill',t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>{engine.dispose();save();});
 world.caveFog.dispose();world.caveFog=new CaveFogRuntime(world,{isOpaque:x=>x>=.4&&x<=.505});ready(world);
 const runtime=world.caveFog,uploads=[],upload=runtime.texture.update.bind(runtime.texture);t.mock.method(runtime.texture,'update',data=>{uploads.push(data);return upload(data);});
 const player=new Vector3(-1.5,0,.5);runtime.update(player,0,{force:true});assert.strictEqual(uploads[0],runtime.fog.rgba);
 assert.equal(runtime.texture.gammaSpace,false);assert.equal(runtime.texture.noMipmap,true);assert.equal(runtime.texture.samplingMode,2);
 const front={x:-.5,y:1.05,z:.5},rear={x:1.5,y:1.05,z:.5};
 const frontSample=rawSample(runtime,front),rearSample=rawSample(runtime,rear);
 assert.equal(frontSample[0],1);assert.equal(rearSample[0],0);assert.ok(cavePlayerFillFactor(front,runtime.playerView,frontSample[2])[0]>.8);assert.deepEqual(cavePlayerFillFactor(rear,runtime.playerView,rearSample[2]),[0,0,0]);
 runtime.update(new Vector3(3,0,.5),1,{force:true});runtime.update(player,2,{force:true});const memory=rawSample(runtime,rear);
 assert.deepEqual(memory.slice(0,3),[0,1,0]);assert.deepEqual(cavePlayerFillFactor(rear,runtime.playerView,memory[2]),[0,0,0]);
 report.checks.actualTexture={front:frontSample,rear:rearSample,exploredRear:memory,textureUploadMatchesAuthoritativeBytes:true};
});

test('actual first-wall bilinear B mask removes the reproduced thin-wall fringe without changing R/G or static light',t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>{engine.dispose();save();});
 world.caveFog.dispose();world.caveFog=new CaveFogRuntime(world,{isOpaque:x=>x>=.4&&x<=.505});ready(world);const runtime=world.caveFog,paint=world.scene.metadata.cavePaintLighting,staticBytes=paint.map.data.slice();
 t.mock.method(paint.texture,'update',()=>assert.fail('Moving mask may not reupload static lighting'));
 runtime.update(new Vector3(-1.5,0,.5),0,{force:true});const samples=[];
 for(const x of [.4,.5,.506,.52,.55,.58,.75,1.5]){
  const p={x,y:1.05,z:.5},rgba=rawSample(runtime,p),local=cavePlayerFillFactor(p,runtime.playerView,rgba[2]);
  if(x===.4)assert.ok(Math.abs(rgba[2]-.1)<1e-10);else assert.equal(rgba[2],0);assert.deepEqual(local,[0,0,0]);
  if(x===.506){assert.ok(rgba[0]>.99,'original first-wall visibility remains');assert.ok(cavePlayerFillFactor(p,runtime.playerView,rgba[0])[0]>.7,'same actual R would reproduce the old fringe');}
  const fire=[1,.76,.44];assert.deepEqual(fire.map((v,i)=>Math.max(v,local[i])),fire);samples.push({x,rgba,local});
 }
 const front={x:-.5,y:1.05,z:.5},frontSample=rawSample(runtime,front);assert.equal(frontSample[2],1);assert.ok(cavePlayerFillFactor(front,runtime.playerView,frontSample[2])[0]>.8);
 assert.deepEqual(cavePlayerFillFactor({...front,y:8},runtime.playerView,frontSample[2]),[0,0,0]);
 assert.deepEqual(paint.map.data,staticBytes);report.checks.thinWall={samples,staticMapBytesUnchanged:true,firstWallTradeoff:'First opaque cell receives no added moving lantern; R/G and existing static surface light stay unchanged.',limit:'Actual1m opacity field, not a proof of subcell geometry shadow accuracy.'};
});

test('actual diagonal first-wall seam keeps local fill off behind both touching opaque cells',t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>{engine.dispose();save();});world.caveFog.dispose();
 world.caveFog=new CaveFogRuntime(world,{isOpaque:(x,z)=>(Math.floor(x)===0&&Math.floor(z)===-1)||(Math.floor(x)===-1&&Math.floor(z)===0)});ready(world);const runtime=world.caveFog;
 runtime.update(new Vector3(-.5,0,-.5),0,{force:true});const samples=[];
 for(const p of [{x:.5,y:1.05,z:.5},{x:.51,y:1.05,z:.51},{x:.5,y:1.05,z:-.5},{x:-.5,y:1.05,z:.5}]){
  const rgba=rawSample(runtime,p);assert.equal(rgba[2],0);assert.deepEqual(cavePlayerFillFactor(p,runtime.playerView,rgba[2]),[0,0,0]);samples.push({p,rgba});
 }
 report.checks.diagonal={samples};
});

test('actual stationary camera updates do not upload the mask or static light, and motion uploads once per fog revision',t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>{engine.dispose();save();});ready(world);const fog=world.caveFog,paint=world.scene.metadata.cavePaintLighting;
 let fogUploads=0;t.mock.method(fog.texture,'update',data=>{assert.strictEqual(data,fog.fog.rgba);fogUploads++;});t.mock.method(paint.texture,'update',()=>assert.fail('Static lamp field cannot follow the player with uploads'));
 const position=new Vector3(-35,3,-18);fog.update(position,0,{force:true});const bytes=fog.fog.rgba,revision=fog.fog.revision;
 for(let i=1;i<=300;i++){world.camera.alpha+=.01;fog.update(position,i/30);}
 assert.equal(fog.fog.revision,revision);assert.equal(fogUploads,1);
 for(let i=1;i<=120;i++)fog.update(new Vector3(-35+i*.01,3,-18),10+i/30);
 assert.equal(fogUploads,fog.fog.revision);assert.strictEqual(fog.fog.rgba,bytes);
 report.checks.uploadPacing={cameraOnlyFrames:300,cameraOnlyUploads:0,movementFrames:120,totalFogUploads:fogUploads,totalRevisions:fog.fog.revision,staticUploads:0,newFogByteArrays:0};
});

test('real retained PBR bind is inactive outside cave, then follows new ready fog/light runtimes over20roundtrips',async t=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true}),scene=world.scene;t.after(()=>{engine.dispose();save();});ready(world);
 const mesh=MeshBuilder.CreateBox('retained-actual-lantern',{},scene),m=mesh.material=new PBRMaterial('retained-actual-lantern',scene);m.metadata={caveRockTone:true};applyVillageToon([mesh],world.lighting);world.caveAtmosphere.attachMaterial(m);world.caveFog.attach(m);
 const actor=MeshBuilder.CreateBox('retained-player-options',{},scene),boss=MeshBuilder.CreateBox('retained-boss-options',{},scene);
 actor.material=new PBRMaterial('retained-player-options',scene);boss.material=new PBRMaterial('retained-boss-options',scene);
 applyCharacterSurfaceStyle({meshes:[actor]},'player');applyCharacterSurfaceStyle({meshes:[boss]},'boss');
 setSceneCharacterStyles(scene,{player:{outline:true,outlineWidth:.5,internal:true,internalStrength:.31,brightness:1.35},boss:{outline:true,outlineWidth:.5,internal:true,internalStrength:.44,brightness:1.8}});
 await prepareMapMaterials([actor,boss]);
 await prepareMapMaterials([mesh]);const compiled=m.subMeshes?.[0]?.effect??mesh.subMeshes[0].effect;assert.ok(compiled);
 const shader=mesh.subMeshes[0].effect.fragmentSourceCode;assert.match(shader,/finalDiffuse\*=cavePaintFactor\(vPositionW\)/);assert.equal(m.fogEnabled,false);
 const counts=()=>({textures:scene.textures.length,materials:scene.materials.length,meshes:scene.meshes.length,lights:scene.lights.length,before:scene.onBeforeRenderObservable.observers.filter(o=>!o._willBeUnregistered).length,after:scene.onAfterRenderObservable.observers.filter(o=>!o._willBeUnregistered).length});
 world.caveFog.update(new Vector3(-35,3,-18),0,{force:true});captureRealBind(mesh);const baseline=counts(),cycles=[];
 for(let i=0;i<20;i++){
  const oldPaint=scene.metadata.cavePaintLighting,oldFog=world.caveFog;
  replaceWorldMap(world,'warrior-v4');await prepareMapMaterials([mesh]);
  const outside=captureRealBind(mesh);assert.equal(outside.cavePaintActive,0);assert.deepEqual(outside.cavePaintPlayer,[0,0,0,0]);assert.equal(outside.caveFogActive,0);assert.notStrictEqual(outside.cavePaintLightMap,oldPaint.texture);assert.equal(oldPaint.disposed,true);assert.equal(oldFog.disposed,true);assert.equal(m.fogEnabled,true);
  replaceWorldMap(world,'warrior-v5');ready(world);world.caveAtmosphere.attachMaterial(m);world.caveFog.attach(m);await prepareMapMaterials([mesh]);
  const beforePlayer=captureRealBind(mesh);assert.deepEqual(beforePlayer.cavePaintPlayer,[0,0,0,0]);assert.equal(beforePlayer.caveFogActive,0);
  world.caveFog.update(new Vector3(-35+i*.01,3,-18),i+1,{force:true});const entered=captureRealBind(mesh);
  assert.equal(entered.cavePaintActive,1);assert.equal(entered.caveFogActive,1);assert.deepEqual(entered.cavePaintPlayer,world.caveFog.playerView.asArray());assert.strictEqual(entered.cavePaintLightMap,scene.metadata.cavePaintLighting.texture);assert.notStrictEqual(entered.cavePaintLightMap,oldPaint.texture);
  const actorBind=captureRealBind(actor),bossBind=captureRealBind(boss);assert.deepEqual(actorBind.characterPaint,[1.35,.31]);assert.deepEqual(bossBind.characterPaint,[1.8/1.35,.44-.2]);assert.equal(actorBind.cavePaintActive,undefined);assert.equal(bossBind.cavePaintActive,undefined);assert.deepEqual(counts(),baseline);
  const f=world.caveFog.fog;let litCells=0,opaqueVisible=0;
  for(let cell=0;cell<f.visible.length;cell++){
   const B=f.rgba[cell*4+2];assert.equal(B,f.visible[cell]&&!f.opaque[cell]?255:0);assert.equal(f.rgba[cell*4],f.visible[cell]?255:0);assert.equal(f.rgba[cell*4+1],f.explored[cell]?255:0);if(B)litCells++;if(f.visible[cell]&&f.opaque[cell])opaqueVisible++;
  }
  cycles.push({roundtrip:i+1,outsideActive:outside.cavePaintActive,beforePlayerReady:beforePlayer.cavePaintPlayer[3],enteredActive:entered.cavePaintActive,newTexture:true,counts:counts(),productionOpacityInvariant:{cells:f.visible.length,litCells,visibleOpaqueCellsWithoutLantern:opaqueVisible,violations:0}});
 }
 report.checks.realRetainedBind={baseline,cycles,firstWarmShaderIncludesPaint:true,oldGpuTexturesRetained:0,productionOpacityCellsChecked:cycles.reduce((sum,c)=>sum+c.productionOpacityInvariant.cells,0)};
});
