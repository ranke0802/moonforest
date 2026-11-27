// Frame-rate guard for touch devices. Watches the real frame interval and,
// when the device cannot hold its target, steps down (in order) the 3D render
// plains view distance, the shadow map and the 3D render resolution. It steps
// back up after a long calm stretch; a level that drops again soon after a
// step up becomes the floor for the session. Pure logic: main.js applies it.
export const ADAPTIVE_LEVELS=Object.freeze([
 // Ordered by how little a phone player can see the change. Resolution is
 // never traded (a softer picture blurs the outlines the art depends on):
 // first distant actors' shadows (a few texels each at phone size), then the
 // shadow map refreshing every other frame, and last a gentle pull-in of the
 // plains view (2.4 -> 1.8 -> 1.6). Each level engages only while the device
 // misses its frame target and steps back up after a calm stretch.
 // (Phones are GPU-bound: the shadow pass alone was ~40 % of triangles and
 // draw calls on the plains, measured 2026-11-18.)
 Object.freeze({scale:1,viewCap:null,rangeScale:1,detailRange:0,shadows:true,actorShadowRange:32,shadowRefresh:1}),
 Object.freeze({scale:1,viewCap:null,rangeScale:1,detailRange:0,shadows:true,actorShadowRange:20,shadowRefresh:1}),
 Object.freeze({scale:1,viewCap:null,rangeScale:1,detailRange:0,shadows:true,actorShadowRange:20,shadowRefresh:2}),
 Object.freeze({scale:1,viewCap:1.8,rangeScale:1,detailRange:0,shadows:true,actorShadowRange:16,shadowRefresh:2}),
 Object.freeze({scale:1,viewCap:1.6,rangeScale:1,detailRange:0,shadows:true,actorShadowRange:16,shadowRefresh:2}),
 // Sustained-slowdown levels (2026-11-27, S23 record: frame work 8.8 -> 19 ms
 // while the device itself slowed). Entered only from the last normal level
 // after SEVERE_MS of frames averaging over 1.5x the target. They cut CPU
 // work too: `forceActorShadowRange` overrides the "far actor shadows" restore
 // switch, the plains view pulls in to 1.4 and the village range to 0.85.
 Object.freeze({scale:1,viewCap:1.4,rangeScale:.85,detailRange:0,shadows:true,actorShadowRange:12,forceActorShadowRange:true,shadowRefresh:2,emergency:true}),
 Object.freeze({scale:1,viewCap:1.4,rangeScale:.85,detailRange:0,shadows:false,actorShadowRange:12,forceActorShadowRange:true,shadowRefresh:2,emergency:true}),
]);
// Last level reached by ordinary misses; deeper levels need a sustained slowdown.
export const ADAPTIVE_NORMAL_LAST=ADAPTIVE_LEVELS.findIndex(level=>level.emergency)-1;
const WINDOW_MS=2000,CALM_MS=20000,PROBE_MS=8000,SEVERE_MS=10000,HISTORY=20;
// A late frame followed by a short one that makes up the time (the pair fits
// two frame slots) is scheduling jitter around the frame cap, not a missed
// frame: Babylon's maxFPS accumulator renders the next frame early. The S23
// record of 2026-11-27 showed pairs such as 20+13 ms and 22+13 ms at 60 fps;
// counted as slow they kept the share at ~5 % and the guard never stepped up.
const CATCH_UP_PAIR=2.2;

// The level to start a session at. The stored level is where the last session
// ended, often after a slow spell (heat, a busy device); trusting it pinned a
// healthy phone on the last level for a whole session. Start one level
// lighter, and never on a sustained-slowdown level.
export function resumeAdaptiveLevel(stored){
 const level=Number(stored);if(!Number.isInteger(level)||level<=0)return 0;
 return Math.min(ADAPTIVE_NORMAL_LAST,level)-1;
}

