import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setImmediate as tick} from 'node:timers/promises';
import {Mesh,MeshBuilder,NullEngine,PBRMaterial,Scene,Texture,TransformNode,VertexData} from '@babylonjs/core';
import {FOE_WEAPON_MODELS,FOE_WEAPONS,mountEnemyWeapon,acquireFoeWeapon} from '../src/v03/foe-weapons.js';
import {TOWN_ITEMS,monsterRewards} from '../src/v03/town-items.js';
import {WarriorEquipment} from '../src/equipment.js';

// Read actual shipped position/index buffers; NullEngine cannot show GPU colors,
// but both users must bind the same painted texture object and mesh geometry.
function geometry(url,scene){
  const file=readFileSync(url),len=file.readUInt32LE(12),d=JSON.parse(file.toString('utf8',20,20+len)),bin=file.subarray(28+len);
  const primitive=d.meshes[0].primitives[0],v=new VertexData();
  for(const [target,key,width] of [['positions','POSITION',3],['indices','indices',1]]){
    const a=d.accessors[key==='indices'?primitive.indices:primitive.attributes[key]],b=d.bufferViews[a.bufferView];
    v[target]=Array.from({length:a.count*width},(_,i)=> key==='indices'?bin.readUInt16LE(b.byteOffset+2*i):bin.readFloatLE(b.byteOffset+4*i));
  }
  const mesh=new Mesh('source',scene);v.applyToMesh(mesh);
  const texture=d.bufferViews[d.images[0].bufferView].byteOffset;
  assert.equal(bin.readUInt32LE(texture+20),1024);assert.ok(d.extensionsRequired.includes('KHR_texture_basisu'));
  mesh.material=new PBRMaterial('paint',scene);mesh.material.albedoTexture=new Texture(null,scene);return mesh;
}

test('five equipped trophies use the actual enemy paint and shape, and release their last lease',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);const acquired=new Map(),released=new Map();
 const load=async(s,url)=>{
   const id=url.pathname.split('/').at(-1);acquired.set(id,(acquired.get(id)||0)+1);
   const mesh=geometry(url,s);
   return {meshes:[mesh],rootNodes:[mesh],dispose(){released.set(id,(released.get(id)||0)+1);mesh.dispose(false,true);}};
 };
 const acquire=(s,id)=>acquireFoeWeapon(s,id,load);
 const sword=MeshBuilder.CreateBox('Golden_Oathblade',{},scene),shield=MeshBuilder.CreateBox('Bunnyguard_Shield',{},scene);
 const original=sword.geometry,initial=new PBRMaterial('original',scene);initial.emissiveTexture=new Texture(null,scene);
 const grip=new TransformNode('player-hand',scene);sword.material=shield.material=initial;sword.parent=grip;
 const shell=sword.clone('outline');shell.parent=sword;
 const equip=new WarriorEquipment({meshes:[sword,shield]}, {},{loadTrophy:acquire});
 const unique=new Set();
 try{
  for(const [kind,meta] of Object.entries(FOE_WEAPONS)){
    const id=Object.keys(monsterRewards(kind,()=>0)).find(item=>TOWN_ITEMS[item].profile==='trophy:'+meta.model);
    assert.ok(id,kind);const item=TOWN_ITEMS[id];
    const hand=new TransformNode('Hand.'+meta.side,scene);
    const foe=mountEnemyWeapon(scene,{transformNodes:[hand]},kind,acquire);
    equip.selectTrophy(item.finish,item.profile);assert.ok(await foe.ready);await tick();
    const held=hand.getChildMeshes().find(m=>m.name===kind+'-held-weapon');
    assert.ok(held.isEnabled());assert.ok(held.getTotalVertices()>100);
    assert.equal(sword.geometry,held.geometry);assert.equal(shell.geometry,sword.geometry);assert.equal(sword.parent,grip);
    assert.equal(sword.material.emissiveTexture,held.material.albedoTexture);assert.notEqual(sword.material.emissiveTexture,initial.emissiveTexture);
    unique.add(sword.geometry.uniqueId);const path=FOE_WEAPON_MODELS[meta.model].pathname.split('/').at(-1);assert.equal(acquired.get(path),1);
    foe.dispose();assert.equal(released.get(path),undefined);
    equip.selectTrophy('original','');await tick();assert.equal(released.get(path),1);assert.equal(sword.geometry,original);hand.dispose();
  }
  assert.equal(unique.size,5);assert.match(TOWN_ITEMS['field-bow'].usage,/close-range/);
  for(const id of ['black-bear','black-wolf','zombie'])assert.ok(Object.keys(monsterRewards(id,()=>0)).some(k=>TOWN_ITEMS[k].slot==='sword'));
 }finally{equip.dispose();scene.dispose();engine.dispose();}
});
