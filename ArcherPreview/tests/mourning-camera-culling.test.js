import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,TransformNode,PBRMaterial,VertexBuffer,MeshBuilder,Skeleton,Bone,Matrix,DirectionalLight,ShadowGenerator} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';
import {MOURNING_SIZE_SCALE} from '../src/elena-spec.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {prepareMourningCameraCulling,buildMourningMeshBounds,MourningCameraBounds} from '../src/mourning-camera-culling.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

async function fixture(t){
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
 engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{const tex=engine.createRawTexture(data,w,h,format,mips,invertY,sampling,compression,type);tex.depth=depth;tex.is2DArray=true;return tex;};
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const camera=new FreeCamera('main-review',new Vector3(0,4,16),scene);camera.setTarget(new Vector3(0,3,0));
 const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base))),{gltf,files}=await readRuntimeGltf(new URL(config.model,base));
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+files.get(b.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json:gltf},'');asset.addAllToScene();for(const group of asset.animationGroups)group.stop();
 const actor=new TransformNode('actor',scene),parent=new TransformNode('parent',scene);actor.parent=parent;actor.scaling.setAll(config.scale*MOURNING_SIZE_SCALE);for(const n of [...asset.meshes,...asset.transformNodes])if(!n.parent)n.parent=actor;
 const material=new PBRMaterial('paint',scene);material.unlit=true;material.backFaceCulling=false;
 const sources=asset.meshes.filter(m=>m.getTotalVertices());for(const m of sources){m.material=material;m.alwaysSelectAsActiveMesh=true;if(m.skeleton)m.skeleton.useTextureToStoreBoneMatrices=true;}
 const shells=attachCharacterOutlines(asset,'elena'),bounds=prepareMourningCameraCulling(asset),animator=new MourningElenaAnimator(asset,config,actor);assert.ok(bounds);
 t.after(()=>{animator.dispose();loader.dispose();scene.dispose();engine.dispose();});
 return {engine,scene,camera,actor,parent,asset,sources,shells,bounds,animator};
}
function prepareFrame(f){f.scene.incrementRenderId();f.scene.setTransformMatrix(f.camera.getViewMatrix(true),f.camera.getProjectionMatrix(true));}
function checkAllVertices(f,label){
 prepareFrame(f);assert.ok(f.bounds.update(),`${label}: bounds usable`);const box=f.bounds.bounds;
 let vertices=0;
 for(const mesh of f.sources){
  const p=mesh.getPositionData(true,true),m=mesh.computeWorldMatrix().m;
  for(let i=0;i<p.length;i+=3){
   const x=p[i],y=p[i+1],z=p[i+2],w=x*m[3]+y*m[7]+z*m[11]+m[15];
   for(let axis=0;axis<3;axis++){const value=(x*m[axis]+y*m[axis+4]+z*m[axis+8]+m[axis+12])/w;if(value<box[axis]-2e-4||value>box[axis+3]+2e-4)assert.fail(`${label}: ${mesh.name} vertex ${i/3} axis ${axis}: ${value} outside ${box[axis]}..${box[axis+3]}`);}
   vertices++;
  }
 }
 return vertices;
}

test('non-normalized, negative, invalid and CPU bone contracts do not enable culling',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>{scene.dispose();engine.dispose();});const mesh=MeshBuilder.CreateBox('test',{},scene),n=mesh.getTotalVertices();mesh.skeleton=new Skeleton('rig','rig',scene);new Bone('bone',mesh.skeleton,null,Matrix.Identity());mesh.setVerticesData(VertexBuffer.MatricesIndicesKind,new Float32Array(n*4));mesh.setVerticesData(VertexBuffer.MatricesWeightsKind,Float32Array.from({length:n*4},(_,i)=>i%4===0?1:0));
 assert.ok(buildMourningMeshBounds(mesh));const w=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);w[0]=.9;assert.equal(buildMourningMeshBounds(mesh),null);w[0]=1.1;w[1]=-.1;assert.equal(buildMourningMeshBounds(mesh),null);w[0]=1;w[1]=NaN;assert.equal(buildMourningMeshBounds(mesh),null);w[1]=0;mesh.computeBonesUsingShaders=false;assert.equal(buildMourningMeshBounds(mesh),null);
});

test('clip-space culling keeps even an off-screen base whose .50 to 3px outline enters the viewport',t=>{
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;const camera=new FreeCamera('edge',Vector3.Zero(),scene);camera.setTarget(new Vector3(0,0,-1));
 t.after(()=>{scene.dispose();engine.dispose();});const group=new MourningCameraBounds([],scene);group.update=()=>true;
 const ink={metadata:{moonforestOutline:true,characterStyleGroup:'boss'},getScene:()=>scene};group.hooks=[{mesh:ink}];
 for(const orthographic of [false,true])for(const fov of [.25,.8,1.6])for(const pixels of [.5,3]){
  camera.mode=orthographic?1:0;camera.orthoLeft=-5;camera.orthoRight=5;camera.orthoTop=3;camera.orthoBottom=-3;camera.fov=fov;scene.metadata={characterStyleSettings:{boss:{outlineWidth:pixels}}};scene.setTransformMatrix(camera.getViewMatrix(true),camera.getProjectionMatrix(true));
  const inverse=scene.getTransformMatrix().clone().invert();
  for(const axis of [0,1])for(const sign of [-1,1])for(const multiplier of [.5,2]){
   const clip=[0,0,.5],size=axis===0?1280:720;clip[axis]=sign*(1+2*pixels/size*multiplier);const p=Vector3.TransformCoordinates(new Vector3(...clip),inverse);group.bounds=[p.x,p.y,p.z,p.x,p.y,p.z];
   assert.equal(group.intersects(scene._frustumPlanes),multiplier<1,`${orthographic?'ortho':'perspective'} fov${fov} ${pixels}px axis${axis} sign${sign}`);
  }
 }
});

