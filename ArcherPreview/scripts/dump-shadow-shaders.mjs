// Produce Babylon's processed WebGL2 variants for native GLSL compilation.
// No browser or visible window is opened.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ArcRotateCamera,Bone,DirectionalLight,Matrix,MeshBuilder,NullEngine,PBRMaterial,Scene,ShadowGenerator,Skeleton,Vector3,VertexBuffer} from '@babylonjs/core';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {installVillageShadowFade,prepareShadowFade} from '../src/village-shadow-fade.js';
const directory=resolve(process.argv[2]??'reports/loading-shadow-diagnostics');await mkdir(directory,{recursive:true});
for(const variant of ['instances','static','skinned']){
  const engine=new NullEngine(),scene=new Scene(engine);engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.disableUniformBuffers=false;
  Object.assign(engine.getCaps(),{instancedArrays:true,textureFloat:true,maxVertexTextureImageUnits:16});
  engine._features.supportShadowSamplers=true;
  new ArcRotateCamera('camera',0,1,20,Vector3.Zero(),scene);
  const light=new DirectionalLight('sun',new Vector3(-.4,-1,-.6),scene),shadows=new ShadowGenerator(1024,light);shadows.usePercentageCloserFiltering=true;shadows.normalBias=.02;installVillageShadowFade(shadows);
  const source=MeshBuilder.CreateBox('source',{},scene);source.material=new PBRMaterial('paint',scene);source._instanceDataStorage.useMonoDataStorageRenderPass=false;prepareShadowFade(source);
  if(variant==='instances'){source.isVisible=false;const mesh=source.createInstance('instance');mesh.instancedBuffers.villageShadowFade=.5;shadows.addShadowCaster(mesh,false);}
  else {
    if(variant==='skinned'){
      const skeleton=new Skeleton('rig','rig',scene);new Bone('root',skeleton,null,Matrix.Identity());source.skeleton=skeleton;source.numBoneInfluencers=8;skeleton.useTextureToStoreBoneMatrices=true;
      const count=source.getTotalVertices(),indices=new Float32Array(count*4),weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;
      source.setVerticesData(VertexBuffer.MatricesIndicesKind,indices);source.setVerticesData(VertexBuffer.MatricesWeightsKind,weights);
      source.setVerticesData(VertexBuffer.MatricesIndicesExtraKind,indices);source.setVerticesData(VertexBuffer.MatricesWeightsExtraKind,new Float32Array(count*4));skeleton.prepare();
    }
    shadows.addShadowCaster(source,false);
  }
  let effect;shadows.onBeforeShadowMapRenderObservable.add(value=>{effect=value;});
  await source.material.forceCompilationAsync(source,{useInstances:variant==='instances'});await shadows.forceCompilationAsync({useInstances:variant==='instances'});scene.render();
  if(!effect)throw new Error('Missing shadow shader '+variant);
  for(const [ext,key]of [['vert','vertexSourceCode'],['frag','fragmentSourceCode']])await writeFile(resolve(directory,variant+'.'+ext),'#version 300 es\n'+effect.defines+'\n'+effect[key]);
  console.log(JSON.stringify({variant,attributes:effect.getAttributesNames(),defines:effect.defines}));engine.dispose();
}
