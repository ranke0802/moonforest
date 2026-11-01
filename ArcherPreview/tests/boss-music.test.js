import test from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio} from '../src/game-audio.js';
import {ActionAudio} from '../src/action-audio.js';
import {bossMusicContext,ELENA_MUSIC_KEYS} from '../src/boss-music.js';
import {AUDIO_BED_LIMITS} from '../src/audio-beds.js';

const saint=()=>({kind:'elena',phase:1,active:true,engaged:true,actor:{position:{x:0,z:0}},brain:{hp:100,serial:1,time:0,mode:'idle'}});
const witch=()=>({...saint(),phase:2});
const bear=()=>({kind:'bear',active:true,brain:{hp:100}});
function fixture({themes=true,fail,defer,decodeDefer,manifestDefer,definitions={}}={}){
 const requests=[],starts=[],music=Object.fromEntries(['village','forest','cave','combat','boss',...(themes?Object.values(ELENA_MUSIC_KEYS):[])].map(k=>[k,{url:k+'.mp3',volume:.25,...definitions[k]}]));
 let clock=0,decodes=0,peakDecodes=0;
 const context={state:'running',currentTime:0,sampleRate:32000,destination:{},sources:[],
  createGain(){return {gain:{value:0,events:[],cancelScheduledValues(t){this.events.push(['cancel',t]);},setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t]);}},connect(){},disconnect(){}};},
  createBufferSource(){const source={playbackRate:{value:1},connect(){},disconnect(){this.disconnected=true;},start(){starts.push(this.buffer?.tag);},stop(at=0){this.stopAt=at;if(at<=context.currentTime)this.onended?.();}};this.sources.push(source);return source;},
  async decodeAudioData(data){decodes++;peakDecodes=Math.max(decodes,peakDecodes);try{await decodeDefer?.(data.tag);return {tag:data.tag,length:data.decodedBytes?data.decodedBytes/4:32000*30,numberOfChannels:data.decodedBytes?1:2,sampleRate:32000,duration:30};}finally{decodes--;}} ,
  async resume(){this.state='running';},async suspend(){this.state='suspended';},async close(){this.state='closed';},
  advance(seconds=2){this.currentTime+=seconds;clock+=seconds*1000;for(const source of this.sources)if(source.stopAt<=this.currentTime)source.onended?.();}
 };
 const manifest={sounds:{hit:'hit.wav'},music,ambience:Object.fromEntries(['village','forest','cave'].map(k=>['ambience_'+k,{url:'ambience_'+k+'.mp3',volume:.1}]))};
 const audio=new GameAudio({contextFactory:()=>context,manifestUrl:new URL('https://music.test/audio.json'),now:()=>clock,fetcher:async(url,options)=>{
  const name=new URL(url).pathname.slice(1);if(name==='audio.json'){await manifestDefer?.();return {ok:true,json:async()=>manifest};}requests.push(name);await defer?.(name,options);if(fail?.(name))throw Error('offline');return {ok:true,arrayBuffer:async()=>{const data=new ArrayBuffer(4);data.tag=name;data.decodedBytes=definitions[name.replace('.mp3','')]?.actualDecodedBytes;return data;}};
 }});
 return {audio,context,requests,starts,music,peakDecodes:()=>peakDecodes};
}
async function settle(audio){await audio.loading;for(let i=0;i<30;i++){if(audio.beds.pending)await audio.beds.pending;else{await Promise.resolve();if(!audio.beds.pending)return;}}throw Error('audio did not settle');}
async function start(f){f.audio.setEnvironment('warrior-v5');await f.audio.unlock();await settle(f.audio);f.context.advance();}
function combat(audio,enemies){audio.setBossContext(enemies);audio.setCombat({active:true,boss:true,alive:true});}

test('actual engaged living Elena wins deterministically over bears; phase2 wins over phase1 and no actor is retained or changed',()=>{
 const one=saint(),two=witch(),ordinary=bear(),input=[ordinary,one,two];assert.equal(bossMusicContext(input),ELENA_MUSIC_KEYS.mourning);assert.equal(bossMusicContext([...input].reverse()),ELENA_MUSIC_KEYS.mourning);
 assert.equal(bossMusicContext([ordinary,one]),ELENA_MUSIC_KEYS.saint);assert.equal(bossMusicContext([ordinary]),'boss');
 for(const enemy of [{...one,engaged:false},{...two,active:false},{...two,brain:{hp:0}},{...two,reviewMode:true},{kind:'goblin',active:true,brain:{hp:1}}])assert.equal(bossMusicContext([enemy]),null);
 assert.equal(one.phase,1);assert.equal(two.phase,2);assert.equal(input.length,3);
});

