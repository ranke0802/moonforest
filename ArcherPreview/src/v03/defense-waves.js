// Jeffrey's defense errand for 0.3 (W01, 2026-11-27, user: "점점 강해지게
// 마물들이 몰려오고 있어요" in ten stages; a loss goes back to before the talk).
//
// Two parts with different lifetimes:
//  - createWaveRaid: the foes of one village visit (map scope). Owned by
//    chapter-resident-visits.js, disposed with the visit. It reuses the chapter
//    foe factory (shared source model per kind, skeleton/animator/state per
//    actor) and spawns one actor at a time, at most maxAlive alive.
//  - createWaveErrand: the errand side inside the story (scene scope). It keeps
//    no map object past a stage: the raid is looked up when a stage starts and
//    dropped when it ends, is cancelled or the map changes.
import {t,speaker} from './i18n.js';
import {ENEMY_ARENA_RADIUS} from '../world-limits.js';
import {stacklessError} from '../map-load-lifetime.js';

const STORE_KEY='v03-waves-v1';
export const WAVE_KINDS=Object.freeze({goblin:'goblin-warrior',archer:'goblin-archer',elite:'hobgoblin-boss'});
// The elite is the forest's hobgoblin (780 HP, 48 damage). As a wave elite it
// comes at stage 5, before the forest quest: 60% HP and 75% damage of the
// boss, times the stage's own scale (stage 10: 749 HP ≈ the boss).
export const WAVE_ELITE=Object.freeze({hp:.6,damage:.75});
// Metres from the palisade spot: inside it the foes fight the player; outside
// it they hold the palisade. Jeffrey (-5.2, 5.6) stands just outside (22.6 m).
const HOLD_RADIUS=20,ENGAGE_RADIUS=16,TICK=.25,SPAWN_CLEARANCE=.42;

// The stage's foes in arrival order: archers spread among the goblins, the
// elites last (they come in once the first ones fall).
export function waveQueue(row,kinds=WAVE_KINDS){
 const goblins=Math.max(0,row?.goblin|0),archers=Math.max(0,row?.archer|0),elites=Math.max(0,row?.elite|0),queue=[];
 let placed=0;
 for(let i=0;i<goblins;i++){
  queue.push(kinds.goblin);
  if(archers&&placed<archers&&Math.floor((i+1)*archers/goblins+.5)>placed){queue.push(kinds.archer);placed++;}
 }
 for(;placed<archers;placed++)queue.push(kinds.archer);
 for(let i=0;i<elites;i++)queue.push(kinds.elite);
 return queue;
}
export function wavePlan(step,stage){
 const row=step?.stages?.[stage-1];if(!row)return null;
 const kinds={...WAVE_KINDS,...step.kinds};
 return {stage,queue:waveQueue(row,kinds),hp:row.hp??1,damage:row.damage??1,elite:{...WAVE_ELITE,...step.elite},eliteKind:kinds.elite,
  at:step.at,from:step.from,maxAlive:Math.max(1,step.maxAlive??6)};
}

// Formation slots: rows of three from a point along (dx,dz), free of walls when the map can tell.
function spot(navigation,point,index,spacing,dx,dz){
 const col=index%3-1,row=Math.floor(index/3)%4,side=col+(row%2)*.5;
 const x=point.x+(dx*row-dz*side)*spacing,z=point.z+(dz*row+dx*side)*spacing;
 const free=(px,pz)=>{if(!navigation?.free)return true;try{return navigation.free({x:px,z:pz},SPAWN_CLEARANCE);}catch{return true;}};
 if(free(x,z))return {x,z};
 for(let ring=1;ring<=4;ring++)for(let i=0;i<8;i++){
  const angle=i/8*Math.PI*2,cx=x+Math.cos(angle)*ring*.7,cz=z+Math.sin(angle)*ring*.7;
  if(free(cx,cz))return {x:cx,z:cz};
 }
 return {x:point.x,z:point.z};
}
const cancelled=()=>stacklessError(()=>Object.assign(new Error('wave cancelled'),{name:'AbortError'}));

