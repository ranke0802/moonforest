// The "drawing the world" veil on the black title (0.3, 2026-11-20, user):
// the prologue's cosmic cut lies under full black and only the light the
// player carries shows it: a lens of it follows the pointer, a left click
// (or a tap) bursts motes of light and lets more of it through for a moment.
// A gold line along the bottom and the note beside it give the progress.
//
// Cost: transforms and opacity only. Pointer moves are coalesced into one
// write per frame and stop with the veil; bursts are Web Animations on a
// fixed pool (no timers, no new elements after creation). The image is the
// prologue's own (cached for the dream that follows).
// Lifetime: owned by the title screen; stop() when the scene is ready,
// dispose() with the title.
import {CURSOR_ART} from './cursors.js';

export const VEIL_ART=new URL('./prologue/00.webp',import.meta.url).href;
export const VEIL=Object.freeze({lens:420,flash:760,bursts:4,motes:14,idleFade:1400});

const el=(doc,tag,className)=>{const node=doc.createElement(tag);if(className)node.className=className;return node;};

// The lens: a round window onto the full-screen picture. The window moves
// with the pointer; the picture inside moves the other way, so it stays put.
function lens(doc,className,size){
 const frame=el(doc,'div',className),art=el(doc,'div','v03-veil-art');
 frame.style.width=frame.style.height=size+'px';art.style.backgroundImage=`url("${VEIL_ART}")`;
 frame.append(art);
 return {frame,place(x,y){const left=x-size/2,top=y-size/2;frame.style.transform=`translate3d(${left}px,${top}px,0)`;art.style.transform=`translate3d(${-left}px,${-top}px,0)`;}};
}

