import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {ASSET_CATALOG,getCatalogAsset,searchCatalog} from '../src/asset-catalog.js';
import {gltfCatalogMetadata,catalogPlacementPolicy,catalogReductionPolicy} from '../scripts/asset-catalog-metadata.mjs';
import {buildAssetCatalog,catalogRevisionForEntries,CATALOG_MANIFESTS,catalogModule,editableIndexModule,catalogRuntimePath,inventoryLocalAssets} from '../scripts/build-asset-catalog.mjs';
import {EDITABLE_ASSET_INDEX,editableBasePlacement} from '../src/editable-asset-index.js';
import {validateResourceIndex} from '../src/resource-index.js';
import {createCinematicDraft,validateCinematicDocument} from '../src/cinematic-document.js';
import {sourcePath} from '../../Sources/resolve-source.mjs';
import {APPROVED_SCENERY_CAPS} from '../scripts/approved-scenery-policy.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const entriesHash=entries=>hash(JSON.stringify(canonical(entries)));
async function catalogProject(t){
 const directory=await mkdtemp(join(tmpdir(),'moonforest-catalog-'));
 t.after(async()=>{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'moonforest-catalog-'));await rm(directory,{recursive:true,force:true});});
 const assets=join(directory,'public','assets'),content=join(assets,'content');await mkdir(content,{recursive:true});
 const model={asset:{version:'2.0'},accessors:[{count:3,min:[0,0,0],max:[1,1,1]},{count:3,type:'VEC2'},{count:3,type:'VEC2'}],meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1}}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
 const files={},documents=new Map();
 const addContent=async(data,extension)=>{const bytes=Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data)),name=hash(bytes)+'.'+extension;await writeFile(join(content,name),bytes);files[name]=bytes.length;return './content/'+name;};
 const modelReference=await addContent(model,'gltf');
 for(const name of CATALOG_MANIFESTS){const doc=['guardian-bear','hooded-goblin','elena','mourning-elena','character','warrior','warrior-v2','warrior-v3','warrior-v3-ios'].includes(name)?{version:'fixture-v1',model:modelReference}:{assets:{'fixture-prop':{model:modelReference,category:'prop',bounds:[1,1,1],height:1,visualReview:'APPROVED'}}};documents.set(name,doc);await writeFile(join(assets,name+'.json'),JSON.stringify(doc));}
 const writeDocument=async name=>writeFile(join(assets,name+'.json'),JSON.stringify(documents.get(name)));
 const writeIndex=async()=>{const payload={files:Object.fromEntries(Object.entries(files).sort()),bundles:[]},index={version:1,revision:hash(JSON.stringify(payload)),...payload};validateResourceIndex(index);await writeFile(join(assets,'resource-index.json'),JSON.stringify(index));return index;};
 await writeIndex();return {directory,assets,content,model,modelReference,documents,addContent,writeDocument,writeIndex};
}

test('glTF metadata counts actual scene instances, triangle modes, joint union, clips and transformed accessor bounds without buffers',()=>{
  const gltf={accessors:[{count:4,min:[-1,0,-1],max:[1,2,1]},{count:6},{count:4}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,targets:[{}]}]},{primitives:[{attributes:{POSITION:0},indices:2,mode:5}]}],nodes:[{mesh:0,translation:[2,0,0]},{mesh:0,scale:[2,1,1]},{mesh:1,translation:[0,0,4]}],scenes:[{nodes:[0,1,2]}],skins:[{joints:[3,4]},{joints:[4,5]}],materials:[{},{}],textures:[{}],images:[{}],animations:[{name:'idle'},{name:'walk'}]};
  const data=gltfCatalogMetadata(gltf);
  assert.equal(data.triangles,6);assert.equal(data.uniqueMeshTriangles,4);assert.equal(data.vertices,4);assert.equal(data.bones,3);assert.equal(data.skins,2);assert.equal(data.clips,2);assert.equal(data.morphTargets,1);
  assert.deepEqual(data.bounds,{min:[-2,0,-1],max:[3,2,5],size:[5,2,6]});
});