// tune: the stage's scale on one foe (HP once; damage on every hit and shot).
export function tuneWaveFoe(enc,kind,plan){
 const elite=kind===plan.eliteKind,hpScale=plan.hp*(elite?plan.elite.hp:1),damageScale=plan.damage*(elite?plan.elite.damage:1);
 const base=enc.profile;
 if(base){
  const profile={...base,damage:Math.round(base.damage*damageScale)};enc.profile=profile;
  // Melee and boss moves carry the brain's (unscaled) damage; shots read enc.profile.
  enc.attackDamage=event=>event?.damage!=null?Math.round(event.damage*damageScale):profile.damage;
  if(enc.brain){enc.brain.maxHp=enc.brain.hp=Math.max(1,Math.round(base.hp*hpScale));}
 }
 enc.waveElite=elite;enc.v03Tuned=true;
}

export function createWaveRaid({world,battle,getPlayer,onDefeat,loadEnemies,onError=console.warn}){
 const map=world.mapId;
 let disposed=false,factory=null,factoryJob=null,run=null,clock=0,next=0;
 const current=()=>!disposed&&world.mapId===map&&!world.scene?.isDisposed;
 function defeated(event){
  const r=run,record=r?.byId.get(event.id);
  if(!record||record.killed)return;
  record.killed=true;r.killed++;
  onDefeat?.({...event,family:'goblin',wave:r.plan.stage});
 }
 function getFactory(){
  return factoryJob??=Promise.resolve().then(loadEnemies).then(module=>{
   if(!current())throw cancelled();
   factory=module.createChapterEnemyFactory({world,battle,onDefeat:defeated});return factory;
  }).catch(error=>{factoryJob=null;throw error;});
 }
 const alive=r=>{let n=0;for(const record of r.records)if(!record.killed)n++;return n;};
 function march(record){const b=record.handle.encounter.brain;if(b&&b.hp>0&&!b.engaged)b.returning=true;}
 function pump(r){
  if(r!==run||!current()||r.ended||r.pending||!r.queue.length||clock<r.retryAt||alive(r)>=r.plan.maxAlive)return;
  const kind=r.queue.shift(),index=r.spawned++,plan=r.plan,navigation=world.navigation;
  const from=spot(navigation,r.origin,index,1.5,r.dx,r.dz),rally=spot(navigation,r.rally,index,1.7,-r.dx,-r.dz);
  const id=`wave-${plan.stage}-${index+1}`,valid=()=>current()&&run===r;
  r.pending++;
  getFactory().then(made=>valid()?made.create({kind,id,x:from.x,z:from.z,yaw:Math.atan2(plan.at.x-from.x,plan.at.z-from.z),
   home:{x:plan.at.x,z:plan.at.z,radius:HOLD_RADIUS,combatRadius:8},player:getPlayer(),isCurrent:valid}):null)
   .then(handle=>{
    if(!handle)return;
    if(!valid()){handle.dispose();return;}
    const enc=handle.encounter;tuneWaveFoe(enc,kind,plan);
    // Its "home spot" is a place at the palisade: walking back there is the march in.
    enc.spawn.x=rally.x;enc.spawn.z=rally.z;
    const record={id,kind,handle,killed:false};r.records.push(record);r.byId.set(id,record);
    if(r.engaged)march(record);
   })
   .catch(error=>{
    if(!valid()||error?.name==='AbortError')return;
    // Try that foe again a little later; after three failures the stage goes on without it.
    if(++r.failures<3){r.queue.unshift(kind);r.spawned--;r.retryAt=clock+2;}else r.total--;
    onError('[MoonForest] wave foe '+kind,error);
   })
   .finally(()=>{r.pending--;pump(r);});
 }
 function stop(){
  const r=run;run=null;
  if(r)for(const record of r.records)record.handle.dispose();
 }
 function tick(r){
  const p=getPlayer()?.position,at=r.plan.at;
  for(let i=r.records.length-1;i>=0;i--){
   const record=r.records[i],enc=record.handle.encounter;
   if(record.killed){
    // A corpse leaves once it has faded; the last one of a kind still to come
    // stays (its source model would otherwise be released and loaded again).
    if(enc.corpseGone&&(r.ended||!r.queue.includes(record.kind)||r.records.some(other=>other!==record&&other.kind===record.kind))){r.records.splice(i,1);record.handle.dispose();}
    continue;
   }
   if(!r.engaged||r.ended||!p)continue;
   const b=enc.brain,a=enc.actor?.position;if(!b||!(b.hp>0)||!a)continue;
   const home=(p.x-at.x)**2+(p.z-at.z)**2<=HOLD_RADIUS*HOLD_RADIUS,near=(p.x-a.x)**2+(p.z-a.z)**2<=ENGAGE_RADIUS*ENGAGE_RADIUS;
   if(home&&near){if(!b.engaged){b.returning=false;b.engaged=true;}}
   else if(!b.engaged&&!b.returning&&(a.x-enc.spawn.x)**2+(a.z-enc.spawn.z)**2>.36)b.returning=true;
  }
  if(r.ended&&!r.records.length&&run===r)run=null;
  pump(r);
 }
 return {
  get disposed(){return disposed||!current();},
  get running(){return !!run&&!run.ended;},
  get stage(){return run?.plan.stage??0;},
  get total(){return run?.total??0;},
  get killed(){return run?.killed??0;},
  get left(){return run?Math.max(0,run.total-run.killed):0;},
  get alive(){return run?alive(run):0;},
  get pending(){return run?.pending??0;},
  get done(){const r=run;return !!r&&!r.ended&&!r.queue.length&&!r.pending&&r.killed>=r.total;},
  // Foes come in (hidden preparation, then standing outside the gate) but do not march yet.
  begin(plan){
   if(!current()||!plan?.queue?.length)return false;
   stop();
   // Spawns stay inside the map's enemy circle (summon would push them onto its edge,
   // one on top of another); rows run from there toward the palisade.
   const radius=Math.max(1,(ENEMY_ARENA_RADIUS??48)-1.5),far=Math.hypot(plan.from.x,plan.from.z),k=far>radius?radius/far:1;
   const origin={x:plan.from.x*k,z:plan.from.z*k},length=Math.hypot(plan.at.x-origin.x,plan.at.z-origin.z)||1,dx=(plan.at.x-origin.x)/length,dz=(plan.at.z-origin.z)/length;
   run={plan,queue:[...plan.queue],total:plan.queue.length,killed:0,pending:0,spawned:0,records:[],byId:new Map(),engaged:false,ended:false,failures:0,retryAt:0,
    origin,dx,dz,rally:{x:plan.at.x-dx*2,z:plan.at.z-dz*2}};
   pump(run);return true;
  },
  go(){const r=run;if(!r||r.ended)return false;r.engaged=true;for(const record of r.records)if(!record.killed)march(record);pump(r);return true;},
  // The stage is over: no one else comes; corpses fade out on their own.
  end(){if(run)run.ended=true;},
  stop,
  update(dt){
   clock+=dt;if(!run||clock<next)return;next=clock+TICK;
   if(!current()){stop();return;}
   tick(run);
  },
  dispose(){if(disposed)return;disposed=true;stop();factory?.dispose();factory=null;factoryJob=null;},
 };
}

