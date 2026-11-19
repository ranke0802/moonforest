// Text blip (2026-11-19): a tiny synthesized retro "dot" per few typed
// characters. Generated sound needs the user's approval before it ships on,
// so it is OFF unless ?blip=1 or localStorage 'moonforest-0.3-text-blip-v1'
// is '1'. No sound files: one shared AudioContext, created on the first user
// gesture after the blip is enabled, a few oscillators at a time.
// The game has no user SFX volume setting yet, so the level is a fixed low gain.
export const TEXT_BLIP_KEY='moonforest-0.3-text-blip-v1';
export const BLIP_GAIN=.05;
export const BLIP_SECONDS=.03;
const MAX_VOICES=3;
const MIN_GAP=.035;
let enabled=null,shared=null,armedView=null;
const storage=view=>{try{return view?.localStorage??null;}catch{return null;}};
export function textBlipEnabled(view=globalThis){
 if(enabled!==null)return enabled;
 try{const q=new URLSearchParams(view?.location?.search??'').get('blip');if(q==='1')return enabled=true;if(q==='0')return enabled=false;}catch{}
 try{enabled=storage(view)?.getItem(TEXT_BLIP_KEY)==='1';}catch{enabled=false;}
 return enabled;
}
// For a future settings toggle. persist=false changes only this page.
export function setTextBlipEnabled(on,{view=globalThis,persist=true}={}){
 enabled=!!on;
 if(persist)try{storage(view)?.setItem(TEXT_BLIP_KEY,enabled?'1':'0');}catch{}
 if(enabled&&armedView)arm(armedView);
 return enabled;
}
// Test hook: forget the cached switch and the shared context.
export function resetTextBlip(){enabled=null;shared?.context?.close?.().catch?.(()=>{});shared=null;armedView=null;}

// A stable pitch per speaker: hash of the key onto a pentatonic-ish range.
const STEPS=[0,2,4,7,9,12,14];
export function voicePitch(who){
 const key=String(who??'');let h=2166136261;
 for(const ch of key){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0;}
 if(!key)return 330;
 return 392*2**(STEPS[h%STEPS.length]/12)*(h&128?1:.5);
}

function makeShared(contextFactory){
 const context=contextFactory();
 const out=context.createGain();out.gain.value=BLIP_GAIN;out.connect(context.destination);
 return {context,out,voices:0,last:-1};
}
const defaultFactory=view=>()=>{const Ctor=view?.AudioContext??view?.webkitAudioContext??globalThis.AudioContext;return new Ctor({latencyHint:'interactive'});};
// Creates the shared context on the first gesture (browsers keep a context
// made earlier suspended). Listeners go away once it exists.
function arm(view,contextFactory){
 armedView=view;
 if(shared||!view?.addEventListener||view.__v03BlipArmed)return;
 view.__v03BlipArmed=true;
 const kinds=['pointerdown','keydown','touchend'];
 const onGesture=()=>{
  if(!textBlipEnabled(view))return;
  try{shared??=makeShared(contextFactory??defaultFactory(view));shared.context.resume?.().catch?.(()=>{});}catch{shared=null;return;}
  for(const kind of kinds)view.removeEventListener(kind,onGesture,true);delete view.__v03BlipArmed;
 };
 for(const kind of kinds)view.addEventListener(kind,onGesture,{capture:true,passive:true});
}

// every: a blip on the 1st visible character, then every 2 or 3 more.
export function createTextBlip({view=globalThis,contextFactory=null,random=Math.random,isEnabled=()=>textBlipEnabled(view)}={}){
 if(isEnabled())arm(view,contextFactory);else armedView=view;
 let next=1;
 return {
  // Typewriter hook: ch is the newest visible character, count how many
  // visible characters the line has shown so far.
  onChar(ch,count,who){
   if(count===1)next=1;
   if(count<next)return false;
   next=count+2+(random()<.5?0:1);
   if(!isEnabled())return false;
   return this.play(who);
  },
  play(who){
   if(!shared){if(contextFactory&&isEnabled()){try{shared=makeShared(contextFactory);}catch{return false;}}else return false;}
   const {context,out}=shared;
   if(context.state&&context.state!=='running')return false;
   const t=context.currentTime??0;
   if(shared.voices>=MAX_VOICES||t-shared.last<MIN_GAP)return false;
   shared.last=t;shared.voices++;
   const osc=context.createOscillator(),env=context.createGain();
   osc.type=who?'square':'triangle';
   osc.frequency.value=voicePitch(who);
   if(osc.detune)osc.detune.value=(random()-.5)*60;
   const g=env.gain;g.setValueAtTime(0,t);g.linearRampToValueAtTime(1,t+.004);g.exponentialRampToValueAtTime(.001,t+BLIP_SECONDS);
   osc.connect(env);env.connect(out);
   osc.onended=()=>{shared&&shared.voices--;osc.disconnect();env.disconnect();};
   osc.start(t);osc.stop(t+BLIP_SECONDS+.005);
   return true;
  },
 };
}
