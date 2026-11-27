// Text blip (2026-11-19): a tiny synthesized retro "dot" per few typed
// characters. On by default since 2026-11-20 (user approved: "the dot sound
// should play in dialogue"); ?blip=0 or localStorage
// 'moonforest-0.3-text-blip-v1' = '0' turns it off. No sound files: one shared AudioContext, created on the first user
// gesture after the blip is enabled, a few oscillators at a time.
// The game has no user SFX volume setting yet, so the level is a fixed low gain.
export const TEXT_BLIP_KEY='moonforest-0.3-text-blip-v1';
// .05 was inaudible under the music on a laptop (user, 2026-11-19).
export const BLIP_GAIN=.16;
// Duller since 2026-11-19 (user): triangle through a low-pass, an octave
// lower, a slightly longer tail.
export const BLIP_SECONDS=.045;
export const BLIP_LOWPASS_HZ=1100;
const MAX_VOICES=3;
const MIN_GAP=.035;
let enabled=null,shared=null,armedView=null;
const storage=view=>{try{return view?.localStorage??null;}catch{return null;}};
export function textBlipEnabled(view=globalThis){
 if(enabled!==null)return enabled;
 try{const q=new URLSearchParams(view?.location?.search??'').get('blip');if(q==='1')return enabled=true;if(q==='0')return enabled=false;}catch{}
 try{enabled=storage(view)?.getItem(TEXT_BLIP_KEY)!=='0';}catch{enabled=true;}
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
// 0.3 (2026-11-28, user: the dot sounds were all different): every line, the prologue
// captions included, speaks with Jeffrey's voice. voicePitch keeps the per-speaker map;
// set SHARED_VOICE to null to bring the different voices back.
export const SHARED_VOICE='제프리';
export const voiceFor=who=>SHARED_VOICE??who;
const STEPS=[0,2,4,7,9,12,14];
export function voicePitch(who){
 const key=String(who??'');let h=2166136261;
 for(const ch of key){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0;}
 if(!key)return 220;
 return 196*2**(STEPS[h%STEPS.length]/12)*(h&128?1:.75);
}

function makeShared(contextFactory){
 const context=contextFactory();
 const out=context.createGain();out.gain.value=BLIP_GAIN;
 const tone=context.createBiquadFilter?.();
 if(tone){tone.type='lowpass';tone.frequency.value=BLIP_LOWPASS_HZ;tone.Q.value=.7;out.connect(tone);tone.connect(context.destination);}
 else out.connect(context.destination);
 return {context,out,voices:0,last:-1};
}
const defaultFactory=view=>()=>{const Ctor=view?.AudioContext??view?.webkitAudioContext??globalThis.AudioContext;return new Ctor({latencyHint:'interactive'});};
// Creates the shared context on the first gesture (browsers keep a context
// made earlier suspended). Listeners go away once it exists.
// 2026-11-28 (user: the prologue's first caption had no dots): the listeners stay until the
// context really runs. A touch pointerdown is not a user activation, so a context made there
// can stay suspended; before, the listeners went away with that first event, so the touchend
// that could start it was not heard and the context was first resumed by the first blip
// itself (the prologue's first caption), skipping blips until the device ran.
const GESTURES=['pointerdown','pointerup','touchend','click','keydown'];
const running=context=>!context?.state||context.state==='running';
function arm(view,contextFactory){
 armedView=view;
 if(running(shared?.context)&&shared||!view?.addEventListener||view.__v03BlipArmed)return;
 view.__v03BlipArmed=true;
 const disarm=()=>{for(const kind of GESTURES)view.removeEventListener(kind,onGesture,true);delete view.__v03BlipArmed;};
 const onGesture=()=>{
  if(!textBlipEnabled(view))return;
  try{shared??=makeShared(contextFactory??defaultFactory(view));}catch{shared=null;return;}
  const context=shared.context;
  if(running(context)){disarm();return;}
  try{Promise.resolve(context.resume?.()).then(()=>{if(running(context))disarm();},()=>{});}catch{}
 };
 for(const kind of GESTURES)view.addEventListener(kind,onGesture,{capture:true,passive:true});
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
  // Starts (or resumes) the shared context ahead of the first line, so the device is
  // running by the first character (the prologue calls it when the dream starts).
  prime(){
   if(!isEnabled())return false;
   if(!shared){try{shared=makeShared(contextFactory??defaultFactory(armedView??view));}catch{return false;}}
   const context=shared.context;
   if(!running(context)){try{context.resume?.()?.catch?.(()=>{});}catch{}arm(armedView??view,contextFactory);}
   return running(context);
  },
  play(who){
   // The prologue after a new-game reload types before any gesture on the new
   // document: create the context here too (the site's earlier activation
   // usually lets it run; if not it stays suspended until a gesture resumes it).
   if(!shared){if(!isEnabled())return false;try{shared=makeShared(contextFactory??defaultFactory(armedView??view));}catch{return false;}}
   const {context,out}=shared;
   // A context the browser suspended (tab switch, autoplay) is resumed here;
   // this blip is skipped, the next ones play.
   if(!running(context)){context.resume?.()?.catch?.(()=>{});arm(armedView??view,contextFactory);return false;}
   const t=context.currentTime??0;
   if(shared.voices>=MAX_VOICES||t-shared.last<MIN_GAP)return false;
   shared.last=t;shared.voices++;
   const osc=context.createOscillator(),env=context.createGain();
   osc.type='triangle';
   osc.frequency.value=voicePitch(voiceFor(who));
   if(osc.detune)osc.detune.value=(random()-.5)*60;
   const g=env.gain;g.setValueAtTime(0,t);g.linearRampToValueAtTime(1,t+.004);g.exponentialRampToValueAtTime(.001,t+BLIP_SECONDS);
   osc.connect(env);env.connect(out);
   osc.onended=()=>{shared&&shared.voices--;osc.disconnect();env.disconnect();};
   osc.start(t);osc.stop(t+BLIP_SECONDS+.005);
   return true;
  },
 };
}