// label(first): the note's words for a first drawing (download) or a later one;
// memory(): the line above it on a first drawing ("a world once drawn stays").
export function createDrawingVeil({doc,mount,label=()=>'',memory=()=>'',left=n=>String(n),random=Math.random,first=true}){
 const view=doc.defaultView;
 const root=el(doc,'div','v03-veil');root.setAttribute('aria-hidden','true');
 try{root.style.cursor=`${CURSOR_ART.arrow} 3 2, auto`;}catch{/* system cursor */}
 const hover=lens(doc,'v03-veil-lens',VEIL.lens);
 const glow=el(doc,'div','v03-veil-glow');
 const bursts=[];
 for(let i=0;i<VEIL.bursts;i++){
  const flash=lens(doc,'v03-veil-flash',VEIL.flash),ring=el(doc,'div','v03-veil-ring'),spark=el(doc,'div','v03-veil-spark'),motes=[];
  for(let k=0;k<VEIL.motes;k++){const mote=el(doc,'i','v03-veil-mote');spark.append(mote);motes.push(mote);}
  root.append(flash.frame,ring,spark);bursts.push({flash,ring,spark,motes,running:[]});
 }
 const bar=el(doc,'div','v03-veil-bar'),fill=el(doc,'i');bar.append(fill);
 const note=el(doc,'p','v03-veil-note'),word=el(doc,'span','v03-veil-word'),pct=el(doc,'b','v03-veil-pct'),rest=el(doc,'span','v03-veil-left');
 note.append(word,pct,rest);
 const remember=el(doc,'p','v03-veil-memory');
 root.insertBefore(glow,root.firstChild);root.insertBefore(hover.frame,glow);
 root.append(bar,remember,note);mount.append(root);
 root.classList.toggle('is-first',!!first);

 let active=false,disposed=false,frame=0,x=0,y=0,seen=false,next=0,lastMove=0,shownPct=-1,shownLeft=-1;
 const reduced=(()=>{try{return view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;}catch{return false;}})();
 function draw(){
  frame=0;if(!active)return;
  hover.place(x,y);glow.style.transform=`translate3d(${x-160}px,${y-160}px,0)`;
  if(!seen){seen=true;root.classList.add('is-lit');}
 }
 function schedule(){if(!frame&&view?.requestAnimationFrame)frame=view.requestAnimationFrame(draw);}
 // A tap lights the spot and fades after a moment (there is no hover on touch).
 let idle=0;
 function settle(touch){
  if(idle){view.clearTimeout(idle);idle=0;}
  root.classList.remove('is-idle');
  if(touch)idle=view?.setTimeout?.(()=>{idle=0;root.classList.add('is-idle');},VEIL.idleFade)??0;
 }
 function burst(px,py){
  const b=bursts[next];next=(next+1)%bursts.length;
  for(const animation of b.running.splice(0))animation.cancel();
  b.flash.place(px,py);
  b.ring.style.transform=`translate3d(${px-60}px,${py-60}px,0)`;b.spark.style.transform=`translate3d(${px}px,${py}px,0)`;
  if(!b.flash.frame.animate)return;
  b.running.push(b.flash.frame.animate([{opacity:0},{opacity:1,offset:.12},{opacity:.55,offset:.45},{opacity:0}],{duration:2200,easing:'ease-out'}));
  b.running.push(b.ring.animate([{opacity:.9,transform:`translate3d(${px-60}px,${py-60}px,0) scale(.2)`},{opacity:0,transform:`translate3d(${px-60}px,${py-60}px,0) scale(4.2)`}],{duration:1100,easing:'cubic-bezier(.15,.7,.3,1)'}));
  if(reduced)return;
  for(const mote of b.motes){
   const angle=random()*Math.PI*2,reach=60+random()*150,dx=Math.cos(angle)*reach,dy=Math.sin(angle)*reach-30*random(),size=.6+random()*.9;
   b.running.push(mote.animate([{opacity:1,transform:`translate3d(0,0,0) scale(${size})`},{opacity:.85,offset:.35},{opacity:0,transform:`translate3d(${dx}px,${dy-40}px,0) scale(${size*.3})`}],{duration:900+random()*900,easing:'cubic-bezier(.1,.6,.3,1)'}));
  }
 }
 const point=event=>{const box=root.getBoundingClientRect?.();return {px:event.clientX-(box?.left??0),py:event.clientY-(box?.top??0)};};
 const onMove=event=>{if(!active||event.pointerType==='touch')return;const p=point(event);x=p.px;y=p.py;lastMove=event.timeStamp;settle(false);schedule();};
 const onDown=event=>{
  if(!active||(event.pointerType!=='touch'&&event.button!==0))return;
  const p=point(event);x=p.px;y=p.py;settle(event.pointerType==='touch');schedule();burst(p.px,p.py);
 };
 const onLeave=event=>{if(event.pointerType!=='touch')root.classList.add('is-idle');};
 return {
  element:root,
  get active(){return active;},
  start(){
   if(disposed||active)return;active=true;root.classList.add('is-active');
   word.textContent=label(first);remember.textContent=memory();
   root.addEventListener('pointermove',onMove,{passive:true});root.addEventListener('pointerdown',onDown,{passive:true});root.addEventListener('pointerleave',onLeave,{passive:true});
  },
  // ratio 0..1, remaining: things still being prepared. Written only on change.
  // remaining may also be ready text (the megabytes still to download).
  setProgress(ratio,remaining){
   const value=Math.max(0,Math.min(100,Math.floor((Number(ratio)||0)*100)));
   const count=typeof remaining==='string'?remaining:Math.max(0,Math.round(Number(remaining)||0));
   if(value!==shownPct){shownPct=value;pct.textContent=value+'%';fill.style.transform=`scaleX(${value/100})`;}
   if(count!==shownLeft){shownLeft=count;rest.textContent=typeof count==='string'?count:count>0?left(count):'';}
  },
  // First drawing (nothing kept yet, or a download running) or a later one.
  setFirst(value){value=!!value;if(value===first)return;first=value;root.classList.toggle('is-first',first);word.textContent=label(first);},
  get first(){return first;},
  relabel(){word.textContent=label(first);remember.textContent=memory();if(typeof shownLeft==='number'&&shownLeft>0)rest.textContent=left(shownLeft);},
  stop(){
   if(!active)return;active=false;root.classList.remove('is-active');
   root.removeEventListener('pointermove',onMove);root.removeEventListener('pointerdown',onDown);root.removeEventListener('pointerleave',onLeave);
   if(frame){view?.cancelAnimationFrame?.(frame);frame=0;}if(idle){view.clearTimeout(idle);idle=0;}
  },
  dispose(){
   if(disposed)return;this.stop();disposed=true;
   for(const b of bursts)for(const animation of b.running.splice(0))animation.cancel();
   root.remove();
  },
  inspect:()=>({active,lit:seen,pct:shownPct,left:shownLeft,lastMove}),
 };
}

// Progress of the black title (boot.js feeds it; the veil writes only on
// change). Phases: the download (the loading card's own ratio, up to 50%),
// the world starting (time-eased, no count), the scene's pending models and
// textures (counted against the most seen), then the quiet wait before the
// reveal. Never goes back.
export function createDrawingProgress({quiet=1.2,limit=25,loadEase=4}={}){
 let ratio=0,peak=0,loadTime=0,download=null;
 return {
  // ratio 0..1 of the download; text: what is left, ready to show. null when the card closed.
  download(value,text=''){download=value===null?null:{value:Math.max(0,Math.min(1,Number(value)||0)),text};},
  update({dt=0,ready=false,pending=0,summoning=false,quietTime=0,prepareTime=0}){
   let left=Math.max(0,pending)+(summoning?1:0)+(ready?0:1),value;
   if(download){value=.5*download.value;if(download.text)left=download.text;}
   else if(!ready){loadTime+=dt;value=.5+.15*(1-Math.exp(-loadTime/loadEase));}
   else{
    peak=Math.max(peak,left);
    const done=peak?(peak-left)/peak:1;
    value=.65+.3*done+.05*Math.min(1,quietTime/quiet);
    if(prepareTime>=limit||(!left&&quietTime>=quiet))value=1;
   }
   ratio=Math.max(ratio,Math.min(1,value));
   return {ratio,remaining:left};
  },
  get ratio(){return ratio;},
 };
}
