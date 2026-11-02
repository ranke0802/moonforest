// Exercise Babylon's exact _uploadAsync/_createTexture functions without a
// constructor/worker/GPU. Only the decode result and engine upload sink are held.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {NullEngine,Scene,Texture} from '@babylonjs/core';
import {InternalTexture} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import {KhronosTextureContainer2} from '@babylonjs/core/Misc/khronosTextureContainer2.js';
import {installMapTextureLifetimeGuard,releaseMapTexture,isAbandonedMapTexture} from '../../src/map-texture-lifetime.js';
installMapTextureLifetimeGuard(KhronosTextureContainer2);const results=[];
for(const mode of ['abandoned','active','still-shared']){
 const engine=new NullEngine(),scene=new Scene(engine),internal=new InternalTexture(engine,1),unrelated={owner:'other'};scene.addPendingData(unrelated);scene.addPendingData(internal);
 let oldLoads=0,newLoads=0,uploads=0,binds=0,resolve;const decoded=new Promise(r=>resolve=r),pendingTexture=new Texture(null,scene,{internalTexture:internal,onLoad:()=>oldLoads++});
 let external;if(mode==='still-shared'){internal.incrementReferences();external=new Texture(null,scene,{internalTexture:internal,onLoad:()=>newLoads++});}
 const container=Object.create(KhronosTextureContainer2.prototype);container._decodeAsync=()=>decoded;container._engine={_bindTextureDirectly(){binds++;},_uploadCompressedDataToTextureDirectly(){uploads++;},_uploadDataToTextureDirectly(){uploads++;}};
 const response=container._uploadAsync(new Uint8Array(),internal).then(()=>{internal.onLoadedObservable.notifyObservers(internal);internal.onLoadedObservable.clear();return {status:'ready'};},error=>({status:error.name}));
 if(mode!=='active')releaseMapTexture(pendingTexture,scene);
 const before={refs:internal._references,pending:scene._pendingData.includes(internal),marked:isAbandonedMapTexture(internal)};
 resolve({transcodedFormat:37492,isInGammaSpace:false,hasAlpha:false,mipmaps:[{width:4,height:4,data:new Uint8Array(8)}]});const result=await response;
 if(mode==='abandoned'){assert.equal(result.status,'AbortError');assert.equal(uploads,0);assert.equal(binds,0);assert.equal(oldLoads,0);assert.equal(internal.isReady,false);assert.equal(scene._pendingData.includes(internal),false);}
 else{assert.equal(result.status,'ready');assert.equal(uploads,1);assert.equal(internal.isReady,true);if(mode==='still-shared')assert.equal(newLoads,1);else assert.equal(oldLoads,1);}
 assert.equal(scene._pendingData.includes(unrelated),true);results.push({mode,before,result,actualCreateUploadCalls:uploads,binds,oldWrapperRawOnLoadCallbacks:oldLoads,externalOwnerOnLoadCallbacks:newLoads,unrelatedPendingPreserved:true,notes:mode==='still-shared'?'Babylon can invoke a disposed cached wrapper raw onLoad closure; map-level owner/settled guards must prevent publication. A still-live external owner receives its load normally.':undefined});
 scene.removePendingData(internal);scene.removePendingData(unrelated);external?.dispose();pendingTexture.dispose();engine.dispose();
}
writeFileSync(new URL('ktx-upload-after.json',import.meta.url),JSON.stringify({scope:'Exact pinned Babylon9.31 _uploadAsync and _createTexture with a controlled decode Promise and stub engine upload sink. No real worker scheduling/GPU execution.',results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
