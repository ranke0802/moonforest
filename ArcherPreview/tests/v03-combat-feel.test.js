import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createCombatFeel,FREEZE_SCALE,HIT_STOP,KICK,COUNTER,HEAVY_BONUS,LIGHT_STREAK} from '../src/v03/combat-feel.js';
import {BossBrain,BOSS_BY_NAME} from '../src/boss-spec.js';
import {DodgeSprintGesture} from '../src/dodge-sprint-input.js';
import {levelHp,levelAttack,PLAYER_BASE_HP} from '../src/v03/character-progression.js';
import {setupTownServices} from '../src/v03/town-services.js';
import {createRewardHud} from '../src/v03/reward-hud.js';
import {GoldLoot} from '../src/gold-loot.js';
import {t} from '../src/v03/i18n.js';
import * as chapter1 from '../src/v03/data/chapter1.js';

// A camera whose targetScreenOffset counts every write.
function camera(){
 const value={x:0,y:0},writes={n:0};
 const offset={get x(){return value.x;},set x(v){writes.n++;value.x=v;},get y(){return value.y;},set y(v){writes.n++;value.y=v;}};
 return {targetScreenOffset:offset,writes};
}
function rig({reduced=false,lessons=true}={}){
 const cam=camera(),ctrl={state:'idle',action:null},tips=[],flashes=[],sounds=[];
 const battle={combatCount:1,encounters:[]},me={position:{x:0,y:0,z:0}};
 const feel=createCombatFeel({camera:()=>cam,controller:()=>ctrl,battle:()=>battle,player:()=>me,onTip:w=>tips.push(w),onFlash:f=>flashes.push(f),
  sound:c=>sounds.push(c),text:k=>k,lessonsOpen:()=>lessons,reduced:()=>reduced,vibrate:()=>false});
 return {feel,cam,ctrl,tips,flashes,sounds,battle,me};
}
const foe=(hp=100,kind='bear')=>({kind,brain:{hp,mode:'idle',serial:1,impacted:false},active:true,actor:{position:{x:1,y:0,z:0}}});
const run=(feel,seconds,dt=1/60)=>{for(let s=0;s<seconds-1e-9;s+=dt)feel.update(dt);};

test('idle costs nothing: no time scale, no bonus, no camera write',()=>{
 const r=rig();r.battle.combatCount=0;
 run(r.feel,2);
 assert.equal(r.feel.timeScale,1);assert.equal(r.feel.strikeBonus,0);assert.equal(r.cam.writes.n,0);
});

test('a plain hit stops the world briefly and kicks the camera, then both settle exactly',()=>{
 const r=rig(),f=foe();
 r.ctrl.state='slash';r.ctrl.action={id:1};
 r.feel.note('enemy',f,23,false);
 assert.equal(r.feel.timeScale,FREEZE_SCALE);
 r.feel.update(1/60);assert.ok(r.cam.targetScreenOffset.x!==0,'the kick moved the view');
 run(r.feel,HIT_STOP.light);assert.equal(r.feel.timeScale,1);
 run(r.feel,KICK.seconds);
 assert.ok(Math.abs(r.cam.targetScreenOffset.x)<1e-12&&Math.abs(r.cam.targetScreenOffset.y)<1e-12);
 const writes=r.cam.writes.n;run(r.feel,1);assert.equal(r.cam.writes.n,writes,'no writes once settled');
});

test('reduced motion keeps the hit stop and drops the camera kick',()=>{
 const r=rig({reduced:true});r.ctrl.state='attack';r.ctrl.action={id:2};
 r.feel.note('enemy',foe(),20,false);
 assert.equal(r.feel.timeScale,FREEZE_SCALE);run(r.feel,.5);assert.equal(r.cam.writes.n,0);
});

test('a heavy burst stops once per action, a felling blow stops longer and praises the heavy finish once',()=>{
 const r=rig(),f=foe();r.ctrl.state='judgment';r.ctrl.action={id:3};
 r.feel.note('enemy',f,28,false);run(r.feel,HIT_STOP.heavy+.01);assert.equal(r.feel.timeScale,1);
 r.feel.note('enemy',f,28,false);assert.equal(r.feel.timeScale,1,'the second contact of the same action does not stop again');
 f.brain.hp=0;r.feel.note('enemy',f,32,true);
 assert.equal(r.feel.timeScale,FREEZE_SCALE);run(r.feel,HIT_STOP.kill+.01);assert.equal(r.feel.timeScale,FREEZE_SCALE,'a heavy kill holds longer than a plain kill');
 assert.deepEqual(r.flashes,['combat.heavyFinish']);
 assert.equal(r.feel.takeFinish('wolf'),false);assert.equal(r.feel.takeFinish('bear'),true);assert.equal(r.feel.takeFinish('bear'),false);
 const plain=rig(),g=foe(0,'fox');plain.ctrl.state='slash';plain.feel.note('enemy',g,20,false);
 assert.deepEqual(plain.flashes,[]);assert.equal(plain.feel.takeFinish('fox'),false);
});

