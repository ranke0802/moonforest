import {readFile,writeFile,readdir,stat,mkdir} from 'node:fs/promises';
import {resolve,relative,dirname,basename,extname,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gltfCatalogMetadata,catalogPlacementPolicy,catalogReductionPolicy} from './asset-catalog-metadata.mjs';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {FOREST_PLACEMENTS} from '../src/monster-forest-layout.js';
import {CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';
import {CHAPTER_POINTS} from '../src/chapter-quest-points.js';

const root=resolve(import.meta.dirname,'..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),slash=value=>value.replaceAll('\\','/');
const maps=['village','great-plains','monster-forest','witch-cave'];
const layouts={'village':VILLAGE_PLACEMENTS,'great-plains':PLAINS_PLACEMENTS,'monster-forest':FOREST_PLACEMENTS,'witch-cave':CAVE_PLACEMENTS};
export const CATALOG_MANIFESTS=['village','village-plains-outskirts','great-plains','monster-forest','witch-cave','quest-props','environment','guardian-bear','hooded-goblin','elena','mourning-elena','character','warrior','warrior-v2','warrior-v3','warrior-v3-ios'];
const actors=new Set(['guardian-bear','hooded-goblin','elena','mourning-elena']),players=new Set(['character','warrior','warrior-v2','warrior-v3','warrior-v3-ios']);

const canonicalCatalogValue=value=>Array.isArray(value)?value.map(canonicalCatalogValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalCatalogValue(value[key])])):value;
// Approved saved scenes reference the shipped catalog's legacy distribution
// revision. Preserve that identity only for this exact canonical entry set;
// mobile-only texture packages must not invalidate those existing scenes.
// Every other definition/model/UV/version change receives its own entry hash.
const legacyEntriesSha256='f73c016eed41df9410a8e357960ce9112e4247e8a201f8dd82dcd66b5f268ff5';
const legacyCatalogRevision='a33bb141c160692086a7bb1f7f8100be74fdbb1fcdef6876512635245af92853';
export function catalogRevisionForEntries(entries){
  const fingerprint=sha(JSON.stringify(canonicalCatalogValue(entries)));
  return fingerprint===legacyEntriesSha256?legacyCatalogRevision:fingerprint;
}

export async function discoverCatalogManifests(publicRoot){
  const directory=resolve(publicRoot,'assets'),names=[];
  for(const file of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(!file.isFile()||!file.name.endsWith('.json')||/(?:^|[-_.])(legacy|sample|fixture|cache|backup|test|development)(?:[-_.]|$)/i.test(file.name))continue;
    const path=resolve(directory,file.name);if((await stat(path)).size>2*1024*1024)continue;
    const manifest=await json(path);if(manifest.developmentFixture||manifest.developmentOnly||manifest.sample)continue;
    const configs=manifest.assets??{single:manifest};
    if(Object.values(configs).some(config=>config&&typeof config==='object'&&(typeof config.model==='string'||config.lods?.some(level=>typeof level.model==='string'))))names.push(file.name.slice(0,-5));
  }
  return names;
}

export function catalogRuntimePath(manifest,reference){
  if(typeof reference!=='string'||!reference||reference.includes('\\')||isAbsolute(reference))throw new Error('Catalog paths must be deployable relative references');
  const base=new URL(manifest,'https://catalog.invalid/'),url=new URL(reference,base);
  if(url.origin!==base.origin||!url.pathname.startsWith('/assets/')||url.search||url.hash||/^[a-z]+:/i.test(reference))throw new Error('Catalog reference escapes public assets: '+reference);
  const path=decodeURIComponent(url.pathname.slice(1));
  if(path.includes('\\')||path.includes('\0')||path.split('/').some(part=>part==='..'||part==='.'))throw new Error('Catalog reference escapes public assets: '+reference);
  return path;
}
async function json(path){return JSON.parse(await readFile(path,'utf8'));}
function resourceHashes(value,out=new Set()){
  if(typeof value==='string'){for(const hash of value.match(/[0-9a-f]{64}/gi)??[])out.add(hash.toLowerCase());}
  else if(value&&typeof value==='object')for(const item of Object.values(value))resourceHashes(item,out);
  return out;
}

