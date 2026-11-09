import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sourcePath} from '../../Sources/resolve-source.mjs';
import {caveCollisionSource,caveCollisionManifest} from '../scripts/cave-collision-source.mjs';
import {caveSourceFingerprint,caveRenderSourceFingerprint} from '../scripts/cave-source-fingerprint.mjs';
import {CAVE_COLLISION_DATA as body} from '../src/witch-cave-collision-data.js';
import {CAVE_SIGHT_DATA as sight} from '../src/witch-cave-sight-data.js';
import {CAVE_CAMERA_DATA as camera} from '../src/witch-cave-camera-data.js';
import {CAVE_LABORATORY_COLLISION_DATA as native} from '../src/cave-laboratory-collision-data.js';
import {EDITOR_CAVE_COLLISION_DATA as ownership} from '../src/editor-cave-collision-data.js';
import {MOURNING_CAVE_CLEARANCE_DATA as mourning} from '../src/mourning-cave-clearance-data.js';

const current=JSON.parse(readFileSync(new URL('../public/assets/witch-cave.json',import.meta.url))),before=JSON.parse(readFileSync(sourcePath('approved-scenery-budgets','before-manifests/witch-cave.json'))),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('approved render budgets preserve registered collision near sources and keep current appearance/native frames',()=>{
 const source=caveCollisionSource(current);assert.equal(source.revision,'approved-scenery-budget-v1');assert.ok(source.replacements.length>0);
 for(const {id,renderModel,collisionModel}of source.replacements){
  assert.equal(renderModel,current.assets[id].lods[0].model);assert.equal(collisionModel,before.assets[id].lods[0].model);assert.equal(source.manifest.assets[id].lods[0].model,collisionModel);
  for(const key of ['bounds','height','origin','frontYawOffset','category','highTextures','mobileHighTextures'])assert.deepEqual(source.manifest.assets[id][key],current.assets[id][key]);
 }
 assert.deepEqual(source.manifest.assets['cave-derived-laboratory-rock'],current.assets['cave-derived-laboratory-rock'],'Unchanged authored native laboratory is never substituted');
 assert.equal(caveSourceFingerprint(),body.fingerprint);for(const data of [sight,camera,native,ownership])assert.equal(data.fingerprint,body.fingerprint);
 assert.notEqual(caveRenderSourceFingerprint(),body.fingerprint,'Current render identity is recorded separately from the preserved gameplay epoch');
});

test('collision source projection rejects unknown approval, source identity and native transform changes',()=>{
 for(const mutate of [a=>{a.height+=.01;},a=>{a.bounds[0]+=.01;},a=>{a.frontYawOffset+=.01;},a=>{a.geometryBudget.revision='unapproved';},a=>{a.geometryBudget.beforeModelSha256='0'.repeat(64);},a=>{a.geometryBudget.appliedModelSha256='0'.repeat(64);}]){
  const changed=structuredClone(current);mutate(changed.assets['cave-01-eroded-wall']);assert.throws(()=>caveCollisionManifest(changed));
 }
 const changed=structuredClone(current);changed.assets['cave-derived-laboratory-rock'].geometryBudget={...changed.assets['cave-01-eroded-wall'].geometryBudget,assetId:'cave-derived-laboratory-rock'};assert.throws(()=>caveCollisionManifest(changed),/Unapproved cave collision source projection/);
 const forged=structuredClone(current),wall=forged.assets['cave-01-eroded-wall'],unknownHash='a'.repeat(64);wall.lods[0].model='./content/'+unknownHash+'.gltf';wall.geometryBudget.appliedModelSha256=unknownHash;
 assert.throws(()=>caveCollisionManifest(forged),/outside the canonical approved application/,'A new live model with matching forged budget metadata must never inherit old collision authority');
 assert.deepEqual(current,JSON.parse(readFileSync(new URL('../public/assets/witch-cave.json',import.meta.url))),'Projection never mutates current render metadata');
});

test('all original gameplay cell, distance, camera, sight and ownership payloads remain exact across render-only budgets',()=>{
 // Captured from the unchanged delivered data at the pre-budget collision
 // epoch, independently checked against HEAD before source selection changed.
 // These hash complete payloads; no geometry rebake or boundary update is allowed.
 const payloads=[
  [{step:body.step,size:body.size,min:body.min,runs:body.runs},'0d3564c8d3945a41f93dfebf7a0dcef7bdc37d4c983aca4bb3840f4272b33134'],
  [{step:sight.step,size:sight.size,min:sight.min,heightRange:sight.heightRange,kind:sight.kind,runs:sight.runs},'b7a0b0922417e6b3589ded3e226ef359e8bb6d476902c9911fa23bb76ea91326'],
  [{step:camera.step,size:camera.size,min:camera.min,bottom:camera.bottom,unit:camera.unit,layers:camera.layers,lookup:camera.lookup,profiles:camera.profiles},'337de415a10eb58302ddd37bad3c0a6e90a319368ded0a0af60d4b652d3c0589'],
  [{step:native.step,minX:native.minX,minZ:native.minZ,width:native.width,height:native.height,quantum:native.quantum,nativeSkin:native.nativeSkin,legacyMargin:native.legacyMargin,maxDistance:native.maxDistance,maxSupportedRadius:native.maxSupportedRadius,padding:native.padding,bodyBand:native.bodyBand,values:native.values},'2f8c5a1033ab93f5f3c9066e85ed5c8eaa49be7850c7de84fe8bef0dbda7c77d'],
  [{step:ownership.step,size:ownership.size,min:ownership.min,bottom:ownership.bottom,unit:ownership.unit,owners:ownership.owners,sightOwners:ownership.sightOwners,cameraOwners:ownership.cameraOwners},'e44d6d18c85e88100087582b9143230e602e1517f25bac69af0cbcaf85a19ce2'],
  [{step:mourning.step,minX:mourning.minX,minZ:mourning.minZ,width:mourning.width,height:mourning.height,ground:mourning.ground,groundTolerance:mourning.groundTolerance,margin:mourning.margin,sizeScale:mourning.sizeScale,bands:mourning.bands,runs:mourning.runs},'e5f982e62688dbdefd75c1d6709eda228bfcafe5dd48c1b3139073e57fd3eb66'],
 ];
 for(const [payload,expected]of payloads)assert.equal(hash(payload),expected);
});
