// 2026-11-27 phone report: "마물의 숲에서 고블린이 소환이 안돼있어서 퀘스트 진행이 안됨"
// (95 s in the forest, no foe). The forest camps through the real resident path, with the
// story on M07 at the same time; a create that never settles or a load that failed does not
// leave the visit empty.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {FreeCamera,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {PlayerCombat} from '../src/player-combat.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {readBinaryMapContainer} from '../src/map-container.js';
import {createChapterResidentVisits} from '../src/v03/chapter-resident-visits.js';
import * as wildlife from '../src/v03/chapter-wildlife.js';
import * as enemies from '../src/v03/chapter-enemy-encounter.js';
import {acquireFoeWeapon,mountEnemyWeapon} from '../src/v03/foe-weapons.js';
import {createStory} from '../src/v03/story.js';
import {QUESTS,ERRANDS,NPCS,DIALOGUES} from '../src/v03/data/chapter1.js';
import {setPack} from '../src/v03/i18n.js';
import ko from '../src/v03/locales/ko.js';

globalThis.location??=new URL('http://localhost/');
const tick=()=>new Promise(resolve=>setTimeout(resolve,2));
// NullEngine has no image codec: the real rigs without their textures (as v03-chapter-enemy-encounter).
async function readRig(scene,url){
 const raw=await fs.readFile(url),jsonLength=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+jsonLength));
 delete doc.textures;delete doc.images;delete doc.extensionsUsed;delete doc.extensionsRequired;
 for(const mat of doc.materials??[])if(mat.pbrMetallicRoughness)delete mat.pbrMetallicRoughness.baseColorTexture;
 const json=Buffer.from(JSON.stringify(doc)),padded=Math.ceil(json.length/4)*4,bytes=Buffer.alloc(20+padded+raw.length-20-jsonLength,32);
 raw.copy(bytes,0,0,20);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded,12);json.copy(bytes,20);raw.copy(bytes,20+padded,20+jsonLength);
 return readBinaryMapContainer(scene,new Uint8Array(bytes),new URL('.',url).href,{fileName:url.pathname.split('/').pop()});
}
const realCamp=async()=>[wildlife,{createChapterEnemyFactory:options=>enemies.createChapterEnemyFactory({...options,incremental:false,loadModel:(scene,url)=>readRig(scene,url),
 mountWeapon:(scene,owner,kind)=>mountEnemyWeapon(scene,owner,kind,(s,id)=>acquireFoeWeapon(s,id,readRig))})}];
function stage(){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 caveFogFallback(scene).getInternalTexture().isReady=true;scene.activeCamera=new FreeCamera('camera',new Vector3(0,2,3),scene);
 const player=new TransformNode('player',scene);player.position.set(.6,0,53.9);
 const world={scene,mapId:'monster-forest',shadows:{addShadowCaster(){},removeShadowCaster(){}},navigation:{free:()=>true,segmentClear:()=>true,path:()=>null}};
 const battle={combat:new PlayerCombat(),encounters:[],bossChanged(){},combatCount:0};battle.combat.reset();
 return {engine,scene,player,world,battle,dispose(){scene.dispose();engine.dispose();}};
}

test('M07 goblins: entering the forest brings the camp goblins, their defeats count, then the clues stand',async()=>{
 setPack('ko',ko);
 const s=stage(),errors=[];
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
 const values=new Map(),journey={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const quest=QUESTS.findIndex(q=>q.id==='M07');
 journey.setItem('v03-story-v1',JSON.stringify({v:2,id:'M07',quest,step:1,count:0,done:[]}));
 journey.setItem('v03-greeted-v1',JSON.stringify(NPCS.map(n=>n.id)));
 const api={world:s.world,battle:s.battle,input:{setSuspended(){}},getPlayer:()=>s.player,getController:()=>null,creditGold:(_k,n)=>n,addPotions:n=>n,toast(){}};
 const story=createStory({api,doc:document,save:{journey,touch:()=>true},content:{QUESTS,ERRANDS,NPCS,DIALOGUES},createVisual:()=>({place(x,y,z){this.position={x,y,z};},dispose(){}})});
 story.start();
 const visits=createChapterResidentVisits({world:s.world,battle:s.battle,getPlayer:()=>s.player,onDefeat:event=>story.defeat(event),loadCamp:realCamp,petsEnabled:false,onError:(...a)=>errors.push(a.map(String).join(' '))});
 try{
  await visits.enter('monster-forest');
  const frame=()=>{visits.update(1/30,true,false);story.update(1/30,{ready:true,mapId:'monster-forest',character:'warrior-v4'});};
  for(let i=0;i<260&&s.battle.encounters.length<3;i++){s.player.position.z=Math.max(4,53.9-i*.25);frame();await tick();}
  assert.deepEqual(errors,[]);
  assert.ok(s.battle.encounters.length>=2,'camp goblins stand: '+s.battle.encounters.length);
  assert.equal(visits.inspect().ready,true);assert.ok(visits.inspect().live>=2);
  // Five goblins of the camps fall (the camps' own defeat path), then the clues.
  for(let i=0;i<5;i++)story.defeat({kind:'goblin-warrior',family:'goblin'});
  frame();assert.equal(story.log.step().id,'clues');
  assert.deepEqual(story.inspect().cast.map(row=>row.id).sort(),['clue-armor','clue-poison','clue-sword']);
 }finally{story.dispose();visits.dispose();s.dispose();}
});

test('a camp create that never settles is dropped after the timeout; a failed load is tried again',async()=>{
 const world={mapId:'monster-forest',scene:{isDisposed:false}},player={position:{x:.6,z:53.9}};
 let calls=0;const made=[],errors=[];
 const hang={createChapterEnemyFactory:()=>({create:row=>{calls++;if(calls===1)return new Promise(()=>{});made.push(row.id);return Promise.resolve({encounter:{active:true,actor:{position:{x:row.x,z:row.z}}},dispose(){}});},dispose(){}})};
 const v=createChapterResidentVisits({world,battle:{},getPlayer:()=>player,onDefeat(){},loadCamp:async()=>[wildlife,hang],onError:(...a)=>errors.push(String(a[1]?.message??a[0]))});
 await v.enter('monster-forest');player.position.z=30;
 for(let i=0;i<30*70;i++){v.update(1/30,true,false);if(i%30===0)await null;}
 await tick();
 assert.ok(made.length>=1,'camps go on after a stuck create');assert.match(errors[0],/did not settle/);
 v.dispose();
 // The camp modules fail to arrive once: the visit loads them again a few seconds later.
 let loads=0;const again=createChapterResidentVisits({world,battle:{},getPlayer:()=>player,onDefeat(){},onError(){},
  loadCamp:async()=>{if(++loads===1)throw new Error('chunk failed');return [wildlife,{createChapterEnemyFactory:()=>({create:async row=>({encounter:{active:true,actor:{position:{x:row.x,z:row.z}}},dispose(){}}),dispose(){}})}];}});
 await again.enter('monster-forest');assert.equal(again.inspect().ready,false);assert.equal(again.inspect().failures,1);
 for(let i=0;i<30*6;i++){again.update(1/30,true,false);await null;}
 await tick();await tick();
 assert.equal(loads,2);assert.equal(again.inspect().ready,true);
 again.dispose();
});