export async function buildAssetCatalog({projectRoot=root}={}){
  const publicRoot=resolve(projectRoot,'public'),index=await json(resolve(publicRoot,'assets/resource-index.json')),cache=new Map(),entries=new Map(),manifestEvidence=[],runtimeHashes=new Set();
  async function modelInfo(path){
    if(cache.has(path))return cache.get(path);
    const location=resolve(publicRoot,path);if((await stat(location)).size>16*1024*1024)throw new Error('Runtime metadata model exceeds the bounded16MiB read: '+path);
    const bytes=await readFile(location);
    const hash=sha(bytes),expected=basename(path).match(/^([0-9a-f]{64})\./i)?.[1];
    if(expected&&expected!==hash)throw new Error('Content-addressed runtime model hash differs: '+path);
    const gltf=extname(path)==='.glb'?JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)).trim()):JSON.parse(bytes.toString('utf8'));
    const result={contentHash:hash,bytes:bytes.length,...gltfCatalogMetadata(gltf)};cache.set(path,result);runtimeHashes.add(hash);return result;
  }
  const discovered=await discoverCatalogManifests(publicRoot),manifestNames=[...CATALOG_MANIFESTS.filter(name=>discovered.includes(name)),...discovered.filter(name=>!CATALOG_MANIFESTS.includes(name))];
  for(const name of manifestNames){
    const manifestPath='assets/'+name+'.json',manifest=await json(resolve(publicRoot,manifestPath));resourceHashes(manifest,runtimeHashes);
    const isActor=actors.has(name)||players.has(name)||!manifest.assets&&!!manifest.animations,configs=manifest.assets??{[name]:manifest};
    manifestEvidence.push({manifest:manifestPath,sha256:sha(await readFile(resolve(publicRoot,manifestPath))),assets:Object.keys(configs).length});
    for(const [assetId,config]of Object.entries(configs)){
      const primary=config.model??config.lods?.find(l=>l.level===0)?.model??config.lods?.[0]?.model;if(!primary)continue;
      const model=catalogRuntimePath(manifestPath,primary),info=await modelInfo(model),version=(isActor||info.skinned||info.clips>0)&&config.version?String(config.version):info.contentHash,key=assetId+'@'+version;
      const availableMaps=name==='village-plains-outskirts'?['village']:maps.includes(name)?[name]:[];
      let usedMaps=availableMaps.filter(map=>layouts[map].some(p=>p.asset===assetId));
      if(name==='village-plains-outskirts'&&(manifest.placements??[]).some(p=>p.asset===assetId))usedMaps=['village'];
      if(name==='quest-props')usedMaps=[...new Set(CHAPTER_POINTS.filter(p=>p.model===assetId).map(p=>p.map))];
      if(actors.has(name))usedMaps=name==='elena'||name==='mourning-elena'?['witch-cave']:maps;
      if(players.has(name))usedMaps=maps;
      if(name==='environment')usedMaps=assetId==='scarecrow'?['training-arena',...maps]:['training-arena'];
      if(entries.has(key)){
        const entry=entries.get(key);if(entry.contentHash!==info.contentHash)throw new Error('Ambiguous catalog asset version: '+key);
        entry.usedMaps=[...new Set([...entry.usedMaps,...usedMaps])].sort();entry.runtime.sources.push({manifest:manifestPath,assetKey:assetId});continue;
      }
      const category=isActor?(players.has(name)||/^warrior-/.test(name)?'player':name==='hooded-goblin'?'monster':actors.has(name)?'boss':config.category??'actor'):config.category??(/tree/.test(assetId)?'tree':/grass/.test(assetId)?'plant':'prop');
      const explicitApproved=config.visualReview==='APPROVED'||config.reviewStatus==='APPROVED'||String(config.geometry?.optimization?.revision??'').includes('approved');
      const reviewStatus=explicitApproved?'approved':'deployed-review-unspecified';
      const independentRock=['rock-01-mossy-boulder','rock-02-jagged-outcrop'].includes(assetId);
      const structural=['building','wall','fence','defense','background'].includes(category)||(category==='rock'&&!independentRock)||config.essentialStructural===true||/cave-|watchtower|well|market-stall|covered-wagon|forest-03-fallen-log/.test(assetId);
      const baked=structural||config.essentialStructural===true;
      const size=config.bounds?.length===3?config.bounds:info.bounds?.size??null;
      const referenceHeight=config.height??config.bodyHeight??(size?size[1]*(config.scale??1):null);
      const normalization=config.height&&config.bounds?.[1]?config.height/config.bounds[1]:config.scale??1;
      const lods=[];
      const profiles=[...(config.model?[{level:0,model:config.model}]:[]),...(config.lods??[]),...(config.mobileNear?[{...config.mobileNear,profile:'mobile-near'}]:[])];
      for(const [i,level]of profiles.entries()){
        const path=catalogRuntimePath(manifestPath,level.model),metadata=await modelInfo(path);
        lods.push({level:level.level??i,distance:level.distance??null,profile:level.profile??null,model:path,contentHash:metadata.contentHash,triangles:metadata.triangles,materials:metadata.materials,textures:metadata.textures,skinned:metadata.skinned,clips:metadata.clips,morphTargets:metadata.morphTargets});
      }
      const thumbnail=config.thumbnail??config.preview;
      const entry={assetId,version,contentHash:info.contentHash,name:config.name??config.displayName??assetId,category,tags:[category,name,assetId,...(info.skinned?['skinned','actor']:['static'])],runtime:{manifest:manifestPath,assetKey:assetId,model,lodLevel:0,sources:[{manifest:manifestPath,assetKey:assetId}]},usedMaps:[...new Set(usedMaps)].sort(),reviewStatus,reviewEvidence:explicitApproved?(config.visualReview?'manifest.visualReview':config.reviewStatus?'manifest.reviewStatus':'manifest.geometry.optimization.revision'):null,geometry:{triangles:info.triangles,uniqueMeshTriangles:info.uniqueMeshTriangles,vertices:info.vertices,materials:info.materials,textures:info.textures,images:info.images,lods,skinned:info.skinned,skins:info.skins,bones:info.bones,clips:info.clips,clipNames:info.clipNames,clipDurations:info.clipDurations,morphTargets:info.morphTargets},bounds:{size,source:config.bounds?'manifest':'glTF-scene-node-accessor-bounds',sourceBounds:info.bounds,posed:info.skinned},units:{world:'metres',source:config.height?'manifest-normalized':'authored-runtime',metersPerSourceUnit:normalization},pivot:{type:config.origin??'runtime-authored',offset:[0,0,0]},forwardYaw:config.frontYawOffset??config.forwardYaw??0,referenceHeight,placement:catalogPlacementPolicy({assetId,category,reviewStatus,skinned:info.skinned,clips:info.clips,morphTargets:info.morphTargets,deformedLod:lods.some(l=>l.skinned||l.clips||l.morphTargets),structural,baked}),reduction:catalogReductionPolicy({assetId,category,skinned:info.skinned}),preview:{mode:thumbnail?'existing-thumbnail':'load-on-explicit-selection',...(thumbnail?{thumbnail:catalogRuntimePath(manifestPath,thumbnail)}:{})}};
      entries.set(key,entry);
    }
  }
  const catalogEntries=[...entries.values()].sort((a,b)=>a.assetId.localeCompare(b.assetId)||a.version.localeCompare(b.version));
  const catalog={version:1,revision:catalogRevisionForEntries(catalogEntries),entries:catalogEntries};
  catalog.contentRevision=sha(JSON.stringify(catalog));
  return {catalog,resourceRevision:index.revision,manifestEvidence,runtimeHashes,modelsRead:cache.size};
}

