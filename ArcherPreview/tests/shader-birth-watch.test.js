import test from 'node:test';
import assert from 'node:assert/strict';
import {createShaderBirthWatch} from '../src/shader-birth-watch.js';

// 2026-11-25 S23 recording: draw submission reached 64-143 ms in single frames (a wolf
// fading, the first mount, raid goblins) and worldUpdateMs reached 226 ms, with nothing
// in the record naming a new shader program or the part of the world update.
test('counts programs born between frames and names them; loading gaps are not births',()=>{
 const effects={a:{name:{vertex:'default',fragment:'default'},defines:'#define TOON'},b:{name:'outline',defines:''}};
 let engine={_compiledEffects:effects},time=100;
 const watch=createShaderBirthWatch(()=>engine,()=>time);
 assert.equal(watch.frame(),0,'the first frame is the baseline');
 assert.equal(watch.frame(),0);assert.deepEqual(watch.recent(),[]);
 effects.c={name:{vertex:'default',fragment:'default'},defines:'#define FADE\n'+'x'.repeat(400)};effects.d={name:'gallop-trail'};time=250.4;
 assert.equal(watch.frame(),2);
 const recent=watch.recent();
 assert.deepEqual(recent.map(entry=>[entry.atMs,entry.shader]),[[250,'default / default'],[250,'gallop-trail']]);
 assert.ok(recent[0].defines.startsWith('#define FADE')&&recent[0].defines.length<=161,'defines are cut short');
 assert.equal(recent[1].defines,null);
 assert.equal(watch.frame(),0,'counted once');
 // A released program leaves; the same key built again is a birth again.
 delete effects.d;assert.equal(watch.frame(),0);
 effects.d={name:'gallop-trail'};assert.equal(watch.frame(),1);
 // Not recording (loading cover): what was built meanwhile is the next baseline.
 watch.pause();effects.e={name:'loading'};effects.f={name:'loading2'};
 assert.equal(watch.frame(),0);effects.g={name:'play'};assert.equal(watch.frame(),1);
 // A new engine (context recovery) is a new baseline; no engine counts nothing.
 engine={_compiledEffects:{z:{name:'z'}}};assert.equal(watch.frame(),0);
 engine=null;assert.equal(watch.frame(),0);
 // Only the latest twelve names are kept, as copies.
 engine={_compiledEffects:{}};watch.frame();
 for(let i=0;i<20;i++)engine._compiledEffects['k'+i]={name:'n'+i};
 assert.equal(watch.frame(),20);assert.equal(watch.recent().length,12);assert.equal(watch.recent().at(-1).shader,'n19');
 watch.recent()[0].shader='changed';assert.notEqual(watch.recent()[0].shader,'changed');
 watch.reset();assert.deepEqual(watch.recent(),[]);
});