test('a manifest with no new themes uses the existing boss file and never invents or downloads a new theme',async()=>{
 const f=fixture({themes:false});await start(f);combat(f.audio,[saint()]);await settle(f.audio);const source=f.audio.music.source;
 for(let i=0;i<100;i++)combat(f.audio,[i%2?witch():saint()]);await settle(f.audio);
 assert.equal(f.audio.inspect().context,'boss');assert.equal(f.audio.music.source,source);assert.equal(f.audio.inspect().bossThemeAvailable,false);assert.equal(f.requests.filter(n=>n==='boss.mp3').length,1);assert.ok(!f.requests.some(n=>n.startsWith('elena_')));f.audio.dispose();
});

test('combat chosen before a delayed manifest reselects its available phase theme and starts only the current score',async()=>{
 let release;const f=fixture({manifestDefer:()=>new Promise(resolve=>release=resolve)});
 f.audio.setEnvironment('warrior-v5');combat(f.audio,[saint()]);assert.equal(f.audio.beds.desired.music,'boss');
 await f.audio.unlock();release();await settle(f.audio);
 assert.equal(f.audio.inspect().context,ELENA_MUSIC_KEYS.saint);assert.equal(f.requests.filter(name=>name==='elena_saint.mp3').length,1);assert.equal(f.requests.includes('boss.mp3'),false);
 const source=f.audio.music.source;for(let i=0;i<100;i++)f.audio.syncMusic();await settle(f.audio);assert.equal(f.audio.music.source,source);f.audio.dispose();
});

test('clearing a failed theme is re-evaluated by music sync and a later modal-close gesture without duplicate starts',async()=>{
 let failing=true;const f=fixture({fail:name=>name==='elena_saint.mp3'&&failing});await start(f);combat(f.audio,[saint()]);await settle(f.audio);assert.equal(f.audio.inspect().context,'boss');
 failing=false;f.context.advance(6);f.audio.beds.retryFailed();f.audio.syncMusic();await settle(f.audio);assert.equal(f.audio.inspect().context,ELENA_MUSIC_KEYS.saint);
 const source=f.audio.music.source,count=f.starts.filter(name=>name==='elena_saint.mp3').length;f.audio.setSuspended(true);f.audio.setSuspended(false);await f.audio.unlock();await settle(f.audio);
 assert.equal(f.audio.music.source,source);assert.equal(f.starts.filter(name=>name==='elena_saint.mp3').length,count);assert.equal(f.requests.filter(name=>name==='elena_saint.mp3').length,2);assert.ok(f.audio.beds.cacheBytes()<=AUDIO_BED_LIMITS.decodedBytes);f.audio.dispose();
});

test('phase1 to phase2 crossfades once, preserves ambience, and stable/multiple bosses do not restart playback',async()=>{
 const f=fixture();await start(f);const ambient=f.audio.beds.current.ambience.source;combat(f.audio,[saint()]);await settle(f.audio);f.context.advance();const first=f.audio.music;
 combat(f.audio,[bear(),witch(),saint()]);await settle(f.audio);const second=f.audio.music;
 assert.equal(first.source.stopAt,f.context.currentTime+1.2);assert.equal(first.source.buffer.tag,'elena_saint.mp3');assert.equal(second.key,'elena_mourning');assert.equal(f.audio.inspect().musicLoaded,true);assert.ok(second.gain.gain.events.some(e=>e[0]==='ramp'&&e[2]===f.context.currentTime+1.2));assert.equal(f.audio.beds.current.ambience.source,ambient);
 const count=f.requests.length;for(let i=0;i<300;i++)combat(f.audio,i%2?[witch(),saint(),bear()]:[bear(),saint(),witch()]);await settle(f.audio);assert.equal(f.audio.music.source,second.source);assert.equal(f.requests.length,count);assert.ok(f.audio.beds.voices.size<=3);assert.equal(f.peakDecodes(),1);
 f.audio.setSuspended(true);f.audio.setSuspended(false);await settle(f.audio);assert.equal(f.audio.music.source,second.source);f.audio.dispose();
});

test('actual ActionAudio victory hold and transformation gap keep the last phase until combat ends; death/restart clear it',async()=>{
 const f=fixture(),router=new ActionAudio(f.audio),enemy=witch(),battle={active:true,encounters:[enemy],playerHp:500,playerMaxHp:500};await start(f);
 f.audio.setBossContext(battle.encounters);router.boss(battle,.01);await settle(f.audio);const score=f.audio.music.source;enemy.brain.hp=0;
 f.audio.setBossContext(battle.encounters);router.boss(battle,.01);await settle(f.audio);assert.equal(f.audio.music.source,score);assert.equal(f.audio.bossTheme,ELENA_MUSIC_KEYS.mourning);
 f.audio.setBossContext([]);router.boss(battle,3);await settle(f.audio);assert.equal(f.audio.inspect().context,'cave');assert.equal(f.audio.bossTheme,null);
 combat(f.audio,[saint()]);await settle(f.audio);f.audio.setCombat({alive:false});f.context.advance();assert.equal(f.audio.inspect().music,'stopped');assert.equal(f.audio.bossTheme,null);for(let i=0;i<10;i++){f.audio.setBossContext([witch()]);f.audio.setCombat({alive:false});assert.equal(f.audio.bossTheme,null);}assert.equal(f.audio.inspect().music,'stopped');
 f.audio.stopAll();f.audio.setEnvironment('warrior-v5');router.reset();await settle(f.audio);assert.equal(f.audio.inspect().context,'cave');combat(f.audio,[saint()]);await settle(f.audio);assert.equal(f.audio.inspect().context,'elena_saint');f.audio.dispose();
});