test('catalog path boundary rejects URLs, absolute paths and encoded traversal',()=>{
  assert.equal(catalogRuntimePath('assets/village.json','./content/model.gltf'),'assets/content/model.gltf');
  for(const value of ['https://example.test/model.gltf','//example.test/model.gltf','file:///C:/source/model.glb','C:\\source\\model.glb','/private/model.gltf','../private/model.gltf','./%2e%2e%2fprivate/model.gltf','./content%5c..%5cprivate.glb','data:application/octet-stream;base64,AA=='])assert.throws(()=>catalogRuntimePath('assets/village.json',value),/Catalog/);
});

test('generated catalog is deterministic and fresh, with exact source model metadata and deployable paths only',async()=>{
  const result=await buildAssetCatalog();
  assert.deepEqual(result.catalog,ASSET_CATALOG);assert.equal(catalogModule(result.catalog),(await readFile(new URL('../src/asset-catalog.js',import.meta.url),'utf8')).replaceAll('\r\n','\n'));
  assert.equal(editableIndexModule(result.catalog),(await readFile(new URL('../src/editable-asset-index.js',import.meta.url),'utf8')).replaceAll('\r\n','\n'));
  const index=JSON.parse(await readFile(new URL('../public/assets/resource-index.json',import.meta.url),'utf8'));validateResourceIndex(index);
  assert.equal(index.revision,hash(JSON.stringify({files:index.files,bundles:index.bundles})),'distribution integrity remains independently verified');
  assert.equal(ASSET_CATALOG.revision,catalogRevisionForEntries(ASSET_CATALOG.entries));assert.equal(result.resourceRevision,index.revision);
  assert.equal(validateCinematicDocument(JSON.stringify(createCinematicDraft({catalogRevision:ASSET_CATALOG.revision})),{catalog:result.catalog}).valid,true,'saved legacy scenes remain valid after rebuilding identical entries');
  assert.ok(result.modelsRead>200);assert.ok(ASSET_CATALOG.entries.length>70);
  const text=JSON.stringify(ASSET_CATALOG);assert.equal(/file:\/\/|[A-Za-z]:\\|C:\/Users|Documents\/ChatGPT|MM Project|base64/i.test(text),false);
  for(const entry of ASSET_CATALOG.entries){
    assert.match(entry.contentHash,/^[a-f0-9]{64}$/);assert.match(entry.runtime.model,/^assets\/content\/[a-f0-9]{64}\.gltf$/);
    const bytes=await readFile(new URL('../public/'+entry.runtime.model,import.meta.url)),hash=createHash('sha256').update(bytes).digest('hex'),gltf=JSON.parse(bytes);
    assert.equal(entry.contentHash,hash);assert.equal(entry.geometry.triangles,gltfCatalogMetadata(gltf).triangles);
  }
  assert.equal(getCatalogAsset('mourning-elena').geometry.triangles,49982);assert.equal(getCatalogAsset('mourning-elena').geometry.bones,255);assert.equal(getCatalogAsset('elena').geometry.triangles,56918);
});