export function catalogModule(catalog){
  return '// Generated by scripts/build-asset-catalog.mjs. Metadata only; import lazily.\n'+
    'export const ASSET_CATALOG = '+JSON.stringify(catalog,null,2)+';\n'+
    'export function getCatalogAsset(assetId,version){const entries=ASSET_CATALOG.entries.filter(entry=>entry.assetId===assetId&&(version===undefined||entry.version===version));if(entries.length!==1)throw new RangeError(entries.length?"Asset version is ambiguous: "+assetId:"Unknown catalog asset/version: "+assetId);return entries[0];}\n'+
    'export function searchCatalog(query="",category=""){const terms=String(query).toLocaleLowerCase().trim().split(/\\s+/).filter(Boolean);return ASSET_CATALOG.entries.filter(entry=>(!category||entry.category===category)&&terms.every(term=>[entry.assetId,entry.name,...entry.tags].join(" ").toLocaleLowerCase().includes(term)));}\n';
}

export function editableIndexModule(catalog){
  const labels={tree:'나무',rock:'바위',prop:'소품',plant:'풀·덤불'},assets=catalog.entries.filter(entry=>entry.placement.supported).map(entry=>({assetId:entry.assetId,version:entry.version,name:entry.name,category:entry.category,sourceKind:entry.placement.sourceKind,defaultCollision:entry.placement.defaultCollision,reviewStatus:entry.reviewStatus,placement:{supported:true,baked:false}}));
  const index={version:1,contentRevision:catalog.contentRevision,categories:Object.entries(labels).filter(([value])=>assets.some(asset=>asset.category===value)).map(([value,label])=>({value,label})),assets,baseEligibilityMeta:{lockedMaps:['witch-cave'],lockedFlags:['background','villagePlainsOutskirts','villageBoundary','sourcePlacementId','sourcePlacement','pad','essentialStructural','length','depth'],questIdsByMap:Object.fromEntries(maps.map(mapId=>[mapId,CHAPTER_POINTS.filter(point=>point.map===mapId).map(point=>point.id)]))}};
  return '// Generated by scripts/build-asset-catalog.mjs. Small nearby-edit index; no renderer/catalog/resource imports.\nexport const EDITABLE_ASSET_INDEX = '+JSON.stringify(index,null,2)+';\n'+
    'export function getEditableAssetInfo(assetId){return EDITABLE_ASSET_INDEX.assets.find(asset=>asset.assetId===assetId)??null;}\n'+
    'export function editableBasePlacement(mapId,source,asset=getEditableAssetInfo(source?.asset)){if(!source)return {editable:false,reason:"대상을 찾지 못했어요."};if(EDITABLE_ASSET_INDEX.baseEligibilityMeta.lockedMaps.includes(mapId))return {editable:false,reason:"동굴의 기존 소품은 고정 충돌에 포함되어 있어 옮길 수 없어요. 새 소품을 놓아 주세요."};if(["background","villagePlainsOutskirts","villageBoundary","sourcePlacementId","sourcePlacement"].some(key=>source[key]))return {editable:false,reason:"다른 맵과 이어지는 배경 소품은 고정되어 있어요. 새 소품을 놓아 주세요."};if(["pad","essentialStructural","length","depth"].some(key=>source[key])||source.lootTier!==undefined||["building","landmark","tower","wall","fence","defense"].includes(source.kind)||EDITABLE_ASSET_INDEX.baseEligibilityMeta.questIdsByMap[mapId]?.includes(source.id))return {editable:false,reason:"지형·건물·보물·이야기에 연결된 기존 대상은 고정되어 있어요."};if(asset?.reviewStatus!=="approved"||!asset.placement?.supported||asset.placement.baked)return {editable:false,reason:"이 기존 대상은 안전한 독립 소품 편집을 지원하지 않아요."};return {editable:true,reason:null};}\n';
}