test('theme failure falls back once to the existing boss score, never mutes effects, and retries only after later gesture/cooldown',async()=>{
 let failing=true;const f=fixture({fail:name=>name==='elena_saint.mp3'&&failing});await start(f);combat(f.audio,[saint()]);await settle(f.audio);
 assert.equal(f.audio.inspect().context,'boss');assert.ok(f.audio.play('hit'));assert.equal(f.requests.filter(n=>n==='elena_saint.mp3').length,1);
 for(let i=0;i<200;i++){combat(f.audio,[saint()]);f.audio.syncMusic();}await settle(f.audio);assert.equal(f.requests.filter(n=>n==='elena_saint.mp3').length,1);
 failing=false;f.context.advance(6);await f.audio.unlock();await settle(f.audio);assert.equal(f.audio.inspect().context,'elena_saint');assert.equal(f.requests.filter(n=>n==='elena_saint.mp3').length,2);f.audio.dispose();
});

test('a superseded phase finishes within the bounded cache but only the latest phase starts',async()=>{
 let release;const f=fixture({defer:name=>name==='elena_saint.mp3'?new Promise(resolve=>release=resolve):null});await start(f);combat(f.audio,[saint()]);combat(f.audio,[witch()]);assert.equal(f.audio.inspect().context,'cave');release();await settle(f.audio);
 assert.equal(f.audio.inspect().context,'elena_mourning');assert.ok(!f.starts.includes('elena_saint.mp3'));assert.ok(f.audio.beds.cache.size<=4);assert.equal(f.peakDecodes(),1);f.audio.dispose();
});

test('map departure during noncancellable decode discards its old generation without late playback/cache resurrection',async()=>{
 let release,decoding;const began=new Promise(resolve=>decoding=resolve),f=fixture({decodeDefer:name=>name==='elena_saint.mp3'?(decoding(),new Promise(resolve=>release=resolve)):null});await start(f);combat(f.audio,[saint()]);await began;
 f.audio.stopAll();f.audio.setEnvironment('warrior-v4');release();await settle(f.audio);
 assert.equal(f.audio.inspect().context,'forest');assert.equal(f.audio.bossTheme,null);assert.ok(!f.starts.includes('elena_saint.mp3'));assert.ok(!f.audio.beds.cache.has('music:elena_saint'));assert.equal(f.peakDecodes(),1);f.audio.dispose();assert.equal(f.audio.beds.voices.size,0);assert.equal(f.audio.beds.cache.size,0);
});

test('12 battles/deaths/map roundtrips keep two scores/two ambience buffers, bounded bytes/voices and no SFX reloading',async()=>{
 const f=fixture();await start(f);
 for(let i=0;i<12;i++){
  combat(f.audio,[saint()]);await settle(f.audio);combat(f.audio,[witch()]);await settle(f.audio);f.context.advance();f.audio.setCombat({alive:false});f.context.advance();
  f.audio.stopAll();f.audio.setEnvironment(i%2?'warrior-v4':'warrior-v3');await settle(f.audio);f.context.advance();f.audio.stopAll();f.audio.setEnvironment('warrior-v5');await settle(f.audio);f.context.advance();
  assert.ok([...f.audio.beds.cache.keys()].filter(k=>k.startsWith('music:')).length<=2);assert.ok([...f.audio.beds.cache.keys()].filter(k=>k.startsWith('ambience:')).length<=2);assert.ok(f.audio.inspect().decodedBedBytes<=AUDIO_BED_LIMITS.decodedBytes);assert.ok(f.audio.beds.voices.size<=2);
 }
 assert.equal(f.requests.filter(n=>n==='hit.wav').length,1);assert.equal(f.peakDecodes(),1);f.audio.dispose();assert.ok(f.context.sources.every(source=>source.buffer===null));
});

test('declared and actual oversized scores cannot exceed the existing decoded budget or replace the audible fallback',async()=>{
 for(const definitions of [{elena_saint:{decodedBytes:64*1024*1024}},{elena_saint:{actualDecodedBytes:64*1024*1024}}]){
  const f=fixture({definitions});await start(f);combat(f.audio,[saint()]);await settle(f.audio);assert.equal(f.audio.inspect().context,'boss');assert.ok(f.audio.inspect().decodedBedBytes<=AUDIO_BED_LIMITS.decodedBytes);assert.ok(!f.audio.beds.cache.has('music:elena_saint'));assert.ok(!f.starts.includes('elena_saint.mp3'));
  if(definitions.elena_saint.decodedBytes)assert.ok(!f.requests.includes('elena_saint.mp3'),'known oversize file is rejected before fetch/decode');f.audio.dispose();
 }
});
