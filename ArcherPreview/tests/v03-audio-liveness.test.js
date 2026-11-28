// 2026-11-28 user (iPhone): "크롬 어플을 껐는데도 계속 배경음이 나오고 아이폰이 뜨거워진다 …
// 이런 폭탄 같은 앱을 제공할 수는 없음". Sound may run only while the page paints.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAudioLiveness,STARVE_MS,WATCH_MS} from '../src/audio-liveness.js';
import {GameAudio,GUARD_HOLD,GUARD_FADE,GUARD_BEAT} from '../src/game-audio.js';
import {createRunTrail} from '../src/v03/run-trail.js';

function stage({hidden=false}={}){
 let time=0,frame=null,watch=null;const log=[],listeners=new Map();
 const doc={hidden,addEventListener:(k,f)=>listeners.set('doc:'+k,f),removeEventListener:k=>listeners.delete('doc:'+k)};
 const view={addEventListener:(k,f)=>listeners.set('view:'+k,f),removeEventListener:k=>listeners.delete('view:'+k)};
 const live=createAudioLiveness({view,doc,now:()=>time,raf:fn=>{frame=fn;return 1;},cancelRaf:()=>{frame=null;},every:(fn,ms)=>{assert.equal(ms,WATCH_MS);watch=fn;return ()=>{watch=null;};},
  onStarve:why=>log.push('starve:'+why),onRevive:()=>log.push('revive'),onBeat:()=>log.push('beat')});
 return {live,log,doc,listeners,paint(ms=16){time+=ms;const fn=frame;frame=null;fn?.();},idle(ms){time+=ms;watch?.();},get hasFrame(){return !!frame;},get watching(){return !!watch;}};
}

test('painted frames beat; no frame for STARVE_MS starves once; the next painted frame revives',()=>{
 const s=stage();
 s.paint();s.paint();assert.deepEqual(s.log,['beat','beat']);
 s.idle(WATCH_MS);s.idle(WATCH_MS);assert.deepEqual(s.log,['beat','beat'],'short gaps are not a starve');
 s.idle(STARVE_MS);assert.equal(s.log.at(-1),'starve:no-frames');assert.equal(s.live.starved,true);
 s.idle(WATCH_MS);s.idle(WATCH_MS);assert.equal(s.log.filter(x=>x.startsWith('starve')).length,1,'starved once');
 s.paint();assert.deepEqual(s.log.slice(-2),['revive','beat']);assert.equal(s.live.starved,false);
 assert.deepEqual({starves:s.live.inspect().starves,revivals:s.live.inspect().revivals},{starves:1,revivals:1});
});

test('hidden, pagehide and freeze starve at once; a frame while still hidden does not revive',()=>{
 const s=stage();s.paint();
 s.doc.hidden=true;s.listeners.get('doc:visibilitychange')();assert.equal(s.log.at(-1),'starve:hidden');
 s.paint();assert.equal(s.live.starved,true,'no revival while hidden');assert.equal(s.log.at(-1),'starve:hidden');
 s.doc.hidden=false;s.paint();assert.deepEqual(s.log.slice(-2),['revive','beat']);
 s.listeners.get('view:pagehide')();assert.equal(s.log.at(-1),'starve:pagehide');s.paint();
 s.listeners.get('doc:freeze')();assert.equal(s.log.at(-1),'starve:freeze');
 // The visibility event never arrived (app put away): the watchdog sees the hidden page.
 const t=stage();t.paint();t.doc.hidden=true;t.idle(WATCH_MS);assert.equal(t.log.at(-1),'starve:hidden');
 s.live.dispose();assert.equal(s.hasFrame,false);assert.equal(s.watching,false);assert.equal(s.listeners.size,0);
});

class Param{constructor(){this.value=1;this.events=[];}cancelScheduledValues(t){this.events.push(['cancel',t]);}setValueAtTime(v,t){this.events.push(['set',v,t]);}linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);}}
class Context extends EventTarget{
 constructor(){super();this.state='suspended';this.currentTime=0;this.sampleRate=32000;this.destination={name:'out'};this.gains=[];this.suspends=0;this.resumes=0;}
 createGain(){const node={gain:new Param(),to:[],connect(target){node.to.push(target);},disconnect(){node.to.length=0;}};this.gains.push(node);return node;}
 createBuffer(c,l,r){return {numberOfChannels:c,length:l,sampleRate:r,duration:l/r};}
 createBufferSource(){return {playbackRate:{value:1},connect(){},disconnect(){},start(){},stop(){}};}
 async decodeAudioData(){return {duration:1,length:32000,numberOfChannels:1};}
 resume(){this.resumes++;this.set('running');return Promise.resolve();}
 suspend(){this.suspends++;this.set('suspended');return Promise.resolve();}
 close(){this.set('closed');return Promise.resolve();}
 set(state){this.state=state;this.dispatchEvent(new Event('statechange'));}
}
function audioStage({guard=true}={}){
 const context=new Context(),session={type:'auto'},events=new EventTarget();
 const audio=new GameAudio({contextFactory:()=>context,audioSession:session,manifestUrl:new URL('https://audio.test/audio.json'),fetcher:async()=>({ok:true,json:async()=>({sounds:{},music:{},ambience:{}}),arrayBuffer:async()=>new ArrayBuffer(4)})});
 if(guard)audio.enableLiveGuard();
 audio.bindUnlock(events);events.dispatchEvent(new Event('click'));
 return {audio,context,session};
}

