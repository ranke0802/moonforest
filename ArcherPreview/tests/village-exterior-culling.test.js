import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,PBRMaterial} from '@babylonjs/core';
import {sourcePath} from '../../Sources/resolve-source.mjs';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {configureVillageSurfaceCulling} from '../src/village-streamed-environment.js';

const base=new URL('../public/assets/',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('approved village exterior keeps its native frame and actual authored faces across every profile',async t=>{
 const config=JSON.parse(readFileSync(new URL('great-plains.json',base))).assets['village-approach'];
 if(!config.approvedVillageExterior){t.skip('Approved exterior not applied');return;}
 const plan=JSON.parse(readFileSync(sourcePath('village-exterior-shell-review','runtime/plan.json'))),before=plan.beforeAsset;
 assert.deepEqual(config,plan.afterAsset);
 for(const field of ['height','bounds','origin','frontYawOffset','category'])assert.deepEqual(config[field],before[field],field+' native frame');
 assert.equal(config.height/config.bounds[1],1);assert.equal(before.height/before.bounds[1],1);
 const profiles=[...config.lods,config.mobileNear],engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());
 for(const [index,profile]of profiles.entries()){
  const url=new URL(profile.model,base),bytes=readFileSync(url);assert.equal(sha(bytes),config.approvedVillageExterior.appliedModelSha256);
  const {gltf}=await readRuntimeGltf(url);assert.equal(profile.triangles,plan.geometry.triangles);assert.ok(gltf.materials.some(m=>m.doubleSided===true));
  assert.equal(gltf.images.length,1);assert.equal(gltf.images[0].uri,plan.texture.name);assert.equal(sha(readFileSync(new URL(gltf.images[0].uri,url))),plan.texture.sha256);
  for(const source of gltf.materials){
   const material=new PBRMaterial('profile-'+index,scene);material.backFaceCulling=!source.doubleSided;
   configureVillageSurfaceCulling({material},{assetId:'village-approach',category:config.category,level:profile.level,approvedVillageExterior:config.approvedVillageExterior});
   assert.equal(material.backFaceCulling,!source.doubleSided,'profile '+index+' follows authored two-sided setting');material.dispose();
  }
 }
});
