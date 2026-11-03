import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Matrix,NullEngine,Scene,Vector3,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {instantiateStaticMap} from '../src/static-map-instances.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

const base=new URL('../public/assets/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name+'.json',base)));
function values(gltf,files,index){
 const accessor=gltf.accessors[index],view=gltf.bufferViews[accessor.bufferView],bytes=files.get(gltf.buffers[view.buffer].uri).data;
 const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[accessor.type],size={5121:1,5123:2,5125:4,5126:4}[accessor.componentType],stride=view.byteStride??components*size;
 const result=[];
 for(let i=0;i<accessor.count;i++)for(let k=0;k<components;k++){
  const offset=(view.byteOffset??0)+(accessor.byteOffset??0)+i*stride+k*size;
  result.push(accessor.componentType===5126?bytes.readFloatLE(offset):accessor.componentType===5125?bytes.readUInt32LE(offset):accessor.componentType===5123?bytes.readUInt16LE(offset):bytes[offset]);
 }
 return result;
}
function normalizedMaterial(gltf,material){
 const normalize=value=>{
  if(!value||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(normalize);
  const out={};for(const [key,entry]of Object.entries(value)){
   if(key==='index'&&typeof entry==='number'){
    const texture=gltf.textures[entry],basis=texture.extensions?.KHR_texture_basisu,image=gltf.images[basis?.source??texture.source];
    const bytes=readFileSync(new URL(image.uri,base+'content/'));
    out.texture={...texture,source:undefined,sampler:texture.sampler===undefined?null:gltf.samplers[texture.sampler],extensions:basis?{...texture.extensions,KHR_texture_basisu:{...basis,source:undefined}}:texture.extensions,imageSha256:createHash('sha256').update(bytes).digest('hex')};
   }else out[key]=normalize(entry);
  }return out;
 };
 return normalize(material);
}

test('derived village facade vertices, normals, UVs and material image bytes match 121 actual production placements',async t=>{
 const village=read('village'),plains=read('great-plains'),config=plains.assets['village-approach'];
 const selected=VILLAGE_PLACEMENTS.filter(p=>Math.hypot(p.x,p.z)<58&&(['building','wall'].includes(p.kind)||['watchtower','wood-03-plank-gate','market-stall','well'].includes(p.asset)||(p.kind==='tree'&&Math.hypot(p.x,p.z)<37)));
 assert.equal(selected.length,121);assert.equal(config.lods[0].triangles,187522);
 const derived=await readRuntimeGltf(new URL(config.lods[0].model,base));
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const world={scene,terrain:createVillageTerrain()};t.after(()=>{scene.dispose();engine.dispose();});
 const details=[];let primitiveIndex=0,positionsChecked=0,uvComponentsChecked=0,maxPositionError=0,maxNormalError=0;
 for(const id of new Set(selected.map(p=>p.asset))){
  const sourceConfig=village.assets[id],profile=sourceConfig.lods.find(l=>l.level===2),sourceUrl=new URL(profile.model,base);
  const {gltf,files}=await readRuntimeGltf(sourceUrl);
  assert.equal(gltf.meshes.length,1);assert.equal(gltf.meshes[0].primitives.length,1);assert.equal(gltf.materials.length,1);
  const primitive=derived.gltf.meshes[0].primitives[primitiveIndex++],bakedPositions=values(derived.gltf,derived.files,primitive.attributes.POSITION),bakedNormals=values(derived.gltf,derived.files,primitive.attributes.NORMAL),bakedUvs=values(derived.gltf,derived.files,primitive.attributes.TEXCOORD_0);
  assert.deepEqual(normalizedMaterial(derived.gltf,derived.gltf.materials[primitive.material]),normalizedMaterial(gltf,gltf.materials[0]),id+' material/texture bytes changed');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(buffer.uri).data).toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  let positionOffset=0,uvOffset=0,assetMaxError=0;
  for(const placement of selected.filter(p=>p.asset===id)){
   const {root,facing}=createVillageTransform(world,placement,sourceConfig),instance=instantiateStaticMap(container,name=>'oracle-'+placement.id+'-'+name);
   for(const node of instance.rootNodes)node.parent=facing;
   const meshes=root.getChildMeshes().filter(mesh=>mesh.getTotalVertices()>0);assert.equal(meshes.length,1);
   for(const mesh of meshes){
    const position=mesh.getVerticesData(VertexBuffer.PositionKind),normal=mesh.getVerticesData(VertexBuffer.NormalKind),uv=mesh.getVerticesData(VertexBuffer.UVKind),matrix=mesh.computeWorldMatrix(true),normalMatrix=Matrix.Transpose(matrix.clone().invert());
    for(let i=0;i<position.length;i+=3){
     const expected=Vector3.TransformCoordinates(Vector3.FromArray(position,i),matrix),expectedNormal=Vector3.TransformNormal(Vector3.FromArray(normal,i),normalMatrix).normalize();
     const actual=Vector3.FromArray(bakedPositions,positionOffset),actualNormal=Vector3.FromArray(bakedNormals,positionOffset),error=Vector3.Distance(expected,actual),normalError=Vector3.Distance(expectedNormal,actualNormal);
     maxPositionError=Math.max(maxPositionError,error);assetMaxError=Math.max(assetMaxError,error);maxNormalError=Math.max(maxNormalError,normalError);
     assert.ok(error<.00002,placement.id+' derived vertex height/transform mismatch '+error);assert.ok(normalError<.000002,placement.id+' derived normal mismatch '+normalError);
     positionOffset+=3;positionsChecked++;
    }
    for(const component of uv){assert.equal(bakedUvs[uvOffset++],component,id+' UV bytes changed');uvComponentsChecked++;}
   }
   root.dispose();
  }
  assert.equal(positionOffset,bakedPositions.length,id+' source geometry vertex count changed');assert.equal(uvOffset,bakedUvs.length);
  details.push({id,placements:selected.filter(p=>p.asset===id).length,vertices:positionOffset/3,maxPositionError:assetMaxError,materialAndImageBytesPreserved:true});container.dispose();loader.dispose();
 }
 assert.equal(primitiveIndex,15);assert.equal(derived.gltf.meshes[0].primitives.length,16,'one existing ground primitive plus fifteen source-material batches');
 const folder=new URL('../reports/boundary-cave-polish-2026-11-03/',import.meta.url);mkdirSync(folder,{recursive:true});
 writeFileSync(new URL('facade-production-geometry.json',folder),JSON.stringify({passed:true,model:config.lods[0].model,placements:selected.length,sourceAssets:primitiveIndex,sourceMaterialBatches:primitiveIndex,totalPrimitives:16,totalTriangles:187522,positionsChecked,uvComponentsChecked,maxPositionError,maxNormalError,details,limitations:['Actual Babylon source hierarchy/production transforms and derived Float32 geometry/UV/material image bytes checked in Node; images are not decoded and no GPU/raster/FPS measurement is made.','Far source geometry preserves its existing differences from near LOD. This proves exact placement transforms, not identical near/far silhouettes or commercial visual quality.','The sixteenth ground primitive is validated by separate shared-road/height tests; this source-model comparison covers the 121 baked scenery placements.']},null,2)+'\n');
});
