// Bear duel time, simulated in Node (1127-combat). Not a frame-rate or device measure.
// The bear is the game's own BossBrain with the guardian bear's clip lengths and BOSS_DAMAGE;
// the warrior is a timeline model of the 0.3 controller (clip lengths ÷ playback rate,
// strike windows, stamina 100 / 15 per idle second, costs 10 / 10 / 30, hold 0.45 s).
// The player's skill is a reaction time and miss chances (see PLAYERS). Each row: 400 seeds.
//   node scripts/v03-bear-duel-sim.mjs            → before/after table
import {BossBrain,BOSS_BY_NAME,BOSS_DAMAGE,BOSS_HEAVY_ATTACKS,BOSS_RECOVERY_READY_TIME} from '../src/boss-spec.js';

const BEAR_CLIPS={Axe_Spin_Attack:2.5,Backflip:2.1333,Block6:1.6667,Flying_Fist_Kick:4.6667,Knock_Down_1:3.2667,Left_Hook_from_Guard:1,
 Left_Uppercut_from_Guard:1.3333,Lunge_Spin_Kick:1.6333,Right_Jab_from_Guard:2,Rising_Flying_Kick:1.5,Running:.6333,Shield_Push_Left:2.3667,
 Skill_01:1.0667,Skill_02:1.3,Skill_03:1.6333,Stand_Up3:6.0333,Walking:1.0333,Weapon_Combo:3.6667,baseball_pitching:3.9667,mage_soell_cast_6:2.3};
// Warrior: clip seconds / playback (1.8 × motion speed) → real seconds; hits at real seconds after the start.
const RATE={slash:1.8,attack:2.88,judgment:1.8,dodge:1.7};
const ACT={
 slash:{len:1.5/RATE.slash,hits:[[.38/RATE.slash,20]],cost:10},
 attack:{len:3/RATE.attack,hits:[[.55/RATE.attack,18],[1.08/RATE.attack,20]],cost:10},
 judgment:{len:4.33/RATE.judgment,hold:.45,hits:[[.94/RATE.judgment,20],[.94/RATE.judgment+.055,20],[.94/RATE.judgment+.11,24,true]],cost:30},
 dodge:{len:2.46/RATE.dodge,cost:10},
};
const PLAYERS={
 pc:{label:'PC',react:.42,jitter:.12,pressLag:0,sprintSlip:0,swingMiss:.12,guardRespect:.75},
 touchOld:{label:'터치(지금 입력)',react:.5,jitter:.16,pressLag:.13,sprintSlip:.22,swingMiss:.18,guardRespect:.6},
 touchNew:{label:'터치(누르는 순간 회피)',react:.5,jitter:.16,pressLag:0,sprintSlip:0,swingMiss:.18,guardRespect:.6},
};
const COUNTER_SECONDS=2;
function rng(seed){let s=seed>>>0||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}

