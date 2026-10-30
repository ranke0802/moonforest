import test from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio} from '../src/game-audio.js';

class Context extends EventTarget{
  constructor(state='suspended'){super();this.state=state;this.currentTime=0;this.sampleRate=32000;this.destination={};this.sources=[];this.resumes=0;this.suspends=0;this.closed=0;}
  createGain(){return {connect(){},disconnect(){},gain:{value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}}};}
  createBuffer(channels,length,rate){return {numberOfChannels:channels,length,sampleRate:rate,duration:length/rate};}
  createBufferSource(){const s={playbackRate:{value:1},connect(){},disconnect(){this.disconnected=true;},start(){this.started=true;},stop(){this.stopped=true;this.onended?.();}};this.sources.push(s);return s;}
  async decodeAudioData(){return {duration:1,length:32000,numberOfChannels:1};}
  resume(){this.resumes++;this.setState('running');return Promise.resolve();}
  suspend(){this.suspends++;this.setState('suspended');return Promise.resolve();}
  close(){this.closed++;this.setState('closed');return Promise.resolve();}
  setState(state){this.state=state;this.dispatchEvent(new Event('statechange'));}
}
function fixture({context=new Context(),failBed=false}={}){
  let time=0,fail=failBed;const requests=[],session={type:'auto'},events=new EventTarget();
  const audio=new GameAudio({contextFactory:()=>context,audioSession:session,now:()=>time,manifestUrl:new URL('https://audio.test/audio.json'),fetcher:async url=>{
    const path=new URL(url).pathname;requests.push(path);
    if(path.endsWith('.json'))return {ok:true,json:async()=>({sounds:{hit:'hit.wav'},music:{cave:{url:'cave.mp3',volume:.25}},ambience:{}})};
    if(path.endsWith('.mp3')&&fail)throw new Error('temporary offline');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};
  }});
  audio.bindUnlock(events);audio.setEnvironment('warrior-v5');return {audio,context,events,session,requests,advance:ms=>time+=ms,recover:()=>{fail=false;}};
}
async function settle(audio){await audio.loading;for(let i=0;i<8;i++){await Promise.resolve();if(audio.beds.pending)await audio.beds.pending;}}

test('touch release retries a hung first resume, while sound loading never waits for it',async()=>{
  const f=fixture(),{audio,context,events}=f;let release;
  context.resume=function(){this.resumes++;if(this.resumes===1)return new Promise(r=>release=r);this.setState('running');return Promise.resolve();};
  events.dispatchEvent(new Event('pointerdown'));assert.equal(context.resumes,1);assert.equal(f.requests[0],'/audio.json','fetch starts in the same call, despite pending resume');
  await audio.loading;assert.ok(audio.buffers.has('hit'));assert.equal(audio.music,null);
  events.dispatchEvent(new Event('touchend'));assert.equal(context.resumes,2);await settle(audio);assert.equal(audio.inspect().music,'playing');assert.equal(audio.play('hit'),true);assert.equal(f.session.type,'playback');
  release();await Promise.resolve();const sources=context.sources.length;
  for(let i=0;i<25;i++)events.dispatchEvent(new Event('click'));await settle(audio);assert.equal(context.resumes,2);assert.equal(context.sources.length,sources);audio.dispose();assert.equal(f.session.type,'auto');
});

test('interrupted Safari contexts resume on tap and visibility return without re-decoding or duplicating loops',async()=>{
  const f=fixture(),{audio,context,events}=f;events.dispatchEvent(new Event('click'));await settle(audio);const source=audio.music.source,downloads=f.requests.length;
  context.setState('interrupted');assert.equal(audio.inspect().music,'paused');events.dispatchEvent(new Event('pointerup'));await settle(audio);
  assert.equal(context.state,'running');assert.equal(audio.music.source,source);assert.equal(f.requests.length,downloads);
  audio.setSuspended(true);context.setState('interrupted');audio.setSuspended(false);await settle(audio);assert.equal(context.state,'running');assert.equal(audio.music.source,source);assert.ok(audio.play('hit'));
  audio.dispose();const resumes=context.resumes;events.dispatchEvent(new Event('touchend'));events.dispatchEvent(new Event('keydown'));assert.equal(context.resumes,resumes);assert.equal(context.closed,1);
});

test('a late resume cannot turn audio back on while the app explicitly remains paused',async()=>{
  const {audio,context}=fixture();let release;context.resume=function(){this.resumes++;return new Promise(r=>release=()=>{this.setState('running');r();});};
  const pending=audio.unlock();await audio.loading;audio.setSuspended(true);release();await pending;assert.equal(context.state,'suspended');assert.equal(audio.music,null);assert.equal(audio.play('hit'),false);audio.dispose();
});

test('a loop ended by interruption restarts from its cached buffer when the context runs again',async()=>{
  const {audio,context,events,requests}=fixture();events.dispatchEvent(new Event('touchend'));await settle(audio);const original=audio.music.source,before=requests.length;
  context.setState('interrupted');original.onended();assert.equal(audio.music,null);context.setState('running');await settle(audio);
  assert.notEqual(audio.music.source,original);assert.equal(audio.beds.voices.size,1);assert.equal(requests.length,before);audio.dispose();
});

test('a failed music download retries only after a later gesture and cooldown, not on every frame',async()=>{
  const f=fixture({failBed:true});f.events.dispatchEvent(new Event('click'));await settle(f.audio);assert.equal(f.audio.beds.failed.size,1);assert.equal(f.audio.play('hit'),true);
  for(let i=0;i<100;i++){f.audio.syncMusic();f.events.dispatchEvent(new Event('pointerdown'));}await settle(f.audio);assert.equal(f.requests.filter(r=>r==='/cave.mp3').length,1);
  f.recover();f.advance(5001);f.events.dispatchEvent(new Event('touchend'));await settle(f.audio);assert.equal(f.audio.inspect().music,'playing');assert.equal(f.requests.filter(r=>r==='/cave.mp3').length,2);f.audio.dispose();
});

test('unsupported or read-only Audio Session APIs do not prevent normal audio playback',async()=>{
  const f=fixture();Object.defineProperty(f.session,'type',{get:()=> 'auto',set:()=>{throw new Error('not supported');}});
  f.events.dispatchEvent(new Event('click'));await settle(f.audio);assert.equal(f.audio.inspect().music,'playing');assert.ok(f.audio.play('hit'));f.audio.dispose();
});

test('closing a modal on a touch-generated click resumes within that same gesture and keeps its cached loops',async()=>{
  const {audio,context,events,requests}=fixture();events.dispatchEvent(new Event('touchend'));await settle(audio);const source=audio.music.source,before=requests.length;
  for(let i=0;i<20;i++){
    audio.setSuspended(true);const resumes=context.resumes;
    // Capture-phase unlock runs while the modal is still open. The modal's
    // click handler then restores playback before the same event dispatch ends.
    events.dispatchEvent(new Event('pointerup'));assert.equal(context.resumes,resumes);
    let resumedInsideHandler=false;
    const close=()=>{audio.setSuspended(false);resumedInsideHandler=context.resumes===resumes+1;};
    events.addEventListener('click',close,{once:true});events.dispatchEvent(new Event('click'));
    assert.equal(resumedInsideHandler,true);await settle(audio);assert.equal(audio.music.source,source);assert.equal(audio.beds.voices.size,1);
  }
  assert.equal(requests.length,before);audio.dispose();
});
