// Prologue: the dream. First implementation uses light, colour and captions on
// a black stage (about 17 seconds, skippable). It will be replaced by an
// in-engine cutscene once the cast models are integrated; the interface
// (play → Promise) stays the same.
export const DREAM_BEATS=Object.freeze([
 {seconds:3.2,tone:'warm',text:'상처 입은 손을 내미는 청년.\n내 손끝에서 번진 빛이 상처를 덮는다.'},
 {seconds:3.2,tone:'day',text:'나란히 걷던 마을 길.\n무슨 말을 했는지는 기억나지 않는다. 온기만 남았다.'},
 {seconds:3.0,tone:'alarm',text:'마물의 울음. 멀리서 그가 쓰러진다.\n손을 뻗지만, 닿지 않는다.'},
 {seconds:3.2,tone:'void',text:'어두운 곳에서 올리는 기도.\n응답은 없다.'},
 {seconds:3.4,tone:'voice',text:'“그 아이를 찾아라.”'},
]);
export const dreamSeconds=()=>DREAM_BEATS.reduce((sum,beat)=>sum+beat.seconds,0);
export function createOpening({doc,mount=doc.body,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const layer=doc.createElement('section');layer.className='v03-opening';layer.hidden=true;layer.dataset.v03Layer='opening';layer.setAttribute('aria-live','polite');
 const glow=doc.createElement('div');glow.className='v03-opening-glow';
 const line=doc.createElement('p');line.className='v03-opening-line';
 const skip=doc.createElement('button');skip.type='button';skip.className='v03-opening-skip';skip.textContent='건너뛰기';
 layer.append(glow,line,skip);mount.append(layer);
 let run=0;
 return {
  element:layer,
  get active(){return !layer.hidden;},
  // Resolves 'done' or 'skipped'. The layer stays black until release().
  async play(){
   const id=++run;let skipped=false;const onSkip=()=>{skipped=true;};
   skip.addEventListener('click',onSkip);
   layer.hidden=false;layer.classList.remove('is-releasing');line.textContent='';
   try{
    await wait(500);
    for(const beat of DREAM_BEATS){
     if(skipped||id!==run)break;
     layer.dataset.tone=beat.tone;line.textContent=beat.text;line.classList.remove('is-in');void line.offsetWidth;line.classList.add('is-in');
     // Poll in short steps so a skip never waits for a whole caption.
     for(let left=beat.seconds*1000;left>0&&!skipped&&id===run;left-=100)await wait(Math.min(100,left));
     line.classList.remove('is-in');
     if(!skipped&&id===run)await wait(350);
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
