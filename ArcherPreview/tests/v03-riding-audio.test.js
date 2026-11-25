import test from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio} from '../src/game-audio.js';
import {createRidingAudio} from '../src/v03/riding-audio.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);
async function until(check){for(let i=0;i<50;i++){if(check())return;await tick();}assert.fail('audio event did not arrive');}
const names=['call','whinny','snort','gallop'];
const response=name=>({ok:true,arrayBuffer:async()=>Uint8Array.of(names.indexOf(name)).buffer});
function fixture(t,{maxVoices=6,fetchSound,decode}={}){
  const requests=[],sources=[],decoded=[];
  const ctx=Object.assign(new EventTarget(),{
    state:'running',currentTime:0,destination:{},
    createGain(){return {gain:{value:0},connect(node){this.target=node;},disconnect(){this.target=null;}};},
    createBufferSource(){return {playbackRate:{value:1},connect(node){this.target=node;},disconnect(){this.target=null;},
      start(when=0){this.when=when;this.name=this.buffer.name;sources.push(this);},stop(){this.stopped=true;this.onended?.();}};},
    async decodeAudioData(bytes){
      const name=names[new Uint8Array(bytes)[0]];decoded.push(name);
      return decode?.(name)??{name,duration:name==='gallop'?2.42:1};
    },
    async resume(){this.state='running';this.dispatchEvent(new Event('statechange'));},
    async suspend(){this.state='suspended';this.dispatchEvent(new Event('statechange'));},
    async close(){this.state='closed';},
  });
  const audio=new GameAudio({contextFactory:()=>ctx,maxVoices,now:()=>ctx.currentTime*1000,fetcher(url,options){
    const name=new URL(url).pathname.split('/').at(-1).split('.')[0];requests.push({name,signal:options.signal});
    return fetchSound?.(name,options)??Promise.resolve(response(name));
  }});
  audio.makeContext();const riding=createRidingAudio(audio);
  t.after(()=>{riding.dispose();audio.dispose();});
  return {audio,riding,ctx,requests,sources,decoded};
}
const last=(sources,name)=>sources.findLast(source=>source.name===name);

test('GameAudio accounts for lazy horse PCM once and disposal releases only buffers still owned by this rider',async t=>{
  const buffers=new Map(names.map((name,i)=>[name,{name,length:(i+1)*100,numberOfChannels:1}]));
  const {audio,riding,requests,sources}=fixture(t,{decode:name=>buffers.get(name)});
  const base={length:50,numberOfChannels:2};audio.buffers.set('ordinary',base);
  assert.equal(audio.inspect().decodedSfxBytes,400);assert.equal(requests.length,0);
  riding.call();await until(()=>audio.inspect().decodedSfxBuffers===5);
  for(const [name,buffer] of buffers)assert.equal(audio.buffers.get('v03-riding:'+name),buffer);
  assert.equal(last(sources,'call').buffer,buffers.get('call'));
  assert.equal(audio.inspect().decodedSfxBytes,4400);
  riding.stop();assert.equal(audio.inspect().decodedSfxBytes,4400);
  const replacement={length:75,numberOfChannels:1};audio.buffers.set('v03-riding:call',replacement);
  riding.dispose();assert.equal(audio.buffers.get('v03-riding:call'),replacement);
  assert.deepEqual([...audio.buffers.keys()].sort(),['ordinary','v03-riding:call']);
  assert.equal(audio.inspect().decodedSfxBuffers,2);assert.equal(audio.inspect().decodedSfxBytes,700);
});

test('only the first horse action requests audio; call, whinny, idle breath and a single speed-controlled gallop use the shared effects master',async t=>{
  const {audio,riding,ctx,requests,sources,decoded}=fixture(t);
  for(let i=0;i<60;i++){riding.run(2);riding.idle(1/60);}
  assert.equal(requests.length,0);
  riding.call();riding.call();
  await until(()=>decoded.length===4&&last(sources,'call'));
  assert.deepEqual(requests.map(r=>r.name).sort(),[...names].sort());
  const whistle=last(sources,'call');assert.equal(whistle.when,.1);
  assert.equal(whistle.target.target,audio.master);assert.equal(whistle.target.gain.value,1);
  ctx.currentTime=1;riding.arrive();riding.run(5.8,.12);
  const whinny=last(sources,'whinny'),hoof=last(sources,'gallop');
  assert.ok(whinny&&hoof);assert.equal(hoof.loop,true);
  assert.equal(hoof.loopStart,26431/44100);assert.equal(hoof.loopEnd,94485/44100);
  assert.equal(hoof.playbackRate.value,1.15);assert.equal(hoof.target.gain.value,.12);
  for(let i=0;i<600;i++)riding.run(14,.83);
  assert.equal(sources.filter(s=>s.name==='gallop').length,1);near(hoof.playbackRate.value,1.55);assert.equal(hoof.target.gain.value,.83);
  riding.run(0);assert.ok(hoof.stopped);assert.ok(!whinny.stopped);assert.ok(!whistle.stopped);
  riding.idle(8);assert.equal(last(sources,'snort'),undefined);
  riding.idle(1);assert.ok(last(sources,'snort'));
  const breaths=sources.length;riding.idle(.5);assert.equal(sources.length,breaths);
  riding.stop();assert.equal(audio.voices.size,0);assert.ok(sources.every(s=>s.buffer===null));
  riding.run(8);assert.ok(last(sources,'gallop')!==hoof);assert.equal(requests.length,4);assert.equal(decoded.length,4);
  riding.dispose();riding.run(14);assert.equal(audio.voices.size,0);assert.equal(audio.effectStopListeners.size,0);
});