test('historical catalog identities remain reproducible; approved scenery changes content without breaking placement versions',async()=>{
 const before=JSON.parse(await readFile(sourcePath('approved-scenery-budgets','before-catalog.json'),'utf8'));
 const previous=before.entries.filter(entry=>!entry.npc),legacy=previous.filter(entry=>!['warrior-v3-mobile2k-rgba','warrior-v3-mobile4k'].includes(entry.assetId));
 assert.equal(legacy.length,82);assert.notEqual(entriesHash(legacy),'f73c016eed41df9410a8e357960ce9112e4247e8a201f8dd82dcd66b5f268ff5','expanded editor capabilities are deliberately distinct metadata');
 assert.equal(catalogRevisionForEntries(legacy),'a33bb141c160692086a7bb1f7f8100be74fdbb1fcdef6876512635245af92853');
 assert.equal(previous.length,84);assert.equal(catalogRevisionForEntries(previous),'535a44e389eea2c7a46223d345768369c9533115b7c1598695ba34319dfd97f8');
 assert.equal(ASSET_CATALOG.entries.length,85);assert.equal(catalogRevisionForEntries(ASSET_CATALOG.entries),ASSET_CATALOG.revision);assert.notEqual(ASSET_CATALOG.revision,catalogRevisionForEntries(legacy));
 assert.notEqual(ASSET_CATALOG.revision,before.revision,'New geometry is a new content catalog, not a forged legacy fingerprint');
 for(const id of Object.keys(APPROVED_SCENERY_CAPS)){
  const old=before.entries.find(e=>e.assetId===id),current=getCatalogAsset(id);
  assert.equal(current.version,old.version,'Native placement authoring identity remains stable for '+id);
  assert.notEqual(current.contentHash,old.contentHash,'Actual geometry has a new independently verified content hash for '+id);
  assert.ok(current.geometry.triangles<=APPROVED_SCENERY_CAPS[id]);
 }
 const reorderedKeys=ASSET_CATALOG.entries.map(entry=>Object.fromEntries(Object.entries(entry).reverse()));assert.equal(catalogRevisionForEntries(reorderedKeys),ASSET_CATALOG.revision);
 for(const change of [entry=>entry.runtime.model='assets/content/'+('a'.repeat(64))+'.gltf',entry=>entry.geometry.lods[0].contentHash='b'.repeat(64),entry=>entry.version+='-changed']){
  const entries=structuredClone(ASSET_CATALOG.entries);change(entries[0]);assert.equal(catalogRevisionForEntries(entries),entriesHash(entries));assert.notEqual(catalogRevisionForEntries(entries),ASSET_CATALOG.revision);
 }
});

test('R2 accepted scenery keeps placement identity while catalog records the actual reviewed render geometry',async t=>{
 const selected=ASSET_CATALOG.entries.filter(entry=>entry.reduction?.revision==='approved-review-r2-2026-11-09');
 if(!selected.length){t.skip('R2 candidate assets have not been applied');return;}
 const ledger=JSON.parse(await readFile(sourcePath('approved-review-r2-2026-11-09','approval.json'),'utf8'));
 assert.equal(selected.length,20);assert.equal(ledger.assets.length,20);
 for(const item of ledger.assets){
  const current=selected.find(entry=>entry.assetId===item.id);assert.ok(current,item.id+' missing R2 catalog entry');
  const config=item.applications[0].afterConfig,meta=config.r2Geometry;
  assert.equal(current.version,meta.catalogAssetVersion,item.id+' original placement identity');
  assert.equal(current.contentHash,meta.appliedModelSha256,item.id+' actual content identity');
  assert.equal(current.geometry.triangles,item.actualTriangles,item.id+' approved triangles');
  assert.equal(current.reduction.approvedTriangles,item.actualTriangles,item.id+' approved triangles must not be recast as an enforced budget');
  assert.equal(current.reduction.locked,true);
  const bytes=await readFile(new URL('../public/'+current.runtime.model,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),current.contentHash);
 }
});

test('mobile-only profile distribution and a new valid global index keep identical catalog entries and saved-scene identity',async t=>{
 const fixture=await catalogProject(t),before=await buildAssetCatalog({projectRoot:fixture.directory});
 const texture=await fixture.addContent(Buffer.from('mobile-only-texture-distribution'),'ktx2');
 fixture.documents.get('village').assets['fixture-prop'].mobileHighTextures={shading:'toon-color',textures:{albedo:{url:texture,width:1024,height:1024,codec:'etc1s'}},resources:[texture]};await fixture.writeDocument('village');
 const index=await fixture.writeIndex(),after=await buildAssetCatalog({projectRoot:fixture.directory});
 assert.notEqual(after.resourceRevision,before.resourceRevision);assert.equal(after.resourceRevision,index.revision);assert.equal(index.revision,hash(JSON.stringify({files:index.files,bundles:index.bundles})));
 assert.deepEqual(after.catalog.entries,before.catalog.entries);assert.deepEqual(after.catalog,before.catalog);assert.equal(catalogModule(after.catalog),catalogModule(before.catalog));
 const savedScene=JSON.stringify(createCinematicDraft({catalogRevision:before.catalog.revision}));assert.equal(validateCinematicDocument(savedScene,{catalog:after.catalog}).valid,true);
 assert.notDeepEqual(after.manifestEvidence,before.manifestEvidence,'distribution evidence still records changed manifest bytes');
});

