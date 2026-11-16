import test from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio} from '../src/game-audio.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<80;i++){if(check())return;await tick();}assert.fail('Expected audio loading boundary');}
function clock(){let now=0,serial=0;const jobs=new Map();return {now:()=>now,setTimeout(fn,ms){jobs.set(++serial,{fn,at:now+ms});return serial;},clearTimeout:id=>jobs.delete(id),advance(ms){now+=ms;for(const [id,job]of [...jobs])if(job.at<=now){jobs.delete(id);job.fn();}},get size(){return jobs.size;}};}
function context(){return {state:'running',currentTime:0,sampleRate:32000,destination:{},sources:[],decoded:0,
 createGain(){return {gain:{value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}},connect(){},disconnect(){}};},
 createBufferSource(){const source={playbackRate:{value:1},connect(){},disconnect(){},start(){},stop(){this.onended?.();}};this.sources.push(source);return source;},
 async decodeAudioData(bytes){this.decoded++;return {length:bytes.byteLength*100,numberOfChannels:1,sampleRate:32000};},
 async resume(){this.state='running';},async suspend(){this.state='suspended';},async close(){this.state='closed';}};}
function fixture(t,{sounds={hit:'hit.wav'},music={},fetchSound,decode}={}){
 const timers=clock(),ctx=context(),requests=[];if(decode)ctx.decodeAudioData=decode;
 const audio=new GameAudio({contextFactory:()=>ctx,now:timers.now,timers,loadTimeoutMs:100,retryDelayMs:5000,manifestUrl:new URL('https://audio-lifetime.test/audio.json'),fetcher:(url,options)=>{
  const path=new URL(url).pathname;requests.push({path,signal:options.signal});
  return path.endsWith('.json')?Promise.resolve({ok:true,json:async()=>({sounds,music})}):fetchSound?.(path,options)??Promise.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});
 }});t.after(()=>audio.dispose());return {audio,ctx,timers,requests};
}

test('a hung effect cannot delay selected music; timeout, gesture retry and late result remain separately owned',async t=>{
 let finishOld,hangRequests=0,oldReads=0;
 const f=fixture(t,{sounds:{hit:'hit.wav',hit_alias:'hit.wav',hang:'hang.wav'},music:{village:{url:'village.mp3'}},fetchSound:path=>{
  if(path==='/hang.wav'&&++hangRequests===1)return new Promise(resolve=>finishOld=resolve);
 }}),{audio,timers,requests}=f;audio.setEnvironment('warrior-v3');await audio.unlock();
 await until(()=>audio.music&&finishOld);assert.equal(audio.beds.ready,true);assert.equal(audio.buffers.has('hit'),true);
 timers.advance(100);await audio.loading;assert.equal(requests.find(r=>r.path==='/hang.wav').signal.aborted,true);assert.equal(audio.inspect().failedSfxSources,1);
 assert.equal(audio.inspect().decodedSfxBuffers,1);assert.equal(audio.inspect().decodedSfxBytes,1600);
 for(let i=0;i<10;i++)audio.unlock();assert.equal(hangRequests,1);
 timers.advance(5001);for(let i=0;i<10;i++)audio.unlock();await audio.sfxLoading;assert.equal(hangRequests,2);const current=audio.buffers.get('hang');assert.ok(current);
 finishOld({ok:true,arrayBuffer:async()=>{oldReads++;return new ArrayBuffer(40);}});await tick();
 assert.equal(oldReads,0);assert.strictEqual(audio.buffers.get('hang'),current);assert.equal(audio.inspect().failedSfxSources,0);assert.equal(timers.size,0);
});

test('timed-out native decode never publishes over a successful retry',async t=>{
 let finishOld,decodes=0;const old={length:999,numberOfChannels:1},current={length:100,numberOfChannels:1};
 const {audio,timers}=fixture(t,{decode:()=>++decodes===1?new Promise(resolve=>finishOld=resolve):Promise.resolve(current)});
 await audio.unlock();await until(()=>!!finishOld);timers.advance(100);await audio.loading;
 assert.equal(audio.buffers.size,0);assert.equal(audio.inspect().pendingSfxDecodes,1);
 timers.advance(5001);audio.unlock();await audio.sfxLoading;assert.strictEqual(audio.buffers.get('hit'),current);
 finishOld(old);await tick();assert.strictEqual(audio.buffers.get('hit'),current);assert.equal(audio.inspect().pendingSfxDecodes,0);assert.equal(timers.size,0);
});