// Local provenance is intentionally a separate artifact. Large model binaries
// are enumerated/stat'ed, never read or hash-dumped; small hashes have a budget.
export async function inventoryLocalAssets(roots,runtimeHashes,{maxMetadataFiles=2000,maxHashBytes=32*1024*1024}={}){
  const modelFiles=[],metadataFiles=[],counts={},errors=[],excluded=new Set(['node_modules','.git','dist','dist-village','ArcherPreviewSite','sol61-production-prompt']);let fileCount=0,totalBytes=0;
  async function walk(directory,scope){
    let items;try{items=await readdir(directory,{withFileTypes:true});}catch(error){errors.push({path:directory,error:error.code});return;}
    for(const item of items.sort((a,b)=>a.name.localeCompare(b.name))){
      const path=resolve(directory,item.name);if(item.isSymbolicLink())continue;
      if(item.isDirectory()){if(!excluded.has(item.name))await walk(path,scope);continue;}
      if(!item.isFile())continue;
      const info=await stat(path),extension=extname(path).toLowerCase();fileCount++;totalBytes+=info.size;counts[extension]=(counts[extension]??0)+1;
      if(['.glb','.gltf','.fbx','.obj','.blend'].includes(extension))modelFiles.push({path,relativePath:slash(relative(scope,path)),bytes:info.size,extension});
      if(extension==='.json'&&/manifest|audit|approval|asset-plan|config|results|ledger|review/.test(item.name)&&info.size<=1024*1024)metadataFiles.push({path,bytes:info.size});
    }
  }
  for(const directory of roots)await walk(resolve(directory),resolve(directory));
  const declaredHashes=new Map(),approvedDirectories=new Set(),approvedPaths=new Set(),metadata=[];
  function inspect(value,base,allowDirectory=false){
    if(!value||typeof value!=='object')return;
    const file=value.file??(typeof value.source==='string'?value.source:null),hash=value.sha256??value.sourceSha256??value.contentHash;
    if(file&&/^[0-9a-f]{64}$/i.test(hash??''))declaredHashes.set(resolve(base,file).toLowerCase(),hash.toLowerCase());
    const approved=value.visual_review?.status==='APPROVED'||value.visualReview==='APPROVED'||value.status==='APPROVED';
    if(approved){if(allowDirectory&&(value.visual_review?.status==='APPROVED'||value.visualReview==='APPROVED'))approvedDirectories.add(base.toLowerCase());if(file)approvedPaths.add(resolve(base,file).toLowerCase());}
    for(const child of Object.values(value))if(child&&typeof child==='object')inspect(child,base);
  }
  for(const file of metadataFiles.slice(0,maxMetadataFiles)){
    try{const bytes=await readFile(file.path),value=JSON.parse(bytes);inspect(value,dirname(file.path),basename(file.path)==='asset-audit.json');metadata.push({path:file.path,bytes:file.bytes,sha256:sha(bytes),explicitApproval:JSON.stringify(value).includes('APPROVED')});}
    catch(error){errors.push({path:file.path,error:'metadata-'+(error.code??'invalid-json')});}
  }
  let hashedBytes=0;const models=[];
  for(const file of modelFiles){
    const key=file.path.toLowerCase(),nameHash=basename(file.path).match(/^([0-9a-f]{64})\./i)?.[1]?.toLowerCase();
    let hash=declaredHashes.get(key)??nameHash??null,hashEvidence=declaredHashes.has(key)?'local-metadata-declared':nameHash?'content-addressed-filename':'not-hashed-large-or-budgeted';
    if(!hash&&file.bytes<=2*1024*1024&&hashedBytes+file.bytes<=maxHashBytes){hash=sha(await readFile(file.path));hashedBytes+=file.bytes;hashEvidence='computed-small-file-sha256';}
    const deployed=!!hash&&runtimeHashes.has(hash),approved=approvedPaths.has(key)||[...approvedDirectories].some(path=>key.startsWith(path+'/')||key.startsWith(path+'\\'));
    const intermediate=file.extension==='.blend'||/(?:^|\/)(?:cache|temp|intermediate|backup|converted|geometry-lod|ktx2-download|mobile-4k|r\d+)\//i.test(file.relativePath);
    const classification=deployed?'deployed-runtime-or-declared-source':intermediate?'intermediate-working-artifact':approved?'unused-explicitly-reviewed':'unreviewed-candidate-or-unlinked-source';
    models.push({...file,sha256:hash,hashEvidence,classification,reviewEvidence:approved?'local-explicit-approval':null});
  }
  return {version:1,scope:roots.map(path=>resolve(path)),sequence:'enumerate/stat -> bounded JSON manifests/audits -> declared hashes -> budgeted small model hashes; no model buffers dumped',fileCount,totalBytes,extensionCounts:counts,models,metadata,metadataFilesDiscovered:metadataFiles.length,metadataFilesRead:metadata.length,hashedSmallModelBytes:hashedBytes,hashBudgetBytes:maxHashBytes,excludedDirectoryNames:[...excluded],classificationCounts:Object.fromEntries([...new Set(models.map(m=>m.classification))].map(key=>[key,models.filter(m=>m.classification===key).length])),errors,limitations:['APPROVED classification requires an explicit nearby/source metadata approval; directory names containing review do not approve a candidate.','Deployed hash links prove exact resource/source references only; they do not substitute a new visual approval.','Large binaries retain declared hash evidence or an explicit not-hashed marker; no multi-GB binary hashing was performed.','Metadata reads are bounded; uninspected/unlinked sources remain candidates rather than being auto-approved.','This local-only artifact contains absolute source paths and must never be copied into the public catalog.']};
}