test('actual model UV mapping and actor version changes invalidate entry identity; a forged content filename still fails',async t=>{
 const fixture=await catalogProject(t),before=await buildAssetCatalog({projectRoot:fixture.directory}),uvModel=structuredClone(fixture.model);uvModel.meshes[0].primitives[0].attributes.TEXCOORD_0=2;
 const uvReference=await fixture.addContent(uvModel,'gltf');fixture.documents.get('village').assets['fixture-prop'].model=uvReference;await fixture.writeDocument('village');await fixture.writeIndex();
 const uvChanged=await buildAssetCatalog({projectRoot:fixture.directory});assert.notEqual(uvChanged.catalog.revision,before.catalog.revision);assert.equal(uvChanged.catalog.revision,entriesHash(uvChanged.catalog.entries));
 assert.equal(validateCinematicDocument(createCinematicDraft({catalogRevision:before.catalog.revision}),{catalog:uvChanged.catalog}).valid,false,'changed UV/model identity still requires a scene migration');
 assert.ok(uvChanged.catalog.entries.some(entry=>entry.runtime.model.endsWith(uvReference.slice(2))&&entry.contentHash===uvReference.split('/').at(-1).split('.')[0]));
 fixture.documents.get('guardian-bear').version='fixture-v2';await fixture.writeDocument('guardian-bear');const versionChanged=await buildAssetCatalog({projectRoot:fixture.directory});assert.notEqual(versionChanged.catalog.revision,uvChanged.catalog.revision);
 assert.equal(versionChanged.catalog.entries.find(entry=>entry.assetId==='guardian-bear').contentHash,before.catalog.entries.find(entry=>entry.assetId==='guardian-bear').contentHash,'version changes alone also change identity');
 await writeFile(join(fixture.assets,fixture.modelReference),JSON.stringify(uvModel));await assert.rejects(buildAssetCatalog({projectRoot:fixture.directory}),/Content-addressed runtime model hash differs/);
});