test('bed readiness does not start destination music while map loading explicitly suspends audio',async t=>{
 let finish;const {audio,requests,timers}=fixture(t,{music:{village:{url:'village.mp3'},cave:{url:'cave.mp3'}},fetchSound:path=>path==='/hit.wav'?new Promise(resolve=>finish=resolve):undefined});
 audio.setEnvironment('warrior-v3');audio.unlock();audio.setSuspended(true);audio.setEnvironment('warrior-v5');
 await until(()=>audio.beds.ready&&finish);assert.equal(audio.music,null);assert.ok(!requests.some(r=>r.path.endsWith('.mp3')));
 audio.setSuspended(false);await until(()=>audio.music);assert.equal(audio.music.key,'cave');assert.ok(!requests.some(r=>r.path==='/village.mp3'));
 timers.advance(100);await audio.loading;finish({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});await tick();
});

test('never-settling native decodes stay capped after logical timeout and later retries',async t=>{
 let decodes=0;const finishes=[];const {audio,timers}=fixture(t,{sounds:Object.fromEntries(Array.from({length:7},(_,i)=>['cue'+i,i+'.wav'])),decode:()=>{decodes++;return new Promise(resolve=>finishes.push(resolve));}});
 await audio.unlock();await until(()=>decodes===3);timers.advance(100);await audio.loading;assert.equal(decodes,3);assert.equal(audio.inspect().failedSfxSources,7);
 timers.advance(5001);audio.unlock();await audio.sfxLoading;assert.equal(decodes,3);assert.equal(audio.inspect().pendingSfxDecodes,3);
 audio.dispose();for(const finish of finishes)finish({length:100,numberOfChannels:1});await tick();assert.equal(audio.buffers.size,0);assert.equal(audio.inspect().pendingSfxDecodes,0);assert.equal(timers.size,0);
});

test('dispose aborts effect fetches and native decode waits immediately without late buffer resurrection',async t=>{
 let finishFetch,finishDecode;const {audio,timers,requests}=fixture(t,{sounds:{fetch:'fetch.wav',decode:'decode.wav'},fetchSound:path=>path==='/fetch.wav'?new Promise(resolve=>finishFetch=resolve):undefined,decode:()=>new Promise(resolve=>finishDecode=resolve)});
 await audio.unlock();await until(()=>finishFetch&&finishDecode);const pending=audio.loading;audio.dispose();await pending;
 assert.equal(timers.size,0);assert.ok(requests.filter(r=>r.path.endsWith('.wav')).every(r=>r.signal.aborted));
 finishFetch({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});finishDecode({length:100,numberOfChannels:1});await tick();assert.equal(audio.buffers.size,0);assert.equal(audio.beds.cache.size,0);assert.equal(audio.voices.size,0);
});

test('manifest timeout is retryable and a stale manifest cannot configure a disposed audio owner',async t=>{
 const timers=clock(),ctx=context();let finish,requests=0;const audio=new GameAudio({contextFactory:()=>ctx,timers,loadTimeoutMs:100,manifestUrl:new URL('https://audio-lifetime.test/manifest.json'),fetcher:()=>++requests===1?new Promise(resolve=>finish=resolve):Promise.resolve({ok:true,json:async()=>({sounds:{}})})});t.after(()=>audio.dispose());
 await audio.unlock();timers.advance(100);await audio.loading;assert.equal(audio.loading,null);audio.unlock();await audio.loading;assert.equal(requests,2);assert.equal(audio.beds.ready,true);
 audio.dispose();finish({ok:true,json:async()=>({sounds:{old:'old.wav'}})});await tick();assert.equal(audio.variants.size,0);assert.equal(audio.buffers.size,0);assert.equal(timers.size,0);
});
