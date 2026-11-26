// The "drawing the world" veil on the black title (0.3, 2026-11-20, user):
// the prologue's cosmic cut lies under full black. Nothing follows the
// pointer (user, 11:11); a left click or a tap bursts motes of light and
// lets the picture through around it for a moment, then it sinks back.
// A gold line along the bottom and the note beside it give the progress.
//
// Cost (reviewed 2026-11-20, this screen is up for the whole download, the
// busiest and fullest moment of a run):
// - transforms and opacity only, on small elements. No will-change, filter,
//   blend mode or mask on anything screen-sized: each of those keeps a
//   screen-sized surface alive (measured after the reveal in the first
//   version: 4 screen-sized pictures and 60 elements held as layers, and the
//   background-position dust animation still running behind the title).
// - the rising dust is separate small dots moved by the compositor, their
//   number set once from the screen's area.
// - the flash window is sized to the screen (a 760 px window on a phone at
//   3x is a 2280 px surface for each of up to four bursts).
// - once the title is revealed the whole veil is taken out of rendering
//   (hidden), so nothing of it animates or is kept behind the title.
// The image is the prologue's own (cached for the dream that follows).
// Lifetime: owned by the title screen; stop() when the scene is ready,
// dispose() with the title.
import {CURSOR_ART} from './cursors.js';
import {reducedMotion} from './accessibility.js';
import {phaseShare} from '../phase-share.js';

export const VEIL_ART=new URL('./prologue/00.webp',import.meta.url).href;
export const VEIL=Object.freeze({flash:760,flashMin:260,flashOfScreen:.85,bursts:4,motes:14,dustPerPixel:5.6e-5,dustMin:14,dustMax:64,fadeMs:2500});
// The flash window: 85 % of the screen's short side, 760 px at most.
export const flashSize=(width,height)=>Math.round(Math.min(VEIL.flash,Math.max(VEIL.flashMin,Math.min(width,height)*VEIL.flashOfScreen)));
// As many dots as the old tiled dust showed on a screen of this area.
export const dustCount=(width,height)=>Math.max(VEIL.dustMin,Math.min(VEIL.dustMax,Math.round(width*height*VEIL.dustPerPixel)));

const el=(doc,tag,className)=>{const node=doc.createElement(tag);if(className)node.className=className;return node;};

// A round window onto the full-screen picture: the window moves to the
// click, the picture inside moves the other way, so it stays put.
function lens(doc,className,size){
 const frame=el(doc,'div',className),art=el(doc,'div','v03-veil-art');
 frame.style.width=frame.style.height=size+'px';// Dimmed by a flat layer in the same background (a filter would need its own surface).
 art.style.backgroundImage=`linear-gradient(#0003,#0003),url("${VEIL_ART}")`;
 frame.append(art);
 return {frame,place(x,y){const left=x-size/2,top=y-size/2;frame.style.transform=`translate3d(${left}px,${top}px,0)`;art.style.transform=`translate3d(${-left}px,${-top}px,0)`;}};
}

