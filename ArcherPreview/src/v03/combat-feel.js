import {reducedMotion,vibrate as buzz} from './accessibility.js';

// 0.3 hit feel and the early lessons it carries (1127-combat, 2026-11-27).
// - hit stop: the whole world runs at FREEZE_SCALE for a few real milliseconds after a hit
//   (boot multiplies it into the 0.3 timeScale that main.js already applies each frame).
// - camera kick: a short additive offset of the game camera's targetScreenOffset (no new camera,
//   no FOV fight with the slow-motion zoom). Reduced motion: no kick.
// - dodge counter: a dodge through a foe's blow opens COUNTER.seconds in which the next
//   COUNTER.hits sword hits deal COUNTER.bonus more (read by main.js as strikeBonus).
// - heavy lesson: after LIGHT_STREAK plain hits with no heavy attack, the 'light-streak' tip;
//   a heavy attack that fells a foe says so and earns FINISH_XP of its kill experience more.
// Nothing here allocates per frame. Idle (no hit, no kick, no counter, no fight) update() returns at once.
export const FREEZE_SCALE=.06;
export const HIT_STOP=Object.freeze({light:.045,heavy:.085,counter:.07,kill:.11,heavyKill:.17});
export const KICK=Object.freeze({light:.035,heavy:.09,kill:.11,seconds:.16});
export const COUNTER=Object.freeze({seconds:2,hits:3,bonus:14,range:4.5});
// Heavy (judgment) sword hits in 0.3: each of its three contacts deals this much more.
export const HEAVY_BONUS=8;
export const LIGHT_STREAK=6;
export const FINISH_XP=.5,FINISH_SECONDS=6;
const HIT_GRACE=.4,DODGE_GRACE=.12;

