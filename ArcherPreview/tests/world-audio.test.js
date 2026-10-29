import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GameAudio} from '../src/game-audio.js';
import {ActionAudio} from '../src/action-audio.js';

function fixture({defer,fail}={}){
 const requests=[],ctx={state:'running',currentTime:0,destination:{},sources:[],decoded:0,
  createGain(){return {gain:{value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}},connect(){},disconnect(){}};},
  createBufferSource(){const s={playbackRate:{value:1},connect(){},disconnect(){},start(){},stop(when=0){this.stopAt=when;if(when<=ctx.currentTime)this.onended?.();}};this.sources.push(s);return s;},
  async decodeAudioData(bytes){this.decoded++;const seconds=bytes.byteLength===90?90:bytes.byteLength===18?18:72,numberOfChannels=seconds===18?1:2;return {length:seconds*32000,duration:seconds,numberOfChannels};},
  async resume(){this.state='running';},async suspend(){this.state='suspended';},async close(){this.state='closed';},
  advance(t=2){this.currentTime+=t;for(const s of this.sources)if(s.stopAt<=this.currentTime)s.onended?.();},
 };
 const manifest={sounds:{one:'same.wav',two:'same.wav'},music:Object.fromEntries(['village','forest','cave','combat','boss'].map(k=>[k,{url:k+'.mp3',volume:.25}])),ambience:Object.fromEntries(['village','forest','cave'].map(k=>['ambience_'+k,{url:'ambience_'+k+'.mp3',volume:.12}]))};
 let inFlight=0,peak=0;
 const a=new GameAudio({contextFactory:()=>ctx,manifestUrl:new URL('https://test.invalid/audio.json'),fetcher:async url=>{
  const name=new URL(url).pathname.slice(1);if(name==='audio.json')return {ok:true,json:async()=>manifest};
  requests.push(name);inFlight++;peak=Math.max(peak,inFlight);try{await defer?.(name);if(fail?.(name))throw new Error('offline');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(name.startsWith('ambience')?18:name==='boss.mp3'?90:72)};}finally{inFlight--;}
 }});
 return {a,ctx,requests,peak:()=>peak};
}
async function settle(a){for(let i=0;i<20;i++){if(a.beds.pending)await a.beds.pending;else{await Promise.resolve();if(!a.beds.pending)return;}}throw new Error('audio did not settle');}

test('only selected map downloads; combat/boss priority, region return, pause and no per-frame restart',async()=>{
 const {a,ctx,requests}=fixture();a.setEnvironment('warrior-v3');assert.equal(requests.length,0);
 await a.unlock();await a.loading;await settle(a);
 assert.deepEqual(requests,['same.wav','village.mp3','ambience_village.mp3']);assert.equal(a.buffers.get('one'),a.buffers.get('two'));
 assert.equal(a.inspect().context,'village');assert.equal(a.inspect().ambience,'ambience_village');
 const ambient=a.beds.current.ambience.source;
 a.setCombat({active:true});await settle(a);assert.equal(a.inspect().context,'combat');assert.equal(a.beds.current.ambience.source,ambient);
 a.setCombat({active:true,boss:true});await settle(a);assert.equal(a.inspect().context,'boss');const score=a.music.source;
 for(let i=0;i<300;i++)a.setCombat({active:true,boss:true});assert.equal(a.music.source,score);
 a.setSuspended(true);assert.equal(a.inspect().music,'paused');a.setSuspended(false);await settle(a);assert.equal(a.music.source,score);
 a.setCombat({active:true,boss:false});await settle(a);assert.equal(a.inspect().context,'combat');
 a.setCombat({active:false});await settle(a);ctx.advance();assert.equal(a.inspect().context,'village');
 a.setCombat({alive:false});ctx.advance();assert.equal(a.inspect().music,'stopped');a.dispose();assert.equal(a.beds.cache.size,0);
});

test('repeated village/forest/cave trips keep bounded buffers and fade voices; scores decode one at a time',async()=>{
 const {a,ctx,requests,peak}=fixture();await a.unlock();await a.loading;
 for(let i=0;i<12;i++)for(const map of ['warrior-v3','warrior-v4','warrior-v5']){
  a.stopAll();a.setEnvironment(map);await settle(a);ctx.advance();
  assert.ok(a.beds.cache.size<=4);assert.ok(a.inspect().decodedBedBytes<=48*1024*1024);assert.ok(a.beds.voices.size<=2);
 }
 const before=requests.length;a.setEnvironment('warrior-v4');await settle(a);ctx.advance();a.setEnvironment('warrior-v5');await settle(a);ctx.advance();
 assert.equal(requests.length,before,'two most recent regions reuse decoded buffers');assert.ok(peak()<=1);
 a.setCombat({active:true,boss:true});await settle(a);a.setCombat({active:true});await settle(a);a.setEnvironment('warrior-v3');await settle(a);
 assert.ok(a.beds.voices.size<=4);assert.ok(a.inspect().decodedBedBytes<=48*1024*1024);
 a.dispose();assert.equal(a.beds.voices.size,0);assert.equal(a.beds.cache.size,0);
});