// ----- the errand side (story) -----
export function createWaveErrand({api,storage=()=>null,hud,content,results=()=>{},focus=()=>{},announce=()=>{},refresh=()=>{}}){
 const errand=(content.ERRANDS??[]).find(row=>row.steps.some(step=>step.type==='waves'))??null;
 const id=errand?.id??null,step=errand?.steps.find(row=>row.type==='waves')??null,total=step?.stages.length??0;
 let log=null,key=STORE_KEY,receipts=new Set(),replaying=false,run=null,lost=false;
 function loadReceipts(){
  receipts=new Set();
  try{const value=JSON.parse(storage()?.getItem(key)??'null');if(Array.isArray(value?.paid))for(const n of value.paid)if(Number.isInteger(n)&&n>=1&&n<=total)receipts.add(n);}catch{/* none paid */}
 }
 function saveReceipts(){try{storage()?.setItem(key,JSON.stringify({paid:[...receipts]}));return true;}catch{return false;}}
 const ready=()=>!!(errand&&log);
 const cleared=()=>!ready()?0:log.isFinished(id)?total:log.count(id);
 const onStep=()=>ready()&&log.isActive(id)&&log.step(id)===step;
 const raidNow=()=>api.world?.mapId===step.map?api.world?.chapterResidents?.raid?.()??null:null;
 function stop(){run?.raid.stop();run=null;}
 function warm(stage){
  if(run){if(run.phase==='warm'&&run.stage===stage)run.idle=0;return;}
  const raid=raidNow(),plan=wavePlan(step,stage);
  if(!raid||!plan||!raid.begin(plan))return;
  run={stage,phase:'warm',raid,idle:0,snapshot:null,left:-1};
 }
 function snapshotNow(){
  const player=api.getPlayer?.(),controller=api.getController?.(),position=player?.position;
  if(!position)return null;
  return {x:position.x,z:position.z,hp:api.battle?.combat?.hp??api.battle?.playerHp??null,stamina:Number.isFinite(controller?.stamina)?controller.stamina:null,
   potions:api.itemCount?.('potion')??null,gear:api.gearCondition?.()??null};
 }
 function begin(stage){
  if(!onStep()||stage!==cleared()+1)return false;
  if(run&&(run.phase!=='warm'||run.stage!==stage))stop();
  warm(stage);
  if(!run){api.toast?.(t('waves.unavailable'));return false;}
  run.snapshot=snapshotNow();run.phase='fight';run.raid.go();lost=false;
  hud.flash?.(t('waves.start',{n:stage}));focus(id);
  return true;
 }
 function pay(stage){
  if(replaying||receipts.has(stage))return;
  const row=step.stages[stage-1],parts=[],summary={xp:0,gold:0,potions:0,armor:null};
  // The receipt is written first: an interrupted payment is never paid twice.
  receipts.add(stage);saveReceipts();
  try{if(row.gold&&api.creditGold?.(`v03-errand-${id}-${stage}`,row.gold)){parts.push(t('reward.gold',{n:row.gold}));summary.gold=row.gold;}}catch(error){console.warn('[MoonForest 0.3] wave gold',error);}
  try{if(row.potions){const n=api.addPotions?.(row.potions)??0;if(n>0){parts.push(t('reward.potions',{n}));summary.potions=n;}}}catch(error){console.warn('[MoonForest 0.3] wave potions',error);}
  // The same reward show as quests and errands (reward-celebration.js via the story).
  announce(parts,summary);
 }
 function clear(){
  const stage=run.stage;run.raid.end();run=null;
  pay(stage);
  hud.flash?.(stage>=total?t('waves.allCleared',{n:stage}):t('waves.cleared',{n:stage}));
  results([log.clear(id,stage)]);
 }
 // A lost stage: back to the moment of the talk (place, health, stamina,
 // potions, gear wear). Stages already cleared stay cleared.
 function restore(){
  const snap=run.snapshot;run.raid.stop();run=null;lost=true;
  if(snap){
   try{api.resetStage?.({x:snap.x,z:snap.z,map:step.map});}catch(error){console.warn('[MoonForest 0.3] wave restore',error);}
   const combat=api.battle?.combat;
   if(combat&&Number.isFinite(snap.hp))combat.hp=Math.max(1,Math.min(combat.maxHp??snap.hp,snap.hp));
   const controller=api.getController?.();
   if(controller&&snap.stamina!==null)controller.stamina=Math.min(controller.maxStamina??snap.stamina,snap.stamina);
   const now=api.itemCount?.('potion');
   if(Number.isInteger(snap.potions)&&Number.isInteger(now)){
    if(now<snap.potions)api.grantItem?.('potion',snap.potions-now);else if(now>snap.potions)api.spendItem?.('potion',now-snap.potions);
   }
   if(snap.gear)api.restoreGearCondition?.(snap.gear);
   try{api.battle?.onChange?.(api.battle);}catch{/* HUD refresh only */}
  }
  api.playSound?.('revive');
  hud.flash?.(t('waves.lost'));refresh();
 }
 return {
  get errand(){return errand;},
  get stage(){return run?.stage??0;},
  get phase(){return run?.phase??null;},
  get lost(){return lost;},
  cleared,
  bind(errands,storeKey,replay=false,fresh=false){stop();log=errands;replaying=replay;lost=false;key=storeKey?storeKey+':waves':STORE_KEY;loadReceipts();if(fresh&&receipts.size){receipts.clear();saveReceipts();}},
  // What the giver says now, or null (offer, the last report: errands.js).
  talk(npc,mainDone){
   if(!ready()||!step.targets.includes(npc))return null;
   if(!log.isActive(id)){if(!log.isFinished(id)&&log.offerFor(npc,mainDone)===errand)warm(1);return null;}
   if(!onStep())return null;
   const done=cleared();if(done>=total)return null;
   if(run&&run.phase!=='warm')return {kind:'wave-hold',errand,dialogue:errand.wait};
   const stage=done+1;warm(stage);
   return {kind:'wave',errand,stage,dialogue:lost&&step.lines?.retry?step.lines.retry:step.stages[stage-1].line??errand.wait};
  },
  // After the talk was played. The offer's talk starts stage 1 once accepted.
  after(talk){
   if(!talk||talk.errand!==errand||!errand)return false;
   if(talk.kind==='offer'){begin(1);return true;}
   if(talk.kind==='wave'){begin(talk.stage);return true;}
   return talk.kind==='wave-hold';
  },
  // The HUD line: "3/10단계 · 남은 마물 4" during a stage.
  objective(errandId){
   if(!ready()||errandId!==id||!onStep())return null;
   const done=cleared();
   if(run&&run.phase!=='warm')return t('waves.objective.fight',{n:run.stage,total,left:run.raid.left});
   const who=speaker((content.NPCS??[]).find(npc=>npc.id===step.targets[0])?.name??'');
   return done>=total?t('waves.objective.report',{total,who}):t('waves.objective.idle',{n:done+1,total,who});
  },
  // ! over the giver while a stage waits to be started (or the last report).
  mark(marks){if(onStep()&&(!run||run.phase==='warm'))marks.set(step.targets[0],'!');},
  // For the guide: talk to the giver, or the palisade while a stage is on.
  guide(){if(!onStep())return null;return run&&run.phase!=='warm'?{map:step.map,x:step.at.x,z:step.at.z,radius:step.at.radius}:{map:step.map,npc:step.targets[0]};},
  // main.js asks before the death screen; true: this errand handles it.
  playerDown(){if(run?.phase==='fight'){run.phase='down';return true;}return run?.phase==='down';},
  update(dt,mapId,talking){
   if(!run)return;
   if(mapId!==step.map||run.raid.disposed){
    const fighting=run.phase!=='warm';run=null;
    if(fighting){api.toast?.(t('waves.cancelled'));refresh();}
    return;
   }
   if(run.phase==='warm'){if(talking)run.idle=0;else if((run.idle+=dt)>.75)stop();return;}
   if(run.phase==='down'){restore();return;}
   const left=run.raid.left;if(left!==run.left){run.left=left;refresh();}
   if(run.raid.done)clear();
  },
  stop,
 };
}
