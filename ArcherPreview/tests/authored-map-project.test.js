import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {Observable} from '@babylonjs/core';
import {ASSET_CATALOG,getCatalogAsset} from '../src/asset-catalog.js';
import {createBasePlacementManifest,createEmptyPlacementDocument} from '../src/placement-document.js';
import {applyAuthoredMap} from '../scripts/apply-authored-map.mjs';
import {authoredMapReference,authoredMapStorageKey,loadAuthoredMap} from '../src/authored-map-loader.js';

async function temporary(t){const path=await mkdtemp(join(tmpdir(),'mf-authored-map-'));t.after(async()=>{assert.equal(dirname(resolve(path)),resolve(tmpdir()));assert.ok(basename(path).startsWith('mf-authored-map-'));await rm(path,{recursive:true,force:true});});return path;}
function document(mapId='village'){
 const base=createBasePlacementManifest(mapId,{catalog:ASSET_CATALOG}),doc=createEmptyPlacementDocument(base),asset=getCatalogAsset('crate-barrel-cluster');
 doc.revision=1;doc.instances.push({instanceId:'authored-crate-1',assetId:asset.assetId,assetVersion:asset.version,transform:{position:[4,0,6],rotation:[0,0,0,1],scale:1},attachment:{surface:'ground',normal:[0,1,0],offset:0,supportId:'terrain'},collision:'solid'});return doc;
}
test('the exported file passes local validation, registers unchanged JSON and rejects stale project revisions',async t=>{
 const projectRoot=await temporary(t),input=join(projectRoot,'export.json'),body=JSON.stringify(document(),null,2)+'\n';await writeFile(input,body);
 const dry=await applyAuthoredMap(input,{projectRoot});assert.equal(dry.dryRun,true);await assert.rejects(readFile(dry.target),{code:'ENOENT'});
 const applied=await applyAuthoredMap(input,{projectRoot,dryRun:false});assert.equal(await readFile(applied.target,'utf8'),body);assert.equal(await readFile(input,'utf8'),body);
 const registry=JSON.parse(await readFile(applied.indexPath,'utf8')),reference=authoredMapReference('village',null,registry);
 assert.equal(reference.sha256,createHash('sha256').update(body).digest('hex'));assert.equal(reference.revision,1);
 const stale=document();stale.instances[0].transform.position[0]=9;await writeFile(input,JSON.stringify(stale));await assert.rejects(applyAuthoredMap(input,{projectRoot,dryRun:false}),/revision conflict/);
 stale.revision=2;await writeFile(input,JSON.stringify(stale));assert.equal((await applyAuthoredMap(input,{projectRoot,dryRun:false})).entry.revision,2);
});
test('malformed/unsafe IDs and nonfinite transforms cannot write project data',async t=>{
 const projectRoot=await temporary(t),input=join(projectRoot,'bad.json');const bad=document();bad.instances[0].assetId='../../secret';await writeFile(input,JSON.stringify(bad));await assert.rejects(applyAuthoredMap(input,{projectRoot,dryRun:false}),/asset/);
 const invalid=document();invalid.instances[0].transform.scale=-1;await writeFile(input,JSON.stringify(invalid));await assert.rejects(applyAuthoredMap(input,{projectRoot,dryRun:false}),/scale/);
});
test('ordinary play has no authored work or fetch, and applied browser data is a separate source from drafts',()=>{
 let reads=0;assert.equal(authoredMapReference('village',{getItem(){reads++;return null;}},{version:1,maps:{}}),null);assert.equal(reads,1);
 const storage={getItem:key=>key===authoredMapStorageKey('village')?JSON.stringify(document()):null};assert.equal(authoredMapReference('village',storage).kind,'browser-applied');
 assert.throws(()=>authoredMapReference('village',null,{version:2,maps:{}}),/버전/);
 assert.throws(()=>authoredMapReference('village',null,{version:1,maps:{village:{path:'https://outside.test/file.json',sha256:'a'.repeat(64)}}}),/경로/);
});
test('a project file with the wrong SHA never replaces active geometry/navigation',async t=>{
 const fetch=globalThis.fetch;t.after(()=>{globalThis.fetch=fetch;});const bytes=new TextEncoder().encode(JSON.stringify(document()));
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>bytes.buffer});let disposed=0;const existing={dispose(){disposed++;}},navigation={};
 const world={mapId:'village',toolGeneration:1,navigation,scene:{isDisposed:false,onDisposeObservable:new Observable()},authoredPlacements:existing};
 await assert.rejects(loadAuthoredMap(world,{registry:{version:1,maps:{village:{path:'authored/maps/village.json',sha256:'0'.repeat(64),revision:1,baseRevision:document().baseRevision}}},baseUrl:'https://game.test/ArcherPreviewSite/'}),/해시/);
 assert.equal(disposed,0);assert.equal(world.authoredPlacements,existing);assert.equal(world.navigation,navigation);
});