test('rapid map changes ignore obsolete decode and never download an already superseded middle map',async()=>{
 let release;const {a,ctx,requests}=fixture({defer:n=>n==='village.mp3'?new Promise(r=>release=r):null});
 await a.unlock();await a.loading;a.setEnvironment('warrior-v3');a.setEnvironment('warrior-v4');a.setEnvironment('warrior-v5');release();await settle(a);
 assert.equal(a.inspect().context,'cave');assert.equal(a.inspect().ambience,'ambience_cave');assert.ok(!requests.includes('forest.mp3'));
 assert.ok(!ctx.sources.some(s=>s.buffer?.duration===72&&s!==a.music.source));a.dispose();
});

test('failed score is not retried each frame and cannot mute successfully loaded effects',async()=>{
 const {a,requests}=fixture({fail:n=>n==='forest.mp3'});await a.unlock();await a.loading;a.setEnvironment('warrior-v4');await settle(a);
 for(let i=0;i<100;i++){a.syncMusic();a.setCombat({active:false});}await settle(a);
 assert.equal(requests.filter(n=>n==='forest.mp3').length,1);assert.equal(a.failed,1);assert.ok(a.play('one'));a.dispose();
});

test('dispose during pending decode prevents resurrection or additional ambience downloads',async()=>{
 let release;const {a,requests}=fixture({defer:n=>n==='village.mp3'?new Promise(r=>release=r):null});
 await a.unlock();await a.loading;a.setEnvironment('warrior-v3');a.dispose();release();await settle(a);
 assert.equal(a.beds.cache.size,0);assert.equal(a.beds.voices.size,0);assert.ok(!requests.includes('ambience_village.mp3'));
});

test('combat router uses actual enemy/health transitions and gives victory music time before map return',()=>{
 const calls=[],modes=[],audio={play:n=>calls.push(n),setCombat:v=>modes.push(v)},router=new ActionAudio(audio);
 const enemy={active:true,kind:'goblin',actor:{position:{x:1,z:0}},brain:{hp:100,serial:1,mode:'move',state:'walk',durations:{walk:1},time:0}};
 const battle={active:true,encounters:[enemy],playerHp:100,playerMaxHp:500};
 router.boss(battle,.01);router.boss(battle,.01);assert.equal(calls.filter(n=>n==='low_health').length,1);assert.equal(modes.at(-1).boss,false);
 enemy.brain.hp=70;router.boss(battle,.01);router.boss(battle,.01);assert.equal(calls.filter(n=>n==='goblin_hurt').length,1);
 enemy.brain.hp=0;router.boss(battle,.01);router.boss(battle,.01);assert.equal(calls.filter(n=>n==='goblin_death').length,1);assert.equal(calls.filter(n=>n==='victory').length,1);
 assert.equal(modes.at(-1).active,true);router.boss(battle,3);assert.equal(modes.at(-1).active,false);
 battle.playerHp=0;router.boss(battle,.01);assert.equal(modes.at(-1).alive,false);
});

test('packed audio references are hashed, licensed and finite; original sound references remain unchanged',async()=>{
 const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(await readFile(new URL('audio.json',base))),edits=JSON.parse(await readFile(new URL('../../Assets/Resources/Audio/World/mix-report.json',import.meta.url))),sources=JSON.parse(await readFile(new URL('../scripts/world-audio-sources.json',import.meta.url)));
 const original=JSON.parse(await readFile(new URL('fixtures/audio-original-v2.json',import.meta.url)));
 for(const [key,value]of Object.entries(original.sounds))assert.deepEqual(manifest.sounds[key],value);
 assert.deepEqual(manifest.music.boss,original.boss);
 assert.equal(Object.keys(manifest.sounds).length,51);assert.equal(Object.keys(manifest.music).length,5);assert.equal(Object.keys(manifest.ambience).length,3);
 assert.equal(new Set(manifest.resources).size,manifest.resources.length);
 for(const url of manifest.resources){const data=await readFile(new URL(url,base));assert.equal(createHash('sha256').update(data).digest('hex'),url.split('/').at(-1).split('.')[0]);}
 for(const [key,edit]of Object.entries(edits)){
  assert.ok(edit.peak>0&&edit.peak<.99&&edit.rms>0&&edit.seconds>0);
  assert.ok(edit.sources.every(s=>sources[s]?.url&&sources[s]?.license));
  const value=manifest[edit.group][key],url=typeof value==='string'?value:value.url;
  assert.equal(url.split('/').at(-1).split('.')[0],edit.sha256);
 }
});
