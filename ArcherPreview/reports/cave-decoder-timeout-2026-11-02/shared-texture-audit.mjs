// Read-only reproduction using shipped glTF/Meshopt bytes. Two legal material
// wrappers share one pending InternalTexture; only the upload callback is held.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NullEngine,Scene,PBRMaterial,Texture} from '@babylonjs/core';
import {InternalTexture} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import '@babylonjs/loaders/glTF/index.js';
import {readMapContainer} from '../../src/map-container.js';
import {isAbandonedMapTexture} from '../../src/map-texture-lifetime.js';
const dir=new URL('./',import.meta.url),base=new URL('../../public/assets/',dir),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base)));
mkdirSync(dir,{recursive:true});
let time=0,id=0;const jobs=new Map(),timers={now:()=>time,setTimeout:(fn,ms)=>{jobs.set(++id,{at:time+ms,fn});return id;},clearTimeout:key=>jobs.delete(key)};
const advance=ms=>{time+=ms;for(const [key,job]of [...jobs])if(job.at<=time){jobs.delete(key);job.fn();}};
const asset=Object.values(manifest.assets).find(a=>a.lods?.find(l=>l.level===2)?.textureSize>0),url=new URL(asset.lods.find(l=>l.level===2).model,base),json=JSON.parse(readFileSync(url));
for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+readFileSync(new URL(buffer.uri,url)).toString('base64');
for(const image of json.images??[])if(image.uri)image.uri='data:image/ktx2;base64,'+readFileSync(new URL(image.uri,url)).toString('base64');
// A duplicate material using the same image/sampler is supported by glTF2 and
// Babylon's shared InternalTexture cache. Source bytes and runtime files stay unchanged.
const primitive=json.meshes[0].primitives[0],copy=structuredClone(json.materials[primitive.material]);json.materials.push(copy);json.meshes[0].primitives.push({...primitive,material:json.materials.length-1});
await MeshoptDecoder.ready;const oldDecoder=MeshoptCompression._Default;
MeshoptCompression._Default={decodeGltfBufferAsync:async(data,count,stride,mode,filter)=>{const out=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(out,count,stride,data,mode,filter);return out;}};
const engine=new NullEngine(),scene=new Scene(engine),warm=new PBRMaterial('shared-brdf',scene);warm.dispose();for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
const other={owner:'unrelated'};scene.addPendingData(other);let shared,wrappers=0,entered;
const boundary=new Promise(resolve=>entered=resolve);
engine.createTexture=(url,noMipmap,invertY,target,samplingMode,onLoad,onError)=>{if(!shared){shared=new InternalTexture(engine,1);target.addPendingData(shared);}else shared.incrementReferences();wrappers++;if(wrappers>=2)entered();return shared;};
try{
 const outcome=readMapContainer(scene,json,'',{fileName:url.pathname.split('/').at(-1),timers}).catch(error=>error);
 const reached=await Promise.race([boundary.then(()=>true),outcome.then(value=>{console.log('Import ended before shared boundary:',value?.message??value);return false;}),new Promise(resolve=>setTimeout(()=>resolve(false),500))]);
 if(!reached){console.log(JSON.stringify({diagnosticOnly:true,wrappers,refs:shared?._references,sceneTextures:scene.textures.map(t=>({name:t.name,refs:t.getInternalTexture()?._references})),materials:json.materials.length,primitives:json.meshes[0].primitives.length}));advance(45000);await outcome;process.exitCode=1;}
 else{
 const externalOwner=process.argv.includes('--external');let external;if(externalOwner){shared.incrementReferences();external=new Texture(null,scene,{internalTexture:shared});}
 const before={wrappers,refs:shared._references,pending:scene.getWaitingItemsCount(),externalOwner};advance(45000);const error=await outcome;await new Promise(r=>setTimeout(r,0));
 const report={scope:'Actual shipped glTF/Meshopt geometry and actual GLTF/PBR/Texture wrappers, controlled shared InternalTexture/upload boundary in NullEngine; not real KTX/GPU execution.',before,after:{error:error.name,refs:shared._references,pending:scene.getWaitingItemsCount(),oldOwnedTokenStillPending:scene._pendingData.includes(shared),unrelatedTokenPreserved:scene._pendingData.includes(other),externalWrapperAlive:external?external.getInternalTexture()===shared:null,markedAbandoned:isAbandonedMapTexture(shared),modelTextureWrappers:scene.textures.filter(t=>t.getInternalTexture()===shared).length,timers:jobs.size}};
 const expectedPending=externalOwner?2:1;if(report.after.pending!==expectedPending||report.after.refs!==(externalOwner?1:0)||report.after.markedAbandoned===externalOwner)throw new Error('Shared owner cleanup contract failed');
 writeFileSync(new URL(externalOwner?'shared-texture-after-external.json':'shared-texture-after-own-all.json',dir),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));external?.dispose();
 }
}finally{MeshoptCompression._Default=oldDecoder;scene.removePendingData(other);scene.removePendingData(shared);engine.dispose();}