test('the heavy attack hits harder in 0.3, Starfall keeps its own numbers',()=>{
 const r=rig();r.ctrl.state='judgment';r.ctrl.action={id:4};assert.equal(r.feel.strikeBonus,HEAVY_BONUS);
 r.ctrl.action={id:5,greatAttack:{}};assert.equal(r.feel.strikeBonus,0);
});

test('a dodge through a blow opens the counter: three stronger hits, one banner, one tip',()=>{
 const r=rig(),f=foe();r.battle.encounters.push(f);
 r.feel.update(1/60);
 r.ctrl.state='dodge';r.feel.update(1/60);
 f.brain.mode='attack';f.brain.serial=7;f.brain.impacted=true;r.feel.update(1/60);
 assert.equal(r.feel.counterOpen,true);assert.deepEqual(r.tips,['dodge-counter']);
 r.ctrl.state='slash';r.ctrl.action={id:6};
 assert.equal(r.feel.strikeBonus,COUNTER.bonus);
 for(let i=0;i<COUNTER.hits;i++)r.feel.note('enemy',f,30,false);
 assert.equal(r.feel.counterOpen,false);assert.equal(r.feel.strikeBonus,0);
 assert.deepEqual(r.flashes,['combat.counter']);
 // A blow that landed on the warrior is no counter, nor one far away.
 const hit=rig(),g=foe();hit.battle.encounters.push(g);hit.ctrl.state='dodge';hit.feel.update(1/60);
 hit.feel.note('player',g,40);g.brain.mode='attack';g.brain.impacted=true;g.brain.serial=9;hit.feel.update(1/60);
 assert.equal(hit.feel.counterOpen,false);
 const far=rig(),h=foe();h.actor.position.x=COUNTER.range+1;far.battle.encounters.push(h);far.ctrl.state='dodge';far.feel.update(1/60);
 h.brain.mode='attack';h.brain.impacted=true;h.brain.serial=3;far.feel.update(1/60);assert.equal(far.feel.counterOpen,false);
 // The game's own evade report opens it too, and it closes after its seconds.
 const evade=rig();evade.feel.note('evade',null,'Dodge');assert.equal(evade.feel.counterOpen,true);
 run(evade.feel,COUNTER.seconds+.02);assert.equal(evade.feel.counterOpen,false);
});

test('only plain hits after the first fight bring the heavy-attack tip, once',()=>{
 const r=rig(),f=foe(500);r.ctrl.state='slash';
 for(let i=0;i<LIGHT_STREAK-1;i++)r.feel.note('enemy',f,20,false);
 assert.deepEqual(r.tips,[]);
 r.ctrl.state='judgment';r.feel.note('enemy',f,30,false);r.ctrl.state='slash';
 for(let i=0;i<LIGHT_STREAK-1;i++)r.feel.note('enemy',f,20,false);
 assert.deepEqual(r.tips,[],'a heavy attack resets the count');
 r.feel.note('enemy',f,20,false);assert.deepEqual(r.tips,['light-streak']);
 for(let i=0;i<LIGHT_STREAK*2;i++)r.feel.note('enemy',f,20,false);assert.deepEqual(r.tips,['light-streak']);
 const tutorial=rig({lessons:false});tutorial.ctrl.state='slash';
 for(let i=0;i<LIGHT_STREAK*2;i++)tutorial.feel.note('enemy',f,20,false);assert.deepEqual(tutorial.tips,[]);
});

test('a telegraphed heavy blow sounds its warning once',()=>{
 const r=rig(),f=foe();f.brain.state='Weapon_Combo';r.battle.encounters.push(f);
 f.brain.telegraphSerial=1;r.feel.update(1/60);r.feel.update(1/60);assert.deepEqual(r.sounds,['boss_warning']);
 f.brain.state='Skill_01';f.brain.telegraphSerial=2;r.feel.update(1/60);assert.deepEqual(r.sounds,['boss_warning'],'the game already warns for these');
});

test('the bear tune: heavy blows hold before contact, rest between blows; untuned brains keep their timing',()=>{
 const clips={Weapon_Combo:3.6667,Right_Jab_from_Guard:2,Block6:1.6667,Walking:1,Running:.63};
 const impactAt=(telegraph)=>{
  const b=new BossBrain(clips,()=>0);b.telegraph=telegraph;b.start('Weapon_Combo','attack');
  for(let t=0;t<5;t+=1/60){const {events}=b.update(1/60,2);if(events.length)return t;}
  return null;
 };
 const plain=impactAt(0),held=impactAt(.3),spec=BOSS_BY_NAME.Weapon_Combo;
 assert.ok(Math.abs(plain-3.6667*spec.impact/1.12)<.03,'untuned timing '+plain);
 assert.ok(Math.abs(held-plain-.3)<.03,'the hold adds its seconds '+held);
 // One long frame reaches, holds and carries on.
 const b=new BossBrain(clips,()=>0);b.telegraph=.3;b.start('Weapon_Combo','attack');
 assert.equal(b.update(3,2).events.length,1);
 // A light blow is never held.
 const jab=new BossBrain(clips,()=>0);jab.telegraph=.3;jab.start('Right_Jab_from_Guard','attack');let at=null;
 for(let t=0;t<3&&at===null;t+=1/60)if(jab.update(1/60,2).events.length)at=t;
 assert.ok(Math.abs(at-2*BOSS_BY_NAME.Right_Jab_from_Guard.impact/1.12)<.03);
 // restWait: the pause after a blow.
 const rest=new BossBrain(clips,()=>0);rest.restWait=.75;rest.start('Right_Jab_from_Guard','attack');
 for(let t=0;t<2/1.12+.05;t+=1/60)rest.update(1/60,2);
 assert.equal(rest.mode,'idle');assert.ok(rest.wait>.6&&rest.wait<=.75);
 const bear=chapter1.QUESTS.find(q=>q.id==='M04').steps.find(s=>s.id==='bear');
 assert.deepEqual(bear.tune,{hp:580,damage:.6,rest:.75,telegraph:.3});
});

