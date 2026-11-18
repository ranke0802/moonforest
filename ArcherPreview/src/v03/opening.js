// Prologue: the dream. Five painted memories, each drifting slowly into view
// under a dark veil, dissolving before the next; the caption sits over a
// darkened band so it always reads (about 24 seconds, skippable).
// The interface (play → Promise, release, cover, cancel) is unchanged.
import {t} from './i18n.js';
const art=name=>new URL(`./prologue/${name}.webp`,import.meta.url).href;
// 00 is the cover shown while a new game loads (see v03.css: the loading card).
export const PROLOGUE_COVER=art('00');
export const FADE_SECONDS=1.4;
export const DREAM_BEATS=Object.freeze([
 {seconds:3.6,tone:'warm',key:'opening.0',image:art('01'),drift:'in-left'},
 {seconds:3.6,tone:'day',key:'opening.1',image:art('02'),drift:'in-up'},
 {seconds:3.4,tone:'alarm',key:'opening.2',image:art('03'),drift:'rush'},
 {seconds:3.4,tone:'void',key:'opening.3',image:art('04'),drift:'down'},
 {seconds:3.4,tone:'voice',key:'opening.4',image:art('05'),drift:'breathe'},
]);
// Real running time: opening pause + every caption's hold and fade-out.
export const dreamSeconds=()=>.5+DREAM_BEATS.reduce((sum,beat)=>sum+beat.seconds+FADE_SECONDS,0);
const MOTES=14;
export function createOpening({doc,mount=doc.body,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
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
 const line=doc.createElement('p');line.className='v03-opening-line';
 const skip=doc.createElement('button');skip.type='button';skip.className='v03-opening-skip';
 layer.append(...planes.map(p=>p.plane),veil,motes,glow,line,skip);mount.append(layer);
 let run=0,front=0;
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
   const id=++run;let skipped=false;const onSkip=()=>{skipped=true;};
   skip.addEventListener('click',onSkip);
   skip.textContent=t('opening.skip');layer.hidden=false;layer.classList.remove('is-releasing');line.textContent='';
   try{
    await wait(500);
    for(const beat of DREAM_BEATS){
     if(skipped||id!==run)break;
     layer.dataset.tone=beat.tone;show(beat);
     line.textContent=t(beat.key);line.classList.remove('is-in');void line.offsetWidth;line.classList.add('is-in');
     // Poll in short steps so a skip never waits for a whole caption.
     for(let left=beat.seconds*1000;left>0&&!skipped&&id===run;left-=100)await wait(Math.min(100,left));
     line.classList.remove('is-in');
     for(let left=FADE_SECONDS*1000;left>0&&!skipped&&id===run;left-=100)await wait(Math.min(100,left));
    }
   }finally{skip.removeEventListener('click',onSkip);line.textContent='';delete layer.dataset.tone;clear();}
   return skipped?'skipped':'done';
  },
  // Fades the black stage away to reveal the game.
  async release(){if(layer.hidden)return;layer.classList.add('is-releasing');await wait(900);layer.hidden=true;layer.classList.remove('is-releasing');},
  // Shows the black stage without captions (used to hide a stage swap).
  // art: keep the prologue cover painting up (new game, before the dream).
  cover({art=false}={}){layer.classList.remove('is-releasing');line.textContent='';clear();layer.hidden=false;if(art)show({image:PROLOGUE_COVER,drift:'breathe',seconds:30});},
  cancel(){run++;clear();layer.hidden=true;},
  dispose(){run++;layer.remove();},
 };
}
