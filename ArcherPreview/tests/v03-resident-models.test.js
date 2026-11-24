import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,VertexBuffer} from '@babylonjs/core';
import {readMapContainer} from '../src/map-container.js';
import {withResidentFaceRig} from '../src/v03/resident-face-models.js';
import {CAST_ENTRIES} from '../src/v03/cast-catalog.js';
import {NPCS,DIALOGUES} from '../src/v03/data/chapter1.js';
import {createSeatedInstructor} from '../src/v03/seated-instructor.js';
import {INSTRUCTOR_MODEL} from '../src/v03/seated-instructor-asset.js';
import {mapNavigation} from '../src/world.js';
import {villagePlacements} from '../src/fixed-layouts.js';
import {settlementPlacements} from '../src/v03/settlement-scenery.js';

const assets=new URL('../public/assets/',import.meta.url);
const read=(path,base=assets)=>readFileSync(new URL(path,base));
const json=path=>JSON.parse(read(path));
function modelFile(path){return json(path.replace(/^assets\//,''));}
async function geometryOnly(scene,model){
 const g=structuredClone(model);
 for(const b of g.buffers)b.uri='data:application/octet-stream;base64,'+read('content/'+b.uri).toString('base64');
 for(const m of g.meshes)for(const p of m.primitives)delete p.material;
 delete g.extensionsRequired;delete g.extensionsUsed;delete g.images;delete g.materials;delete g.textures;
 return readMapContainer(scene,g,'file:///',{skipMaterials:true});
}

test('seven shipped cast rigs load sparse cheek weights in Babylon; non-face channels, textures and mesh streams stay identical',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try {
  let correctedRoles=0,total=0,bytes=0;
  for(const source of CAST_ENTRIES){
   const variant=withResidentFaceRig(source);
   if(source===variant)continue;
   const old=modelFile(source.runtime.model),out=modelFile(variant.runtime.model);
   const row=json(variant.runtime.manifest.replace('assets/','')).assets[variant.assetId];
   assert.equal(row.model.replace('./','assets/'),variant.runtime.model);
   assert.deepEqual(out.animations,old.animations);assert.deepEqual(out.nodes,old.nodes);
   assert.deepEqual(out.images,old.images);assert.deepEqual(out.meshes,old.meshes);
   assert.deepEqual(out.buffers.slice(0,-1),old.buffers);
   const attr=out.meshes[0].primitives[0].attributes,idx=attr.WEIGHTS_0;
   const sparse=out.accessors[idx].sparse,blob=read('content/'+out.buffers.at(-1).uri);
   assert.ok(sparse.count>100);
   bytes+=blob.length;total+=sparse.count;
   const container=await geometryOnly(scene,out),mesh=container.meshes.find(m=>m.getTotalVertices()>0);
   const wp=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind),original=old.accessors[idx];
   const oldView=old.bufferViews[original.bufferView],oldBytes=read('content/'+old.buffers[oldView.buffer].uri);
   const recomputed=new Set();
   for(let j=0;j<sparse.count;j++){
    const i=blob.readUInt16LE(j*2);
    recomputed.add(i);
    for(let k=0;k<4;k++)assert.equal(wp[i*4+k],blob.readFloatLE(out.bufferViews[sparse.values.bufferView].byteOffset+(4*j+k)*4));
    assert.ok(Math.abs(wp.slice(i*4,i*4+4).reduce((a,b)=>a+b,0)-1)<1e-5);
   }
   for(let i=0;i<original.count;i+=29)if(!recomputed.has(i)){
    const offset=(oldView.byteOffset??0)+(original.byteOffset??0)+i*16;
    for(let k=0;k<4;k++)assert.equal(wp[i*4+k],oldBytes.readFloatLE(offset+k*4));
   }
   container.dispose();correctedRoles++;
  }
  assert.equal(correctedRoles,7);assert.ok(total>1800&&bytes<40*1024);
 }finally{scene.dispose();engine.dispose();}
});

test('the seated instructor has two native clips, five joints, two draws, a shared texture and a walkable conversation position',async()=>{
 const config=NPCS.find(n=>n.id==='foster-father');
 assert.equal(config.roam,false);assert.equal(DIALOGUES[config.idle][0].who,'양아버지');
 const nav=mapNavigation({village:true,gameplayV03:true,placements:settlementPlacements('village',villagePlacements())});
 assert.ok(nav.free(config,.6,90));assert.ok(nav.free({x:config.x-1,z:config.z+.7},.34,90));
 const model=modelFile(INSTRUCTOR_MODEL),chief=json('npc-moonforest-tripo-merchant.json').assets['moonforest-tripo-merchant'];
 assert.ok(chief.resources.includes('./content/'+model.images[0].uri));
 assert.equal(model.skins[0].joints.length,5);assert.equal(model.meshes.reduce((s,m)=>s+m.primitives.length,0),2);
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const asset=await geometryOnly(scene,model);
  const groups=asset.animationGroups;
  assert.deepEqual(groups.map(g=>g.name),['Seated_Idle','Seated_Teach']);
  for(const group of groups){assert.equal(group.targetedAnimations.length,4);assert.ok(group.targetedAnimations.every(t=>t.target.name!=='Root'));}
  const wrap={rootNodes:asset.rootNodes,animationGroups:groups,meshes:asset.meshes,own(){},dispose:()=>asset.dispose()};
  const visual=createSeatedInstructor(scene,async()=>wrap,'https://example.invalid/');
  visual.place(config.x,0,config.z,config.yaw);await visual.settled;
  assert.ok(groups[0].isPlaying);visual.talk(true);assert.ok(groups[1].isPlaying);
  visual.talk(false);assert.ok(groups[0].isPlaying);
  visual.dispose();assert.equal(scene.animationGroups.length,0);
 }finally{scene.dispose();engine.dispose();}
});
