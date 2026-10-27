import {Engine,Scene,ArcRotateCamera,Color3,Color4,Vector3,HemisphericLight,DirectionalLight,SceneLoader,TransformNode,VertexBuffer,MeshBuilder,StandardMaterial,ShadowGenerator} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {applyMonsterToon} from '../src/monster-toon.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {attachCharacterOutlines,isRuntimeOutline} from '../src/character-outlines.js';
import {applyHitFlash} from '../src/hit-feedback.js';
const engine=new Engine(document.querySelector('canvas'),true),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.68,.76,.77,1);
new ArcRotateCamera('camera',Math.PI/2,1.3,7,new Vector3(0,1.0,0),scene).attachControl(document.querySelector('canvas'),true);
new HemisphericLight('sky',new Vector3(0,1,0),scene).intensity=.65;
const key=new DirectionalLight('key',new Vector3(.65,-1,-.45),scene);key.position=new Vector3(-4,8,5);key.intensity=1.65;
const shadows=new ShadowGenerator(1024,key);shadows.usePercentageCloserFiltering=true;shadows.normalBias=.02;shadows.bias=.0008;
const floor=MeshBuilder.CreateGround('floor',{width:30,height:20},scene);floor.material=new StandardMaterial('floor',scene);floor.material.diffuseColor=new Color3(.48,.57,.53);floor.material.specularColor=Color3.Black();floor.receiveShadows=true;
const assets=[],groups=[],stats=[];let playing=false;
for(const [kind,name,xs] of [['bear','guardian-bear',[-3.9,-1.4]],['goblin','hooded-goblin',[1.4,3.7]]]){
 const config=await(await fetch(`/assets/${name}.json`)).json(),url=new URL(config.model,new URL('/assets/',location.href));
 const container=await SceneLoader.LoadAssetContainerAsync(new URL('.',url).href,url.pathname.split('/').pop(),scene);container.animationGroups.forEach(g=>g.stop());
 for(const [index,x] of xs.entries()){
  const asset=instantiateBossModel(container),actor=new TransformNode(`${kind}-${index}`,scene);actor.position.x=x;actor.scaling.setAll(config.scale);actor.rotation.y=index?-.55:.4;
  for(const n of new Set([...asset.meshes,...asset.transformNodes]))if(!n.parent)n.parent=actor;
  for(const mesh of asset.meshes)if(mesh.getTotalVertices()){mesh.receiveShadows=true;if(mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind))mesh.numBoneInfluencers=8;shadows.addShadowCaster(mesh,false);}
  applyMonsterToon(asset);attachCharacterOutlines(asset,kind);assets.push(asset);
  const group=asset.animationGroups.find(g=>g.name==='Running')||asset.animationGroups[0];group.start(true);group.goToFrame(12);group.pause();groups.push(group);
  for(const mesh of asset.meshes)if(mesh.getTotalVertices()&&!isRuntimeOutline(mesh))stats.push({kind,triangles:mesh.getTotalIndices()/3,material:mesh.material.getClassName(),unlit:mesh.material.unlit,lightingDisabled:mesh.material.disableLighting,color:mesh.material.albedoColor.asArray(),texture:mesh.material.albedoTexture?.name,alpha:mesh.material.alpha,rig:mesh.skeleton?.name});
 }
}
document.querySelector('#outline').onclick=()=>assets.flatMap(a=>a.meshes).filter(isRuntimeOutline).forEach(m=>m.isVisible=!m.isVisible);
document.querySelector('#flash').onclick=()=>{assets.forEach(a=>applyHitFlash(a.meshes,.25));setTimeout(()=>assets.forEach(a=>applyHitFlash(a.meshes,0)),700);};
document.querySelector('#animate').onclick=()=>{playing=!playing;groups.forEach(g=>playing?g.play(true):g.pause());};
document.querySelector('#stats').textContent=JSON.stringify(stats,null,1);
await scene.whenReadyAsync();document.querySelector('#status').textContent='Ready';
engine.runRenderLoop(()=>scene.render());addEventListener('resize',()=>engine.resize());
