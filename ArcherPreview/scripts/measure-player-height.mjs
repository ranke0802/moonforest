import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {orderPoseNodes,refreshPoseMatrices} from '../src/pose-matrices.js';
import {CharacterAnimator} from '../src/animation.js';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'reports/player-160cm');mkdirSync(out,{recursive:true});
const config=JSON.parse(readFileSync(resolve(root,'public/assets/warrior-v3.json'),'utf8'));
const url=new URL(config.model,new URL('../public/assets/',import.meta.url)),source=await readRuntimeGltf(url),gltf=structuredClone(source.gltf);
for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const loader=new GLTFFileLoader();loader.skipMaterials=true;
const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
for(const group of container.animationGroups)group.stop();
const actor=new TransformNode('height-audit-player',scene);
for(const node of new Set([...container.meshes,...container.transformNodes]))if(!node.parent)node.parent=actor;
const pose=orderPoseNodes([...container.meshes,...container.transformNodes]);
const body=container.meshes.filter(m=>m.getTotalVertices()&&!/Outline/.test(m.name)&&/^Warrior_(Body(?:_primitive\d+)?|Hair|Face|Ear\.[LR]|Neck)$/.test(m.name));
if(body.length<6||!body.some(m=>m.name.startsWith('Warrior_Body')))throw new Error('Unexpected reviewed warrior body mesh set: '+body.map(m=>m.name));
const p=new Vector3();
function bounds(scale){
  actor.scaling.setAll(scale);actor.computeWorldMatrix(true);refreshPoseMatrices(pose);
  for(const skeleton of container.skeletons)skeleton.prepare(true);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const mesh of body){const world=mesh.computeWorldMatrix(true),positions=mesh.getPositionData(true,true);
    for(let i=0;i<positions.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(positions[i],positions[i+1],positions[i+2],world,p);
      for(const [k,v]of p.asArray().entries()){min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);}}
  }return {min,max,height:max[1]-min[1]};
}
const sourceBind=bounds(1),oldBind=bounds(config.scale),targetScale=1.6/sourceBind.height,targetBind=bounds(targetScale);
const animator=new CharacterAnimator(container.animationGroups,config.animations);
animator.transition('idle',{clipTime:0,loop:true});animator.update(0);scene._animate(0);
const idle=bounds(targetScale),nodes=Object.fromEntries(container.transformNodes.filter(n=>['mixamorig:Head','mixamorig:RightFoot','mixamorig:LeftFoot'].includes(n.name)).map(n=>[n.name,n.getAbsolutePosition().asArray()]));
const report={scope:'Actual decoded and CPU-skinned reviewed runtime body, boots to hair top; excludes weapon, cape and outline shell. Reference is exported upright bind pose; animation may bend or jump.',modelSha256:createHash('sha256').update(readFileSync(url)).digest('hex'),bodyMeshes:body.map(m=>m.name),oldScale:config.scale,sourceBind,oldBind,targetScale,targetBind,idle,nodes,relativeScale:targetScale/config.scale};
writeFileSync(resolve(out,'height-measurement.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
animator.dispose();container.dispose();loader.dispose();scene.dispose();engine.dispose();
