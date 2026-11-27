// 2026-11-27 playtest (user: "새로하기부터 끝까지 사람처럼"): a new slot played from the
// wagon to the end of chapter one and through Elena's journal, the way a player goes,
// through the real boot (setupV03), story, errands, defense waves, town economy and
// gold ledger. Only the engine is missing: the camp and plains foes are stood in from
// their real spawn tables (CHAPTER_CAMPS, PLAINS_MONSTER_SPAWNS, the cave's resident
// Elena), the map trips go through the real portals (map-route.js) and the guide's
// ROUTES. Each step checks: the target is on that map and can be spoken to, the foes
// the step needs exist where it says, the way there exists, the guide light has a goal,
// the quest panel is not empty, the reward is paid once, and title -> continue resumes
// at the same point. Rerun after a change to chapter1.js, story.js, errands.js,
// defense-waves.js, quest-migration.js or the locales:
//   node --test tests/v03-playthrough.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {setupV03} from '../src/v03/boot.js';
import {createSaveSession} from '../src/v03/save-slots.js';
import {setTypewriterEnabled} from '../src/v03/typewriter.js';
import {CHOICE_ARM_MS} from '../src/v03/dialogue.js';
import {GoldLoot} from '../src/gold-loot.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {QUESTS,ERRANDS,NPCS,ROUTES} from '../src/v03/data/chapter1.js';
import {CHAPTER_CAMPS,chapterQuestFamily} from '../src/v03/chapter-wildlife.js';
import {PLAINS_MONSTER_SPAWNS} from '../src/plains-monster-spawns.js';
import {mapPortals,mapForCharacter,MAP_PORTALS,FOREST_SPAWN,CAVE_SPAWN} from '../src/map-route.js';
import {ELENA_HOME} from '../src/elena-spec.js';
import {createWaveRaid} from '../src/v03/defense-waves.js';
import {CHAPTER_COMBAT} from '../src/v03/chapter-enemy-brain.js';
import {questKey} from '../src/v03/chapter-progress.js';
import {questExperience} from '../src/v03/character-progression.js';
import {LEGACY_ORDER} from '../src/v03/quest-migration.js';

setTypewriterEnabled(false);
const E='moonforest-0.3';
// Where the player stands on arriving at each map (map-route.js).
const ARRIVAL=Object.freeze({village:MAP_PORTALS['great-plains'].arrival,'great-plains':MAP_PORTALS.village.arrival,'monster-forest':FOREST_SPAWN,'witch-cave':CAVE_SPAWN});
const CHARACTER=Object.freeze({village:'warrior-v3','great-plains':'warrior-plains','monster-forest':'warrior-v4','witch-cave':'warrior-v5'});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(times=12){for(let i=0;i<times;i++)await tick();}
function memory(){
 const map=new Map();
 return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>{map.set(k,String(v));},removeItem:k=>{map.delete(k);},dump:()=>Object.fromEntries(map)};
}
const HANGUL=/[가-힣]/,RAW_KEY=/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9-]+)+$/,HOLE=/\{[a-zA-Z]+\}/;

// ----- the map graph as the player walks it: real portals, guide ROUTES -----
function portalTo(from,to){return mapPortals(from).find(portal=>mapForCharacter(portal.destination)===to)??null;}
function mapPath(from,to){
 const seen=new Map([[from,null]]),queue=[from];
 while(queue.length){const at=queue.shift();if(at===to)break;for(const portal of mapPortals(at)){const next=mapForCharacter(portal.destination);if(!seen.has(next)){seen.set(next,at);queue.push(next);}}}
 if(!seen.has(to))return null;
 const path=[];for(let at=to;at!==from;at=seen.get(at))path.unshift(at);return path;
}

// ----- where each fight's foes come from (the real spawn tables) -----
const plainsRows=PLAINS_MONSTER_SPAWNS.maps['great-plains'];
const plainsKind=id=>id.startsWith('guardian-bear')?'bear':id.includes('wolf')?'wolf':id.split('.')[0];
const within=(row,at)=>!at||(row.x-at.x)**2+(row.z-at.z)**2<=at.radius**2;
// Foes that stand on a map for a step {map,kind,at}: [{kind,family,x,z}], as their defeat events report them.
function residents(map,kind,at){
 let rows=[];
 if(map==='great-plains')rows=plainsRows.map(row=>({kind:plainsKind(row.definitionId),family:plainsKind(row.definitionId),x:row.x,z:row.z,respawn:row.respawn}));
 else if(map==='witch-cave')rows=[...CHAPTER_CAMPS['witch-cave'].map(row=>({kind:row.kind,family:chapterQuestFamily(row.kind),x:row.x,z:row.z})),{kind:'elena',family:'elena',phase:2,x:ELENA_HOME.x,z:ELENA_HOME.z}];
 else if(CHAPTER_CAMPS[map])rows=CHAPTER_CAMPS[map].map(row=>({kind:row.kind,family:chapterQuestFamily(row.kind),x:row.x,z:row.z}));
 return rows.filter(row=>(!kind||row.kind===kind||row.family===kind)&&within(row,at));
}

// What stands on a map as the player arrives: the plains' authored packs (spawnMode start), the
// cave's resident Elena, and camp foes within 25 m (chapter-wildlife.js admits them near the player).
function standing(map,at){
 const near=row=>(row.x-at.x)**2+(row.z-at.z)**2<25*25;
 const rows=map==='great-plains'?residents(map):map==='witch-cave'?residents(map).filter(row=>row.kind==='elena'||near(row)):residents(map).filter(near);
 return rows.map(row=>({active:true,kind:row.kind,questFamily:row.family,phase:row.phase,brain:{hp:100,maxHp:100,mode:'idle'},actor:{position:{x:row.x,z:row.z}}}));
}

// A stand-in for the chapter foe factory (defense waves): same create/dispose shape, no engine.
function fakeEnemies(){
 const made=[];let onDefeat=null;
 const module={createChapterEnemyFactory({onDefeat:report}){onDefeat=report;return {
  async create({kind,id,x,z,home,isCurrent}){
   await null;if(!isCurrent())throw Object.assign(new Error('cancelled'),{name:'AbortError'});
   const profile={...CHAPTER_COMBAT[kind]};
   const handle={id,kind,home,disposed:false,encounter:{kind,profile,brain:{hp:profile.hp,maxHp:profile.hp,engaged:false,returning:false},actor:{position:{x,z}},spawn:{x,z},corpseGone:false},dispose(){this.disposed=true;}};
   made.push(handle);return handle;
  },dispose(){}};}};
 return {module,made,kill(handle){handle.encounter.brain.hp=0;onDefeat({id:handle.id,kind:handle.kind,position:handle.encounter.actor.position});handle.encounter.corpseGone=true;}};
}

