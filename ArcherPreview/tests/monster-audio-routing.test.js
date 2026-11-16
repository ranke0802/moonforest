import test from 'node:test';
import assert from 'node:assert/strict';
import {ActionAudio} from '../src/action-audio.js';
import {bossMusicContext,availableBossMusic,ALPHA_WOLF_MUSIC_KEY} from '../src/boss-music.js';

const enemy=(kind,regularWolfId,engaged)=>({kind,regularWolfId,active:true,actor:{position:{x:0,z:0}},
  ...(engaged===undefined?{}:{territoryState:{enabled:true,engaged}}),
  brain:{hp:100,serial:1,time:0,state:'test',mode:'idle',durations:{test:1}}});
const battle=encounters=>({active:true,playerHp:100,playerMaxHp:100,encounters});
function fixture(){const cues=[],modes=[],router=new ActionAudio({play:(name)=>cues.push(name),setCombat:mode=>modes.push(mode)});return {router,cues,modes};}

test('all creature profiles emit their own attack, hurt and death exactly once per actor edge',()=>{
  for(const [kind,id,prefix]of [['bear',undefined,'bear'],['wolf',undefined,'wolf'],['wolf','gray-wolf','wolf'],['wolf','stylized-wolf','wolf'],['wolf','wolf-3','wolf'],['wolf','fox','fox'],['wolf','boar','boar'],['goblin',undefined,'goblin']]){
    const {router,cues}=fixture(),one=enemy(kind,id),two=enemy(kind,id);
    router.bossMotion(one,.01);router.bossMotion(two,.01);
    for(const actor of [one,two]){actor.brain.mode='attack';actor.brain.serial++;router.bossMotion(actor,.01);router.bossMotion(actor,.01);}
    one.brain.hp=70;router.bossMotion(one,.01);router.bossMotion(one,.01);
    one.brain.hp=0;router.bossMotion(one,.01);router.bossMotion(one,.01);
    assert.equal(cues.filter(x=>x===prefix+'_attack').length,2,prefix);
    assert.equal(cues.filter(x=>x===prefix+'_hurt').length,1,prefix);
    assert.equal(cues.filter(x=>x===prefix+'_death').length,1,prefix);
    assert.equal(cues.filter(x=>x==='bear_attack').length,prefix==='bear'?2:0);
  }
});

test('territory rest/watch never starts combat or victory, regular combat stays ordinary, manual summons remain combat',()=>{
  const {router,cues,modes}=fixture(),fox=enemy('wolf','fox',false),alpha=enemy('wolf',undefined,false),bear=enemy('bear',undefined,false),b=battle([fox,alpha,bear]);
  router.boss(b,.1);assert.equal(modes.at(-1).active,false);assert.equal(modes.at(-1).boss,false);assert.ok(!cues.includes('victory'));
  fox.territoryState.engaged=true;router.boss(b,.1);assert.equal(modes.at(-1).active,true);assert.equal(modes.at(-1).boss,false);
  alpha.territoryState.engaged=true;router.boss(b,.1);assert.equal(modes.at(-1).boss,true);
  alpha.territoryState.engaged=false;fox.territoryState.engaged=false;router.boss(b,3);assert.equal(modes.at(-1).active,false);assert.ok(!cues.includes('victory'));
  router.reset();router.boss(battle([enemy('wolf','boar')]),.1);assert.equal(modes.at(-1).active,true);assert.equal(modes.at(-1).boss,false);
  router.boss(battle([enemy('wolf')]),.1);assert.equal(modes.at(-1).boss,true);
});

test('alpha theme respects engagement, stable boss priority and manifest fallback without altering bear or Elena keys',()=>{
  const alpha=enemy('wolf',undefined,true),bear=enemy('bear',undefined,true),saint={...enemy('elena'),engaged:true,phase:1},witch={...saint,phase:2};
  assert.equal(bossMusicContext([bear]),'boss');
  for(const actors of [[bear,alpha],[alpha,bear]])assert.equal(bossMusicContext(actors),ALPHA_WOLF_MUSIC_KEY);
  for(const actors of [[alpha,saint],[saint,alpha]])assert.equal(bossMusicContext(actors),'elena_saint');
  assert.equal(bossMusicContext([alpha,saint,witch]),'elena_mourning');
  alpha.territoryState.engaged=false;bear.territoryState.engaged=false;
  assert.equal(bossMusicContext([alpha,bear,enemy('wolf','fox',true)]),null);
  assert.equal(bossMusicContext([enemy('wolf')]),'alpha_wolf');
  assert.equal(availableBossMusic('alpha_wolf',{alpha_wolf:{url:'alpha.mp3'}}),'alpha_wolf');
  assert.equal(availableBossMusic('alpha_wolf',{}),'boss');
  assert.equal(availableBossMusic('alpha_wolf',{alpha_wolf:{url:'alpha.mp3'}},new Set(['music:alpha_wolf'])),'boss');
});