// label(first): the note's words for a first drawing (download) or a later one;
// memory(): the line above it on a first drawing ("a world once drawn stays").
export function createDrawingVeil({doc,mount,label=()=>'',memory=()=>'',left=n=>String(n),random=Math.random,first=true}){
 const view=doc.defaultView;
 const root=el(doc,'div','v03-veil');root.setAttribute('aria-hidden','true');
 try{root.style.cursor=`${CURSOR_ART.arrow} 3 2, auto`;}catch{/* system cursor */}
 const width=view?.innerWidth||1280,height=view?.innerHeight||720,flashPx=flashSize(width,height);
 // Rising dust: small dots, each on its own slow loop (CSS, compositor only).
 // Placed by a fixed sequence so the screen looks the same every time; dimmer
 // toward the edges like the old vignette.
 const dust=el(doc,'div','v03-veil-dust');let seed=20261120;const next01=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0,count=dustCount(width,height);i<count;i++){
  const dot=el(doc,'i','v03-veil-dot'+(i%3===1?' is-violet':i%3===2?' is-small':'')),x=next01(),y=next01();
  const away=Math.hypot((x-.5)/.5,(y-.55)/.5),glow=Math.max(.12,Math.min(.7,.7*(1.25-away)));
  dot.style.left=(x*100).toFixed(2)+'%';dot.style.top=(y*100).toFixed(2)+'%';dot.style.setProperty('--o',glow.toFixed(2));dot.style.animationDelay=(-next01()*22).toFixed(2)+'s';
  dust.append(dot);
 }
 root.append(dust);
 const bursts=[];
 for(let i=0;i<VEIL.bursts;i++){
  const flash=lens(doc,'v03-veil-flash',flashPx),ring=el(doc,'div','v03-veil-ring'),spark=el(doc,'div','v03-veil-spark'),motes=[];
  for(let k=0;k<VEIL.motes;k++){const mote=el(doc,'i','v03-veil-mote');spark.append(mote);motes.push(mote);}
  root.append(flash.frame,ring,spark);bursts.push({flash,ring,spark,motes,running:[]});
 }
 const bar=el(doc,'div','v03-veil-bar'),fill=el(doc,'i');bar.append(fill);
 const note=el(doc,'p','v03-veil-note'),word=el(doc,'span','v03-veil-word'),pct=el(doc,'b','v03-veil-pct'),rest=el(doc,'span','v03-veil-left');
 note.append(word,pct,rest);
 const remember=el(doc,'p','v03-veil-memory');
 root.append(bar,remember,note);mount.append(root);
 root.classList.toggle('is-first',!!first);

 let active=false,disposed=false,next=0,bursted=0,shownPct=-1,shownLeft=-1,fadeTimer=0;
 // Reduced motion (device or the player's choice, accessibility.js), asked at each tap.
 function burst(px,py){
  const b=bursts[next];next=(next+1)%bursts.length;bursted++;
  for(const animation of b.running.splice(0))animation.cancel();
  b.flash.place(px,py);
  b.ring.style.transform=`translate3d(${px-60}px,${py-60}px,0)`;b.spark.style.transform=`translate3d(${px}px,${py}px,0)`;
  if(!b.flash.frame.animate)return;
  const reduced=reducedMotion();
  // Reduced: one soft glow that fades, without the ring and the flying motes.
  if(reduced){b.running.push(b.flash.frame.animate([{opacity:0},{opacity:.45,offset:.3},{opacity:0}],{duration:2600,easing:'ease-in-out'}));return;}
  // Bright at once, then sinking slowly back into the black.
  b.running.push(b.flash.frame.animate([{opacity:0},{opacity:1,offset:.08},{opacity:.6,offset:.35},{opacity:0}],{duration:2600,easing:'ease-out'}));
  b.running.push(b.ring.animate([{opacity:.9,transform:`translate3d(${px-60}px,${py-60}px,0) scale(.2)`},{opacity:0,transform:`translate3d(${px-60}px,${py-60}px,0) scale(4.2)`}],{duration:1100,easing:'cubic-bezier(.15,.7,.3,1)'}));
  for(const mote of b.motes){
   const angle=random()*Math.PI*2,reach=60+random()*150,dx=Math.cos(angle)*reach,dy=Math.sin(angle)*reach-30*random(),size=.6+random()*.9;
   b.running.push(mote.animate([{opacity:1,transform:`translate3d(0,0,0) scale(${size})`},{opacity:.85,offset:.35},{opacity:0,transform:`translate3d(${dx}px,${dy-40}px,0) scale(${size*.3})`}],{duration:900+random()*900,easing:'cubic-bezier(.1,.6,.3,1)'}));
  }
 }
 const onDown=event=>{
  if(!active||(event.pointerType!=='touch'&&event.button!==0))return;
  const box=root.getBoundingClientRect?.();burst(event.clientX-(box?.left??0),event.clientY-(box?.top??0));
 };
 // Out of rendering once it has faded: no dots animating, no surfaces kept.
 function retire(){
  if(fadeTimer){view?.clearTimeout?.(fadeTimer);fadeTimer=0;}
  root.removeEventListener('transitionend',onFaded);
  if(active)return;
  for(const b of bursts)for(const animation of b.running.splice(0))animation.cancel();
  root.hidden=true;
 }
 function onFaded(event){if(event.target===root&&event.propertyName==='opacity')retire();}
 return {
  element:root,
  get active(){return active;},
  start(){
   if(disposed||active)return;active=true;root.hidden=false;root.classList.add('is-active');
   if(fadeTimer){view?.clearTimeout?.(fadeTimer);fadeTimer=0;}
   word.textContent=label(first);remember.textContent=memory();
   root.addEventListener('pointerdown',onDown,{passive:true});
  },
  // remaining: a count, or ready text (megabytes, the stage being drawn).
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
   root.removeEventListener('pointerdown',onDown);
   // The fade's end hides it; the timer covers a fade that never runs (hidden tab, reduced motion).
   root.addEventListener('transitionend',onFaded);
   fadeTimer=view?.setTimeout?.(retire,VEIL.fadeMs)??0;if(!fadeTimer)retire();
  },
  dispose(){
   if(disposed)return;this.stop();disposed=true;retire();
   for(const b of bursts)for(const animation of b.running.splice(0))animation.cancel();
   root.remove();
  },
  inspect:()=>({active,hidden:root.hidden===true,dots:dust.childElementCount,flash:flashPx,bursts:bursted,pct:shownPct,left:shownLeft}),
 };
}

