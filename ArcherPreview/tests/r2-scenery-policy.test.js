import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sourcePath} from '../../Sources/resolve-source.mjs';
import {SCENERY_REVIEW_R2_REVISION,sceneryNativeFingerprint,validateR2SceneryAgainstLedger} from '../scripts/approved-scenery-policy.mjs';

const hex=letter=>letter.repeat(64),model=letter=>`./content/${hex(letter)}.gltf`;
const clone=structuredClone;
function fixture(){
 const id='approved-fixture',sourceModelId='file:Sources/environment/plains/authored-maps/2026-11-05-user-work.moonmap',sourceModelSha256=createHash('sha256').update(readFileSync(sourcePath(sourceModelId))).digest('hex');
 const before={height:2,bounds:[1,2,1],origin:'bottom-center',category:'prop',lods:[{model:model('a'),triangles:4000,distance:0},{model:model('c'),triangles:2000,distance:20},{model:model('d'),triangles:1000,distance:50}],mobileNear:{model:model('f'),triangles:4000}};
 const after=clone(before);after.lods[0]={...after.lods[0],model:model('b'),triangles:1400};after.mobileNear={model:model('e'),triangles:1400};
 after.r2Geometry={revision:SCENERY_REVIEW_R2_REVISION,assetId:id,requestedCap:1500,actualTriangles:1400,catalogAssetVersion:hex('a'),beforeModelSha256:hex('a'),appliedModelSha256:hex('b'),nativeConfigSha256:sceneryNativeFingerprint(before),lodModels:[hex('b'),hex('c'),hex('d')],mobileNearModelSha256:hex('e'),derivedAtlasSourceSha256:null,texturePixelsUnchanged:true,lodDistancesUnchanged:true};
 const ledger={version:1,revision:SCENERY_REVIEW_R2_REVISION,assets:[{id,requestedCap:1500,actualTriangles:1400,sourceModelId,sourceModelSha256,sourceTextureId:null,sourceTextureSha256:null,reviewedR1:true,applications:[{manifest:'village.json',beforeConfig:before,afterConfig:clone(after)}]}]};
 return {id,config:after,info:{contentHash:hex('b'),triangles:1400},ledger};
}

test('R2 identity accepts only the exact authorized asset even when near count is below preserved LOD1',()=>{
 const {id,config,info,ledger}=fixture();assert.equal(validateR2SceneryAgainstLedger(id,config,info,ledger),hex('a'));
 for(const mutate of [
  x=>{x.config.r2Geometry.assetId='forged';},x=>{x.config.r2Geometry.catalogAssetVersion=hex('f');},
  x=>{x.config.lods[1].model=model('e');},x=>{x.config.lods[1].distance++;},x=>{x.config.height++;},
  x=>{x.config.mobileNear.model=model('f');},x=>{x.info.contentHash=hex('c');},x=>{x.info.triangles++;},
  x=>{x.config.geometryBudget={revision:'forged'};},x=>{x.ledger.assets[0].sourceModelSha256=hex('f');},
 ]){const x=fixture();mutate(x);assert.throws(()=>validateR2SceneryAgainstLedger(x.id,x.config,x.info,x.ledger));}
});

test('R2 internal invariants reject a ledger-matching config with changed native frame or retained LOD',()=>{
 for(const mutate of [
  x=>{x.config.height++;x.config.r2Geometry.nativeConfigSha256=sceneryNativeFingerprint(x.config);},
  x=>{x.config.lods[1].model=model('e');x.config.r2Geometry.lodModels[1]=hex('e');},
  x=>{x.config.lods[1].distance++;},x=>{x.config.r2Geometry.catalogAssetVersion=hex('f');},
 ]){const x=fixture();mutate(x);x.ledger.assets[0].applications[0].afterConfig=clone(x.config);assert.throws(()=>validateR2SceneryAgainstLedger(x.id,x.config,x.info,x.ledger));}
});
