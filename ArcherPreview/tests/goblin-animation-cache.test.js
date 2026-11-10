import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Animation,AnimationGroup,NullEngine,Quaternion,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {CharacterAnimator} from '../src/animation.js';
import {GoblinBrain} from '../src/goblin-spec.js';
import {GoblinEncounter} from '../src/goblin-encounter.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readAccessor} from '../scripts/web-geometry.js';

const base=new URL('../public/assets/',import.meta.url);
const config=JSON.parse(readFileSync(new URL('hooded-goblin.json',base)));
const {gltf,files}=await readRuntimeGltf(new URL(config.model,base));
const tracks=gltf.animations.map(clip=>({name:clip.name,channels:clip.channels.map(channel=>{
 const sampler=clip.samplers[channel.sampler];
 const read=index=>{const a=gltf.accessors[index],width={SCALAR:1,VEC3:3,VEC4:4}[a.type],values=readAccessor(gltf,files,index);return Array.from({length:a.count},(_,i)=>Array.from(values.subarray(i*width,(i+1)*width)));};
 return {...channel.target,interpolation:sampler.interpolation??'LINEAR',times:read(sampler.input).flat(),values:read(sampler.output)};
})}));
const property={translation:'position',rotation:'rotationQuaternion',scale:'scaling'};
function fixture(cache){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const nodes=gltf.nodes.map(n=>{const node=new TransformNode(n.name,scene);node.position.copyFromFloats(...(n.translation??[0,0,0]));node.rotationQuaternion=Quaternion.FromArray(n.rotation??[0,0,0,1]);node.scaling.copyFromFloats(...(n.scale??[1,1,1]));return node;});
 gltf.nodes.forEach((n,i)=>(n.children??[]).forEach(child=>nodes[child].parent=nodes[i]));
 const groups=tracks.map(clip=>{const group=new AnimationGroup(clip.name,scene);for(const t of clip.channels){
  const a=new Animation(clip.name+'-'+t.node+'-'+t.path,property[t.path],60,t.path==='rotation'?Animation.ANIMATIONTYPE_QUATERNION:Animation.ANIMATIONTYPE_VECTOR3);
  a.setKeys(t.times.map((time,i)=>({frame:time*60,value:t.path==='rotation'?Quaternion.FromArray(t.values[i]):Vector3.FromArray(t.values[i]),...(t.interpolation==='STEP'?{interpolation:1}:{})})));group.addTargetedAnimation(a,nodes[t.node]);
 }return group;});
 const animator=new CharacterAnimator(groups,config.animations,{bindingCacheSize:cache});
 return {engine,scene,nodes,groups,animator,step(state,spec,dt){animator.transition(state,spec);animator.update(dt);scene._animate(0);},dispose(){animator.dispose();assert.equal(scene._activeAnimatables.length,0);for(const g of groups)assert.equal(g.animatables.length,0);scene.dispose();engine.dispose();}};
}
function samePose(a,b){
 let error=0;for(let i=0;i<a.nodes.length;i++){const x=a.nodes[i].computeWorldMatrix(true).m,y=b.nodes[i].computeWorldMatrix(true).m;for(let j=0;j<16;j++)error=Math.max(error,Math.abs(x[j]-y[j]));}
 assert.ok(error<2e-5,`goblin world pose mismatch ${error}`);
}

test('real goblin clips reuse bounded bindings on state changes, without changing poses, combat events or death cleanup',t=>{
 const a=fixture(0),b=fixture(2),brain=new GoblinBrain(a.animator.durations,()=>.2);
 try{
  assert.equal(b.animator.inspectBindingCache().eligible,true);
  for(let frame=0;frame<900;frame++){
   if(frame===180)brain.hit({damage:1});if(frame===420)brain.hit({damage:1,heavy:true});if(frame===800)brain.hit({damage:1000});
   const result=brain.update(1/60,frame<120?5:1,true);
   const spec={clipTime:brain.time,actionId:brain.serial,loop:['move','approach'].includes(brain.mode),blendDuration:['down','recover'].includes(brain.mode)?.10:.16};
   const before=b.animator.inspectBindingCache().created;
   for(const f of [a,b])f.step(brain.state,spec,1/60);
   if(frame>0&&brain.serial===b.lastSerial)assert.equal(b.animator.inspectBindingCache().created,before,'bindings are not created every frame');
   b.lastSerial=brain.serial;samePose(a,b);
   assert.ok(b.animator.bindingCache.size<=2);assert.ok(Number.isFinite(result.speed));
  }
  assert.ok(b.animator.inspectBindingCache().reused>0);
  assert.ok(b.animator.inspectBindingCache().created<a.animator.inspectBindingCache().created);
  t.diagnostic(JSON.stringify({frames:900,baseline:a.animator.inspectBindingCache(),cached:b.animator.inspectBindingCache(),scope:'Babylon NullEngine with shipped goblin animation tracks; not mobile FPS or GPU'}));
  const created=b.animator.inspectBindingCache().created;
  for(let i=0;i<90;i++){b.step(brain.state,{clipTime:brain.time,actionId:brain.serial,blendDuration:.16},1/60);assert.equal(b.animator.inspectBindingCache().created,created);}
 }finally{a.dispose();b.dispose();}
});

test('goblin production encounter selects a bounded cache',()=>{
 const probe=fixture(0);
 try{const animator=GoblinEncounter.prototype.createAnimator.call({kind:'goblin',asset:{animationGroups:probe.groups},config});assert.equal(animator.bindingCacheSize,2);assert.equal(animator.bindingCacheCompatible,true);animator.dispose();}
 finally{probe.dispose();}
});

test('Babylon loader and independently cloned shipped goblins are eligible and keep matching skin pose',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const json=structuredClone(gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])json[key]=(json[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;
 const container=await loader.loadAssetContainerAsync(scene,{json},'');
 const assets=[instantiateBossModel(container),instantiateBossModel(container)];
 const animators=assets.map((asset,index)=>new CharacterAnimator(asset.animationGroups,config.animations,{bindingCacheSize:index?2:0}));
 try{
  assert.equal(animators[1].bindingCacheCompatible,true);
  const states=['Walking','Running','Right_Jab_from_Guard','Walking','Knock_Down','Walking'];
  for(let cycle=0;cycle<3;cycle++)for(const [i,state]of states.entries()){
   for(const animator of animators){animator.transition(state,{clipTime:.2,actionId:cycle*states.length+i,blendDuration:.1});animator.update(.2);}
   scene._animate(0);
   for(let s=0;s<assets[0].skeletons.length;s++){
    const [a,b]=assets.map(asset=>{const sk=asset.skeletons[s],mesh=asset.meshes.find(m=>m.skeleton===sk);sk.prepare(true);return sk.getTransformMatrices(mesh);});
    assert.equal(a.length,b.length);for(let k=0;k<a.length;k++)assert.ok(Math.abs(a[k]-b[k])<2e-5,`${state} bone matrix ${k}`);
   }
  }
  assert.ok(animators[1].inspectBindingCache().reused>0);
 }finally{for(const animator of animators)animator.dispose();for(const asset of assets){for(const group of asset.animationGroups)group.dispose();for(const node of [...asset.meshes,...asset.transformNodes])node.dispose();for(const skeleton of asset.skeletons)skeleton.dispose();}container.dispose();loader.dispose();scene.dispose();engine.dispose();}
});