test('complete r9 living/death frame ranges and arbitrary parent yaw/scale remain inside current skin-morph bounds',{timeout:120000},async t=>{
 const f=await fixture(t);let checked=0,poses=0;
 for(const [state,duration]of [['idle',6],['walk',2.4],['cast',3],['cast_slam',3],['cast_alternate',3],['hit',1.3],['dead',5.2]]){
  f.animator.reset();f.animator.transition(state);
  for(let frame=0;frame<=Math.round(duration*30);frame++){
   if(frame)f.animator.update(1/30);f.animator.sample(0);
   f.parent.position.set(17,-3,-11);f.parent.rotation.set(.1*Math.sin(frame*.13),frame*.17,.07*Math.cos(frame*.19));f.parent.scaling.set(frame%2?-1.2:1.2,.8,1.1);
   f.actor.rotation.y=frame*.13;
   checked+=checkAllVertices(f,`${state}/${frame}`);poses++;
  }
 }
 assert.equal(poses,724);assert.ok(checked>68_000_000);assert.ok(f.bounds.parts.every(part=>part.maxWeightSumError<=1e-5));
 t.diagnostic(JSON.stringify({poses,checkedVertices:checked,boneBoxes:f.bounds.parts.reduce((n,p)=>n+p.boxes.length,0),maxWeightSumError:Math.max(...f.bounds.parts.map(p=>p.maxWeightSumError))}));
});

test('simultaneous 0..1 morph combinations are enclosed, and unsupported edits fail open',async t=>{
 const f=await fixture(t);let seed=92741;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 f.animator.transition('cast');f.animator.update(1.45);f.animator.sample(0);
 for(let sample=0;sample<26;sample++){
  for(const part of f.bounds.parts)for(const target of part.targets)target.influence=sample===0?0:sample===1?1:rand();
  f.parent.scaling.set(sample%2?-1:1,.7+rand(),.7+rand());f.parent.rotation.set(rand(),rand()*6,rand());checkAllVertices(f,`all-morphs/${sample}`);
 }
 const target=f.bounds.parts.find(p=>p.targets.length===11).targets[0];target.influence=1.001;prepareFrame(f);assert.equal(f.bounds.update(),false);assert.equal(f.bounds.intersects(f.scene._frustumPlanes),true);target.influence=-.01;prepareFrame(f);assert.equal(f.bounds.update(),false);
});

test('turning away removes only main-camera body and ink submissions; shadow casters and pooled return remain intact',{timeout:15000},async t=>{
 const f=await fixture(t),{scene,camera,asset,sources,shells,bounds}=f;f.animator.sample(0);
 const light=new DirectionalLight('sun',new Vector3(-1,-2,-1),scene);light.position.set(0,12,15);light.shadowFrustumSize=40;light.shadowMinZ=.1;light.shadowMaxZ=100;
 const shadows=new ShadowGenerator(1024,light);for(const m of sources)shadows.addShadowCaster(m,false);t.after(()=>shadows.dispose());
 for(const m of [...sources,...shells])await m.material.forceCompilationAsync(m);await shadows.forceCompilationAsync();
 const passes=[];for(const mesh of [...sources,...shells]){const process=mesh._processRendering;mesh._processRendering=function(...args){passes.push({mesh,pass:f.engine.currentRenderPassId});return process.apply(this,args);};}
 const main=()=>scene.getActiveMeshes().data.slice(0,scene.getActiveMeshes().length).filter(m=>asset.meshes.includes(m));
 scene.render();assert.equal(main().length,7);const renderList=shadows.getShadowMap().renderList.slice(),shadowPass=shadows.getShadowMap().renderPassId;
 const visibleShadow=new Set(passes.filter(p=>p.pass===shadowPass).map(p=>p.mesh));assert.ok(visibleShadow.has(sources.find(m=>m.name==='Elina_Chimera_Skin')),'the original body casts in the baseline frame');
 camera.setTarget(new Vector3(0,4,40));passes.length=0;scene.render();assert.equal(main().length,0);
 assert.deepEqual(Array.from(shadows.getShadowMap().renderList),renderList);assert.equal(sources.every(m=>m.isVisible),true);assert.equal(shadows.getShadowMap().refreshRate,1);
 assert.deepEqual(new Set(passes.filter(p=>p.pass===shadowPass).map(p=>p.mesh)),visibleShadow,'main-camera rejection preserves the exact original light-pass submissions');assert.equal(passes.some(p=>shells.includes(p.mesh)),false,'ink has no shadow or off-screen main draw');
 const hookCount=bounds.hooks.length,partCount=bounds.parts.length;
 for(let trip=0;trip<20;trip++){f.actor.setEnabled(false);scene.render();assert.equal(main().length,0);f.actor.setEnabled(true);camera.setTarget(new Vector3(0,3,0));scene.render();assert.equal(main().length,7);camera.setTarget(new Vector3(0,4,40));scene.render();assert.equal(main().length,0);assert.strictEqual(prepareMourningCameraCulling(asset),bounds);}
 assert.equal(bounds.hooks.length,hookCount);assert.equal(bounds.parts.length,partCount);assert.ok(bounds.updates<=scene.getRenderId(),'one union per scene render ID');
 bounds.dispose();assert.equal(sources.every(m=>m.alwaysSelectAsActiveMesh),true);
});