// ----- the page: boot + story + the game's hooks as main.js wires them -----
function harness({lang='ko',local=memory(),session=memory(),random=()=>.5}={}){
 const {document,window}=parseHTML('<html><body><main id="app"><canvas id="viewport"></canvas><section id="loading"></section></main></body></html>');
 const root=document.getElementById('app');
 let clock=0;Object.defineProperty(window,'performance',{value:{now:()=>clock},configurable:true});
 let resolveSplash;window.__moonforestSplash={done:new Promise(r=>{resolveSplash=r;}),remove:()=>resolveSplash()};
 const languageStorage=memory();languageStorage.setItem('moonforest:lang:v1',lang);
 const save=createSaveSession({local,session,edition:E,now:()=>1000+clock});
 const player={position:{x:0,z:0}},controller={captured:false,groggy:false,dead:false,state:'idle',stamina:100,maxStamina:100};
 const wolf={active:true,radius:1.8,actor:{position:{x:0,z:6}},brain:{hp:100,maxHp:900,mode:'idle'}};
 const battle={encounters:[],combat:{hp:500,maxHp:500},loading:false,livingCount:0,combatCount:0,
  summon:async(_p,count,kind)=>{summons.push(kind+':'+count);battle.encounters=Array.from({length:count},()=>({...wolf,kind,brain:{...wolf.brain}}));battle.livingCount=count;return true;},
  resetBattle:()=>{battle.encounters=[];battle.livingCount=0;}};
 const summons=[],toasts=[],shops=[];
 const state={ready:true,failed:false,character:'warrior-plains',mapId:'great-plains'};
 const camera={alpha:1,beta:.9,radius:17,lowerRadiusLimit:4,upperRadiusLimit:30};
 const guide={shown:null,show(x,y,z,time,moving){guide.shown={x,y,z,moving};},hide(){guide.shown=null;},dispose(){}};
 const createVisual=(_scene,key,{id})=>{const v={id,key,position:null,disposed:false,place(x,y,z,yaw){v.position={x,y,z,yaw};},dispose(){v.disposed=true;}};return v;};
 const world={camera,scene:{isDisposed:false},mapId:state.mapId,navigation:{free:()=>true,path:(from,to)=>[{x:to.x,z:to.z}]},terrain:{heightAt:()=>0},chapterResidents:null};
 // The wallet and the village economy on the slot's own storage (main.js: goldLoot, townServices).
 const wallet=new GoldLoot({storage:save.journey});let economy=createTownEconomy(wallet,{},{random});
 const reloadTown=()=>{wallet.reload();economy.reset({});economy.onEvent=townListener;return true;};
 let townListener=null;
 // Jeffrey's palisade raid: the real raid on a stand-in foe factory, made once per village visit.
 const raidFoes=fakeEnemies();let raid=null;
 world.chapterResidents={raid:()=>world.mapId==='village'?raid??=createWaveRaid({world,battle,getPlayer:()=>player,onDefeat:event=>shell.defeat({...event,position:{x:0,z:0}}),loadEnemies:async()=>raidFoes.module,onError:()=>{}}):null};
 const api={root,save,world,battle,languageStorage,wait:()=>Promise.resolve(),random:()=>.5,createVisual,createGuide:()=>guide,createMarkers:null,setMapMarkers(){},placeProps:async()=>true,
  input:{setSuspended(){}},actions:{attack(){},dodge(){},guard(){},move(){}},toast:m=>toasts.push(String(m)),getPlayer:()=>player,getController:()=>controller,getState:()=>state,
  // main.js v03ResetStage: the battle is cleared (boss.resetBattle) and the player put on the spot.
  resetStage:stage=>{battle.resetBattle();if(stage){player.position.x=stage.x;player.position.z=stage.z;}},openSettings(){},
  travel:async id=>{state.character=id;state.mapId=world.mapId=mapForCharacter(id);return true;},
  prepareWorld(){},prefetchScore(){},startWorld(){},stopWorld(){},exit(){},wake(){},
  reloadProgress:reloadTown,restartProgress:reloadTown,
  rest:()=>{battle.combat.hp=battle.combat.maxHp;const n=3-(economy.state.bag.potion??0);if(n>0)economy.grant('potion',n);return true;},
  openTownShop:async(id,view)=>{shops.push(id+':'+view);},
  playerLevel:()=>economy.progression.level,
  settleQuest:(quest,step)=>economy.settleQuest(quest,step),hasSettledQuest:id=>economy.hasSettledQuest(id),
  creditQuestExperience:(ids,quiet,chapter)=>economy.creditQuests(ids,quiet,chapter),
  creditGold:(source,amount)=>wallet.creditCumulative(source,amount),
  addPotions:count=>economy.grant('potion',count)?count:0,
  grantItem:(id,count)=>economy.grant(id,count),spendItem:(id,count)=>!!economy.spend(id,count),itemCount:id=>economy.state.bag[id]??0,
  gearCondition:()=>economy.wearSnapshot(),restoreGearCondition:snapshot=>economy.restoreWear(snapshot),
  onTownEvent:fn=>{townListener=fn;economy.onEvent=fn;},
  grantArmor:id=>{if(id!=='leather'||economy.state.bag['leather-coat'])return false;if(!economy.grant('leather-coat'))return false;if(!economy.state.equipped.armor)economy.equip('leather-coat');return true;}};
 const shell=setupV03(api);
 shell.story.prepareOpeningCast=async id=>shell.story.prepare(id);
 const click=selector=>document.querySelector(selector).dispatchEvent(new window.Event('click',{bubbles:true}));
 const key=code=>document.dispatchEvent(Object.assign(new window.Event('keydown',{bubbles:true,cancelable:true}),{code}));
 // Every text the player can see now (own text of shown elements under #app, and the prompt's label).
 const seen=new Map();
 function look(where){
  const walk=el=>{
   if(el.hidden)return;
   for(const node of el.childNodes){
    if(node.nodeType===3){const text=node.textContent.trim();if(text&&!seen.has(text))seen.set(text,where());}
    else if(node.nodeType===1)walk(node);
   }
  };
  walk(document.body);
  for(const text of toasts)if(!seen.has(text))seen.set(text,where()+' (toast)');
  const label=document.querySelector('.v03-prompt')?.getAttribute('aria-label');if(label&&!seen.has(label))seen.set(label,where());
 }
 function update(dt=.016){clock+=dt*1000;shell.update(dt);raid?.update(dt);if(world.mapId!=='village'&&raid){raid.dispose();raid=null;}}
 return {api,document,window,shell,state,battle,camera,save,local,session,click,key,player,controller,guide,summons,toasts,shops,raidFoes,seen,look,update,world,
  get economy(){return economy;},wallet,finishSplash:()=>resolveSplash(),advance:ms=>{clock+=ms;},
  reveal:async()=>{await settle();update();await settle();for(let i=0;i<90;i++)update();await settle();}};
}

