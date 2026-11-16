import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,TransformNode,Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './read-runtime-gltf.js';
import {BossEncounter} from '../../src/boss-encounter.js';
import {instantiateBossModel} from '../../src/boss-models.js';
import {createBossPreparation} from '../../src/boss-preparation.js';
import {WARRIOR_DIMENSIONS} from '../../src/player-dimensions.js';
export async function bearContactFixture(t){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;new FreeCamera('camera',new Vector3(0,4,-10),scene);Object.assign(engine.getCaps(),{maxVertexUniformVectors:256,maxVertexTextureImageUnits:16,textureFloat:true});
 const base=new URL('../../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('guardian-bear.json',base))),{gltf,files}=await readRuntimeGltf(new URL(config.model,base));
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const group of container.animationGroups)group.stop();const paint=new StandardMaterial('bear-contact-test',scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
 const player=new TransformNode('actual-player-capsule',scene);player.metadata={playerDimensions:WARRIOR_DIMENSIONS};player.position.set(0,0,3);
 const world={scene,release:'moonforest-0.2',terrain:{heightAt:()=>0,place:p=>{p.y=0;}},shadows:{addShadowCaster(){},removeShadowCaster(){}}},damage=[];
 const bear=new BossEncounter(world,()=>{},(...event)=>damage.push(event),()=>{},{loadAsset:async()=>({config,asset:instantiateBossModel(container)})});await bear.summon(player,{position:Vector3.Zero(),rotationY:0,preparation:createBossPreparation({incremental:false})});
 const head=new TransformNode('player-head-contact-fixture',scene),foot=new TransformNode('player-foot-contact-fixture',scene);head.parent=foot.parent=player;head.position.y=WARRIOR_DIMENSIONS.headHeight;foot.position.set(.1,.05,0);bear.playerNodes={'mixamorig:Head':head,'mixamorig:RightFoot':foot};
 const sample=(name,time)=>{bear.brain.start(name,'attack');bear.brain.time=time;bear.dt=1/60;bear.groundHeight=.075;bear.animator.transition(name,{clipTime:time,actionId:bear.brain.serial,blendDuration:0});bear.animator.update(.2);scene._animate(0);bear.prepareContactPose(player,{state:'idle'});};
 const dispose=()=>{bear.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();};if(t)t.after(dispose);return {bear,player,world,scene,damage,sample,dispose};
}
