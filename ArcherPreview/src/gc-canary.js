// Diagnostics only (2026-11-27). Nothing here changes rendering, gameplay or
// object lifetime of anything but the canary itself.
//
// Full-collection canary: one small object is held strongly for HOLD_MS (long
// enough for the young generation to promote it while the game allocates),
// then dropped. A promoted object is reclaimed only by a full (old-generation)
// collection, so its FinalizationRegistry callback marks "a full GC finished
// shortly before this time". A recording can then line long frames up with
// these times (S23 2026-11-27: 100-200 ms frames in unrelated sections).
// Limits: the callback runs as a later task, so the time is an upper bound; at
// most one GC is seen per cycle; a canary dropped while still young would be
// reported by a minor GC (unlikely after HOLD_MS of play).
const HOLD_MS=8000,RECENT=160;
const state={supported:typeof FinalizationRegistry==='function',armed:0,finalized:0,recentFinalizedAtMs:[]};
let registry=null,held=null,heldUntil=0,outstanding=false;
function arm(now){held={canary:state.armed};heldUntil=now+HOLD_MS;outstanding=true;registry.register(held,state.armed);state.armed++;}
export function tickGcCanary(now=performance.now()){
  if(!state.supported)return state;
  if(!registry)registry=new FinalizationRegistry(()=>{
    outstanding=false;state.finalized++;state.recentFinalizedAtMs.push(Math.round(performance.now()));
    if(state.recentFinalizedAtMs.length>RECENT)state.recentFinalizedAtMs.shift();
  });
  if(held&&now>=heldUntil)held=null;
  if(!held&&!outstanding)arm(now);
  return state;
}
export function gcCanarySnapshot(engine=null){
  tickGcCanary();
  let parallelShaderCompile=null;
  try{parallelShaderCompile=engine?.getCaps?.()?.parallelShaderCompile?true:engine?false:null;}catch{}
  return {supported:state.supported,holdMs:HOLD_MS,armed:state.armed,finalized:state.finalized,recentFinalizedAtMs:state.recentFinalizedAtMs.slice(),parallelShaderCompile,
    scope:'full-GC canary: each time is when a promoted canary was finalized (upper bound of a full collection end), performance.now() ms'};
}
// Groups an observable's observers by a short fingerprint of their callback
// source, so a snapshot can say which kind of observer accumulates. Called
// for diagnostic snapshots only (never per frame).
export function observerKinds(observable,limit=12){
  const list=observable?.observers;if(!Array.isArray(list))return null;
  const counts=new Map();
  for(const observer of list){
    let key='?';
    try{key=String(observer?.callback??'').replace(/\s+/g,' ').slice(0,90)||'?';}catch{}
    counts.set(key,(counts.get(key)??0)+1);
  }
  return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([source,count])=>({count,source}));
}