// ----- a player: walks, talks, fights, saves -----
function createPlayer(h,{lang='ko',notes}){
 const story=()=>h.shell.story,log=()=>h.shell.story.log,doc=h.document;
 const where=()=>`${log().quest()?.id??'end'}/${log().step()?.id??'-'}@${h.state.mapId}`;
 const frames=(n,look=true)=>{for(let i=0;i<n;i++){h.update();if(look&&i%15===0)h.look(where);}h.look(where);};
 const menuShown=()=>doc.querySelector('.v03-dialogue-choices')?.hidden===false;
 const note=(kind,text)=>notes.push({kind,at:where(),text});
 const lines=[];
 // Plays out whatever talk is open. choose: what to take from a service menu first ('talk', 'rest'...).
 async function finish({choose='talk'}={}){
  let picked=false;
  for(let i=0;i<160&&story().dialogueOpen;i++){
   h.look(where);
   if(menuShown()){
    // The menu's order (service-menu.js): talk, the services, leave.
    const entries=[...doc.querySelectorAll('.v03-dialogue-choice')];
    h.advance(CHOICE_ARM_MS+20);
    const index=!picked&&choose?(choose==='talk'?0:choose==='leave'?entries.length-1:1):entries.length-1;
    picked=true;entries[index].click();await settle(4);continue;
   }
   const who=doc.querySelector('.v03-dialogue-who')?.textContent??'',text=doc.querySelector('.v03-dialogue-text')?.textContent??'';
   if(text&&lines.at(-1)?.text!==text)lines.push({who,text,at:where()});
   h.click('.v03-dialogue-next');await settle(2);
  }
  await settle();frames(2);
  if(story().dialogueOpen)note('막힘','대화가 160번 넘겨도 닫히지 않음');
 }
 // Walk the real portals to a map. Checks the guide's exit (ROUTES) leads into the portal it should.
 async function goTo(map){
  if(h.state.mapId===map)return true;
  const path=mapPath(h.state.mapId,map);
  if(!path){note('막힘',`${h.state.mapId}에서 ${map}로 가는 포털 경로 없음`);return false;}
  for(const next of path){
   const from=h.state.mapId,portal=portalTo(from,next),exit=ROUTES[from]?.[map];
   if(!exit)note('막힘',`ROUTES['${from}']['${map}'] 없음 (빛무리가 출구를 모름)`);
   else if(Math.hypot(exit.x-portal.x,exit.z-portal.z)>portal.radius+2)note('주의',`ROUTES['${from}']['${map}']=(${exit.x},${exit.z})가 ${next}행 포털(${portal.x},${portal.z})과 ${Math.hypot(exit.x-portal.x,exit.z-portal.z).toFixed(1)}m 떨어짐`);
   Object.assign(h.player.position,{x:portal.x,z:portal.z});
   const back=portalTo(next,from),arrival=portal.arrival??back?.arrival??{x:0,z:0};
   h.state.character=CHARACTER[next];h.state.mapId=h.world.mapId=next;Object.assign(h.player.position,{x:arrival.x,z:arrival.z});
   frames(3);
   if(story().dialogueOpen)await finish();
  }
  return true;
 }
 function castIds(){return h.shell.inspect().story.cast.map(row=>row.id);}
 // The guide light has somewhere to go while the player stands away from the goal.
 function checkGuide(label){
  const from={...h.player.position};
  frames(20,false);
  const guide=h.shell.inspect().story.guide;
  // After the main line with no errand taken there is nothing to lead to (offers wear a + mark).
  const idle=!log().step()&&!Object.keys(errandState(h).active).length;
  if(!guide&&!h.battle.combatCount&&!idle)note('주의',`빛무리 대상 없음 (${label}, 플레이어 ${from.x.toFixed(0)},${from.z.toFixed(0)})`);
  return guide;
 }
 function checkPanel(){
  const title=doc.querySelector('.v03-quest-title')?.textContent?.trim(),objective=doc.querySelector('.v03-quest-objective')?.textContent?.trim();
  if(!title||!objective)note('막힘',`퀘스트 패널이 비어 있음 (제목 '${title}', 목표 '${objective}')`);
  return {title,objective};
 }
 async function talk(id,{choose='talk'}={}){
  const npc=NPCS.find(row=>row.id===id);
  if(!await goTo(npc.map))return false;
  frames(2);
  if(!castIds().includes(id)){note('막힘',`${id}가 ${npc.map} 출연진에 없음 (${castIds().join(',')})`);return false;}
  // Start from the map's arrival point: the light leads to them.
  checkGuide('talk '+id);
  const at=h.shell.story.castVisual(id).position;Object.assign(h.player.position,{x:at.x,z:at.z});frames(2);
  if(h.shell.inspect().story.near!==id){note('막힘',`${id} 옆에서 말 걸기 버튼이 뜨지 않음 (near=${h.shell.inspect().story.near})`);return false;}
  h.click('.v03-prompt');await settle(2);
  if(!story().dialogueOpen){note('막힘',`${id}에게 말을 걸어도 대화가 열리지 않음`);return false;}
  await finish({choose});return true;
 }
 // Foes of a step stand where the spawn tables put them; they fall to the player (their defeat events).
 async function fight(step,{count=step.count,source=null}={}){
  const map=step.map??h.state.mapId;
  if(!await goTo(map))return false;
  // Every foe of the step's kind on the map counts (the kill has no place); the spot, if any, must hold one.
  const all=source??residents(map,step.kind,null),spot=step.at&&!source?residents(map,step.kind,step.at):[];
  if(all.length===0){note('막힘',`${map}에 ${step.kind??'짐승'} 소환 경로가 없음`);return false;}
  if(step.at&&!source&&!spot.length)note('막힘',`${step.kind}가 목표 지점(${step.at.x},${step.at.z} 반경 ${step.at.radius}m)에 없음`);
  const rows=[...spot,...all.filter(row=>!spot.includes(row))];
  if(!rows.some(row=>row.respawn)&&rows.length<count)note('주의',`${map}의 ${step.kind??'짐승'} ${rows.length}마리 < 필요 ${count} (한 방문에 다 못 잡음)`);
  Object.assign(h.player.position,ARRIVAL[map]);
  h.battle.encounters=standing(map,h.player.position);
  checkGuide('defeat '+(step.kind??'any'));
  for(let n=0;n<count;n++){
   const row=rows[n%rows.length];
   const foe={active:true,kind:row.family==='goblin'?row.kind:row.kind,questFamily:row.family,phase:row.phase,brain:{hp:100,maxHp:100,mode:'idle'},actor:{position:{x:row.x,z:row.z}}};
   h.battle.encounters=[foe];
   Object.assign(h.player.position,{x:row.x+2,z:row.z+2});frames(4);
   if(story().dialogueOpen)await finish();
   h.battle.combatCount=1;frames(2,false);
   foe.brain.hp=0;foe.active=false;h.battle.encounters=[];h.battle.combatCount=0;
   h.shell.defeat({kind:row.kind,family:row.family,position:{x:row.x,z:row.z},...(row.phase?{phase:row.phase}:{})});
   frames(2);
   if(story().dialogueOpen)await finish();
  }
  return true;
 }
 // Back to the title and continue the same slot: the same point, the same purse.
 async function saveAndContinue(){
  const before={quest:log().quest()?.id??null,step:log().step()?.id??null,count:log().snapshot().count,done:log().snapshot().done.join(','),gold:h.wallet.balance,xp:h.economy.progression.totalXp,errands:JSON.stringify(story().inspect?.()?.quest??null)};
  const errandsBefore=h.save.journey.getItem(questKey(player.chapter)+':errands');
  if(!await h.shell.returnToTitle()){note('막힘','타이틀로 돌아가기 실패');return false;}
  await settle();
  h.click('[data-action="load"]');await settle();h.click(`.v03-slot[data-slot="${h.save.slot}"]`);await settle();h.click(`[data-chapter="${player.chapter}"]`);await settle(40);frames(3);
  if(h.shell.screen!=='play'){note('막힘',`이어하기 후 화면이 ${h.shell.screen}`);return false;}
  const after={quest:log().quest()?.id??null,step:log().step()?.id??null,count:log().snapshot().count,done:log().snapshot().done.join(','),gold:h.wallet.balance,xp:h.economy.progression.totalXp,errands:before.errands};
  if(JSON.stringify(before)!==JSON.stringify(after))note('막힘',`이어하기 지점이 다름 ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  if(h.save.journey.getItem(questKey(player.chapter)+':errands')!==errandsBefore)note('막힘','이어하기 후 의뢰 기록이 바뀜');
  if(story().dialogueOpen)await finish();
  return true;
 }
 const player={chapter:1,story,log,where,frames,finish,goTo,talk,fight,checkGuide,checkPanel,saveAndContinue,castIds,lines,note,menuShown};
 return player;
}

// ----- errands, as the player takes them -----
function errandState(h){try{return JSON.parse(h.save.journey.getItem(questKey(1)+':errands'))??{active:{},finished:[]};}catch{return {active:{},finished:[]};}}
// Where a delivered item comes from: the foe that drops it (town-items.js DROPS) on its map.
const ITEM_SOURCES=Object.freeze({'boar-meat':{map:'great-plains',kind:'boar'},'ghoul-mail':{map:'witch-cave',kind:'ghoul-warrior'}});
function createErrandRunner(h,p){
 const errand=id=>ERRANDS.find(row=>row.id===id);
 const step=id=>{const row=errandState(h).active[id];return row?{...errand(id).steps[row.step],done:row.count}:null;};
 async function accept(id){
  const e=errand(id);
  if(!await p.talk(e.giver))return false;
  if(!errandState(h).active[id]&&!errandState(h).finished.includes(id)){p.note('막힘',`${e.giver}에게 말 걸어도 의뢰 ${id}가 수령되지 않음`);return false;}
  return true;
 }
 // The quest panel on this errand's page: the light leads to it.
 function pageGuide(id){h.shell.story.selectPage(id);const g=p.checkGuide('errand '+id);h.shell.story.selectPage(null);return g;}
 async function obtain(item){
  const source=ITEM_SOURCES[item];
  if(!source){p.note('막힘',`${item}을 얻는 경로를 모름`);return false;}
  const rows=residents(source.map,source.kind,null);
  if(!rows.length){p.note('막힘',`${item}: ${source.map}에 ${source.kind} 없음`);return false;}
  await p.fight({map:source.map,kind:source.kind,count:1},{count:1,source:rows});
  // town-services.defeat rolls the drop (random); the pickup lands in the bag.
  h.economy.grant(item,1);return true;
 }
 async function run(id,{until=null}={}){
  for(let guard=0;guard<30;guard++){
   const s=step(id);if(!s)return true;
   if(until&&s.id===until)return true;
   const before=JSON.stringify(errandState(h));
   pageGuide(id);
   if(s.type==='defeat')await p.fight(s,{count:Math.max(1,s.count-s.done)});
   else if(s.type==='talk')await p.talk(s.targets[0]);
   else if(s.type==='deliver'){if((h.economy.state.bag[s.item]??0)<s.count)await obtain(s.item);await p.talk(s.targets[0]);}
   else if(s.type==='town'){
    await p.goTo('village');
    if(s.action==='craft'){if(!h.economy.craft('herbalist',s.item))p.note('막힘',`약초사 조제 실패 (${s.item}, 재료 ${JSON.stringify(h.economy.state.bag)})`);}
    else if(s.action==='forge'){if(h.economy.forge(0)===null)p.note('막힘',`단련 실패 (금화 ${h.wallet.balance}, 재료 없음?)`);}
    else if(s.action==='repair'){h.economy.repair();}
   }
   p.frames(2);
   if(JSON.stringify(errandState(h))===before){p.note('막힘',`의뢰 ${id}/${s.id} 진행 안 됨`);return false;}
  }
  return false;
 }
 return {accept,run,step,pageGuide};
}

// Jeffrey's palisade (W01): ten stages, one lost (back to before the talk) and one left mid-fight.
async function defendPalisade(h,p,{loseAt=3,leaveAt=5,titleAt=7,saveAfter=2}={}){
 const cleared=()=>errandState(h).active.W01?.count??(errandState(h).finished.includes('W01')?10:0);
 const lost=[],left=[],titled=[];
 const killAll=async()=>{
  for(let guard=0;guard<400;guard++){
   p.frames(25,false);await settle(6);
   const alive=h.raidFoes.made.filter(foe=>!foe.disposed&&foe.encounter.brain.hp>0);
   if(!alive.length&&h.shell.story.waves.phase!=='fight')return true;
   for(const foe of alive)h.raidFoes.kill(foe);
  }
  return false;
 };
 for(let stage=1;stage<=10;stage++){
  if(stage>1||h.shell.story.waves.phase!=='fight')await p.talk('youth');
  if(h.shell.story.waves.phase!=='fight'||h.shell.story.waves.stage!==stage){p.note('막힘',`방어전 ${stage}단계가 시작되지 않음 (phase ${h.shell.story.waves.phase}, stage ${h.shell.story.waves.stage})`);return false;}
  if(stage===loseAt&&!lost.length){
   const potions=h.economy.state.bag.potion??0,spot={...h.player.position};
   h.economy.spend('potion',Math.min(1,potions));h.player.position.x+=7;
   assert.equal(h.shell.story.interceptDeath(),true,'a fall during a stage is the errand\'s to handle');
   p.frames(3);
   lost.push({stage,cleared:cleared(),potions:h.economy.state.bag.potion??0,potionsBefore:potions,at:{...h.player.position},spot});
   if(cleared()!==stage-1)p.note('막힘',`방어전 ${stage}단계 패배 후 깬 단계 수가 ${cleared()}`);
   if((h.economy.state.bag.potion??0)!==potions)p.note('주의',`방어전 패배 후 물약 ${h.economy.state.bag.potion} (말 걸기 전 ${potions})`);
   stage--;continue;
  }
  if(stage===leaveAt&&!left.length){
   await p.goTo('great-plains');left.push({stage,toast:h.toasts.at(-1)});await p.goTo('village');
   if(cleared()!==stage-1)p.note('막힘',`방어전 ${stage}단계 이탈 후 깬 단계 수가 ${cleared()}`);
   stage--;continue;
  }
  // Back to the title in the middle of a stage: the stage is not cleared, the talk starts it again.
  if(stage===titleAt&&!titled.length){
   await p.saveAndContinue();titled.push(stage);
   if(cleared()!==stage-1)p.note('막힘',`방어전 ${stage}단계 중 타이틀 → 이어하기 후 깬 단계 수가 ${cleared()}`);
   if(h.shell.story.waves.phase==='fight')p.note('막힘','이어하기 후에도 방어전이 진행 중으로 남음');
   stage--;continue;
  }
  if(!await killAll()){p.note('막힘',`방어전 ${stage}단계의 마물을 다 잡아도 끝나지 않음`);return false;}
  if(cleared()!==stage)p.note('막힘',`방어전 ${stage}단계를 깨도 기록이 ${cleared()}`);
  if(stage===saveAfter)await p.saveAndContinue();
 }
 await p.talk('youth');
 if(!errandState(h).finished.includes('W01'))p.note('막힘','방어전 10단계 후 제프리에게 보고해도 끝나지 않음');
 return {lost,left,titled};
}

// ----- chapter one from a new slot -----
async function playChapterOne(h,p,{errands=true,start='new',chapter=1}={}){
 const steps=[],runner=createErrandRunner(h,p),paid=new Map();
 if(start==='new'){
  h.finishSplash();await h.reveal();
  h.click('[data-action="new"]');await settle();h.click('.v03-slot[data-slot="1"]');await settle();h.click('[data-chapter="1"]');await settle(40);
  if(h.shell.screen!=='play')p.note('막힘','새로하기 후 플레이 화면이 아님: '+h.shell.screen);
  p.frames(1400);
  if(h.shell.story.sceneActive)p.note('막힘','오프닝 장면이 끝나지 않음');
 }else{
  // 불러오기 → the slot → a chapter (a record seeded by the caller, or the one just played).
  if(start==='title'){if(!await h.shell.returnToTitle())p.note('막힘','타이틀로 돌아가기 실패');await settle();}else{h.finishSplash();await h.reveal();}
  p.chapter=chapter;
  h.click('[data-action="load"]');await settle();h.click(`.v03-slot[data-slot="${start==='load'?1:h.save.slot}"]`);await settle();
  if(h.document.querySelector(`[data-chapter="${chapter}"]`)?.disabled)p.note('막힘',`${chapter}장 버튼이 잠겨 있음`);
  h.click(`[data-chapter="${chapter}"]`);await settle(40);p.frames(3);
  if(h.shell.screen!=='play')p.note('막힘','불러오기 후 플레이 화면이 아님: '+h.shell.screen);
  if(h.shell.story.dialogueOpen)await p.finish();
 }
 const did=new Set();
 async function afterQuest(id){
  if(!errands)return;
  if(id==='M10'){await runner.accept('S02');await runner.run('S02');}
  if(id==='M03'){await runner.accept('S03');await runner.run('S03');}
  if(id==='M04'){
   // Jeffrey offers both of his errands; his footprints first, then the palisade (stage 1 starts with the offer).
   await runner.accept('S01');await runner.accept('W01');did.add('W01:'+JSON.stringify(await defendPalisade(h,p)));
   await runner.accept('S04');await runner.run('S04');
   await runner.accept('M06');await runner.run('M06');
  }
  // S01 stays open into M07: Jeffrey is then main target and errand giver at once.
  if(id==='M11'){await runner.accept('S05');}
  if(id==='M07'){await runner.run('S01');await runner.run('S05');await runner.accept('S06');}
  if(id==='M12'){await runner.run('S06',{until:'link'});const rows=residents('witch-cave','ghoul-warrior');if(rows.length)await p.fight({map:'witch-cave',kind:'ghoul-warrior',count:1},{count:1,source:rows});h.economy.grant('ghoul-mail',1);}
  if(id==='M08'){await runner.run('S06');}
 }
 for(let guard=0;guard<80&&!p.log().finished;guard++){
  const quest=p.log().quest(),step=p.log().step(),before=JSON.stringify(p.log().snapshot());
  const gold0=h.wallet.balance,xp0=h.economy.progression.totalXp;
  const panel=p.checkPanel();
  if(quest.id==='M00'&&step.id==='fight'){
   p.frames(30);const foes=h.battle.encounters.filter(foe=>foe.active&&foe.brain?.hp>0).length+(h.shell.inspect().worldStarted?plainsRows.length:0);
   if(!foes){p.note('막힘',`늑대가 없음: 싸울 적 0 (소환 기록 ${h.summons.join(',')}, 평원 몬스터 시작 ${h.shell.inspect().worldStarted})`);break;}
   h.battle.encounters=[];h.battle.combatCount=0;h.battle.livingCount=0;
   h.shell.defeat({kind:'wolf',position:{x:0,z:0}});p.frames(3);
  }else if(quest.id==='M00'&&step.id==='wagon'){
   await p.talk('driver');
   const spot=h.shell.inspect().story.lift;
   if(!spot&&p.log().step()?.id==='wagon')p.note('막힘','마부와 말한 뒤 마차 밀기가 시작되지 않음');
   else if(!spot){}
   else{
    Object.assign(h.player.position,{x:spot.x,z:spot.z});p.frames(2);
    for(let push=1;push<=3;push++){p.frames(130);h.key('KeyE');await settle();p.frames(40);await settle();}
    if(h.shell.story.dialogueOpen)await p.finish();
   }
  }else if(step.type==='talk'){
   for(const id of step.targets){if(p.log().step()!==step)break;if(p.log().snapshot().done.includes(id))continue;await p.talk(id);}
  }else if(step.type==='defeat'){
   await p.fight(step,{count:step.count-p.log().snapshot().count});
  }else if(step.type==='reach'){
   if(h.state.mapId===step.map){const out=mapPath(step.map,'great-plains')?.[0]??'village';await p.goTo(out);}
   if(p.log().step()===step)await p.goTo(step.map);
  }
  const advanced=JSON.stringify(p.log().snapshot())!==before||p.log().quest()!==quest;
  steps.push({quest:quest.id,step:step.id,type:step.type,map:h.state.mapId,title:panel.title,objective:panel.objective,ok:advanced});
  if(!advanced){p.note('막힘',`${quest.id}/${step.id} 진행 안 됨`);break;}
  if(p.log().quest()!==quest){
   const gold=h.wallet.balance-gold0,xp=h.economy.progression.totalXp-xp0;
   paid.set(quest.id,{gold,xp});
   if(chapter===1&&gold!==(quest.reward?.gold??0))p.note('막힘',`${quest.id} 금화 보상 ${gold} (정의 ${quest.reward?.gold??0})`);
   if(xp!==questExperience(quest.id))p.note('막힘',`${quest.id} 경험치 ${xp} (정의 ${questExperience(quest.id)})`);
   if(h.economy.state.settledQuests.filter(id=>id===quest.id).length!==1)p.note('막힘',`${quest.id} 정산 영수증 ${h.economy.state.settledQuests.filter(id=>id===quest.id).length}개`);
   await p.saveAndContinue();
   await afterQuest(quest.id);
   if(errands&&['M04','M07','M08'].includes(quest.id))await p.saveAndContinue();
  }
 }
 return {steps,paid,did};
}

const REPORT=process.env.PLAYTEST_REPORT??null;
async function report(name,value){if(!REPORT)return;const fs=await import('node:fs');fs.appendFileSync(REPORT,JSON.stringify({name,...value})+'\n');}

test('새로하기: M00부터 M09, 선택의뢰 전부와 방어전 10단계, 2장 해금까지 막힘 없이',{timeout:240000},async()=>{
 const notes=[],h=harness(),p=createPlayer(h,{notes});
 try{
  const run=await playChapterOne(h,p);
  await settle(4);
  const finished=errandState(h).finished;
  await report('ko-chapter1',{steps:run.steps,notes,paid:Object.fromEntries(run.paid),errands:errandState(h),did:[...run.did],gold:h.wallet.balance,level:h.economy.progression.level,xp:h.economy.progression.totalXp,lines:p.lines.length});
  assert.deepEqual(notes.filter(n=>n.kind==='막힘'),[]);
  assert.equal(p.log().finished,true,'chapter one finished');
  assert.equal(h.summons.filter(row=>row==='gray-wolf:1').length,1,'a new game\'s ambush wolf is the only one (the fight step calls none while it stands)');
  assert.deepEqual([...finished].sort(),ERRANDS.map(e=>e.id).sort(),'every errand done');
  // Each palisade stage paid once, at its own amount; the errand's 500 on the report.
  const W01=ERRANDS.find(e=>e.id==='W01'),stages=W01.steps[0].stages;
  for(const [i,row] of stages.entries())if(row.gold)assert.equal(h.wallet.credits['v03-errand-W01-'+(i+1)],row.gold,'stage '+(i+1));
  assert.equal(h.wallet.credits['v03-errand-W01'],W01.reward.gold);
  const visited=run.steps.map(s=>s.quest+'/'+s.step);
  assert.deepEqual(visited,QUESTS.flatMap(q=>q.steps.map(s=>q.id+'/'+s.id)).filter(id=>visited.includes(id)),'main steps in order');
  assert.ok(visited.length>=QUESTS.flatMap(q=>q.steps).length-1,'every step but the driver\'s thanks (it follows the push by itself)');
 }finally{h.shell.dispose?.();}
});

// A record seeded at a point of the line (as the game writes it), on the map it was saved on.
function seedSlot({cursor,map='village',greeted=null,errands=null,credits=null,legacy=false}={}){
 const local=memory(),session=memory(),seed=createSaveSession({local,session,edition:E,now:()=>50});
 seed.commit({chapter:1,character:CHARACTER[map],title:'x',playSeconds:30});
 seed.journey.setItem(questKey(1),JSON.stringify(cursor));
 if(greeted)seed.journey.setItem(questKey(1)+':greeted',JSON.stringify(greeted));
 if(errands)seed.journey.setItem(questKey(1)+':errands',JSON.stringify(errands));
 if(credits){const wallet=new GoldLoot({storage:seed.journey});for(const [source,n] of Object.entries(credits))wallet.creditCumulative(source,n);}
 void legacy;return {local,session};
}
const stepMap=(quest,step)=>{const s=quest.steps[step];if(s.map&&s.type!=='reach')return s.map;if(s.type==='talk')return NPCS.find(n=>n.id===s.targets[0]).map;return quest.id==='M00'?'great-plains':'village';};

for(const [phase,hp] of [[1,100],[2,0]]){
 test(`2장 성소: ${phase}페이즈 HP ${hp} 거주 개체가 남아 있어도 비탄의 마녀를 준비한다`,async()=>{
  const seeded=seedSlot({cursor:{v:2,id:'#end',quest:QUESTS.length,step:0,count:0,done:[]},map:'witch-cave'});
  const prefix=E+':slot1:';
  seeded.local.setItem(prefix+'v03-chapters-v1',JSON.stringify({id:2,done:[1]}));
  seeded.local.setItem(prefix+questKey(2),JSON.stringify({v:2,id:'E02',quest:1,step:1,count:0,done:[]}));
  const h=harness(seeded);
  try{
   h.finishSplash();await h.reveal();
   h.click('[data-action="load"]');await settle();
   h.click('.v03-slot[data-slot="1"]');await settle();
   h.click('[data-chapter="2"]');await settle(40);
   h.update();
   assert.equal(h.shell.inspect().story.step,'sanctuary');
   const row={active:true,kind:'elena',phase,brain:{hp,mode:'idle'},death:{started:hp===0},actor:{position:{...ELENA_HOME}}};
   h.battle.encounters=[row];
   const requests=[];
   let release;
   h.battle.activateResident=(player,options)=>{
    assert.equal(player,h.player);
    requests.push(options);
    return new Promise(resolve=>{release=resolve;});
   };
   for(let i=0;i<16;i++)h.update();
   assert.equal(requests.length,0,'loads only at the sanctuary');
   Object.assign(h.player.position,{x:39,z:-19});
   h.battle.combatCount=phase===1?1:0;
   h.battle.residentPending=true;h.update();h.battle.residentPending=false;
   assert.equal(requests.length,0,'does not start over an existing resident operation');
   for(let i=0;i<16;i++)h.update();
   assert.deepEqual(requests,[{reset:true,phase:2}],'starts the right phase once while loading');
   release(false);await settle();
   for(let i=0;i<10;i++)h.update(.1);
   assert.equal(requests.length,1,'a failed request waits before retrying');
   for(let i=0;i<40;i++)h.update(.1);
   assert.equal(requests.length,2,'the sanctuary retries a failed request');
   h.battle.encounters=[{...row,phase:2,brain:{hp:100,mode:'idle'},death:{started:false}}];
   release(true);await settle();
   for(let i=0;i<60;i++)h.update(.1);
   assert.equal(requests.length,2,'leaves a living phase 2 resident alone');
   h.shell.defeat({kind:'elena',phase:1,position:{...ELENA_HOME}});
   assert.equal(h.shell.inspect().story.step,'sanctuary');
   h.shell.defeat({kind:'elena',phase:2,position:{...ELENA_HOME}});
   assert.equal(h.shell.inspect().story.step,'last-page');
  }finally{h.shell.dispose?.();}
 });
}

test('이어하기: 1장 모든 단계에서 저장 → 불러오기 후 끝까지 갈 수 있다',{timeout:240000},async()=>{
 const blocked=[];
 for(const [qi,quest] of QUESTS.entries())for(const [si,step] of quest.steps.entries()){
  const map=quest.id==='M00'?'great-plains':stepMap(quest,si);
  const h=harness(seedSlot({cursor:{v:2,id:quest.id,quest:qi,step:si,count:0,done:[]},map})),notes=[],p=createPlayer(h,{notes});
  try{
   await playChapterOne(h,p,{errands:false,start:'load'});
   const stuck=notes.filter(n=>n.kind==='막힘'||n.text.startsWith('빛무리'));
   if(stuck.length||!p.log().finished)blocked.push({from:quest.id+'/'+step.id,map,stuck,finished:p.log().finished});
   await report('resume-'+quest.id+'-'+step.id,{notes,finished:p.log().finished});
  }finally{h.shell.dispose?.();}
 }
 assert.deepEqual(blocked,[]);
});

// Seen text that is not in the player's language: Korean in another language, a bare key, an unfilled {hole}.
function foreignText(seen,lang){
 const out=[];
 for(const [text,at] of seen){
  if(RAW_KEY.test(text))out.push({kind:'키',text,at});
  else if(HOLE.test(text))out.push({kind:'빈칸',text,at});
  else if(lang!=='ko'&&HANGUL.test(text))out.push({kind:'한국어',text,at});
 }
 return out;
}
for(const lang of ['ko','en','ja','vi','zh']){
 test(`${lang}: 1장(의뢰 포함)과 2장을 끝까지, 보이는 문구가 모두 ${lang}`,{timeout:240000},async()=>{
  const notes=[],h=harness({lang}),p=createPlayer(h,{notes});
  try{
   await playChapterOne(h,p,{errands:true});
   assert.equal(p.log().finished,true,'chapter one finished');
   await playChapterOne(h,p,{errands:false,start:'title',chapter:2});
   for(const line of p.lines){for(const text of [line.who,line.text])if(text&&!h.seen.has(text))h.seen.set(text,line.at);}
   const foreign=foreignText(h.seen,lang),speakers=[...new Set(p.lines.map(line=>line.who))];
   await report(lang+'-text',{notes,foreign,speakers,seen:h.seen.size,chapter2:p.log().finished,...(process.env.PLAYTEST_SEEN?{texts:[...h.seen.keys()]}:{})});
   assert.deepEqual(notes.filter(n=>n.kind==='막힘'),[]);
   assert.equal(p.log().finished,true,'chapter two finished');
   assert.deepEqual(foreign,[]);
  }finally{h.shell.dispose?.();}
 });
}

// Every errand still open once the main line is over: taken and finished (the post-chapter village).
async function sweepErrands(h,p){
 const runner=createErrandRunner(h,p);
 for(const errand of ERRANDS){
  const state=errandState(h);if(state.finished.includes(errand.id))continue;
  if(!state.active[errand.id]&&!await runner.accept(errand.id))continue;
  if(errand.id==='W01'){if(h.shell.story.waves.phase!=='fight'&&!(errandState(h).active.W01?.count>=10))await p.talk('youth');await defendPalisade(h,p,{loseAt:0,leaveAt:0});}
  else await runner.run(errand.id);
 }
}
// Records written before 11/27: {quest:index in the old order,step,count,done}, no v.
const OLD_STEPS=Object.freeze({M00:4,M01:1,M02:1,M03:3,M04:2,M05:2,M06:3,M07:3,M08:1,M09:1});
const OLD_GOLD=Object.freeze({M00:30,M01:0,M02:40,M03:60,M04:120,M05:80,M06:250,M07:200,M08:300,M09:100});
test('옛 저장(11/27 전 형식): 모든 단계에서 새 흐름으로 옮겨 끝까지, 보상은 한 번씩',{timeout:240000},async()=>{
 const bad=[];
 const positions=[...LEGACY_ORDER.flatMap((id,quest)=>Array.from({length:OLD_STEPS[id]},(_,step)=>({quest,step,count:(id==='M06'&&step===1)||(id==='M07'&&step===1)||(id==='M03'&&step===1)?1:0}))),{quest:LEGACY_ORDER.length,step:0,count:0}];
 for(const old of positions){
  const id=LEGACY_ORDER[old.quest]??'end',credits={};
  for(const earlier of LEGACY_ORDER.slice(0,old.quest))if(OLD_GOLD[earlier])credits['v03-quest-'+earlier]=OLD_GOLD[earlier];
  // An errand or two in progress, as players had them (S01 after the bear, S04 handed the scrap).
  const errands=old.quest>=5?{active:{S01:{step:0,count:1},S04:{step:1,count:0}},finished:['S02']}:null;
  const h=harness(seedSlot({cursor:{quest:old.quest,step:old.step,count:old.count,done:[]},map:id==='M00'?'great-plains':'village',errands,credits})),notes=[],p=createPlayer(h,{notes});
  try{
   await playChapterOne(h,p,{errands:false,start:'load'});
   const moved=JSON.parse(h.save.journey.getItem(questKey(1))??'null');
   await sweepErrands(h,p);
   const stuck=notes.filter(n=>n.kind==='막힘');
   // Each payout source holds at most its reward: nothing paid twice.
   const over=[...QUESTS,...ERRANDS].filter(q=>q.reward?.gold).map(q=>{const source=q.goldSource??(q.giver?'v03-errand-':'v03-quest-')+q.id;return {id:q.id,got:h.wallet.credits[source]??0,want:q.reward.gold};}).filter(row=>row.got>row.want);
   const receipts=h.economy.state.settledQuests,twice=receipts.filter((r,i)=>receipts.indexOf(r)!==i);
   const unfinished=ERRANDS.filter(e=>!errandState(h).finished.includes(e.id)).map(e=>e.id);
   await report('legacy-'+id+'-'+old.step,{notes,moved:moved&&{v:moved.v,id:moved.id,step:moved.step},finished:p.log().finished,over,twice,unfinished});
   const dark=notes.filter(n=>n.text.startsWith('빛무리'));
   if(stuck.length||dark.length||!p.log().finished||over.length||twice.length||unfinished.length)bad.push({old:id+'/'+old.step,stuck,finished:p.log().finished,over,twice,unfinished});
  }finally{h.shell.dispose?.();}
 }
 assert.deepEqual(bad,[]);
});

test('마을 서비스: 여관 선택창과 재회 순서, 대장간 구매·수리·단련 4단계와 내구도, 약초사 조제, 금화 부족, 물약 슬롯',{timeout:120000},async()=>{
 const {gradeStrike,FORGE_RULES,STOCK,RECIPES}=await import('../src/v03/town-items.js');
 const {DIALOGUES}=await import('../src/v03/data/chapter1.js');
 const notes=[],h=harness(seedSlot({cursor:{v:2,id:'M10',quest:2,step:0,count:0,done:[]},map:'village'})),p=createPlayer(h,{notes});
 try{
  h.finishSplash();await h.reveal();
  h.click('[data-action="load"]');await settle();h.click('.v03-slot[data-slot="1"]');await settle();h.click('[data-chapter="1"]');await settle(40);p.frames(3);
  // Innkeeper, first meeting: the reunion, then the menu; resting is the menu's choice.
  h.economy.spend('potion',h.economy.state.bag.potion??0);h.battle.combat.hp=120;
  const before=p.lines.length;await p.talk('innkeeper',{choose:'rest'});
  assert.equal(p.lines[before].text,DIALOGUES['inn-greet'][0].text,'the reunion comes first');
  assert.equal(p.lines.length-before,DIALOGUES['inn-greet'].length,'then the menu, no quest line');
  assert.equal(h.economy.state.bag.potion,3,'a night\'s rest refills the potions');assert.equal(h.battle.combat.hp,500);
  // Second time: no reunion; talking only talks (no rest without the choice).
  h.economy.spend('potion',1);const second=p.lines.length;await p.talk('innkeeper',{choose:'talk'});
  assert.deepEqual(p.lines.slice(second).map(l=>l.text),DIALOGUES['inn-idle'].map(l=>l.text));
  assert.equal(h.economy.state.bag.potion,2,'talking is not resting');
  // The smith's menu opens his shop and his bench (main.js openTownShop).
  await p.talk('smith',{choose:'shop'});assert.ok(h.shops.includes('smith:shop'),h.shops.join());
  // Not enough gold: nothing is bought and nothing is taken.
  const gold=h.wallet.balance;assert.ok(gold<STOCK.smith.oathblade);
  assert.equal(h.economy.buy('smith','oathblade'),false);assert.equal(h.wallet.balance,gold);assert.equal(h.economy.state.bag.oathblade??0,0);
  h.api.creditGold('test-purse',400);
  const events=[];h.economy.onEvent=event=>events.push(event.action+':'+(event.item??''));
  assert.equal(h.economy.buy('smith','iron-scrap',3),true);assert.equal(h.wallet.balance,gold+400-3*STOCK.smith['iron-scrap']);
  // Herbalist: no herbs, no potion; with them, one more potion.
  assert.equal(h.economy.craft('herbalist','potion'),false);
  h.economy.grant('moon-herb',2);const potions=h.economy.state.bag.potion;
  assert.equal(h.economy.craft('herbalist','potion'),true);assert.equal(h.economy.state.bag.potion,potions+1);assert.equal(h.economy.state.bag['moon-herb']??0,0);
  // The bench: four grades by where the hammer falls; each costs gold, a material and maximum durability.
  const grades=new Map();for(let i=0;i<=2000;i++){const x=i/1000-1,g=gradeStrike(x,0);if(!grades.has(g))grades.set(g,x);}
  assert.deepEqual([...grades.keys()].sort(),['Failed','Near miss','Perfect','Success']);
  for(const [grade,position] of grades){
   const w0=h.economy.gear(),cost=h.economy.forgeCost(),purse=h.wallet.balance,scrap=h.economy.state.bag['iron-scrap']??0;
   if(!scrap)h.economy.grant('iron-scrap',1);
   const got=h.economy.forge(position);
   const w1=h.economy.gear();
   if(gradeStrike(position,w0.level)!==grade)continue;// the ring tightens with the level
   assert.equal(got,grade);assert.equal(w1.level,w0.level+1);assert.equal(w1.bonus-w0.bonus,FORGE_RULES.attackGains[grade],grade);
   assert.ok(w1.max<=w0.max&&w1.max>=FORGE_RULES.minDurability&&w1.hp<=w1.max,grade+' durability');assert.equal(h.wallet.balance,purse-cost);
  }
  assert.ok(events.filter(e=>e.startsWith('forge')).length>=1&&events.includes('buy:iron-scrap')&&events.includes('craft:potion'));
  // Repair: the worn blade back to its maximum for its price.
  h.economy.damageWeapon('slash');for(let i=0;i<40;i++)h.economy.damageWeapon('slash');
  const worn=h.economy.gear(),price=h.economy.repairCost(),purse=h.wallet.balance;
  if(worn.hp<worn.max){assert.ok(price>0);assert.equal(h.economy.repair(),true);assert.equal(h.economy.gear().hp,h.economy.gear().max);assert.equal(h.wallet.balance,purse-price);}
  // Potion slots: a potion registered in slot 1 is drunk from it.
  assert.ok(h.economy.register('potion',0));const left=h.economy.state.bag.potion;
  assert.ok(h.economy.drink(0));assert.equal(h.economy.state.bag.potion,left-1);
  assert.deepEqual(notes.filter(n=>n.kind==='막힘'),[]);
  void RECIPES;
 }finally{h.shell.dispose?.();}
});
