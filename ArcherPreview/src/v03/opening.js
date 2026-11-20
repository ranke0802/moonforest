// Prologue: the dream. It opens on the cosmic cut (00, 'the table of fate'):
// tight on the warrior in the square, then drawing back and up to the vast
// figure with fork and cloche over the village. The cloche's shadow sweeps
// down into five painted memories, each drifting into view under a dark veil.
// After "Find that child." the cosmic cut stabs back for a heartbeat, rushes
// at the fork, whites out, and the warrior wakes: the black lids open on the
// live scene (about 36 seconds, skippable).
// The interface (play → Promise, release, cover, cancel) is unchanged.
import {t} from './i18n.js';
import {createTypewriter,typingMs,typewriterEnabled} from './typewriter.js';
import {createTextBlip} from './text-blip.js';
const art=name=>new URL(`./prologue/${name}.webp`,import.meta.url).href;
// 00 is no longer the loading cover: its first sight is the dream's entrance.
export const PROLOGUE_COVER=art('00');
export const INTRO=Object.freeze({image:PROLOGUE_COVER,seconds:8.6,lines:[{key:'opening.intro.0',at:.9,until:4.0},{key:'opening.intro.1',at:4.6,until:8.2}]});
export const WAKE_SECONDS=1.3;
export const FADE_SECONDS=1.4;
export const DREAM_BEATS=Object.freeze([
 {seconds:3.6,tone:'warm',key:'opening.0',image:art('01'),drift:'in-left'},
 {seconds:3.6,tone:'day',key:'opening.1',image:art('02'),drift:'in-up'},
 {seconds:3.4,tone:'alarm',key:'opening.2',image:art('03'),drift:'rush'},
 {seconds:3.4,tone:'void',key:'opening.3',image:art('04'),drift:'down'},
 {seconds:3.4,tone:'voice',key:'opening.4',image:art('05'),drift:'breathe'},
]);
// Real running time: opening pause + every caption's hold and fade-out.
export const dreamSeconds=()=>.5+INTRO.seconds+FADE_SECONDS+DREAM_BEATS.reduce((sum,beat)=>sum+beat.seconds+FADE_SECONDS,0)+WAKE_SECONDS;
// Fetches and decodes the paintings early (from the logo on) so the dream
// starts without waiting; the browser cache keeps them for later visits.
let warmed=null;
export function warmPrologueArt(view=globalThis){
 if(warmed)return warmed;
 const Img=view?.Image;if(!Img)return warmed=[];
 warmed=[PROLOGUE_COVER,...DREAM_BEATS.map(beat=>beat.image)].map(url=>{const img=new Img();img.decoding='async';img.src=url;img.decode?.().catch(()=>{});return img;});
 return warmed;
}
const MOTES=14;
// Captions: 60 ms a character (talk is 25), starting once the line is up.
export const TYPE_PACE=2.4,TYPE_DELAY_MS=450;
// Captions type out (typewriter.js). A caption's hold starts only once it is
// fully shown; a tap, click, Enter or Space on the dream shows it at once.
export function createOpening({doc,mount=doc.body,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),blip=createTextBlip({view:doc.defaultView??globalThis}),typewriter=createTypewriter({doc,onChar:(ch,count,who)=>blip?.onChar(ch,count,who)}),typing=()=>typewriterEnabled(doc.defaultView??globalThis)}){
 const layer=doc.createElement('section');layer.className='v03-opening';layer.hidden=true;layer.dataset.v03Layer='opening';layer.setAttribute('aria-live','polite');
 // Two picture planes cross-fade; each holds a sharp painting and a blurred
 // copy screened over it (the dream haze).
 const planes=[0,1].map(()=>{
  const plane=doc.createElement('div');plane.className='v03-opening-plane';
  const sharp=doc.createElement('div');sharp.className='v03-opening-art';
  const haze=doc.createElement('div');haze.className='v03-opening-haze';
  plane.append(sharp,haze);return {plane,sharp,haze};
 });
 const veil=doc.createElement('div');veil.className='v03-opening-veil';
 const motes=doc.createElement('div');motes.className='v03-opening-motes';
 for(let i=0;i<MOTES;i++){const mote=doc.createElement('i');mote.style.setProperty('--x',`${(i*61)%100}%`);mote.style.setProperty('--d',`${7+(i*37)%9}s`);mote.style.setProperty('--delay',`${-((i*53)%11)}s`);mote.style.setProperty('--s',`${2+(i*29)%4}px`);motes.append(mote);}
 const glow=doc.createElement('div');glow.className='v03-opening-glow';
 const line=doc.createElement('p');line.className='v03-opening-line';line.setAttribute('aria-hidden','true');
 const said=doc.createElement('span');said.className='v03-sr-only';
 const skip=doc.createElement('button');skip.type='button';skip.className='v03-opening-skip';
 // Dream frame (blurred, doubled rim), the cloche's shadow, the wake flash and the lids.
 const rim=doc.createElement('div');rim.className='v03-opening-rim';
 const shade=doc.createElement('div');shade.className='v03-opening-shade';
 const flash=doc.createElement('div');flash.className='v03-opening-flash';
 const lids=[0,1].map(i=>{const lid=doc.createElement('div');lid.className='v03-opening-lid '+(i?'is-low':'is-high');return lid;});
 // Out-of-focus world behind the opening lids (a backdrop blur inside this
 // layer: filtering the game canvas itself let it paint over the lids).
 const focus=doc.createElement('div');focus.className='v03-opening-focus';
 layer.append(...planes.map(p=>p.plane),rim,veil,motes,glow,shade,line,said,flash,focus,...lids,skip);mount.append(layer);
 let run=0,front=0;
 // How long a caption takes to type (0 when typing is off): the paintings
 // hold that much longer so a caption never outlives its picture.
 // The caption's line fades in first (v03.css, 0.5 s), then types at a
 // reading pace (2026-11-20, user: the first row was already there when the
 // line became visible and the second rattled out).
 const typeMs=key=>key&&typing()?TYPE_DELAY_MS+typingMs(t(key),TYPE_PACE):0;
 const hurry=event=>{if(layer.hidden||skip.contains(event.target))return;if(event.type==='keydown'&&event.code!=='Enter'&&event.code!=='Space')return;typewriter.complete();};
 layer.addEventListener('click',hurry);
 const show=beat=>{
  const next=planes[front=1-front],prev=planes[1-front];
  for(const el of [next.sharp,next.haze])el.style.backgroundImage=`url("${beat.image}")`;
  next.plane.dataset.drift=beat.drift;next.plane.style.setProperty('--hold',`${beat.seconds+FADE_SECONDS*2}s`);
  next.plane.classList.remove('is-in');void next.plane.offsetWidth;next.plane.classList.add('is-in');prev.plane.classList.remove('is-in');
 };
 const clear=()=>{for(const p of planes)p.plane.classList.remove('is-in');};
 return {
  element:layer,
  get active(){return !layer.hidden;},
  // Resolves 'done' or 'skipped'. The layer stays black until release().
  async play(){
   const id=++run;let skipped=false;const onSkip=()=>{skipped=true;typewriter.stop();};
   skip.addEventListener('click',onSkip);doc.addEventListener('keydown',hurry);
   skip.textContent=t('opening.skip');layer.hidden=false;layer.classList.remove('is-releasing','is-flash','is-white','is-shading');delete layer.dataset.woke;line.textContent='';said.textContent='';
   const hold=async ms=>{for(let left=ms;left>0&&!skipped&&id===run;left-=100)await wait(Math.min(100,left));};
   // Types the caption; resolves when it is fully shown (or skipped).
   const caption=key=>{const text=key?t(key):'';said.textContent=text;const typed=typewriter.start(line,text,{who:null,pace:TYPE_PACE,delay:key?TYPE_DELAY_MS:0});line.classList.remove('is-in');if(key){void line.offsetWidth;line.classList.add('is-in');}return typed;};
   try{
    await wait(500);
    // 1. The entrance: the table of fate, revealed from the warrior upward.
    if(!skipped&&id===run){
     layer.dataset.tone='cosmic';layer.dataset.dream='1';show({image:INTRO.image,drift:'reveal',seconds:INTRO.seconds-FADE_SECONDS*2+INTRO.lines.reduce((sum,row)=>sum+typeMs(row.key),0)/1000});
     let clock=0;
     for(const row of INTRO.lines){await hold((row.at-clock)*1000);if(skipped||id!==run)break;await caption(row.key);await hold((row.until-row.at)*1000);line.classList.remove('is-in');clock=row.until;}
     await hold((INTRO.seconds-clock)*1000);
     // The cloche's shadow falls over the village, into the memories.
     if(!skipped&&id===run){layer.classList.add('is-shading');await hold(FADE_SECONDS*1000);}
    }
    for(const beat of DREAM_BEATS){
     if(skipped||id!==run)break;
     layer.dataset.tone=beat.tone;show({...beat,seconds:beat.seconds+typeMs(beat.key)/1000});layer.classList.remove('is-shading');
     await caption(beat.key);
     // Poll in short steps so a skip never waits for a whole caption.
     for(let left=beat.seconds*1000;left>0&&!skipped&&id===run;left-=100)await wait(Math.min(100,left));
     line.classList.remove('is-in');
     for(let left=FADE_SECONDS*1000;left>0&&!skipped&&id===run;left-=100)await wait(Math.min(100,left));
    }
    // 2. The wake: the table stabs back, rushes at the fork, whites out.
    if(!skipped&&id===run){
     layer.dataset.tone='wake';show({image:INTRO.image,drift:'fork',seconds:1});
     await hold(450);layer.classList.add('is-flash');await hold(380);
     clear();layer.classList.add('is-white');await hold(WAKE_SECONDS*1000-830);
     // The white stays up: release() dissolves it into the scene.
     if(!skipped)layer.dataset.woke='1';
    }
   }finally{
    typewriter.stop();skip.removeEventListener('click',onSkip);doc.removeEventListener('keydown',hurry);line.textContent='';said.textContent='';line.classList.remove('is-in');
    // 2026-11-20 (user: no black between the dream and the wagon): what the
    // dream showed last stays up, the white of the wake or, when skipped, the
    // painting of that moment, and release() dissolves it into the scene.
    // A cancelled dream (another one started) clears as before.
    // The cloche's shadow never stays: it would fall over the picture while it dissolves (seen 2026-11-20 on a skip).
    layer.classList.remove('is-shading');
    if(id!==run){delete layer.dataset.tone;delete layer.dataset.dream;layer.classList.remove('is-flash','is-white');clear();}
   }
   if(skipped&&id===run)layer.dataset.woke='1';
   return skipped?'skipped':'done';
  },
  // True while the opaque black stage fully hides the 3D scene (not while it
  // fades or opens like eyelids onto the world).
  get covering(){return !layer.hidden&&!layer.classList.contains('is-releasing')&&!layer.classList.contains('is-waking')&&layer.dataset.woke!=='1';},
  // Fades the stage away to reveal the game.
  async release(){
   if(layer.hidden)return;
   // One cross-fade for every case (v03.css: 1.3 s after the dream, 0.85 s
   // for a plain cover). Before 2026-11-20 the dream ended on black that
   // dimmed and brightened like eyes opening.
   layer.classList.add('is-releasing');await wait(layer.dataset.woke==='1'?1350:900);
   layer.hidden=true;layer.classList.remove('is-releasing','is-flash','is-white','is-shading');delete layer.dataset.woke;delete layer.dataset.tone;delete layer.dataset.dream;clear();
  },
  // Shows the black stage without captions (used to hide a stage swap).
  // art: keep the prologue cover painting up (new game, before the dream).
  cover({art=false}={}){typewriter.stop();layer.classList.remove('is-releasing','is-flash','is-white','is-shading');delete layer.dataset.woke;delete layer.dataset.tone;delete layer.dataset.dream;line.textContent='';said.textContent='';clear();layer.hidden=false;if(art)show({image:PROLOGUE_COVER,drift:'breathe',seconds:30});},
  cancel(){run++;typewriter.stop();clear();layer.hidden=true;},
  dispose(){run++;typewriter.stop();layer.removeEventListener('click',hurry);doc.removeEventListener('keydown',hurry);layer.remove();},
 };
}
