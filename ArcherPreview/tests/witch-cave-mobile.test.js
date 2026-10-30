import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,ArcRotateCamera,Vector3,Frustum,PBRMaterial,HemisphericLight,DirectionalLight,ShadowGenerator} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {CAVE_PLACEMENTS as VILLAGE_PLACEMENTS,CAVE_ROUTES} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain as createVillageTerrain} from '../src/witch-cave-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {installVillageGeometry} from '../src/village-streamed-environment.js';
import {placementBounds} from '../src/village-demand.js';
import {VillageVisibility} from '../src/village-visibility.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {TreeOcclusion,prepareTreeOcclusion} from '../src/tree-occlusion.js';
import {applyVillageToon} from '../src/village-toon.js';
import {SceneLighting} from '../src/scene-lighting.js';
import {MovingSky} from '../src/sky.js';
import {prepareVillageInstancing} from '../src/village-instancing.js';
import {villageLodSources} from '../src/village-lod.js';
import {renderPixelRatio,RenderActivity} from '../src/render-policy.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

// S23 and iPhone 14 Pro viewports/DPR with the shared mobile policy. NullEngine
// validates draw submission, not real GPU rasterization, upload time or thermals.
for(const [orientation,width,height]of [['S23 landscape',780,360],['S23 portrait',360,780]]){
 test('witch cave mobile '+orientation+' keeps complete rock/prop draws during movement, turns and delayed LOD promotion',async t=>{
  const ratio=renderPixelRatio(3,'high',true),engine=new NullEngine({renderWidth:width*ratio,renderHeight:height*ratio}),scene=new Scene(engine);
  // RawTexture uploads complete on the GPU in production, absent in NullEngine.
  caveFogFallback(scene).getInternalTexture().isReady=true;
  scene.useRightHandedSystem=true;engine.getCaps().instancedArrays=true;t.after(()=>engine.dispose());
  const camera=new ArcRotateCamera('camera',1.2,1.14,13,new Vector3(0,1.22,6),scene);camera.fov=.65;camera.minZ=.05;camera.maxZ=300;
  const ambient=new HemisphericLight('sky',Vector3.Up(),scene),key=new DirectionalLight('sun',new Vector3(-.4,-1,-.6),scene),rim=new DirectionalLight('rim',Vector3.Down(),scene),shadows=new ShadowGenerator(1024,key);
  new MovingSky(scene);scene.fogStart=65;scene.fogEnd=80;
  const lighting=new SceneLighting(scene,{ambient,key,rim,shadows,touchDevice:true,village:true}),world={scene,camera,terrain:createVillageTerrain(),touchDevice:true,lighting,shadows};
  lighting.setQuality('high');assert.equal(new RenderActivity(true).limit({busy:true}),30);assert.equal(ratio,2);
  const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base))),assets=[],records=[],sources=new Set();
  const ids=Object.keys(manifest.assets);
  for(const id of ids){
   const config=manifest.assets[id],asset={tiers:new Map(),baseLevel:Infinity,containers:new Map()};assets.push(asset);
   for(const variant of villageLodSources(config,true)){
    const {gltf,files}=await readRuntimeGltf(new URL(variant.model,base));
    for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
    const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
    const meshes=container.meshes.filter(m=>m.getTotalVertices()>0);
    // The production glTF loader explicitly sets OPAQUE. Match that authored
    // mode while omitting GPU textures; the test's default PBRMaterial otherwise
    // enables blending merely because the forest has a VEC4 vertex color.
    assert.ok(gltf.materials.every(m=>(m.alphaMode??'OPAQUE')==='OPAQUE'));
    for(const m of meshes){m.material=new PBRMaterial(id+variant.level,scene);m.material.transparencyMode=0;m.material.backFaceCulling=!['tree','plant'].includes(config.category);m.metadata={villageLodLevel:variant.level};}
    prepareVillageInstancing(meshes);applyVillageToon(meshes,lighting);prepareTreeOcclusion(meshes);lighting.registerMeshes(meshes);
    for(const m of meshes)await m.material.forceCompilationAsync(m,{useInstances:true});
    asset.containers.set(variant.level,container);
   }
   installVillageGeometry(asset,asset.containers.get(2),2,world);
   for(const placement of VILLAGE_PLACEMENTS.filter(p=>p.asset===id)){
    const {root,facing}=createVillageTransform(world,placement,config),entries=asset.source.instantiateModelsToScene(n=>root.name+n,false,{doNotInstantiate:false});
    for(const node of entries.rootNodes)node.parent=facing;
    const meshes=root.getChildMeshes().filter(m=>m.getTotalVertices()>0);
    for(const m of meshes){m.computeWorldMatrix(true);m.freezeWorldMatrix();}facing.freezeWorldMatrix();root.freezeWorldMatrix();
    const bounds=placementBounds(world,placement,config);
    for(const m of meshes){const bb=m.getBoundingInfo().boundingBox;for(const axis of ['x','y','z']){assert.ok(bb.minimumWorld[axis]>=bounds.min[axis]-.05,'conservative lower bound '+placement.id+axis);assert.ok(bb.maximumWorld[axis]<=bounds.max[axis]+.05,'conservative upper bound '+placement.id+axis);}}
    records.push({root,meshes,placement,min:bounds.min,max:bounds.max});
   }
  }
  const visibility=new VillageVisibility(world,records,{touch:true}),fade=new TreeOcclusion(records.map(r=>r.root)),stats={},ink=new VillageOutlines(world,records,stats);
  t.after(()=>{ink.dispose();visibility.dispose();});
  const drawn=new Set(),shadowDrawn=new Set(),levels=new Set(),lastLevel=new WeakMap();let transitions=0,examined=0,rockDraws=0,shadowDraws=0;
  const register=()=>{
   for(const asset of assets)for(const source of new Set([...asset.baseMeshes,...[...asset.tiers.values()].flatMap(t=>t.meshes)])){
    if(sources.has(source))continue;sources.add(source);ink.sourceFor(source);
    const original=source._processRendering;
    source._processRendering=function(mesh,subMesh,effect,fill,batch,...args){
     const isBase=!ink.drawing&&!scene._isInIntermediateRendering(),instances=batch.visibleInstances[subMesh._id]??[];
     const result=original.call(this,mesh,subMesh,effect,fill,batch,...args);
     if(scene._isInIntermediateRendering())for(const m of instances)shadowDrawn.add(m);
     if(isBase&&instances.length){
      assert.equal(engine.getDepthWrite(),true);assert.equal(subMesh.indexCount,this.getTotalIndices(),'complete topology for '+this.name);
      const data=batch.parent.instancesData;let offset=batch.renderSelf[subMesh._id]?16:0;
      for(const m of instances){
       drawn.add(m);assert.ok(m.instancedBuffers.treeCoverage>=.44);levels.add(this.metadata.villageLodLevel);
       if(lastLevel.has(m)&&lastLevel.get(m)!==this.metadata.villageLodLevel)transitions++;
       lastLevel.set(m,this.metadata.villageLodLevel);
       assert.deepEqual(Array.from(data.slice(offset,offset+16)),Array.from(m.getWorldMatrix().m),'instance matrices match placement in camera pass');offset+=16;
      }
     }
     return result;
    };
   }
  };
  register();await ink.prepare();
  for(let frame=0;frame<210;frame++){
   if(frame===30||frame===65){
    const level=frame===30?1:0;
    for(const asset of assets)installVillageGeometry(asset,asset.containers.get(level),level,world);
    register();await ink.prepare();fade.refreshRoots(records.map(r=>r.root));
   }
   const route=CAVE_ROUTES[frame<105?0:1],phase=(frame%105)/104*(route.length-1),part=Math.min(route.length-2,Math.floor(phase)),u=phase-part,a=route[part],b=route[part+1];
   const target=new Vector3(a[0]+(b[0]-a[0])*u,0,a[1]+(b[1]-a[1])*u);target.y=world.terrain.heightAt(target.x,target.z);
   camera.setTarget(target.add(new Vector3(0,1.1,0)));camera.alpha=frame*.077;camera.beta=frame%42<21?.92:1.18;camera.radius=9+(1+Math.sin(frame*.055))*10;
   camera.getViewMatrix();camera.getProjectionMatrix();lighting.follow(target);visibility.update(camera.globalPosition,target,1/30);fade.update(camera.globalPosition,target,1/30);ink.next=0;
   const planes=Frustum.GetPlanes(camera.getTransformationMatrix()),expected=records.filter(r=>r.root.isEnabled()).flatMap(r=>r.meshes).filter(m=>m.isInFrustum(planes));
   drawn.clear();shadowDrawn.clear();scene.render();
   for(const m of expected){assert.ok(drawn.has(m),'missing visible base '+m.name+' frame '+frame);examined++;if(m.name.includes('cave-0')||m.name.includes('rock-'))rockDraws++;}
   for(const m of visibility.cast){assert.ok(shadowDrawn.has(m),'missing shadow caster '+m.name+' frame '+frame);shadowDraws++;}
   assert.ok(stats.outlineInstances<=96);assert.ok(stats.outlineTriangles<=160000);assert.ok(visibility.stats.shadowCasters<=28);
  }
  let matrixBytes=0;
  for(const source of sources){const passes=Object.values(source._instanceDataStorage.renderPasses);assert.ok(passes.length<=2);for(const pass of passes)matrixBytes+=pass.instancesData?.byteLength??0;}
  assert.ok(matrixBytes<1048576);assert.ok(examined>3000);assert.ok(rockDraws>1000);assert.deepEqual([...levels].sort(),[0,1,2]);assert.ok(transitions>30);
  t.diagnostic(JSON.stringify({orientation,frames:210,visibleDraws:examined,rockDraws,shadowDraws,lodTransitions:transitions,matrixBytes}));
 });
}
