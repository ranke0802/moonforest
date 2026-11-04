import index from './authored-map-index.json' with {type:'json'};

export const authoredMapStorageKey=mapId=>'moonforest-0.1:placements:applied:'+mapId;
export const authoredMapDraftKey=mapId=>'moonforest-0.1:placements:draft:'+mapId;
export const AUTHORED_MAP_INDEX=index;

export function authoredMapReference(mapId,storage,registry=index){
 if(registry.version!==1||!registry.maps||typeof registry.maps!=='object'||Array.isArray(registry.maps))throw new Error('배치 레지스트리 버전을 지원하지 않습니다.');
 let local=null;try{local=storage?.getItem(authoredMapStorageKey(mapId));}catch{}
 if(local!==null&&local!==undefined){if(local.length>512*1024)throw new Error('저장된 배치 파일이 512 KiB를 초과했습니다.');return {kind:'browser-applied',document:JSON.parse(local)};}
 const entry=registry.maps?.[mapId];
 if(entry===undefined)return null;
 if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(key=>!['path','sha256','revision','baseRevision'].includes(key))||entry.path!==`authored/maps/${mapId}.json`||!/^[a-f0-9]{64}$/.test(entry.sha256))throw new Error('배치 레지스트리 경로 또는 해시가 잘못되었습니다.');
 if(!Number.isSafeInteger(entry.revision)||entry.revision<0||typeof entry.baseRevision!=='string'||!/^base-v1-[0-9a-f]{16}$/.test(entry.baseRevision))throw new Error('배치 레지스트리 revision 또는 baseRevision이 잘못되었습니다.');
 return {kind:'project-file',...entry};
}

export async function loadAuthoredMap(world,{storage,registry=index,onCommit=()=>{},baseUrl=globalThis.location?.href,runtimeOptions={}}={}){
 const reference=authoredMapReference(world.mapId,storage,registry);if(!reference)return null;
 const mapId=world.mapId,scene=world.scene,generation=world.toolGeneration;
 const [{ASSET_CATALOG},{AuthoredPlacementRuntime},{MapLoadLifetime},{validatePlacementDocument,createBasePlacementManifest}]=await Promise.all([import('./asset-catalog.js'),import('./authored-placement-runtime.js'),import('./map-load-lifetime.js'),import('./placement-document.js')]);
 if(world.mapId!==mapId||world.scene!==scene||scene.isDisposed||world.toolGeneration!==generation)throw Object.assign(new Error('배치 로딩 중 지역이 변경되었습니다.'),{name:'AbortError'});
 let document=reference.document;
 if(!document){
  const url=new URL(reference.path,new URL('./',baseUrl));url.searchParams.set('v',reference.sha256);
  const lifetime=new MapLoadLifetime({stage:'authored-map'});world.authoredDataLifetime=lifetime;
  const observer=scene.onDisposeObservable.addOnce(()=>lifetime.abort());
  try{
   const response=await lifetime.run(()=>fetch(url,{cache:'no-cache',signal:lifetime.signal}));if(!response.ok)throw new Error('배치 파일 HTTP '+response.status);
   const bytes=await lifetime.run(()=>response.arrayBuffer());if(bytes.byteLength>512*1024)throw new Error('배치 파일이 512 KiB를 초과했습니다.');
   const digest=await lifetime.run(()=>crypto.subtle.digest('SHA-256',bytes)),sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
   if(sha256!==reference.sha256)throw new Error('배치 파일 해시가 등록 내용과 다릅니다.');
   document=JSON.parse(new TextDecoder().decode(bytes));
  }finally{lifetime.close();scene.onDisposeObservable.remove(observer);if(world.authoredDataLifetime===lifetime)world.authoredDataLifetime=null;}
 }
 if(world.mapId!==mapId||world.toolGeneration!==generation)throw Object.assign(new Error('배치 로딩 중 지역이 변경되었습니다.'),{name:'AbortError'});
 if(reference.kind==='project-file'&&(document.revision!==reference.revision||document.baseRevision!==reference.baseRevision))throw new Error('배치 파일 revision/baseRevision이 레지스트리와 다릅니다.');
 document=validatePlacementDocument(document,{catalog:ASSET_CATALOG,baseManifest:createBasePlacementManifest(mapId,{catalog:ASSET_CATALOG,placements:world.placements})});
 const existing=world.authoredPlacements,reuse=existing&&!existing.disposed&&existing.mapId===mapId;
 const runtime=reuse?existing:new AuthoredPlacementRuntime(world,{...runtimeOptions,catalog:ASSET_CATALOG,onCommit});
 try{await runtime.apply(document);world.authoredPlacements=runtime;return runtime;}catch(error){if(!reuse)runtime.dispose();throw error;}
}
