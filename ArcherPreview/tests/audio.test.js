import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../src/game-audio.js';
import { ActionAudio } from '../src/action-audio.js';
const fakeContext=()=>({state:'running',currentTime:0,destination:{},decoded:0,sources:[],
 createGain(){return {gain:{value:0},connect(){},disconnect(){}};},
 createBufferSource(){const s={playbackRate:{value:1},connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};this.sources.push(s);return s;},
 async decodeAudioData(){this.decoded++;return {duration:.2};},async resume(){this.state='running';},async suspend(){this.state='suspended';},async close(){this.state='closed';}});

test('sound assets load/decode once with bounded concurrency; no repeated fetch per sound',async()=>{
 const ctx=fakeContext();let active=0,peak=0,downloads=0;
 const a=new GameAudio({contextFactory:()=>ctx,manifestUrl:new URL('https://example.test/audio.json'),fetcher:async url=>{
  if(String(url).endsWith('json'))return {ok:true,json:async()=>({sounds:Object.fromEntries(Array.from({length:8},(_,i)=>['cue'+i,'./'+i+'.wav']))})};
  downloads++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};
 }});
 assert.equal(a.play('cue0'),false);assert.equal(downloads,0);
 await a.unlock();await a.loading;await a.unlock();assert.equal(downloads,8);assert.equal(ctx.decoded,8);assert.ok(peak<=3);
 for(let i=0;i<8;i++){ctx.currentTime+=1;assert.equal(a.play('cue0'),true);ctx.sources.at(-1).onended();}
 assert.equal(downloads,8);assert.equal(a.voices.size,0);a.dispose();
});

test('audio bounds voices, prioritizes contacts, drops distant/missing/duplicate sounds, suspends cleanly',async()=>{
 const ctx=fakeContext(),a=new GameAudio({contextFactory:()=>ctx,maxVoices:2});a.context=ctx;a.master=ctx.createGain();
 for(const name of ['foot_0','foot_1','boss_hit','death'])a.buffers.set(name,{});
 assert.ok(a.play('foot_0'));assert.equal(a.play('foot_0'),false);assert.ok(a.play('foot_1'));assert.equal(a.voices.size,2);
 assert.ok(a.play('boss_hit'));assert.ok(ctx.sources[0].stopped);assert.equal(a.voices.size,2);
 ctx.currentTime+=1;assert.equal(a.play('foot_0',{position:{x:100,z:0}}),false);
 a.setSuspended(true);assert.equal(a.voices.size,0);assert.equal(ctx.state,'suspended');assert.equal(a.play('death'),false);
 a.setSuspended(false);assert.equal(ctx.state,'running');assert.ok(a.play('death'));assert.equal(a.inspect().peak,2);
 a.dispose();
});

test('motion cues follow clip crossings at different rates, never repeat during hit-stop or invent impact on a miss',()=>{
 const calls=[],router=new ActionAudio({play:(...v)=>calls.push(v),listener:{}}),position={x:0,z:0};
 const tick=(state,actionId,clipTime,extra={})=>router.player({state,actionId,clipTime,...extra},1/60,{character:'warrior-v2',position,duration:3});
 for(const t of [0,.2,.49,.49,.7,1.1,1.1,2.5])tick('attack',1,t);
 assert.deepEqual(calls.map(c=>c[0]),['slash','slash']);
 tick('slash',2,.5);assert.equal(calls.at(-1)[0],'slash');tick('slash',2,.7,{staggered:true});assert.equal(calls.length,3);
 router.damage(position,20,false);router.damage(position,24,true,'enemy',3,true);
 assert.deepEqual(calls.slice(3).map(c=>c[0]),['boss_hit','land','critical']);
 tick('dodge',3,0);tick('dodge',3,2.5);assert.deepEqual(calls.slice(-2).map(c=>c[0]),['roll','land']);
});

test('archer moving/standing transitions do not retrigger bow draw; canceled actions produce no later swing',()=>{
 const calls=[],r=new ActionAudio({play:n=>calls.push(n),listener:{}}),options={character:'archer',position:{x:0,z:0}};
 r.player({state:'attack',actionId:1,clipTime:.1},.1,options);r.player({state:'moveAttack',actionId:1,clipTime:.2},.1,options);
 assert.deepEqual(calls,['bow_draw']);
 r.reset();options.character='warrior-v2';r.player({state:'judgment',actionId:2,clipTime:.1},.1,options);r.player({state:'idle',actionId:null,clipTime:1},.1,options);
 assert.deepEqual(calls,['bow_draw','charge_ready']);
});
