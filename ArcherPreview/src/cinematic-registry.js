import registryDocument from './cinematic-registry.json' with {type:'json'};
import {ASSET_CATALOG} from './asset-catalog.js';
import {ACTOR_DEFINITIONS} from './actor-definitions.js';
import audioManifest from '../public/assets/audio.json' with {type:'json'};
import {CINEMATIC_LIMITS,validateCinematicDocument} from './cinematic-document.js';
import {MapLoadLifetime} from './map-load-lifetime.js';
import {createBasePlacementManifest} from './placement-document.js';

export const CINEMATIC_REGISTRY=registryDocument;
export const DEFAULT_CINEMATIC_REFERENCES={catalog:ASSET_CATALOG,actorDefinitions:ACTOR_DEFINITIONS,audioIds:Object.keys(audioManifest.sounds)};
const idPattern=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/,hashPattern=/^[a-f0-9]{64}$/;
const maps=['village','great-plains','monster-forest','witch-cave'];

export function listRegisteredCinematics(registry=CINEMATIC_REGISTRY){
  if(!registry||typeof registry!=='object'||Array.isArray(registry)||Object.keys(registry).some(key=>!['version','entries'].includes(key))||registry.version!==1||!Array.isArray(registry.entries)||registry.entries.length>256)throw new Error('Invalid cinematic registry schema');
  const ids=new Set();
  for(const entry of registry.entries){
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(key=>!['cutsceneId','mapId','version','catalogRevision','duration','sha256','bytes','url'].includes(key))||typeof entry.cutsceneId!=='string'||!idPattern.test(entry.cutsceneId)||ids.has(entry.cutsceneId)||!maps.includes(entry.mapId)||entry.version!==1||typeof entry.catalogRevision!=='string'||!hashPattern.test(entry.catalogRevision)||typeof entry.sha256!=='string'||!hashPattern.test(entry.sha256)||!Number.isFinite(entry.duration)||entry.duration<.1||entry.duration>600||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>CINEMATIC_LIMITS.bytes||entry.url!==`authored/cinematics/${entry.sha256}.json`)throw new Error('Invalid cinematic registry entry: '+(entry?.cutsceneId??'unknown'));
    ids.add(entry.cutsceneId);
  }
  return structuredClone(registry.entries);
}

async function boundedBody(response,entry,lifetime){
  const announced=response.headers?.get?.('content-length');
  if(announced!==null&&announced!==undefined&&Number(announced)>CINEMATIC_LIMITS.bytes)throw new Error('Registered cinematic response exceeds512KiB');
  if(!response.body?.getReader)throw new Error('Registered cinematic response requires a bounded readable stream');
  const reader=response.body.getReader(),parts=[];let length=0;
  const cancel=()=>{reader.cancel(lifetime.signal.reason).catch(()=>{});};lifetime.signal.addEventListener('abort',cancel,{once:true});
  try{
    for(;;){
      const {done,value}=await lifetime.run(()=>reader.read());if(done)break;
      length+=value.byteLength;if(length>Math.min(entry.bytes,CINEMATIC_LIMITS.bytes))throw new Error('Registered cinematic byte count differs');parts.push(value);
    }
    if(length!==entry.bytes)throw new Error('Registered cinematic byte count differs');
    const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}return bytes;
  }catch(error){reader.cancel(error).catch(()=>{});throw error;}
  finally{lifetime.signal.removeEventListener('abort',cancel);try{reader.releaseLock();}catch{/* An abandoned backend read can still settle after logical cancellation. */}}
}

export async function loadRegisteredCinematic(id,{registry=CINEMATIC_REGISTRY,fetch:fetcher=globalThis.fetch,baseUrl,signal,references=DEFAULT_CINEMATIC_REFERENCES,timeoutMs=45000,timers}={}){
  const entry=listRegisteredCinematics(registry).find(value=>value.cutsceneId===id);if(!entry)throw new Error('Unknown registered cinematic: '+id);
  if(entry.catalogRevision!==references.catalog?.revision)throw new Error('Registered cinematic catalog revision is stale');
  if(typeof fetcher!=='function')throw new Error('Cinematic fetch is unavailable');
  const base=new URL(baseUrl??import.meta.env?.BASE_URL??'./',globalThis.location?.href??'http://localhost/'),url=new URL(entry.url,base);
  if(!['http:','https:'].includes(base.protocol)||url.origin!==base.origin||!url.pathname.startsWith(base.pathname.endsWith('/')?base.pathname:base.pathname.slice(0,base.pathname.lastIndexOf('/')+1)))throw new Error('Cinematic registry URL escapes the game base');
  const lifetime=new MapLoadLifetime({signal,timeoutMs,timers,stage:'cinematic-registry'});let response;
  try{
    response=await lifetime.run(()=>fetcher(url.href,{cache:'force-cache',signal:lifetime.signal}),{onLate:value=>{value?.body?.cancel?.().catch(()=>{});}});
    if(!response?.ok)throw new Error('Registered cinematic request failed ('+(response?.status??'unknown')+')');
    const bytes=await boundedBody(response,entry,lifetime);lifetime.check();
    if(!globalThis.crypto?.subtle)throw new Error('SHA256 verification requires Web Crypto');
    const digest=await lifetime.run(()=>globalThis.crypto.subtle.digest('SHA-256',bytes));
    const hash=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
    if(hash!==entry.sha256)throw new Error('Registered cinematic SHA256 differs');
    const validationReferences=references.instanceIds?references:{...references,instanceIds:createBasePlacementManifest(entry.mapId,{catalog:references.catalog}).instances.map(value=>value.instanceId)};
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),result=validateCinematicDocument(text,validationReferences);
    if(!result.valid)throw Object.assign(new Error('Registered cinematic document validation failed'),{errors:result.errors});
    const document=result.document;
    if(document.cutsceneId!==entry.cutsceneId||document.mapId!==entry.mapId||document.version!==entry.version||document.catalogRevision!==entry.catalogRevision||document.duration!==entry.duration)throw new Error('Registered cinematic metadata differs from the index');
    lifetime.check();return document;
  }catch(error){lifetime.abort(error);response?.body?.cancel?.().catch(()=>{});throw error;}
  finally{lifetime.close();}
}