async function main(){
  const result=await buildAssetCatalog(),output=resolve(root,'src/asset-catalog.js'),module=catalogModule(result.catalog),indexOutput=resolve(root,'src/editable-asset-index.js'),indexModule=editableIndexModule(result.catalog),check=process.argv.includes('--check');
  if(check){if((await readFile(output,'utf8')).replaceAll('\r\n','\n')!==module||(await readFile(indexOutput,'utf8')).replaceAll('\r\n','\n')!==indexModule)throw new Error('Generated asset catalog/index is stale');}
  else{await writeFile(output,module);await writeFile(indexOutput,indexModule);}
  const reportDir=resolve(root,'reports/moonforest-0.1-2026-11-04');await mkdir(reportDir,{recursive:true});
  const inventoryRoots=[];for(let i=2;i<process.argv.length;i++)if(process.argv[i]==='--inventory-root')inventoryRoots.push(process.argv[++i]);
  if(inventoryRoots.length){const inventory=await inventoryLocalAssets(inventoryRoots,result.runtimeHashes);await writeFile(resolve(reportDir,'phase3-local-inventory.json'),JSON.stringify(inventory,null,2)+'\n');}
  const entries=result.catalog.entries;
  const report={version:1,resourceRevision:result.resourceRevision,catalogRevision:result.catalog.revision,catalogContentRevision:result.catalog.contentRevision,entries:entries.length,modelsRead:result.modelsRead,manifests:result.manifestEvidence,editable:entries.filter(e=>e.placement.supported).map(e=>({assetId:e.assetId,version:e.version,contentHash:e.contentHash,usedMaps:e.usedMaps})),reviewCounts:Object.fromEntries([...new Set(entries.map(e=>e.reviewStatus))].map(status=>[status,entries.filter(e=>e.reviewStatus===status).length])),sameIdsWithMultipleVersions:[...new Set(entries.map(e=>e.assetId))].filter(id=>entries.filter(e=>e.assetId===id).length>1),publicPaths:'deployable-relative-only; local provenance exists only in phase3-local-inventory.json',metadata:'Actual glTF accessor index counts, node-instance triangle submissions, material/texture definitions, skins/joint union, animation names and accessor/node-transform bounds; no external geometry buffers decoded.',reduction:{adopted:false,reason:'No evidence-backed non-protected reduction with equivalent GPU/pixel views is available. Protected houses/trees/rocks/woodwalls and all animated actor profiles stay locked. Separate candidate IDs/versions are required for any future review; approved sources were not modified.'},preview:'Existing thumbnail reference only when present; otherwise load-on-explicit-selection. Search/catalog module imports no renderer, model, textures or preload jobs.',limitations:['Metadata is not GPU allocation/time, physical-device FPS or polygon-source count.','glTF bounds are static accessor/node-transform bounds; posed actors retain their existing runtime skinned bounds and are not static-placement candidates.','Local source approval/hash evidence is inventoried separately and does not auto-approve deployed manifests without explicit review status.','Thirteen approved static prop/tree/rock/plant types are editable independent copies. Soft plants are decorative; solid collision is ground-only and tree bodies use existing certified trunk profiles. Existing base instances require a separate per-map eligibility check.','Normal startup lazy separation, placement/navigation/minimap integration and final build are owned by root/A/verifier.']};
  await writeFile(resolve(reportDir,'phase3-catalog-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({checked:check,entries:entries.length,modelsRead:result.modelsRead,editable:report.editable.map(e=>e.assetId),revision:result.catalog.revision}));
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))await main();
