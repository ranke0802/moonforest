// Independent multi-slot rollback proof for callback deadlines. No network/GPU.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,PBRMaterial,RawTexture} from '@babylonjs/core';
import {VillageTextureStreaming} from '../../src/village-texture-streaming.js';
import {MAP_MODEL_TIMEOUT_MS} from '../../src/map-load-lifetime.js';
import {isAbandonedMapTexture} from '../../src/map-texture-lifetime.js';

const hash=value=>createHash('sha256').update(value).digest('hex'),sourceUrl=new URL('../../src/village-texture-streaming.js',import.meta.url),sourceSha256=hash(readFileSync(sourceUrl));
const rows=[],warnings=[],warn=console.warn;console.warn=(...values)=>warnings.push(values.map(value=>String(value)).join(' '));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function run(hangRole){
 const engine=new NullEngine({textureSize:4}),scene=new Scene(engine),callbacks=[];
 engine.getCaps().maxTextureSize=4096;
 const clock={value:0,next:0,pending:new Map(),now(){return this.value;},setTimeout(fn,ms){const id=++this.next;this.pending.set(id,{fn,at:this.value+ms});return id;},clearTimeout(id){this.pending.delete(id);},advance(ms){this.value+=ms;for(const [id,timer]of [...this.pending])if(timer.at<=this.value){this.pending.delete(id);timer.fn();}}};
 const create=engine.createTexture.bind(engine);
 engine.createTexture=(...args)=>{
  if(!String(args[0]).startsWith('https://independent.test/'))return create(...args);
  const onLoad=args[5],onError=args[6];args[5]=args[6]=null;const internal=create(...args),size=String(args[0]).endsWith('albedo.png')?2048:512;internal.width=size;internal.height=size;internal.baseWidth=size;internal.baseHeight=size;internal.isReady=false;scene.addPendingData(internal);
  const callback={url:String(args[0]),internal,load(){scene.removePendingData(internal);internal.isReady=true;onLoad?.();internal.onLoadedObservable.notifyObservers(internal);},error(){onError?.('late retired stage error');}};callbacks.push(callback);return internal;
 };
 const materials=[new PBRMaterial('a',scene),new PBRMaterial('b',scene)],originals=[];
 for(const material of materials){for(const slot of ['albedoTexture','bumpTexture','metallicTexture'])material[slot]=RawTexture.CreateRGBATexture(new Uint8Array(4*4*4).fill(128),4,4,scene);material.freeze();originals.push({material,slots:[material.albedoTexture,material.bumpTexture,material.metallicTexture]});}
 const roles=['albedo','normal','orm'],profile={textures:Object.fromEntries(roles.map(role=>[role,{url:role+'.png',width:role==='albedo'?2048:512,height:role==='albedo'?2048:512}])),resources:[]},asset={config:{highTextures:profile},source:{materials}},stats={},world={scene,touchDevice:false};
 const stream=new VillageTextureStreaming(world,new Map([['asset',asset]]),[],new URL('https://independent.test/'),stats,{textureTimers:clock});stream.clock=()=>clock.value;stream.wanted.set('asset',1);
 const initialTextures=scene.textures.length,initialAfterObservers=scene.onAfterRenderObservable.observers.filter(observer=>!observer._willBeUnregistered).length;
 try{
  const pending=stream.start('asset');
  for(const role of roles){
   for(let i=0;i<10&&!callbacks.some(row=>row.url.endsWith(role+'.png'));i++)await tick();
   const callback=callbacks.find(row=>row.url.endsWith(role+'.png'));assert.ok(callback,role+' actually starts');
   if(role===hangRole)break;
   clock.advance(1000);callback.load();await tick();
  }
  assert.equal(stats.highTexturePending,1);assert.ok(stats.highTextureReserved>0);assert.equal(stream.resident.size,0);
  clock.advance(MAP_MODEL_TIMEOUT_MS);await pending;
  assert.equal(stats.highTexturePending,0);assert.equal(stats.highTextureReserved,0);assert.equal(stream.resident.size,0);assert.equal(stream.textureWaiters.size,0);assert.equal(clock.pending.size,0);assert.equal(scene.getWaitingItemsCount(),0);
  assert.equal(scene.textures.length,initialTextures,'all completed and pending temporary maps roll back');
  for(const {material,slots}of originals){assert.deepEqual([material.albedoTexture,material.bumpTexture,material.metallicTexture],slots);assert.equal(material.isFrozen,true,'failed preparation does not dirty/freeze-toggle original material');}
  for(const callback of callbacks){assert.equal(callback.internal._references,0);assert.equal(isAbandonedMapTexture(callback.internal),true);callback.load();callback.error();}
  await tick();assert.equal(stats.highTextureLoads,0);assert.equal(stream.resident.size,0);assert.equal(scene.textures.length,initialTextures);assert.ok(stream.failed.has('asset'));
  stream.dispose();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(scene.onAfterRenderObservable.observers.length,initialAfterObservers-1);
  rows.push({hangRole,passed:true,startedRoles:callbacks.map(row=>row.url.split('/').at(-1)),temporaryTextureReferences:callbacks.map(row=>row.internal._references),originalMaterialSlotsExact:true,originalMaterialsRemainFrozen:true,pendingBytesAfter:stats.highTextureReserved,scenePendingAfter:scene.getWaitingItemsCount(),lateCallbackPromotions:stats.highTextureLoads,callbackDeadlinesAfter:clock.pending.size});
 }catch(error){rows.push({hangRole,passed:false,error:error.stack});}
 finally{stream.dispose();engine.dispose();}
}
try{await run('normal');await run('orm');assert.equal(hash(readFileSync(sourceUrl)),sourceSha256,'source remains frozen');}
finally{console.warn=warn;}
const report={generatedAt:new Date().toISOString(),passed:rows.every(row=>row.passed),sourceSha256,rows,warnings,scope:'Actual Babylon texture wrapper/internal ownership, pending-data and material-slot rollback under injected logical deadlines; no downloads, actual image decoding, GPU upload, pixels or device performance measured.'};
writeFileSync(new URL('verification-resource-lifecycle.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