test('the small nearby-edit index agrees with catalog eligibility without importing model, renderer or full catalog data',async()=>{
 const source=await readFile(new URL('../src/editable-asset-index.js',import.meta.url),'utf8');assert.ok(new TextEncoder().encode(source).length<48000);assert.equal(/^import\s/m.test(source),false);assert.equal(/fetch\(|new (?:Engine|Texture)|LoadAsset|preload/.test(source),false);
 assert.deepEqual(EDITABLE_ASSET_INDEX.assets.map(row=>row.assetId),ASSET_CATALOG.entries.filter(row=>row.placement.supported||row.assetId==='cave-derived-laboratory-rock').map(row=>row.assetId));assert.deepEqual(EDITABLE_ASSET_INDEX.categories.map(row=>row.value),['tree','rock','prop','plant','building','wall','fence','defense','background']);
 assert.equal(editableBasePlacement('village',{id:'safe-tree',asset:'tree-01-round-oak',kind:'tree'}).editable,true);
 for(const [mapId,row]of [['witch-cave',{id:'cavern-118',asset:'crate-barrel-cluster'}],['village',{id:'background-copy',asset:'handcart',background:true}],['great-plains',{id:'treasure',asset:'handcart',lootTier:0}],['village',{id:'home',asset:'tree-01-round-oak',pad:true}]])assert.equal(editableBasePlacement(mapId,row).editable,true);
 assert.equal(editableBasePlacement('witch-cave',{id:'cavern-149',asset:'cave-derived-laboratory-rock'}).editable,false);
});

test('search and version lookup use metadata only and disambiguate same IDs across versions',async()=>{
  const matches=searchCatalog('handcart','prop');assert.equal(matches.length,1);assert.equal(matches[0].assetId,'handcart');assert.equal(getCatalogAsset('handcart',matches[0].version),matches[0]);
  const first=matches[0],extra={...first,version:'test-other-version'};ASSET_CATALOG.entries.push(extra);
  try{assert.throws(()=>getCatalogAsset('handcart'),/ambiguous/);assert.equal(getCatalogAsset('handcart',first.version),first);}finally{ASSET_CATALOG.entries.pop();}
  assert.throws(()=>getCatalogAsset('handcart','wrong-version'),/Unknown/);
  const source=await readFile(new URL('../src/asset-catalog.js',import.meta.url),'utf8');assert.equal(/^import\s/m.test(source),false);assert.equal(/fetch\(|new (?:Engine|Texture)|LoadAsset|preload|base64/.test(source),false);
});

test('all shipped static ordinary categories are addable without weakening deformation or art-review safeguards',()=>{
 const editable=ASSET_CATALOG.entries.filter(e=>e.placement.supported);assert.equal(editable.length,71);
 for(const category of ['building','wall','fence','defense','rock','tree','prop'])assert.ok(editable.some(e=>e.category===category),category);
 for(const entry of editable){assert.equal(entry.geometry.skinned,false);assert.equal(entry.geometry.clips,0);assert.equal(entry.geometry.morphTargets,0);assert.ok(entry.geometry.lods.every(lod=>!lod.skinned&&!lod.clips&&!lod.morphTargets));assert.deepEqual(entry.placement.surfaces,['ground','wall','ceiling','free']);assert.equal(entry.placement.scaleMin,.1);assert.equal(entry.placement.scaleMax,10);assert.ok(entry.units.metersPerSourceUnit>0);}
 for(const id of ['tree-01-round-oak','tree-02-slender-pine','forest-01-sickly-oak','forest-02-dead-tree'])assert.equal(getCatalogAsset(id).placement.body.shape,'trunk-capsule');
 for(const id of ['oak-tree','verdant-tree'])assert.equal(getCatalogAsset(id).placement.supported,true);
 for(const id of ['village-plains-outskirts-ground','cave-derived-laboratory-rock'])assert.equal(getCatalogAsset(id).placement.supported,false);
 assert.match(getCatalogAsset('cave-derived-laboratory-rock').placement.reason,/지형/);
 assert.equal(getCatalogAsset('chest-common').reviewStatus,'deployed-review-unspecified','editor support never fabricates visual approval');
 assert.equal(catalogPlacementPolicy({assetId:'handcart',category:'prop',reviewStatus:'unreviewed'}).supported,true);
 for(const deformation of [{skinned:true},{clips:1},{morphTargets:1},{deformedLod:true}])assert.equal(catalogPlacementPolicy({assetId:'tree-01-round-oak',category:'tree',reviewStatus:'approved',...deformation}).supported,false);
 for(const category of ['building','tree','rock','wall','fence','defense'])assert.equal(catalogReductionPolicy({assetId:'test',category}).locked,true);
 for(const entry of ASSET_CATALOG.entries.filter(e=>/house|tree|rock|wood-|wall/i.test(e.assetId)))assert.equal(entry.reduction.locked,true);
});

test('local inventory separates exact deployed hashes, explicit nearby review, candidates and working artifacts without autoapproval',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'moonforest-catalog-'));
  t.after(async()=>{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'moonforest-catalog-'));await rm(directory,{recursive:true,force:true});});
  const bytes=Buffer.from('runtime-source'),hash=createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(directory,hash+'.gltf'),bytes);await writeFile(join(directory,'candidate.glb'),'candidate');await writeFile(join(directory,'working.blend'),'scene');
  await writeFile(join(directory,'review-report.json'),JSON.stringify({status:'APPROVED',description:'This generic report does not approve sibling models.'}));
  await mkdir(join(directory,'reviewed'));await writeFile(join(directory,'reviewed','asset-audit.json'),JSON.stringify({visual_review:{status:'APPROVED'}}));await writeFile(join(directory,'reviewed','lod0.glb'),'reviewed');
  const result=await inventoryLocalAssets([directory],new Set([hash]));
  assert.equal(result.models.find(m=>m.path.endsWith(hash+'.gltf')).classification,'deployed-runtime-or-declared-source');
  assert.equal(result.models.find(m=>m.path.endsWith('candidate.glb')).classification,'unreviewed-candidate-or-unlinked-source');
  assert.equal(result.models.find(m=>m.path.endsWith('lod0.glb')).classification,'unused-explicitly-reviewed');
  assert.equal(result.models.find(m=>m.path.endsWith('working.blend')).classification,'intermediate-working-artifact');
  assert.ok(result.hashedSmallModelBytes<=result.hashBudgetBytes);assert.equal(result.errors.length,0);
});