test('the output goes through a guard whose fade-out is always scheduled a few seconds ahead',async()=>{
 const {audio,context}=audioStage();await audio.loading;
 const guard=audio.guard;assert.ok(guard);assert.deepEqual(audio.master.to,[guard]);assert.deepEqual(guard.to,[context.destination]);
 assert.equal(context.state,'running');
 guard.gain.events.length=0;context.currentTime=10;audio.beat();
 assert.deepEqual(guard.gain.events,[['cancel',10],['set',1,10],['set',1,10+GUARD_HOLD],['ramp',0,10+GUARD_HOLD+GUARD_FADE]]);
 // Beats are written to the audio clock at most every GUARD_BEAT seconds (frames call it freely).
 context.currentTime=10+GUARD_BEAT/2;audio.beat();assert.equal(guard.gain.events.length,4);
 context.currentTime=10+GUARD_BEAT;audio.beat();assert.equal(guard.gain.events.length,8);
 // Not running: nothing is scheduled.
 context.set('interrupted');context.currentTime=20;audio.beat();assert.equal(guard.gain.events.length,8);
 audio.dispose();
});

test('without the guard (0.2) the graph and beat are as before',async()=>{
 const {audio,context}=audioStage({guard:false});await audio.loading;
 assert.equal(audio.guard,null);assert.deepEqual(audio.master.to,[context.destination]);audio.beat();audio.dispose();
});

test('starved: the context is suspended and the playback session handed back, whatever the game asked; revived: both return',async()=>{
 const {audio,context,session}=audioStage();await audio.loading;
 assert.equal(session.type,'playback');assert.equal(context.state,'running');
 audio.setStarved(true);assert.equal(context.state,'suspended');assert.equal(session.type,'auto');assert.equal(audio.suspended,true);
 audio.setSuspended(false);assert.equal(context.state,'suspended','the game cannot resume a page that is not painting');
 audio.setStarved(false);await Promise.resolve();assert.equal(context.state,'running');assert.equal(session.type,'playback');
 // The game's own pause survives a starve and revival.
 audio.setSuspended(true);audio.setStarved(true);audio.setStarved(false);assert.equal(context.state,'suspended');assert.equal(audio.suspended,true);
 audio.dispose();
});

test('main.js wires it for 0.3 only, with the dot-sound context; the trail keeps a snapshot every few seconds',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/if\(versionRoute\.edition&&!world\.audioLiveness\)\{audio\.enableLiveGuard\(\);world\.audioLiveness=createAudioLiveness\(\{onStarve:\(\)=>\{audio\.setStarved\(true\);suspendTextBlip\(\);\},onRevive:\(\)=>audio\.setStarved\(false\),onBeat:\(\)=>audio\.beat\(\)\}\);\}/);
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};let time=1000;
 const trail=createRunTrail({storage,now:()=>time});trail.mark('play');
 time=6000;trail.vitals({map:'village',level:5,lost:1,restored:1,gapMs:40});
 const next=createRunTrail({storage,now:()=>9000});
 assert.deepEqual(next.previous.vitals,{map:'village',level:5,lost:1,restored:1,gapMs:40});
 assert.equal(next.previous.beatAt,6000);assert.equal(next.previous.stage,'play');assert.equal(next.previous.ended,false);
});

test('the dot-sound context is suspended with it and wakes with the next line',async()=>{
 const {createTextBlip,suspendTextBlip,resetTextBlip}=await import('../src/v03/text-blip.js');
 resetTextBlip();let ctx=null;
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}),node=()=>({connect(){},disconnect(){},gain:param()});
 const factory=()=>ctx={state:'running',currentTime:0,destination:{},createGain:node,suspends:0,resumes:0,
  createOscillator(){return {...node(),type:'',frequency:param(),detune:param(),start(){},stop(){}};},
  suspend(){ctx.suspends++;ctx.state='suspended';return Promise.resolve();},resume(){ctx.resumes++;ctx.state='running';return Promise.resolve();}};
 const blip=createTextBlip({view:{},contextFactory:factory,isEnabled:()=>true});
 assert.equal(blip.play('제프리'),true);
 suspendTextBlip();assert.equal(ctx.state,'suspended');suspendTextBlip();assert.equal(ctx.suspends,1,'only a running context is suspended');
 blip.prime();assert.equal(ctx.state,'running');
 resetTextBlip();
});
