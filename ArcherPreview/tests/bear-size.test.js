import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {BEAR_V02_SIZE,bearEncounterSize} from '../src/bear-size.js';

function heightOf(enemy){
  for(const node of [enemy.actor,enemy.carrier,...enemy.asset.transformNodes,...enemy.asset.meshes])node.computeWorldMatrix(true);
  for(const skeleton of enemy.asset.skeletons)skeleton.prepare(true);
  let min=Infinity,max=-Infinity;
  for(const mesh of enemy.asset.meshes){
    if(!mesh.getTotalVertices()||mesh.metadata?.moonforestOutline)continue;
    const positions=mesh.getPositionData(true,true),world=mesh.computeWorldMatrix(true);
    for(let i=0;i<positions.length;i+=3){const y=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),world).y;min=Math.min(min,y);max=Math.max(max,y);}
  }
  return max-min;
}

test('0.2 shipped skinned bear has a 4.5m default guard pose and proportional geometry without changing 0.1 or source clips',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const loader=new GLTFFileLoader();loader.skipMaterials=true;
  t.after(()=>{loader.dispose();scene.dispose();engine.dispose();});
  const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('guardian-bear.json',base))),before=JSON.stringify(config);
  const decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  for(const group of container.animationGroups)group.stop();
  const paint=new StandardMaterial('bear-size-test',scene);
  for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
  const player=new TransformNode('player',scene),encounters=[];
  for(const release of ['moonforest-0.1','moonforest-0.2']){
    const world={scene,release,terrain:{place:p=>{p.y=0;}},shadows:{addShadowCaster(){},removeShadowCaster(){}}};
    const enemy=new BossEncounter(world,()=>{},()=>{},()=>{},{loadAsset:async()=>({config,asset:instantiateBossModel(container)})});
    await enemy.summon(player,{position:Vector3.Zero(),rotationY:0,preparation:createBossPreparation({frame:async()=>{}})});
    enemy.animator.clips.Block6.goToFrame(0,false);enemy.dt=1/60;enemy.alignPose();
    encounters.push(enemy);
  }
  const [old,bear]=encounters,q=BEAR_V02_SIZE.sizeScale,oldHeight=heightOf(old),height=heightOf(bear);
  assert.ok(Math.abs(height-4.5)<1e-5,`actual skinned height ${height}`);
  assert.ok(Math.abs(BEAR_V02_SIZE.scale/(3/BEAR_V02_SIZE.sourceHeight)-1.5)<1e-12,'1.5x the previous 3m actor scale');
  assert.ok(Math.abs(oldHeight-2.3436112135648726)<1e-5,`preserved 0.1 height ${oldHeight}`);
  assert.equal(old.config,config);assert.notEqual(bear.config,config);assert.equal(JSON.stringify(config),before);
  assert.equal(old.actor.scaling.x,1.45);assert.equal(bear.actor.scaling.x,BEAR_V02_SIZE.scale);
  for(const key of ['radius','stopDistance','separationRadius'])assert.ok(Math.abs(bear[key]-old[key]*q)<1e-12,key);
  const oldCapsules=old.hurtCapsules(),capsules=bear.hurtCapsules();
  for(let i=0;i<capsules.length;i++)assert.ok(Math.abs(capsules[i].radius-oldCapsules[i].radius*q)<1e-12);
  assert.equal(bear.attackRange({range:2.4}),old.attackRange({range:2.4})*q);
  assert.equal(bear.brain.update(.1,5*q).speed,old.brain.update(.1,5).speed);
  assert.equal(bear.brain.state,old.brain.state);assert.equal(bear.brain.time,old.brain.time);
  assert.deepEqual(bear.asset.animationGroups.map(g=>[g.name,g.from,g.to,g.targetedAnimations.length]),old.asset.animationGroups.map(g=>[g.name,g.from,g.to,g.targetedAnimations.length]));
  assert.deepEqual(bear.asset.skeletons.map(s=>s.bones.length),old.asset.skeletons.map(s=>s.bones.length));
  assert.equal(bearEncounterSize({}),null);
  console.log(JSON.stringify({referencePose:'Block6 frame 0',actualHeight:height,preservedV01Height:oldHeight,scale:bear.config.scale,sizeRatio:q,clips:bear.asset.animationGroups.length,checks:'native skin height; independent config; proportionate navigation/hurt/range; preserved movement speed/timing and rig/clip layout'}));
  for(const enemy of encounters)enemy.hide();container.dispose();
});