export function createCombatFeel({camera=()=>null,controller=()=>null,battle=()=>null,player=()=>null,
 onTip=()=>{},onFlash=()=>{},sound=()=>{},text=key=>key,lessonsOpen=()=>true,reduced=reducedMotion,vibrate=buzz}={}){
 let clock=0,stop=0,kickAge=-1,kickAmp=0,kickX=0,kickY=0,appliedX=0,appliedY=0,kickCamera=null;
 let counterLeft=0,counterHits=0,counterShown=false,lastDodge=-1,lastPlayerHit=-1,light=0,streakSent=false;
 let finishKind=null,finishAt=-1,stopAction=null,disposed=false;
 const stats={hits:0,heavy:0,kills:0,heavyKills:0,counters:0,counterHits:0,stops:0};
 function freeze(seconds){if(seconds>stop)stop=seconds;stats.stops++;}
 function kick(amp,x,y){
  if(reduced()||amp<=0)return;
  if(kickAge>=0&&kickAge<KICK.seconds*.5&&kickAmp>amp)return;
  kickAge=0;kickAmp=amp;kickX=x;kickY=y;
 }
 function applyKick(dt){
  const cam=camera(),offset=cam?.targetScreenOffset;
  if(kickCamera&&kickCamera!==cam)restoreKick();
  if(!offset){kickAge=-1;return;}
  kickCamera=cam;
  let x=0,y=0;
  if(kickAge>=0){
   kickAge+=dt;const k=kickAge/KICK.seconds;
   if(k>=1||reduced())kickAge=-1;
   else{const fall=(1-k)*(1-k),wave=Math.cos(k*Math.PI*3);x=kickX*kickAmp*fall*wave;y=kickY*kickAmp*fall*wave;}
  }
  if(x!==appliedX||y!==appliedY){offset.x+=x-appliedX;offset.y+=y-appliedY;appliedX=x;appliedY=y;}
 }
 function restoreKick(){
  const offset=kickCamera?.targetScreenOffset;
  if(offset&&(appliedX||appliedY)){offset.x-=appliedX;offset.y-=appliedY;}
  appliedX=appliedY=0;kickAge=-1;kickCamera=null;
 }
 function openCounter(){
  if(counterLeft>0&&counterHits===0)return;
  counterLeft=COUNTER.seconds;counterHits=0;counterShown=false;stats.counters++;
  if(lessonsOpen())onTip('dodge-counter');
 }
 // Foes whose blow just landed (rising edge of brain.impacted) while the warrior rolled near them.
 // Also the telegraph hold of a heavy blow (brain.telegraphSerial): one warning cue.
 function watchFoes(){
  const b=battle(),list=b?.encounters;if(!list||!(b.combatCount>0))return;
  const me=player(),p=me?.position;
  const rolled=clock-lastDodge<=DODGE_GRACE;
  for(let i=0;i<list.length;i++){
   const foe=list[i],brain=foe?.brain;if(!foe.active||!brain||!(brain.hp>0))continue;
   if(brain.telegraphSerial&&foe.v03FeelTelegraph!==brain.telegraphSerial){
    foe.v03FeelTelegraph=brain.telegraphSerial;
    if(!/Skill|Flying|Spin/.test(brain.state))sound('boss_warning',{position:foe.actor?.position,volume:.4});
   }
   const struck=brain.mode==='attack'&&brain.impacted===true;
   const mark=struck?brain.serial:-1;
   if(struck&&foe.v03FeelImpact!==mark&&rolled&&clock-lastPlayerHit>HIT_GRACE&&p&&foe.actor){
    const a=foe.actor.position,dx=a.x-p.x,dz=a.z-p.z;
    if(dx*dx+dz*dz<=COUNTER.range*COUNTER.range)openCounter();
   }
   foe.v03FeelImpact=mark;
  }
 }
 return {
  // main.js damage feedback, through boot.combatEvent: kind 'enemy' (the warrior hit foe),
  // 'player' / 'block' (foe hit the warrior), 'evade' (a dodge took the blow).
  note(kind,foe,damage,heavyFlag=false){
   if(disposed)return;
   if(kind==='player'){lastPlayerHit=clock;counterLeft=0;return;}
   if(kind==='evade'){openCounter();return;}
   if(kind!=='enemy'||!foe?.brain||typeof damage!=='number')return;
   const c=controller(),action=c?.action,state=c?.state,heavy=heavyFlag||state==='judgment';
   const skill=!!action?.greatAttack,killed=!(foe.brain.hp>0);
   stats.hits++;
   const counter=counterLeft>0&&counterHits<COUNTER.hits;
   if(counter){counterHits++;stats.counterHits++;if(!counterShown){counterShown=true;onFlash(text('combat.counter'));}}
   if(heavy){stats.heavy++;light=0;}
   else if(++light>=LIGHT_STREAK&&!streakSent&&lessonsOpen()){streakSent=true;onTip('light-streak');}
   // Heavy bursts and Starfall land several contacts in one action: stop once per action.
   const id=action?.id??null,first=id===null||id!==stopAction;stopAction=id;
   if(killed){
    stats.kills++;
    // Starfall keeps its own timing: no stop for the foes it fells.
    if(!skill)freeze(heavy?HIT_STOP.heavyKill:HIT_STOP.kill);kick(KICK.kill,0,-1);vibrate(heavy?40:24);
    if(heavy&&!skill){stats.heavyKills++;finishKind=foe.summonKind??foe.kind??null;finishAt=clock;onFlash(text('combat.heavyFinish'));}
    return;
   }
   if(skill){if(first)kick(KICK.heavy,0,-1);return;}
   if(heavy){if(first){freeze(HIT_STOP.heavy);kick(KICK.heavy,0,-1);vibrate(18);}return;}
   freeze(counter?HIT_STOP.counter:HIT_STOP.light);kick(counter?KICK.heavy:KICK.light,(stats.hits&1)?1:-1,.35);
  },
  update(dt){
   if(disposed||!(dt>0))return;
   clock+=dt;
   if(stop>0)stop=Math.max(0,stop-dt);
   if(counterLeft>0)counterLeft=Math.max(0,counterLeft-dt);
   if(controller()?.state==='dodge')lastDodge=clock;
   watchFoes();
   if(kickAge>=0||appliedX||appliedY)applyKick(dt);
  },
  // Multiplied into the 0.3 time scale: 1 unless a hit stop holds.
  get timeScale(){return stop>0?FREEZE_SCALE:1;},
  // Added to the sword's attack for the strike sampled this frame (main.js).
  get strikeBonus(){
   const c=controller();let bonus=c?.state==='judgment'&&!c.action?.greatAttack?HEAVY_BONUS:0;
   if(counterLeft>0&&counterHits<COUNTER.hits)bonus+=COUNTER.bonus;
   return bonus;
  },
  get counterOpen(){return counterLeft>0&&counterHits<COUNTER.hits;},
  // town-services defeat(): true once when this kind was just felled by a heavy attack.
  takeFinish(kind){
   if(finishKind===null||clock-finishAt>FINISH_SECONDS||kind!==finishKind)return false;
   finishKind=null;return true;
  },
  // A map change or a new record: nothing carries over.
  reset(){stop=0;counterLeft=0;counterHits=0;light=0;finishKind=null;stopAction=null;restoreKick();},
  inspect(){return {...stats,stop,counterLeft,light,streakSent,kick:kickAge>=0,applied:[appliedX,appliedY]};},
  dispose(){if(disposed)return;restoreKick();disposed=true;},
 };
}
