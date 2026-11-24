import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {setImmediate as tick} from 'node:timers/promises';
import {parseHTML} from 'linkedom';
import {DirectionalLight,NullEngine,Scene,SceneLoader,ShadowGenerator,Texture,TransformNode,Vector3} from '@babylonjs/core';
import {GLTFLoader} from '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {readEquipmentChoices,WarriorEquipment} from '../src/equipment.js';
import {readMapContainer} from '../src/map-container.js';
import {simplifierReady} from '../src/mesh-simplify.js';
import {mergePlayerMeshes} from '../src/player-mesh-merge.js';
import {PlayerStrikeSampler} from '../src/player-strikes.js';
import {castsPlayerShadow} from '../src/v03/actor-shadow-casters.js';
import {acquireFoeWeapon} from '../src/v03/foe-weapons.js';
import {createRidingHorse} from '../src/v03/riding-horse.js';
import {TOWN_ITEMS} from '../src/v03/town-items.js';
import {setupTownServices} from '../src/v03/town-services.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

const assetBase=new URL('../public/assets/',import.meta.url);
const swords=Object.keys(TOWN_ITEMS).filter(id=>TOWN_ITEMS[id].slot==='sword');
const trophies=swords.filter(id=>TOWN_ITEMS[id].profile.startsWith('trophy:'));
const drawCountByModel=new Map();
function loadBlade(url,scene){
  const bytes=readFileSync(url);
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const [mesh]=gltf.meshes;
  assert.equal(mesh.primitives.length,1);
  drawCountByModel.set(url.pathname.split('/').at(-1).replace(/\.glb$/,''),gltf.accessors[mesh.primitives[0].indices].count);
  return SceneLoader.LoadAssetContainerAsync('',new Uint8Array(bytes),scene,undefined,'.glb');
}
async function mobileWarrior(scene){
  const manifest=JSON.parse(readFileSync(new URL('warrior-v3-mobile4k.json',assetBase)));
  const {gltf,files}=await readRuntimeGltf(new URL(manifest.model,assetBase));
  for(const buffer of gltf.buffers)buffer.uri='data:application/octet-stream;base64,'+files.get(buffer.uri).data.toString('base64');
  const container=await readMapContainer(scene,gltf,assetBase.href);
  container.addAllToScene();
  mergePlayerMeshes(container,{keep:['Bunnyguard_Shield','Golden_Oathblade']});
  return container;
}
for(const reduced of [false,true])test('saved and re-equipped weapons submit the complete paint and silhouette including after dismount (reduced hull '+reduced+')',async t=>{
  const {document}=parseHTML('<html lang="en"><body><main><div class="top-actions"></div></main></body></html>');
  document.documentElement.dataset.edition='0.3';
  const originalDocument=globalThis.document,originalLocation=globalThis.location;
  t.after(()=>{globalThis.document=originalDocument;globalThis.location=originalLocation;});
  if(reduced)assert.ok(await simplifierReady());
  // Native pixels are the sole unsupported part of the imported production assets.
  t.mock.method(GLTFLoader.prototype,'_loadTextureAsync',function(context,texture,assign){
    const result=new Texture(null,this.babylonScene);assign(result);return Promise.resolve(result);
  });
  const engine=new NullEngine(),scene=new Scene(engine),container=await mobileWarrior(scene);
  globalThis.document=document;
  globalThis.location={search:reduced?'?simplify=1':''};
  const sword=scene.getMeshByName('Golden_Oathblade'),original=sword.geometry,grip=sword.parent;
  const player=new TransformNode('player',scene),seat=new TransformNode('seat',scene);
  seat.parent=player;player.metadata={saddleOffset:seat};
  for(const node of new Set([...container.meshes,...container.transformNodes]))if(!node.parent)node.parent=seat;
  const shadow=new ShadowGenerator(256,new DirectionalLight('sun',Vector3.Down(),scene));
  if(castsPlayerShadow(sword))shadow.addShadowCaster(sword,false);
  // This is the same flow as character loading, including a pending saved shape
  // request before the runtime outline is attached and the save slot is applied.
  const store={getItem:key=>key==='v03:stable:horse'?'1':JSON.stringify({sword:'soldier-sword'})};
  const equipment=new WarriorEquipment(container,readEquipmentChoices(store),{
    loadModel:loadBlade,loadTrophy:(target,id)=>acquireFoeWeapon(target,id,(s,url)=>loadBlade(url,s))
  });
  const shell=attachCharacterOutlines(container,'warrior').find(m=>m.parent===sword);
  const root=document.querySelector('main'),world={scene,mapId:'village',terrain:{heightAt:()=>0}};
  const saved={bag:Object.fromEntries(swords.map(id=>[id,1])),equipped:{sword:reduced?'wolf-blade':'field-sword'}};
  const services=setupTownServices({root,world,wallet:{town:saved,tradeTown:()=>true},legacy:()=>({}),appearance:()=>equipment,
    player:()=>player,controls:()=>null,battle:()=>null,sound(){}});
  const notices=[];
  const stable=createRidingHorse({root,world,player:()=>player,storage:store,ridingAllowed:()=>true,tell:msg=>notices.push(msg),forwardYaw:()=>0,
    makeHorse:()=>({ready:Promise.resolve({}),play(){},place(){},speed(){},dispose(){},saddleContactToRef(v){v.set(0,1,0);return true;}})});
  t.after(()=>{stable.dispose();services.dispose();equipment.dispose();container.dispose();scene.dispose();engine.dispose();});

  const draws=t.mock.method(engine,'drawElementsType',()=>{});
  function assertDraw(mesh,count){
    assert.equal(mesh.subMeshes.length,1);
    assert.equal(mesh.isEnabled(),true);
    mesh._draw(mesh.subMeshes[0],0,1);
    assert.deepEqual(draws.mock.calls.at(-1).arguments.slice(1,3),[0,count],mesh.name+' render submission');
    assert.equal(mesh.getTotalIndices(),count);
  }
  const strike=()=>new PlayerStrikeSampler().sample({state:'attack',actionId:1,clipTime:.75},sword,null).blade;
  async function check(id){
    await Promise.all(equipment.shapes.values());await tick();
    const {finish,profile}=TOWN_ITEMS[id];
    const key=profile.startsWith('trophy:')?profile.slice(7):finish;
    const count=drawCountByModel.get(key)??original.getTotalIndices();
    assertDraw(sword,count);
    assert.ok(sword.parent===grip,'player hand node changed');
    const casters=shadow.getShadowMap().renderList;
    assert.ok(casters.length===1&&casters[0]===sword,'shadow pass lost its registered sword');
    assert.equal(castsPlayerShadow(shell),false);
    if(reduced){
      const indices=shell.getTotalIndices();assert.ok(indices>0&&indices<count);
      assertDraw(shell,indices);
      assert.ok(shell.geometry.getVertexBuffer('position').getBuffer()===sword.geometry.getVertexBuffer('position').getBuffer(),'optimized outline references old sword vertices');
    }else{
      assert.ok(shell.geometry===sword.geometry,'default outline references old sword geometry');
      assertDraw(shell,count);
    }
    assert.equal(services.bag().find(row=>row.id===id).worn,true);
  }
  services.apply();await check(saved.equipped.sword);
  const before=strike();
  assert.ok(services.equip('raider-dagger'));
  assert.ok(services.equip('oathblade'));
  await check('oathblade'); // The late import must not repaint a restored blade.
  // Return to a large standard and a field blade from every smaller trophy.
  for(const id of [...trophies.flatMap(id=>[id,'wolf-blade',id,'field-sword']),...swords]){
    const ink=shell.geometry;
    assert.ok(services.equip(id));await check(id);
    if(reduced&&ink!==shell.geometry)assert.ok(!scene.geometries.includes(ink),'detached index-only hull was retained');
    assert.deepEqual(strike(),before);
  }
  stable.updateAvailability();
  const ride=root.querySelector('.v03-ride-toggle');
  ride.click();await tick();assert.equal(stable.active,true,notices.join(', '));assert.equal(sword.isEnabled(),false);
  assert.ok(services.equip('field-bow'));await Promise.all(equipment.shapes.values());await tick();
  assert.ok(services.equip('field-sword'));await Promise.all(equipment.shapes.values());await tick();
  assert.equal(sword.isEnabled(),false);assert.equal(shell.isEnabled(),false);
  ride.click();await tick();assert.equal(stable.active,false);await check('field-sword');
});