test('title mute, suspend and stopAll cancel in-flight cues; a resumed ride loads just the current action without a whistle',async t=>{
  let hold=true;const finish=[];
  const {audio,riding,ctx,requests,sources}=fixture(t,{fetchSound:name=>hold?new Promise(resolve=>finish.push(()=>resolve(response(name)))):null});
  audio.setSfxMuted(true);riding.call();riding.idle(30);riding.run(14);assert.equal(requests.length,0);
  audio.setSfxMuted(false);riding.call();assert.equal(requests.length,4);
  audio.stopAll();assert.ok(requests.every(r=>r.signal.aborted));
  hold=false;for(const complete of finish)complete();await tick();assert.equal(sources.length,0);
  riding.run(8,.5);await until(()=>last(sources,'gallop'));assert.equal(requests.at(-1).name,'gallop');
  const original=last(sources,'gallop');audio.setSuspended(true);assert.ok(original.stopped);assert.equal(audio.voices.size,0);
  riding.run(14);assert.equal(sources.length,1);audio.setSuspended(false);await tick();
  riding.run(14);assert.equal(sources.length,2);near(last(sources,'gallop').playbackRate.value,1.55);
  audio.setSfxMuted(true);assert.ok(last(sources,'gallop').stopped);assert.equal(ctx.state,'running');
  audio.setSfxMuted(false);riding.arrive();await until(()=>last(sources,'whinny'));
  assert.ok(!last(sources,'call'));assert.equal(requests.length,6);
});

test('native decode after cancellation cannot play, replace current intent, duplicate an in-flight decode or survive disposal',async t=>{
  let resolveFirst,count=0;
  const {audio,riding,requests,sources,decoded}=fixture(t,{decode:name=>{
    if(name==='gallop'&&count++===0)return new Promise(resolve=>resolveFirst=resolve);
  }});
  riding.run(6);await until(()=>resolveFirst);
  audio.stopAll();for(let i=0;i<100;i++)riding.run(14);
  assert.deepEqual(decoded,['gallop']);assert.equal(requests.length,1);assert.equal(sources.length,0);
  resolveFirst({name:'stale'});await tick();assert.equal(sources.length,0);
  riding.run(14,.8);await until(()=>last(sources,'gallop'));assert.ok(!last(sources,'stale'));
  assert.equal(last(sources,'gallop').target.gain.value,.8);assert.equal(audio.sfxDecodeJobs.size,0);
  riding.dispose();assert.equal(audio.audioLifetimes.size,0);assert.equal(audio.voices.size,0);
});

test('a delayed whistle survives its cue time and a WebKit resume without replaying; arrival supersedes a still-loading whistle',async t=>{
  let finishCall;
  const f=fixture(t,{fetchSound:name=>name==='call'?new Promise(resolve=>finishCall=()=>resolve(response(name))):null});
  f.ctx.state='interrupted';f.riding.call();f.ctx.currentTime=.8;finishCall();
  await until(()=>f.audio.audioLifetimes.size===0);
  assert.equal(f.sources.length,0);await f.ctx.resume();
  assert.equal(last(f.sources,'call').when,.8);f.ctx.dispatchEvent(new Event('statechange'));assert.equal(f.sources.length,1);
  let delayed;
  const g=fixture(t,{fetchSound:name=>name==='call'?new Promise(resolve=>delayed=()=>resolve(response(name))):null});
  g.riding.call();g.riding.arrive();await until(()=>last(g.sources,'whinny'));
  delayed();await until(()=>g.audio.audioLifetimes.size===0);assert.ok(!last(g.sources,'call'));
});

test('voice limits and interruptions retain only current cues, tolerate cold decodes and retry admission without frame-by-frame drops',async t=>{
  const {audio,riding,ctx,sources}=fixture(t,{maxVoices:1});
  audio.buffers.set('death',{name:'death'});audio.play('death');
  riding.arrive();await until(()=>audio.dropped===1);
  for(let i=0;i<120;i++)riding.idle(0);assert.equal(audio.dropped,1);
  ctx.currentTime=.3;last(sources,'death').onended();riding.idle(0);
  assert.ok(last(sources,'whinny'));assert.equal(audio.voices.size,1);
  ctx.currentTime=3;audio.play('death');assert.ok(last(sources,'whinny').stopped);
  riding.run(6);await until(()=>audio.dropped===2);
  riding.run(0);last(sources,'death').onended();ctx.currentTime+=1;riding.idle(.1);
  assert.ok(!last(sources,'gallop'));assert.equal(audio.peakVoices,1);
});
