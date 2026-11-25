import test from 'node:test';
import {parseHTML} from 'linkedom';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DirectionalLight,FreeCamera,Matrix,NullEngine,RawTexture,Ray,Scene,ShadowGenerator,TransformNode,Vector3,VertexBuffer} from '@babylonjs/core';
import {GLTFLoader} from '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readMapContainer} from '../src/map-container.js';
import {createRidingHorse} from '../src/v03/riding-horse.js';
import {SADDLE_PAD_HEIGHT} from '../src/v03/riding-saddle.js';
import {configurePlayerSize} from '../src/player-dimensions.js';
import {CharacterAnimator} from '../src/animation.js';
import {inspectPreparedEffects} from '../src/prepared-effect-lifetime.js';

function skipPaint(g){
 delete g.extensionsRequired;delete g.extensionsUsed;delete g.images;delete g.materials;delete g.textures;
 for(const m of g.meshes)for(const p of m.primitives)delete p.material;
}
function seatGap(mesh,worldPoint){
 const p=Vector3.TransformCoordinates(worldPoint,Matrix.Invert(mesh.getWorldMatrix()));
 const ray=new Ray(new Vector3(p.x,p.y+1,p.z),Vector3.Down());
 const vertices=mesh.getVerticesData('position'),indices=mesh.getIndices();let nearest=Infinity;
 for(let i=0;i<indices.length;i+=3){
   const [a,b,c]=[indices[i],indices[i+1],indices[i+2]].map(j=>Vector3.FromArray(vertices,j*3));
   const hit=ray.intersectsTriangle(a,b,c);
   if(hit&&hit.distance>=0)nearest=Math.min(nearest,hit.distance);
 }
 return nearest-1;
}
// Each side has eight diamond sections of leather and one twenty-vertex bit ring.
function reinSection(reins,positions,side,section){
 const offset=(52*side+4*section)*3;
 const local=new Vector3((positions[offset]+positions[offset+6])*.5,positions[offset+1],positions[offset+2]);
 return Vector3.TransformCoordinates(local,reins.getWorldMatrix());
}
// Lower surface of the clothing above the cushion, in saddle-local space.
function underside(points,indices,x,z){
 let lowest=Infinity;
 for(let i=0;i<indices.length;i+=3){
   const a=3*indices[i],b=3*indices[i+1],c=3*indices[i+2];
   const ux=points[b]-points[a],uz=points[b+2]-points[a+2],vx=points[c]-points[a],vz=points[c+2]-points[a+2];
   const det=ux*vz-uz*vx;if(Math.abs(det)<1e-10)continue;
   const dx=x-points[a],dz=z-points[a+2],u=(dx*vz-dz*vx)/det,v=(dz*ux-dx*uz)/det;
   if(u>=0&&v>=0&&u+v<=1)lowest=Math.min(lowest,points[a+1]+u*(points[b+1]-points[a+1])+v*(points[c+1]-points[a+1]));
 }
 return lowest;
}
test('shipped mobile warrior seats the skinned breeches on the back throughout locomotion, slope and turns; loading cancellation releases the mount',async t=>{
 const confUrl=new URL('../public/assets/warrior-v3-mobile4k.json',import.meta.url);
 const cfg=JSON.parse(readFileSync(confUrl)),rt=await readRuntimeGltf(new URL(cfg.model,confUrl)),g=rt.gltf;
 skipPaint(g);
 for(const b of g.buffers)b.uri='data:application/octet-stream;base64,'+rt.files.get(b.uri).data.toString('base64');
 const engine=new NullEngine(),scene=new Scene(engine);
 scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
 new FreeCamera('camera',new Vector3(0,2,-4),scene);
 const asset=await readMapContainer(scene,g,'file:///',{skipMaterials:true});asset.addAllToScene();
 const root=new TransformNode('player-world-transform',scene),lift=new TransformNode('rider-saddle-offset',scene);
 lift.parent=root;root.metadata={saddleOffset:lift};
 for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=lift;
 configurePlayerSize(root,cfg,{warrior:true});
 for(const mesh of asset.meshes)if(mesh.skeleton){
   if(mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind))mesh.numBoneInfluencers=8;
   mesh.skeleton.useTextureToStoreBoneMatrices=true;mesh.alwaysSelectAsActiveMesh=true;
 }
 const animator=new CharacterAnimator(asset.animationGroups,cfg.animations,{bindingCacheSize:9,prewarmBindings:true});
 const body=scene.getMeshByName('Warrior_Body_primitive0');
 const ankles=['Left','Right'].map(s=>scene.getTransformNodeByName('mixamorig:'+s+'Foot'));
 const grips=['Left','Right'].map(s=>scene.getTransformNodeByName('mixamorig:'+s+'HandMiddle1'));
 const originalFetch=globalThis.fetch,horse=readFileSync(new URL('../src/v03/models/wagon-horse-rig.glb',import.meta.url)),baseMeshes=scene.meshes.length;
 // Keep the real horse texture, imported materials and toon ownership. Stub only pixel decoding.
 t.mock.method(GLTFLoader.prototype,'_loadTextureAsync',function(_context,texture,assign){
   const image=RawTexture.CreateRGBATexture(new Uint8Array([70,45,35,255]),1,1,this.babylonScene,false,false);
   image.getInternalTexture().isReady=true;image.name=texture.name??'horse base colour';assign(image);return Promise.resolve(image);
 });
 let abort=false,hold=true;
 globalThis.fetch=(_url,{signal})=>{
  if(!hold)return Promise.resolve(new Response(horse));
  return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{abort=true;reject(signal.reason);},{once:true}));
 };
 const {document:doc}=parseHTML('<html lang="en"><body><main id="app"><div class="top-actions"></div><button id="attack-button"></button></main></body></html>');
 const heightAt=(x,z)=>.16*x-.07*z;
 const shadows=new ShadowGenerator(32,new DirectionalLight('sun',new Vector3(0,-1,0),scene));
 const world={mapId:'village',scene,shadows,terrain:{heightAt}};
 let collectingPose=false,compositions=0,measuredFrames=0,largestPose=0;
 const diagnostics={collecting:false,mark(){collectingPose=true;compositions=0;return 7;},measure(section,start){
   collectingPose=false;assert.equal(start,7);assert.equal(section,'ridingPoseMs');measuredFrames++;largestPose=Math.max(largestPose,compositions);
 }};
 const stable=createRidingHorse({world,diagnostics,
  root:doc.getElementById('app'),storage:{getItem:()=> '1',setItem(){}},player:()=>root,
  ridingAllowed:()=>true,tell(){},forwardYaw:()=>cfg.forwardYaw});
 const button=doc.querySelector('.v03-ride-toggle');
 const click=async()=>{
   await button.onclick();
   for(let frames=0;frames<130&&['approaching','mounting','dismounting','departing'].includes(stable.inspect().state);frames++){
     stable.afterMove({state:'idle'},0,.08);scene.render();engine.endFrame();
   }
 };
 try{
  const inventory=()=>Object.fromEntries(['meshes','transformNodes','geometries','materials','textures','skeletons','animationGroups','animatables']
    .map(k=>[k,scene[k].length]).concat([
      ['casters',shadows.getShadowMap().renderList?.length??0],
      ['beforeRender',scene.onBeforeRenderObservable.observers.filter(o=>!o._willBeUnregistered).length],
      ['sceneDispose',scene.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length]
    ]));
  scene.render();
  const onFoot=inventory();
  const priorTextures=new Set(scene.textures);
  const nextFrame=async()=>{await new Promise(resolve=>setTimeout(resolve,5));scene.render();engine.endFrame();};
  async function drawnPrograms(){
   const meshes=['v03-riding-saddle','wagon_horse'].map(name=>scene.getMeshByName(name));
   for(let i=0;i<100;i++){
    await nextFrame();
    const effects=meshes.map(mesh=>mesh.subMeshes[0]._getDrawWrapper(scene.activeCamera.renderPassId,false)?.effect);
    if(effects.every(effect=>effect?.isReady())&&meshes.every(mesh=>scene.isActiveMesh(mesh)))return effects;
   }
   assert.fail('saddle and painted horse did not complete their main-camera draw');
  }
  stable.updateAvailability();
  assert.deepEqual(stable.inspect(),{state:'on-foot',mounts:0,gait:null});
  const loading=click();assert.equal(button.textContent,'Cancel horse loading');assert.ok(!button.hidden&&!button.disabled);
  assert.deepEqual(stable.inspect(),{state:'loading',mounts:0,gait:null});
  await click();await loading;assert.ok(abort);assert.equal(scene.meshes.length,baseMeshes);assert.equal(lift.position.y,0);
  assert.equal(inspectPreparedEffects(engine).kept,0);
  hold=false;await click();assert.ok(stable.active);assert.equal(button.textContent,'Dismount');
  assert.deepEqual(stable.inspect(),{state:'mounted',mounts:1,gait:'Horse_Idle'});
  const skin=scene.meshes.find(m=>m.name==='wagon_horse');assert.ok(skin?.skeleton);
  assert.ok(shadows.getShadowMap().renderList.includes(skin));assert.ok(skin.material.albedoTexture);
  const paint=skin.material.pluginManager.getPlugin('MoonforestHorseCoat');
  assert.ok(paint);const originalAtlas=skin.material.albedoTexture,meshCount=scene.meshes.length;
  const subject=await stable.wardrobe.preview();
  assert.ok(subject.meshes.includes(skin));assert.ok(!subject.meshes.some(m=>m.name==='v03-riding-reins'));
  subject.setCoat('#eeeeee');assert.equal(paint.strength,1);subject.dispose();assert.equal(paint.strength,0);
  assert.ok(stable.wardrobe.setCoat('#8b6c51'));assert.equal(paint.strength,1);
  assert.equal(skin.material.albedoTexture,originalAtlas);assert.equal(scene.meshes.length,meshCount);
  for(const node of [...scene.meshes,...scene.transformNodes])node.onAfterWorldMatrixUpdateObservable.add(()=>{if(collectingPose)compositions++;});
  scene.render();assert.equal(measuredFrames,0);
  const mountedScene=inventory(),horse=scene.getTransformNodeByName('v03-wagon-horse');
  for(const area of ['great-plains','monster-forest','village']){
    stable.beginTravel(area);assert.ok(!horse.isEnabled()&&!stable.active);world.mapId=area;stable.updateAvailability();
    assert.ok(await stable.finishTravel(p=>({x:p.x,y:heightAt(p.x,p.z),z:p.z})));
    scene.render();assert.ok(horse.isEnabled()&&stable.active);assert.equal(scene.getMeshByName('wagon_horse'),skin);
    assert.deepEqual(inventory(),mountedScene);
  }
  diagnostics.collecting=true;
  const saddle=scene.getMeshByName('v03-riding-saddle');assert.ok(saddle);assert.equal(scene.getMeshByName('harness').isEnabled(),false);
  const reins=scene.getMeshByName('v03-riding-reins');assert.ok(reins);
  assert.equal(reins.material,saddle.material);assert.equal(reins.isPickable,false);
  assert.equal(reins.getTotalVertices(),104);assert.equal(reins.getTotalIndices(),456);
  const reinBuffer=reins.getVertexBuffer(VertexBuffer.PositionKind),reinPositions=reins.getVerticesData(VertexBuffer.PositionKind);
  for(const [state,speed] of [['idle',0],['walk',1.5],['run',5]]){
   for(let i=0;i<8;i++){
   root.rotation.y=i*Math.PI/4;root.position.set(.16*i,heightAt(.16*i,-.18*i),-.18*i);
   animator.transition(state==='idle'?'idle':'run',{clipTime:.083*i,loop:true});animator.update(1/60);
   stable.afterMove({state},speed);
   scene.render();
   // Sample the actual CPU-skinned source triangle under the rider. The game
   // uses four precomputed bind-local weights and never reads a mesh on a frame.
   const points=skin.getPositionData(true);
   assert.ok(reins.isEnabled());
   assert.equal(reins.getVertexBuffer(VertexBuffer.PositionKind),reinBuffer);
   assert.equal(reins.getVerticesData(VertexBuffer.PositionKind),reinPositions);
   for(const [side,grip] of grips.entries()){
     const hand=reinSection(reins,reinPositions,side,0),mouth=reinSection(reins,reinPositions,side,7);
     const surface=Vector3.TransformCoordinates(Vector3.FromArray(points,3*(side===0?8357:8168)),skin.getWorldMatrix());
     assert.ok(Vector3.Distance(hand,grip.absolutePosition)<.001,'rein missed hand during '+state);
     assert.ok(Vector3.Distance(mouth,surface)<.035,'bit missed the mouth corner during '+state);
     let length=0,last=hand;
     for(let index=1;index<=7;index++){
       const next=reinSection(reins,reinPositions,side,index);length+=Vector3.Distance(last,next);last=next;
     }
     assert.ok(length>.75&&length<1.2&&length>Vector3.Distance(hand,mouth)+.01,'rein lost its slack during '+state);
   }
   const weights=[.41430354,.54627857,.03941788];
   const at=[4456,4457,4458].reduce((y,id,k)=>y+weights[k]*Vector3.TransformCoordinates(Vector3.FromArray(points,id*3),skin.getWorldMatrix()).y,0);
   const garment=body.getPositionData(true),seat=Vector3.Zero();
   for(const id of [16262,16108]){
     const fitted=Vector3.TransformCoordinates(Vector3.FromArray(garment,id*3),body.getWorldMatrix());
     const gap=seatGap(saddle,fitted);
     assert.ok(Math.abs(gap)<.004,`seat side ${id} gap ${gap} during ${state}`);
     seat.addInPlace(fitted.scale(.5));
   }
   assert.ok(Math.abs(seat.y-at-(SADDLE_PAD_HEIGHT-.003))<.001,'armour lost saddle contact during '+state);
   const local=body.getWorldMatrix().multiply(Matrix.Invert(saddle.getWorldMatrix())),point=Vector3.Zero();
   const localCloth=new Float32Array(garment.length);
   for(let v=0;v<garment.length;v+=3){Vector3.FromArrayToRef(garment,v,point);Vector3.TransformCoordinatesToRef(point,local,point);point.toArray(localCloth,v);}
   // The old twin tabs touched while the actual seated area floated above them.
   for(const [x,z] of [[-.055,0],[.055,0],[-.055,-.022],[.055,-.022],[0,-.024],[0,.005],[0,.024]]){
     const y=underside(localCloth,body.getIndices(),x,z);
     const gap=seatGap(saddle,Vector3.TransformCoordinates(new Vector3(x,y,z),saddle.getWorldMatrix()));
     assert.ok(gap>=-.001&&gap<=.014,`cushion gap ${gap} at ${x},${z} in ${state}`);
   }
   const side=new Vector3(Math.cos(root.rotation.y),0,-Math.sin(root.rotation.y));
   for(const [j,ankle] of ankles.entries()){ankle.computeWorldMatrix(true);const d=Vector3.Dot(ankle.absolutePosition.subtract(saddle.absolutePosition),side);
    const lateral=j===0?d:-d;assert.ok(lateral>.38&&lateral<.44,'boot lost its place on the flank during '+state);}
   }
  }
  diagnostics.collecting=false;
  const firstPrograms=await drawnPrograms();
  assert.match(firstPrograms[1].fragmentSourceCode,/if\s*\(horseCoat\.w\s*>\s*\.5\)/);
  assert.ok(stable.wardrobe.setCoat('#ffffff'));
  assert.equal((await drawnPrograms())[1],firstPrograms[1],'changing the coat reuses the same shader');
  await click();assert.equal(scene.meshes.length,baseMeshes);assert.equal(lift.position.y,0);assert.equal(scene.animationGroups.length,asset.animationGroups.length);
  assert.ok(reins.isDisposed());
  assert.equal(measuredFrames,24);
  assert.ok(largestPose>0&&largestPose<200,'world matrices recomposed in one rider fit: '+largestPose);
  assert.deepEqual(stable.inspect(),{state:'on-foot',mounts:1,gait:null});
  await nextFrame();
  assert.ok(firstPrograms.every(effect=>!effect.isDisposed));
  assert.equal(inspectPreparedEffects(engine).kept,2);assert.equal(inspectPreparedEffects(engine).liveOwners,0);
  assert.ok(scene.objectRenderers.every(renderer=>!renderer.getActiveMeshes().data.includes(skin)));
  assert.ok(scene._registeredForLateAnimationBindings.data.every(node=>!node?.isDisposed?.()));
  const afterFirst=inventory();
  // This bare scene had no other painted actors. The first one initializes two
  // scene-wide textures, their disposal hooks and the shared outline material.
  const sceneTextures=scene.textures.filter(texture=>!priorTextures.has(texture)).map(texture=>texture.name).sort();
  assert.deepEqual(sceneTextures,['cave-fog-inactive-sampler','data:EnvironmentBRDFTexture0']);
  assert.deepEqual(afterFirst,{...onFoot,materials:onFoot.materials+1,textures:onFoot.textures+2,sceneDispose:onFoot.sceneDispose+2});
  assert.ok(scene.materials.some(material=>material.name==='moonforest-character-outline'));
  assert.equal(measuredFrames,24);
  await click();const remountedReins=scene.getMeshByName('v03-riding-reins');assert.ok(stable.active&&remountedReins);
  world.mapId='witch-cave';stable.updateAvailability();
  assert.equal(stable.active,false);assert.ok(remountedReins.isDisposed());assert.equal(scene.meshes.length,baseMeshes);
  world.mapId='village';stable.updateAvailability();
  for(let cycle=0;cycle<4;cycle++){
    await click();const programs=await drawnPrograms();
    assert.ok(programs.every((effect,i)=>effect===firstPrograms[i]),'remount compiled a replacement program');
    await click();await nextFrame();
    assert.equal(inspectPreparedEffects(engine).kept,2);assert.equal(inspectPreparedEffects(engine).refs,0);
    assert.deepEqual(inventory(),afterFirst);
  }
  assert.deepEqual(stable.inspect(),{state:'on-foot',mounts:6,gait:null});
  t.diagnostic('World matrices per mounted fit (max) '+largestPose+'. After dismount '+JSON.stringify(afterFirst));
 }finally{stable.dispose();animator.dispose();asset.dispose();scene.dispose();engine.dispose();globalThis.fetch=originalFetch;}
 assert.equal(inspectPreparedEffects(engine).kept,0);
});
