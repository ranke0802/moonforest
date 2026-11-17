// Prologue: the dream. First implementation uses light, colour and captions on
// a black stage (about 17 seconds, skippable). It will be replaced by an
// in-engine cutscene once the cast models are integrated; the interface
// (play → Promise) stays the same.
// Each caption fades in, holds, then fades out fully before the next one.
import {t} from './i18n.js';
export const FADE_SECONDS=1.1;
export const DREAM_BEATS=Object.freeze([
 {seconds:2.7,tone:'warm',key:'opening.0'},
 {seconds:2.7,tone:'day',key:'opening.1'},
 {seconds:2.6,tone:'alarm',key:'opening.2'},
 {seconds:2.6,tone:'void',key:'opening.3'},
 {seconds:3.0,tone:'voice',key:'opening.4'},
]);
// Real running time: opening pause + every caption's hold and fade-out.
export const dreamSeconds=()=>.5+DREAM_BEATS.reduce((sum,beat)=>sum+beat.seconds+FADE_SECONDS,0);
export function createOpening({doc,mount=doc.body,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const layer=doc.createElement('section');layer.className='v03-opening';layer.hidden=true;layer.dataset.v03Layer='opening';layer.setAttribute('aria-live','polite');
 const glow=doc.createElement('div');glow.className='v03-opening-glow';
 const line=doc.createElement('p');line.className='v03-opening-line';
 const skip=doc.createElement('button');skip.type='button';skip.className='v03-opening-skip';
 layer.append(glow,line,skip);mount.append(layer);
 let run=0;
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
     layer.dataset.tone=beat.tone;line.textContent=t(beat.key);line.classList.remove('is-in');void line.offsetWidth;line.classList.add('is-in');
     // Poll in short steps so a skip never waits for a whole caption.
     for(let left=beat.seconds*1000;left>0&&!skipped&&id===run;left-=100)await wait(Math.min(100,left));
     line.classList.remove('is-in');
     for(let left=FADE_SECONDS*1000;left>0&&!skipped&&id===run;left-=100)await wait(Math.min(100,left));
    }
   }finally{skip.removeEventListener('click',onSkip);line.textContent='';delete layer.dataset.tone;}
   return skipped?'skipped':'done';
  },
  // Fades the black stage away to reveal the game.
  async release(){if(layer.hidden)return;layer.classList.add('is-releasing');await wait(900);layer.hidden=true;layer.classList.remove('is-releasing');},
  // Shows the black stage without captions (used to hide a stage swap).
  cover(){layer.classList.remove('is-releasing');line.textContent='';layer.hidden=false;},
  cancel(){run++;layer.hidden=true;},
  dispose(){run++;layer.remove();},
 };
}
