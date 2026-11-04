import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {ASSET_CATALOG,getCatalogAsset,searchCatalog} from '../src/asset-catalog.js';
import {gltfCatalogMetadata,catalogPlacementPolicy,catalogReductionPolicy} from '../scripts/asset-catalog-metadata.mjs';
import {buildAssetCatalog,catalogModule,editableIndexModule,catalogRuntimePath,inventoryLocalAssets} from '../scripts/build-asset-catalog.mjs';
import {EDITABLE_ASSET_INDEX,editableBasePlacement} from '../src/editable-asset-index.js';

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
  assert.deepEqual(result.catalog,ASSET_CATALOG);assert.equal(catalogModule(result.catalog),await readFile(new URL('../src/asset-catalog.js',import.meta.url),'utf8'));
  assert.equal(editableIndexModule(result.catalog),await readFile(new URL('../src/editable-asset-index.js',import.meta.url),'utf8'));
  const index=JSON.parse(await readFile(new URL('../public/assets/resource-index.json',import.meta.url),'utf8'));assert.equal(ASSET_CATALOG.revision,index.revision);
  assert.ok(result.modelsRead>200);assert.ok(ASSET_CATALOG.entries.length>70);
  const text=JSON.stringify(ASSET_CATALOG);assert.equal(/file:\/\/|[A-Za-z]:\\|C:\/Users|Documents\/ChatGPT|MM Project|base64/i.test(text),false);
  for(const entry of ASSET_CATALOG.entries){
    assert.match(entry.contentHash,/^[a-f0-9]{64}$/);assert.match(entry.runtime.model,/^assets\/content\/[a-f0-9]{64}\.gltf$/);
    const bytes=await readFile(new URL('../public/'+entry.runtime.model,import.meta.url)),hash=createHash('sha256').update(bytes).digest('hex'),gltf=JSON.parse(bytes);
    assert.equal(entry.contentHash,hash);assert.equal(entry.geometry.triangles,gltfCatalogMetadata(gltf).triangles);
  }
  assert.equal(getCatalogAsset('mourning-elena').geometry.triangles,49982);assert.equal(getCatalogAsset('mourning-elena').geometry.bones,255);assert.equal(getCatalogAsset('elena').geometry.triangles,56918);
});

test('the small nearby-edit index agrees with catalog eligibility without importing model, renderer or full catalog data',async()=>{
 const source=await readFile(new URL('../src/editable-asset-index.js',import.meta.url),'utf8');assert.ok(new TextEncoder().encode(source).length<20000);assert.equal(/^import\s/m.test(source),false);assert.equal(/fetch\(|new (?:Engine|Texture)|LoadAsset|preload/.test(source),false);
 assert.deepEqual(EDITABLE_ASSET_INDEX.assets.map(row=>row.assetId),ASSET_CATALOG.entries.filter(row=>row.placement.supported).map(row=>row.assetId));assert.deepEqual(EDITABLE_ASSET_INDEX.categories.map(row=>row.value),['tree','rock','prop','plant']);
 assert.equal(editableBasePlacement('village',{id:'safe-tree',asset:'tree-01-round-oak',kind:'tree'}).editable,true);
 for(const [mapId,row]of [['witch-cave',{id:'cavern-118',asset:'crate-barrel-cluster'}],['village',{id:'background-copy',asset:'handcart',background:true}],['great-plains',{id:'treasure',asset:'handcart',lootTier:0}],['village',{id:'home',asset:'tree-01-round-oak',pad:true}]])assert.equal(editableBasePlacement(mapId,row).editable,false);
});

test('search and version lookup use metadata only and disambiguate same IDs across versions',async()=>{
  const matches=searchCatalog('handcart','prop');assert.equal(matches.length,1);assert.equal(matches[0].assetId,'handcart');assert.equal(getCatalogAsset('handcart',matches[0].version),matches[0]);
  const first=matches[0],extra={...first,version:'test-other-version'};ASSET_CATALOG.entries.push(extra);
  try{assert.throws(()=>getCatalogAsset('handcart'),/ambiguous/);assert.equal(getCatalogAsset('handcart',first.version),first);}finally{ASSET_CATALOG.entries.pop();}
  assert.throws(()=>getCatalogAsset('handcart','wrong-version'),/Unknown/);
  const source=await readFile(new URL('../src/asset-catalog.js',import.meta.url),'utf8');assert.equal(/^import\s/m.test(source),false);assert.equal(/fetch\(|new (?:Engine|Texture)|LoadAsset|preload|base64/.test(source),false);
});

test('all approved independent tree/rock/prop/plant variants are editable while baked, actor and unreviewed assets stay locked',()=>{
  const editable=ASSET_CATALOG.entries.filter(e=>e.placement.supported);
  assert.deepEqual(editable.map(e=>e.assetId),['bush','crate-barrel-cluster','firewood','forest-01-sickly-oak','forest-02-dead-tree','forest-04-poison-fungi','forest-05-thorn-bramble','garden-bed','handcart','rock-01-mossy-boulder','rock-02-jagged-outcrop','tree-01-round-oak','tree-02-slender-pine']);
  for(const entry of editable){const soft=entry.category==='plant';assert.equal(entry.reviewStatus,'approved');assert.equal(entry.geometry.skinned,false);assert.equal(entry.geometry.clips,0);assert.equal(entry.geometry.morphTargets,0);assert.equal(entry.geometry.lods.every(lod=>!lod.skinned&&!lod.clips&&!lod.morphTargets),true);assert.equal(entry.placement.collision,soft?'none':'independent-static');assert.equal(entry.placement.defaultCollision,soft?'none':'solid');assert.deepEqual(entry.placement.solidSurfaces,soft?[]:['ground']);assert.deepEqual(entry.placement.surfaces,['ground','wall','ceiling','free']);assert.equal(entry.placement.scaleMin,.1);assert.equal(entry.placement.scaleMax,10);assert.ok(entry.units.metersPerSourceUnit>0);}
  for(const tree of searchCatalog('','tree').filter(entry=>entry.placement.supported)){assert.equal(tree.placement.sourceKind,'tree');assert.equal(tree.placement.body.shape,'trunk-capsule');assert.ok(tree.placement.body.radius>0);assert.ok(tree.placement.body.height>0);assert.equal(tree.reduction.locked,true);}
  assert.equal(searchCatalog('','tree').filter(e=>e.placement.supported).length,4);
  assert.equal(searchCatalog('','rock').filter(e=>e.placement.supported).length,2);
  assert.equal(getCatalogAsset('oak-tree').placement.supported,false);assert.equal(getCatalogAsset('verdant-tree').placement.supported,false);
  for(const entry of ASSET_CATALOG.entries)if(entry.geometry.skinned||entry.placement.baked||entry.reviewStatus!=='approved')assert.equal(entry.placement.supported,false);
  assert.equal(getCatalogAsset('chest-common').reviewStatus,'deployed-review-unspecified');
  assert.equal(catalogPlacementPolicy({assetId:'handcart',category:'prop',reviewStatus:'unreviewed'}).supported,false);
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