test('death cue and victory survive territory disengagement and router reset drops old actor tracking',()=>{
  const {router,cues,modes}=fixture(),bear=enemy('bear',undefined,true),b=battle([bear]);
  router.boss(b,.01);bear.territoryState.engaged=false;bear.brain.hp=0;router.boss(b,.01);router.boss(b,.01);
  assert.equal(cues.filter(x=>x==='bear_death').length,1);assert.equal(cues.filter(x=>x==='victory').length,1);assert.equal(modes.at(-1).active,true);
  router.boss(b,3);assert.equal(modes.at(-1).active,false);
  router.reset();bear.brain.hp=100;router.boss(b,.01);assert.equal(cues.filter(x=>x==='bear_hurt').length,0);
});

test('creature steps require actual movement and alerts fire once per engagement without armored footsteps',()=>{
  for(const [kind,id,prefix]of [['wolf',undefined,'wolf'],['wolf','fox','fox'],['wolf','boar','boar'],['bear',undefined,'bear']]){
    const {router,cues}=fixture(),actor=enemy(kind,id,false);actor.brain.mode='move';
    router.bossMotion(actor,.5);assert.ok(!cues.includes(prefix+'_step'));
    actor.actor.position.x+=.2;router.bossMotion(actor,.5);assert.equal(cues.filter(x=>x===prefix+'_step').length,1);
    router.bossMotion(actor,.5);assert.equal(cues.filter(x=>x===prefix+'_step').length,1);
    actor.territoryState.engaged=true;router.bossMotion(actor,.01);router.bossMotion(actor,.01);assert.equal(cues.filter(x=>x===prefix+'_alert').length,1);
    actor.territoryState.engaged=false;router.bossMotion(actor,.01);actor.territoryState.engaged=true;router.bossMotion(actor,.01);assert.equal(cues.filter(x=>x===prefix+'_alert').length,2);
    assert.ok(!cues.some(x=>/^foot_/.test(x)));
  }
});

test('V02 absolute source impact works with missing durations, fast crossings and separate ram/maul clocks',()=>{
  const {router,cues}=fixture(),actor=enemy('wolf','fox',true);
  actor.brain.durations={};actor.brain.mode='attack';actor.brain.action={impact:.34,clipEnd:.8};
  actor.brain.time=.2;router.bossMotion(actor,.01);assert.equal(cues.filter(x=>x==='fox_impact').length,0);
  actor.brain.time=.5;router.bossMotion(actor,.01);router.bossMotion(actor,.01);assert.equal(cues.filter(x=>x==='fox_impact').length,1);
  actor.brain.serial++;actor.brain.action={momentumRam:true,ramPhases:[{impact:.34},{impact:2.14},{impact:2.69}]};
  actor.brain.time=10;actor.brain.ramContactTime=.2;router.bossMotion(actor,.01);assert.equal(cues.filter(x=>x==='fox_impact').length,1);
  actor.brain.ramContactTime=.5;router.bossMotion(actor,.01);actor.brain.ramContactTime=2.8;router.bossMotion(actor,.01);router.bossMotion(actor,.01);
  assert.equal(cues.filter(x=>x==='fox_impact').length,4);
  assert.ok(!cues.some(x=>x==='slash'||x==='slash_heavy'));
});

test('legacy goblin attack and foot cues retain their existing timing and identifiers',()=>{
  const {router,cues}=fixture(),actor=enemy('goblin');actor.brain.mode='attack';actor.brain.time=.2;
  router.bossMotion(actor,.01);actor.brain.time=.4;router.bossMotion(actor,.01);
  assert.equal(cues.filter(x=>x==='slash').length,1);actor.brain.mode='move';router.bossMotion(actor,.5);
  assert.ok(cues.some(x=>/^foot_/.test(x)));assert.ok(!cues.some(x=>x==='goblin_alert'||x==='goblin_step'||x==='goblin_impact'));
});