// 2026-11-27 22:34 user: the dodge/sprint button works the same in a fight as outside it (tap rolls on the
// release, hold sprints); the press-to-roll change was reverted.
test('the dodge button keeps one rule in and out of a fight: a tap rolls on the release, a hold sprints',()=>{
 let clock=0,rolls=0;const sprint=[];
 const g=new DodgeSprintGesture({now:()=>clock,onDodge:()=>rolls++,onSprint:h=>sprint.push(h)});
 g.begin('key');assert.equal(rolls,0,'no roll at the press');clock=80;g.end('key');assert.equal(rolls,1,'tap rolls at the release');
 g.begin('key');clock=400;g.advance(1/60);assert.deepEqual(sprint,[true]);g.end('key');assert.equal(rolls,1,'a hold sprints without rolling');assert.deepEqual(sprint,[true,false]);
 const boot=readFileSync(new URL('../src/v03/boot.js',import.meta.url),'utf8'),main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.doesNotMatch(boot+main,/pressDodge/,'no fight-only dodge rule');
});

test('each level adds health and attack, shown on the banner; an older record gets its level\'s values',ctx=>{
 assert.equal(levelHp(1),PLAYER_BASE_HP);assert.equal(levelHp(6),PLAYER_BASE_HP+50);assert.equal(levelAttack(1),0);assert.equal(levelAttack(6),5);
 const {document}=parseHTML('<html><body><div id="app"></div></body></html>'),root=document.getElementById('app');
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const open=()=>{
  const combat={maxHp:500,hp:430,defense:0},events=[],world={v03:{playing:true}};
  const town=setupTownServices({root,world,wallet:new GoldLoot({storage}),legacy:()=>({}),player:()=>({}),battle:()=>({combat}),controls:()=>null,appearance:()=>null,
   notify(){},onPause(){},onLevelUp:e=>{events.push(e);return true;}});
  ctx.after(()=>town.dispose());return {town,combat,events};
 };
 const a=open();a.town.apply();
 assert.equal(a.combat.maxHp,500);assert.equal(a.town.attackPower,a.town.economy.attack);
 a.town.creditQuestExperience(['M03']);// level 3
 assert.equal(a.events[0].level,3);assert.equal(a.events[0].hp,20);assert.equal(a.events[0].attack,2);
 assert.equal(a.combat.maxHp,520);assert.equal(a.combat.hp,450,'the new maximum adds to current health');
 assert.equal(a.town.attackPower,a.town.economy.attack+2);
 a.town.economy.flush?.();
 const b=open();b.town.apply();
 assert.equal(b.town.economy.progression.level,3);assert.equal(b.combat.maxHp,520);assert.equal(b.town.attackPower,b.town.economy.attack+2);
 const hud=createRewardHud({doc:document,mount:root});
 hud.showLevel({level:3,points:2,cap:20,ratio:.2,fromRatio:0,hp:20,attack:2});
 const rows=[...hud.banner.querySelectorAll('.v03-lvup-stats li')].filter(li=>!li.hidden).map(li=>li.textContent);
 assert.deepEqual(rows,[t('levelup.growth',{hp:20,attack:2}),t('levelup.points',{n:2})]);
 hud.showLevel({level:4,points:1,cap:20,ratio:.2,fromRatio:0});
 assert.deepEqual([...hud.banner.querySelectorAll('.v03-lvup-stats li')].filter(li=>!li.hidden).map(li=>li.textContent),[t('levelup.points',{n:1})],'nothing that did not rise');
});

test('the new combat words and tips exist in the five languages',async()=>{
 for(const lang of ['ko','en','ja','vi','zh']){
  const {default:pack}=await import(`../src/v03/locales/${lang}.js`);
  for(const key of ['combat.counter','combat.heavyFinish','levelup.growth','levelup.hp','levelup.attack'])assert.equal(typeof pack.ui[key],'string',lang+' '+key);
  assert.match(pack.ui['levelup.growth'],/\{hp\}.*\{attack\}/);
  if(lang!=='ko')for(const id of ['heavy-hunt','counter'])for(const k of ['title','keys','touch','text'])assert.ok(pack.story.tips[id]?.[k],lang+' '+id+'.'+k);
 }
 for(const id of ['heavy-hunt','counter'])assert.ok(chapter1.TIPS.some(tip=>tip.id===id));
});