/** One duel. tune: {hp,damage,rest,telegraph}; build: {attack (sword+level), hp, defense, counter}; style: normal|heavy|counter. */
export function duel({tune,build,style,player,seed,limit=240}){
 const random=rng(seed),dt=1/60;
 const bear=new BossBrain(BEAR_CLIPS,random);bear.hp=bear.maxHp=tune.hp;
 if(tune.rest!=null)bear.restWait=tune.rest;if(tune.telegraph)bear.telegraph=tune.telegraph;
 let t=0,hp=build.hp,stamina=100,act=null,stun=0,counterLeft=0,counterHits=0,taken=0,hits=0,dodges=0,deaths=0,knock=0;
 let plannedDodge=null,seenSerial=-1,lastHitSerial=-1;
 const bonus=()=>build.attack+(counterLeft>0&&counterHits<3?build.counter:0);
 const start=(kind)=>{const a=ACT[kind];if(stamina<a.cost)return false;stamina-=a.cost;act={kind,t:-(a.hold??0),next:0,hold:a.hold??0};return true;};
 while(t<limit&&bear.hp>0){
  t+=dt;counterLeft=Math.max(0,counterLeft-dt);
  // Bear
  const before=bear.serial,{events}=bear.update(dt,2.0,true);
  // Player reacts to a new bear attack: sees it, then (maybe) dodges after reaction time.
  if(bear.mode==='attack'&&bear.serial!==seenSerial){
   seenSerial=bear.serial;
   const spec=BOSS_BY_NAME[bear.state],wind=BEAR_CLIPS[bear.state]*spec.impact/(spec.playRate||1.12)+(BOSS_HEAVY_ATTACKS.has(bear.state)?(tune.telegraph??0):0);
   const wants=random()<.9;
   const reaction=player.react+(random()-.5)*2*player.jitter+player.pressLag;
   plannedDodge=wants&&reaction<wind-.05&&random()>player.sprintSlip?{at:t+reaction,serial:bear.serial}:null;
  }
  if(plannedDodge&&t>=plannedDodge.at&&stun<=0){
   // A roll cancels idle time, a held charge or a swing's recovery; not a swing before its hits, nor the judgment's descent.
   const busy=act&&act.kind!=='dodge'&&act.t>=0&&act.next<(ACT[act.kind].hits?.length??0),locked=act?.kind==='judgment'&&act.t>=0;
   if(!busy&&!locked&&act?.kind!=='dodge'){act=null;if(start('dodge'))dodges++;}
   plannedDodge=null;
  }
  for(const e of events){
   const dodging=act?.kind==='dodge';
   if(dodging){if(style==='counter'){counterLeft=COUNTER_SECONDS;counterHits=0;}continue;}
   // Some swings miss the warrior outright (the bear's limbs, the camera, a step aside).
   if(random()<.25)continue;
   const dmg=Math.max(1,Math.round(BOSS_DAMAGE[e.name]*tune.damage)-build.defense);
   hp-=dmg;taken+=dmg;lastHitSerial=bear.serial;
   const superArmor=act?.kind==='judgment'&&act.t>=0;
   if(BOSS_HEAVY_ATTACKS.has(e.name)){act=null;stun=1.6;}else if(!superArmor){act=null;stun=.2;}
   if(hp<=0){deaths++;hp=build.hp;stamina=100;} // keep fighting to measure the length; deaths are reported
  }
  if(stun>0){stun-=dt;continue;}
  // Player action
  if(act){
   act.t+=dt;const a=ACT[act.kind];
   // The judgment refills stamina during its recovery, after the blade contact (warrior-v2 restoreJudgmentRecovery).
   if(act.kind==='judgment'&&act.t>1.12/RATE.judgment)stamina=Math.min(100,stamina+15*dt);
   while(act.next<(a.hits?.length??0)&&act.t>=a.hits[act.next][0]){
    const [,base,heavy]=a.hits[act.next++];
    if(act.missed??=random()<player.swingMiss)continue;
    const defense=bear.defense;
    const value=base+bonus()+(act.kind==='judgment'?build.heavy??0:0);
    if(defense==='block'&&act.kind!=='judgment'){act=null;stun=1.5;break;} // blocked swing: warrior groggy
    if(defense==='evade')continue;
    if(bear.hit({damage:value,heavy:!!heavy&&act.kind==='judgment',ignoreDefense:act.kind==='judgment'})){hits++;if(counterLeft>0)counterHits++;if(heavy)knock++;}
   }
   if(act&&act.t>=a.len)act=null;
   continue;
  }
  if(act===null&&stamina<100)stamina=Math.min(100,stamina+15*dt);
  // Choose: never into a raised guard (mostly), wait out a backflip.
  if(bear.mode==='evade')continue;
  if(bear.mode==='guard'&&random()<player.guardRespect)continue;
  const down=bear.mode==='down'||bear.mode==='recover';
  const spec=bear.mode==='attack'?BOSS_BY_NAME[bear.state]:null;
  const windupLeft=spec&&!bear.impacted?(BEAR_CLIPS[bear.state]*spec.impact/((spec.playRate||1.12))-bear.time/((spec.playRate||1.12))):0;
  if(windupLeft>.35&&!down)continue; // a careful player does not swing into a wind-up
  const heavyReady=stamina>=30&&!down&&(style==='heavy'||style==='counter')&&(bear.mode!=='attack'||bear.impacted);
  if(heavyReady&&random()<.7){start('judgment');continue;}
  if(stamina>=10+(style==='normal'?0:10)||down&&stamina>=10){
   const kind=(hits%3===0)?'slash':'attack';start(kind);
  }
 }
 return {seconds:t,taken,deaths,hits,dodges,knock,won:bear.hp<=0};
}
function summary(rows){
 const s=rows.map(r=>r.seconds).sort((a,b)=>a-b),q=p=>s[Math.min(s.length-1,Math.floor(p*s.length))];
 const taken=rows.map(r=>r.taken).sort((a,b)=>a-b);
 return {median:q(.5),p25:q(.25),p75:q(.75),taken:taken[taken.length>>1],death:rows.filter(r=>r.deaths>0).length/rows.length};
}
export function table({tune,build,player,seeds=400}){
 const out={};
 for(const style of ['normal','heavy','counter']){const rows=[];for(let i=1;i<=seeds;i++)rows.push(duel({tune,build,style,player,seed:i*7919}));out[style]=summary(rows);}
 return out;
}
// Before: 6af9e08f. After: this branch. Level 6 (where the bear quest usually starts, ~300 XP).
const BEFORE={tune:{hp:650,damage:.7},build:{attack:3,hp:500,defense:2,counter:0}};
const AFTER={tune:{hp:580,damage:.6,rest:.75,telegraph:.3},build:{attack:3+5,hp:550,defense:2,counter:14,heavy:8}};
if(import.meta.url===`file://${process.argv[1]}`){
 const fmt=r=>`${r.median.toFixed(0)}초 (${r.p25.toFixed(0)}–${r.p75.toFixed(0)}) · 받은 피해 ${r.taken} · 한 번이라도 쓰러짐 ${(r.death*100).toFixed(0)}%`;
 for(const [name,setup] of [['전',BEFORE],['후',AFTER]])for(const key of ['pc','touchOld','touchNew']){
  if(name==='전'&&key==='touchNew')continue;if(name==='후'&&key==='touchOld')continue;
  const r=table({...setup,player:PLAYERS[key]});
  console.log(`${name} · ${PLAYERS[key].label}\n  일반 공격만: ${fmt(r.normal)}\n  강공격 섞음: ${fmt(r.heavy)}\n  회피 반격 섞음: ${fmt(r.counter)}`);
 }
}