// What is being drawn, by progress after the download (keys under title.stage.*).
export const DRAW_STAGES=Object.freeze([[.58,'ground'],[.65,'trees'],[.75,'people'],[.83,'critters'],[.9,'beasts'],[1.01,'monsters']]);
export function drawStage(ratio){for(let i=0;i<DRAW_STAGES.length;i++)if(ratio<DRAW_STAGES[i][0])return DRAW_STAGES[i][1];return 'monsters';}

// Progress of the black title (boot.js feeds it; the veil writes only on
// change). Phases: the download and the game's own loading (the loading
// card's ratio, up to 50%), the world starting (no count), the scene's
// pending models and textures (counted against the most seen), then the quiet
// wait before the reveal. Never goes back.
// Fine steps (user, 2026-11-21): a phase without counts, and the long gaps
// between counts (a handful of pending items made 5% jumps), move by how long
// that phase took last time on this device (phase-share.js); the counts and
// the phase ends correct it. expectedStart/expectedPending are in seconds.
// glide (share of the bar per second, 0 = off): when real work finishes in a
// lump the value would jump (measured on the deployed build: 37→49, 49→66,
// 71→80, 86→95). With a glide the shown value runs up to it at that pace by the
// wall clock instead, so the number counts through every percent.
// update() is called every frame while the title is black: it takes one
// caller-owned input object and returns the same result object each time.
export function createDrawingProgress({quiet=1.2,limit=25,expectedStart=4,expectedPending=5,glide=0,now=()=>performance.now()}={}){
 let ratio=0,shown=0,seen=null,peak=0,loadTime=0,pendingTime=0,downloading=false,downloadValue=0,downloadText='';
 const out={ratio:0,remaining:0},took={start:0,pending:0};
 return {
  // ratio 0..1 of the download; text: what is left, ready to show. null when the card closed.
  download(value,text=''){downloading=value!==null;downloadValue=downloading?Math.max(0,Math.min(1,Number(value)||0)):0;downloadText=downloading?text:'';},
  update({dt=0,ready=false,pending=0,summoning=false,quietTime=0,prepareTime=0}){
   let left=Math.max(0,pending)+(summoning?1:0)+(ready?0:1),value;
   if(downloading){value=.5*downloadValue;if(downloadText)left=downloadText;}
   else if(!ready){loadTime+=dt;value=.5+.15*phaseShare(loadTime,expectedStart);}
   else{
    peak=Math.max(peak,left);if(left)pendingTime+=dt;
    const done=peak?(peak-left)/peak:1,passed=left?phaseShare(pendingTime,expectedPending):1;
    // The counted share, and of what is left the share that time says has passed: it keeps moving
    // after a count ran ahead of the clock (deployed build: 1.5 s standing at 80%).
    value=.65+.3*(done+(1-done)*passed)+.05*Math.min(1,quietTime/quiet);
    if(prepareTime>=limit||(!left&&quietTime>=quiet))value=1;
   }
   ratio=Math.max(ratio,Math.min(1,value));
   if(glide>0&&ratio<1){
    // At most a tenth of a second per call: after a long stall the value still runs up, it does not leap.
    const at=now(),passed=seen===null?0:Math.min(.1,Math.max(0,(at-seen)/1000));seen=at;
    shown=Math.max(shown,Math.min(ratio,shown+glide*passed));
   }else shown=ratio;
   out.ratio=shown;out.remaining=left;
   return out;
  },
  // Seconds each uncounted phase really took, for the next run.
  get measured(){took.start=loadTime;took.pending=pendingTime;return took;},
  get ratio(){return shown;},
  // Still running up to the real value (the caller keeps calling update until this is false).
  get gliding(){return shown<ratio;},
 };
}
