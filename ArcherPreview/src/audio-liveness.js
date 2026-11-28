// Sound may play only while the page is painting (2026-11-28, user on an iPhone: the music
// kept playing after the browser app was closed and the phone ran hot).
// The game asks iOS for a "playback" audio session (game-audio.js), which the system keeps
// alive in the background, and the visibility events that suspend the context do not reach a
// page whose main thread is stuck or whose app was put away without them. So liveness is
// measured instead of assumed:
//  - one requestAnimationFrame probe (a browser only runs it while the page is on screen)
//    notes the time and renews the audio's own fade-out deadline (onBeat);
//  - a 1 s watchdog starves the audio (onStarve: suspend the contexts, give the session back)
//    when no frame came for STARVE_MS, or at once when the page reports hidden/pagehide/freeze;
//  - the next painted frame revives it (onRevive).
// A page whose main thread is dead cannot run any of this; for that case the deadline set by
// the last beat silences the output on the audio thread (GameAudio.beat).
// One probe and one timer for the whole page; neither touches the scene.
export const STARVE_MS=2500,WATCH_MS=1000;

export function createAudioLiveness({view=globalThis,doc=view?.document,now=()=>view.performance.now(),
 onStarve=()=>{},onRevive=()=>{},onBeat=()=>{},
 raf=fn=>view.requestAnimationFrame(fn),cancelRaf=id=>view.cancelAnimationFrame(id),
 every=(fn,ms)=>{const id=view.setInterval(fn,ms);return ()=>view.clearInterval(id);}}={}){
 let last=now(),starved=false,frame=0,disposed=false,starves=0,revivals=0,reason=null;
 const starve=why=>{if(starved||disposed)return;starved=true;starves++;reason=why;try{onStarve(why);}catch{/* the probe goes on */}};
 const tick=()=>{
  frame=0;if(disposed)return;
  last=now();
  if(doc?.hidden!==true){
   if(starved){starved=false;revivals++;try{onRevive();}catch{/* the probe goes on */}}
   onBeat();
  }
  frame=raf(tick);
 };
 const watch=()=>{if(doc?.hidden===true)starve('hidden');else if(now()-last>STARVE_MS)starve('no-frames');};
 const onVisibility=()=>{if(doc?.hidden===true)starve('hidden');};
 const onPageHide=()=>starve('pagehide'),onFreeze=()=>starve('freeze');
 doc?.addEventListener?.('visibilitychange',onVisibility);doc?.addEventListener?.('freeze',onFreeze);
 view?.addEventListener?.('pagehide',onPageHide);
 frame=raf(tick);
 const stopWatch=every(watch,WATCH_MS);
 return {
  get starved(){return starved;},
  inspect(){return {starved,starves,revivals,reason,sinceFrameMs:Math.round(now()-last)};},
  dispose(){
   if(disposed)return;disposed=true;if(frame)cancelRaf(frame);frame=0;stopWatch();
   doc?.removeEventListener?.('visibilitychange',onVisibility);doc?.removeEventListener?.('freeze',onFreeze);
   view?.removeEventListener?.('pagehide',onPageHide);
  },
 };
}