export class AdaptivePerformance {
 constructor({enabled=true,now=()=>performance.now(),level=0}={}){
  // level: the level to start at (see resumeAdaptiveLevel).
  this.enabled=enabled;this.now=now;this.level=enabled&&Number.isInteger(level)?Math.min(ADAPTIVE_LEVELS.length-1,Math.max(0,level)):0;this.floor=0;this.calm=0;this.severe=0;this.probeAt=null;this.changes=0;this.history=[];this.windows={down:0,calm:0,neutral:0,calmBlockedBySlow:0,forgiven:0};this.lastWindow=null;this.previous=0;this.reset();
 }
 get settings(){return ADAPTIVE_LEVELS[this.level];}
 reset(){this.sum=0;this.count=0;this.slow=0;this.forgiven=0;this.elapsed=0;this.previous=0;}
 // intervalMs: real time since the previous frame. targetMs: the frame cap.
 // Returns the new settings when the level changes, otherwise null.
 sample(intervalMs,{active=true,targetMs=1000/60}={}){
  if(!this.enabled)return null;
  // Loading, pauses and hitches longer than 1/4 s say nothing about steady cost.
  if(!active||!(intervalMs>0)||intervalMs>250){this.reset();return null;}
  this.sum+=intervalMs;this.count++;this.elapsed+=intervalMs;
  if(intervalMs>targetMs*1.2)this.slow++;
  else if(this.previous>targetMs*1.2&&this.previous+intervalMs<=targetMs*CATCH_UP_PAIR&&this.slow>0){this.slow--;this.forgiven++;}
  this.previous=intervalMs;
  if(this.elapsed<WINDOW_MS)return null;
  const average=this.sum/this.count,slowShare=this.slow/this.count,window=this.elapsed,forgiven=this.forgiven;this.reset();
  let next=this.level,reason=null;
  // Window verdicts for the diagnostics (2026-11-27: the S23 record could not tell which condition held the level).
  const verdict=average>targetMs*1.1||slowShare>.2?'down':average<targetMs*1.04&&slowShare<.05?'calm':'neutral';this.windows[verdict]++;this.windows.forgiven+=forgiven;if(verdict==='neutral'&&average<targetMs*1.04)this.windows.calmBlockedBySlow++;
  this.lastWindow={averageMs:Math.round(average*100)/100,slowShare:Math.round(slowShare*1000)/1000,forgiven,verdict};
  if(average>targetMs*1.5)this.severe+=window;else this.severe=0;
  if(average>targetMs*1.1||slowShare>.2){
   this.calm=0;
   if(this.level<ADAPTIVE_NORMAL_LAST||(this.level<ADAPTIVE_LEVELS.length-1&&this.severe>=SEVERE_MS)){
    // Dropping right after a step up: that lighter level is the real limit.
    if(this.probeAt!==null&&this.now()-this.probeAt<PROBE_MS)this.floor=this.level+1;
    next=this.level+1;reason=this.level>=ADAPTIVE_NORMAL_LAST?'severe':average>targetMs*1.1?'average':'slow';
    if(this.level>=ADAPTIVE_NORMAL_LAST)this.severe=0;
   }
   this.probeAt=null;
  }else if(average<targetMs*1.04&&slowShare<.05){
   this.calm+=window;
   if(this.calm>=CALM_MS&&this.level>this.floor){next=this.level-1;this.calm=0;this.probeAt=this.now();reason='calm';}
  }else if(this.settings.emergency&&average<targetMs*1.2){
   // Leaving a sustained-slowdown level only needs the device back near target.
   this.calm+=window;
   if(this.calm>=CALM_MS&&this.level>this.floor){next=this.level-1;this.calm=0;this.probeAt=this.now();reason='recovered';}
  }else this.calm=0;
  if(next===this.level)return null;
  this.history.push({atMs:Math.round(this.now()),from:this.level,to:next,reason,averageMs:Math.round(average*100)/100,slowShare:Math.round(slowShare*1000)/1000,forgiven,targetMs:Math.round(targetMs*100)/100,floor:this.floor});
  if(this.history.length>HISTORY)this.history.shift();
  this.level=next;this.changes++;return this.settings;
 }
 inspect(){return {enabled:this.enabled,level:this.level,floor:this.floor,changes:this.changes,history:this.history.map(entry=>({...entry})),windows:{...this.windows},lastWindow:this.lastWindow&&{...this.lastWindow},...this.settings};}
}
