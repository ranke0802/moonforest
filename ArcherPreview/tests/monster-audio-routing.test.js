import test from 'node:test';
import assert from 'node:assert/strict';
import {ActionAudio} from '../src/action-audio.js';
import {bossMusicContext} from '../src/boss-music.js';
import {CombatMusicGate} from '../src/combat-music-gate.js';

const enemy=(kind='wolf',regularWolfId)=>({kind,regularWolfId,active:true,actor:{position:{x:0,z:0}},territoryState:{enabled:true,engaged:false,phase:'watch'},brain:{hp:100,maxHp:100,serial:1,time:0,mode:'idle',state:'test',durations:{test:1}}});
const battle=enemies=>({active:true,encounters:enemies,playerHp:100,playerMaxHp:100});
function fixture(){const cues=[],modes=[],contexts=[],router=new ActionAudio({play:name=>cues.push(name),setCombat:mode=>modes.push(mode),setBossContext:actors=>contexts.push([...actors])});return {router,cues,modes,contexts};}

test('outer awareness, inner admission, rising and idle observation never start a score',()=>{
 for(const [kind,id]of [['wolf',undefined],['bear',undefined],['wolf','fox'],['wolf','boar']]){
  const f=fixture(),one=enemy(kind,id),b=battle([one]);
  for(const [phase,engaged,mode]of [['ambient',false,'move'],['watch',false,'idle'],['combat',true,'rise'],['combat',true,'idle']]){
   Object.assign(one.territoryState,{phase,engaged});one.brain.mode=mode;f.router.boss(b,.1);assert.equal(f.modes.at(-1).active,false);assert.deepEqual(f.contexts.at(-1),[]);
  }
  one.brain.mode='attack';f.router.boss(b,.1);assert.equal(f.modes.at(-1).active,true);assert.equal(f.modes.at(-1).boss,!id);assert.deepEqual(f.contexts.at(-1),[one]);
  one.brain.mode='idle';f.router.boss(b,4);assert.equal(f.modes.at(-1).active,true,'recovery/observation in an ongoing battle keeps music');
  Object.assign(one.territoryState,{phase:'disengage',engaged:false});f.router.boss(b,3);assert.equal(f.modes.at(-1).active,false);
  Object.assign(one.territoryState,{phase:'watch',engaged:false});f.router.boss(b,.1);assert.equal(f.modes.at(-1).active,false,'reentry cannot reuse the old music latch');
 }
});

test('pursuit and new damage start combat, regular fights do not start a watching boss score',()=>{
 const f=fixture(),fox=enemy('wolf','fox'),alpha=enemy(),b=battle([fox,alpha]);
 f.router.boss(b,.1);fox.territoryState.engaged=true;fox.brain.mode='move';f.router.boss(b,.1);assert.equal(f.modes.at(-1).boss,false);assert.deepEqual(f.contexts.at(-1),[fox]);
 alpha.territoryState.engaged=true;alpha.brain.hp=90;f.router.boss(b,.1);assert.equal(f.modes.at(-1).boss,true);assert.ok(f.contexts.at(-1).includes(alpha));
 f.router.reset();alpha.brain.mode='idle';f.router.boss(b,.1);assert.equal(f.modes.at(-1).boss,false,'old wound alone is not a new fight');
});

test('music latch removes hidden/pool actors and manual idle summons wait for combat',()=>{
 const gate=new CombatMusicGate(),one=enemy();delete one.territoryState;
 assert.deepEqual(gate.update([one]),[]);one.brain.mode='attack';assert.deepEqual(gate.update([one]),[one]);
 gate.update([]);assert.equal(gate.actors.size,0);one.brain.mode='idle';assert.deepEqual(gate.update([one]),[]);
 one.brain.mode='move';gate.update([one]);one.active=false;assert.deepEqual(gate.update([one]),[]);one.active=true;one.brain.mode='idle';assert.deepEqual(gate.update([one]),[]);
 gate.reset();assert.equal(gate.actors.size,0);
});

test('withdrawn creature voices and alpha score are restored to their previous identifiers',()=>{
 for(const [kind,id]of [['bear',undefined],['wolf',undefined],['wolf','gray-wolf'],['wolf','fox'],['wolf','boar']]){
  const f=fixture(),one=enemy(kind,id);f.router.bossMotion(one,.01);one.brain.serial++;one.brain.mode='attack';f.router.bossMotion(one,.01);one.brain.hp=70;f.router.bossMotion(one,.01);one.brain.hp=0;f.router.bossMotion(one,.01);
  for(const suffix of ['attack','hurt','death'])assert.equal(f.cues.filter(name=>name==='bear_'+suffix).length,1);
  assert.ok(!f.cues.some(name=>/^(wolf|fox|boar)_/.test(name)));
 }
 const alpha=enemy();alpha.territoryState.engaged=true;assert.equal(bossMusicContext([alpha]),'boss');
});
