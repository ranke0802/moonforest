// Frame-rate guard for touch devices. Watches the real frame interval and,
// when the device cannot hold its target, steps down (in order) the 3D render
// plains view distance, the shadow map and the 3D render resolution. It steps
// back up after a long calm stretch; a level that drops again soon after a
// step up becomes the floor for the session. Pure logic: main.js applies it.
export const ADAPTIVE_LEVELS=Object.freeze([
 // Only the 3D render resolution is traded. View distance, ground detail,
 // the village range and shadows are part of the authored look (the plains
 // panorama from the bear's hill, the forest ring around the village) and
 // are never reduced here — phone recordings also showed they bought little
 // (CPU 22.5 → 18.6 ms/frame on the plains with all of them cut).
 Object.freeze({scale:1,viewCap:null,rangeScale:1,detailRange:0,shadows:true}),
 Object.freeze({scale:.9,viewCap:null,rangeScale:1,detailRange:0,shadows:true}),
 Object.freeze({scale:.8,viewCap:null,rangeScale:1,detailRange:0,shadows:true}),
]);
const WINDOW_MS=2000,CALM_MS=20000,PROBE_MS=8000;

export class AdaptivePerformance {
 constructor({enabled=true,now=()=>performance.now(),level=0}={}){
  // level: where the previous session settled (the caller persists it).
  this.enabled=enabled;this.now=now;this.level=enabled&&Number.isInteger(level)?Math.min(ADAPTIVE_LEVELS.length-1,Math.max(0,level)):0;this.floor=0;this.calm=0;this.probeAt=null;this.changes=0;this.reset();
 }
 get settings(){return ADAPTIVE_LEVELS[this.level];}
 reset(){this.sum=0;this.count=0;this.slow=0;this.elapsed=0;}
 // intervalMs: real time since the previous frame. targetMs: the frame cap.
 // Returns the new settings when the level changes, otherwise null.
 sample(intervalMs,{active=true,targetMs=1000/60}={}){
  if(!this.enabled)return null;
  // Loading, pauses and hitches longer than 1/4 s say nothing about steady cost.
  if(!active||!(intervalMs>0)||intervalMs>250){this.reset();return null;}
  this.sum+=intervalMs;this.count++;this.elapsed+=intervalMs;if(intervalMs>targetMs*1.2)this.slow++;
  if(this.elapsed<WINDOW_MS)return null;
  const average=this.sum/this.count,slowShare=this.slow/this.count,window=this.elapsed;this.reset();
  let next=this.level;
  if(average>targetMs*1.1||slowShare>.2){
   this.calm=0;
   if(this.level<ADAPTIVE_LEVELS.length-1){
    // Dropping right after a step up: that lighter level is the real limit.
    if(this.probeAt!==null&&this.now()-this.probeAt<PROBE_MS)this.floor=this.level+1;
    next=this.level+1;
   }
   this.probeAt=null;
  }else if(average<targetMs*1.04&&slowShare<.05){
   this.calm+=window;
   if(this.calm>=CALM_MS&&this.level>this.floor){next=this.level-1;this.calm=0;this.probeAt=this.now();}
  }else this.calm=0;
  if(next===this.level)return null;
  this.level=next;this.changes++;return this.settings;
 }
 inspect(){return {enabled:this.enabled,level:this.level,floor:this.floor,changes:this.changes,...this.settings};}
}
