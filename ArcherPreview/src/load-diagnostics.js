// Stage wall times include asynchronous work and waiting. Keep only eight map
// visits; collecting a few timestamps also works when the HUD is switched off.
export class LoadDiagnostics {
  constructor(now=()=>performance.now()){this.now=now;this.current=null;this.history=[];}
  begin(label){if(this.current)this.finish('interrupted');const at=this.now();this.current={label,started:at,phase:'setup',phaseStarted:at,setupMs:0,downloadMs:0,modelMs:0,screenMs:0,bytes:0,cachedBytes:0};}
  phase(name){const c=this.current;if(!c||c.phase===name)return;const at=this.now();c[c.phase+'Ms']+=Math.max(0,at-c.phaseStarted);c.phase=name;c.phaseStarted=at;}
  download(state){if(this.current){this.current.bytes=state.total??0;this.current.cachedBytes=state.cached??0;}}
  snapshot(){const c=this.current??this.history.at(-1);if(!c)return null;const copy={...c};if(this.current){const at=this.now();copy[copy.phase+'Ms']+=Math.max(0,at-copy.phaseStarted);copy.totalMs=Math.max(0,at-copy.started);}delete copy.phaseStarted;delete copy.started;return copy;}
  finish(error=null){if(!this.current)return;const snapshot=this.snapshot();snapshot.phase=error?'error':'complete';snapshot.error=error?String(error).slice(0,200):null;this.history.push(snapshot);if(this.history.length>8)this.history.shift();this.current=null;}
}

export function readDiagnosticMemory(perf=globalThis.performance,resources={}){
  const heap=perf?.memory;
  const positive=value=>Number.isFinite(value)&&value>=0?value:null;
  return {jsUsedBytes:positive(heap?.usedJSHeapSize),jsAllocatedBytes:positive(heap?.totalJSHeapSize),jsLimitBytes:positive(heap?.jsHeapSizeLimit),
    backgroundHighTextureEstimateBytes:positive(resources.highTextureBytes),backgroundHighTextureBudgetBytes:positive(resources.highTextureBudget),
    textures:positive(resources.textures),meshes:positive(resources.meshes),geometries:positive(resources.geometries)};
}
