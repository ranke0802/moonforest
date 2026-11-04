import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,PBRMaterial,RawTexture,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {createWorld,replaceWorldMap} from '../../src/world.js';
import {readMapContainer} from '../../src/map-container.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import {MINIMAP_SIZE,minimapWorldPoint,MINIMAP_MAPS} from '../../src/dot-minimap.js';

export const assetRoot=new URL('../../public/assets/',import.meta.url),drain=()=>new Promise(resolve=>setTimeout(resolve,0));
export const sha=value=>createHash('sha256').update(typeof value==='string'?value:Buffer.from(value.buffer??value,value.byteOffset??0,value.byteLength??value.length)).digest('hex');
export function resourceCounts(scene){
 const live=observable=>observable?.observers?.filter(observer=>!observer._willBeUnregistered).length??0,count=owner=>Object.values(owner??{}).reduce((sum,value)=>sum+(value?.observers?live(value):0),0),nodes=[...scene.meshes,...scene.transformNodes];
 return {meshes:scene.meshes.length,geometries:scene.geometries.length,materials:scene.materials.length,textures:scene.textures.length,skeletons:scene.skeletons.length,morphManagers:scene.morphTargetManagers.length,transformNodes:scene.transformNodes.length,sceneObservers:count(scene),nodeObservers:nodes.reduce((sum,node)=>sum+count(node)+count(node._nodeDataStorage),0),scenePending:scene.getWaitingItemsCount()};
}
export function geometryProof(container){return container.meshes.filter(mesh=>mesh.getTotalVertices()).map(mesh=>({name:mesh.name,triangles:mesh.getTotalIndices()/3,indices:sha(Uint32Array.from(mesh.getIndices())),attributes:Object.fromEntries(mesh.getVerticesDataKinds().map(kind=>[kind,sha(Float32Array.from(mesh.getVerticesData(kind)))]))}));}
export async function loadActualProp(model,scene){
 const given=model instanceof URL?model:new URL(String(model).replace(/^\/?assets\//,''),assetRoot),source=given.protocol==='file:'?given:new URL(given.pathname.replace(/^\/?assets\//,''),assetRoot),decoded=await readRuntimeGltf(source),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(value=>value!=='EXT_meshopt_compression');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const container=await readMapContainer(scene,gltf,'',{skipMaterials:true}),paint=new PBRMaterial('phase3-actual-prop-fixture',scene),texture=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,scene);texture.getInternalTexture().isReady=true;paint.albedoTexture=texture;paint.transparencyMode=0;
 container.materials.push(paint);container.textures.push(texture);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
 return {container,source:source.href,sourceSha256:sha(readFileSync(source)),proof:geometryProof(container),material:paint,texture};
}
export function actualMapFixture(){
 const engine=new NullEngine({renderWidth:1280,renderHeight:720});engine.getCaps().instancedArrays=true;engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
 const world=createWorld(engine,{village:true,touchDevice:true});world.scene.defaultMaterial;world.scene.getOutlineRenderer();caveFogFallback(world.scene).getInternalTexture().isReady=true;
 const change=character=>{replaceWorldMap(world,character);for(const texture of world.scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;};
 return {engine,world,scene:world.scene,change,dispose(){world.scene.dispose();engine.dispose();}};
}
function color(value){if(/^#[a-f0-9]{6}$/i.test(value))return [parseInt(value.slice(1,3),16),parseInt(value.slice(3,5),16),parseInt(value.slice(5,7),16),255];return [0,0,0,255];}
export function rasterCanvas(){
 const data=new Uint8ClampedArray(MINIMAP_SIZE*MINIMAP_SIZE*4),calls={draws:0},ctx={fillStyle:'#000000',fillRect(x,y,w,h){const rgba=color(this.fillStyle);for(let yy=Math.max(0,Math.floor(y));yy<Math.min(MINIMAP_SIZE,Math.ceil(y+h));yy++)for(let xx=Math.max(0,Math.floor(x));xx<Math.min(MINIMAP_SIZE,Math.ceil(x+w));xx++)data.set(rgba,(yy*MINIMAP_SIZE+xx)*4);},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},getImageData:()=>({data:data.slice()}),putImageData(image){data.set(image.data);},drawImage(canvas){calls.draws++;if(canvas.data)data.set(canvas.data);}};
 return {width:MINIMAP_SIZE,height:MINIMAP_SIZE,data,calls,getContext:()=>ctx};
}
export function minimapFixture(DotMinimap){const canvas=rasterCanvas(),label={},element={hidden:true,querySelector:selector=>selector==='canvas'?canvas:label},document={createElement:()=>rasterCanvas()},map=new DotMinimap(element,{document});return {map,canvas,label,element};}
export function rasterFreePoints(world,{clearance=2.5,separation=12}={}){
 const spec=MINIMAP_MAPS[world.mapId],points=[];assert.ok(spec);
 for(let y=12;y<84;y++)for(let x=12;x<84;x++){
  const p=minimapWorldPoint(spec.rect,x+.5,y+.5,MINIMAP_SIZE,spec.halfTurn);
  if(Math.hypot(p.x,p.z)>35||!world.navigation.free(p,clearance,80))continue;
  if(points.some(old=>Math.hypot(p.x-old.x,p.z-old.z)<separation))continue;
  points.push({...p,y:world.terrain.heightAt(p.x,p.z),pixel:[x,y]});if(points.length===2)return points;
 }
 throw new Error('Two clear representative minimap cells not found on '+world.mapId);
}
export function blockedRasterAt(canvas,pixel){const [x,y]=pixel,index=(y*MINIMAP_SIZE+x)*4;return canvas.data[index]===12&&canvas.data[index+1]===16&&canvas.data[index+2]===24;}
export function asVector(p){return new Vector3(p.x,p.y??0,p.z);}
