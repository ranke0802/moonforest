// Preparation owns no gameplay clock. Long vertex proofs yield only at fixed
// block boundaries, preserving the synchronous arithmetic and buffer order.
import {createFrameWorkLease} from './frame-work-coordinator.js';
import {stacklessError} from './map-load-lifetime.js';
export function bossPreparationCancelled(){return stacklessError(()=>{const error=new Error('보스 준비 요청이 변경되었습니다.');error.name='AbortError';return error;});}
export function bossPreparationTimeout(){const error=new Error('화면 준비 시간이 초과되었습니다. 새로고침해 주세요.');error.name='TimeoutError';return error;}
export function bossPreparationFrame(signal){
  if(signal?.aborted)return Promise.reject(signal.reason??bossPreparationCancelled());
  if(typeof requestAnimationFrame!=='function')return Promise.resolve();
  return new Promise((resolve,reject)=>{
    let frame,timer,done=false;const abort=()=>finish(signal.reason??bossPreparationCancelled());
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);if(frame!==undefined)cancelAnimationFrame(frame);signal?.removeEventListener('abort',abort);if(error instanceof Error)reject(error);else resolve();};
    signal?.addEventListener('abort',abort,{once:true});frame=requestAnimationFrame(()=>finish());timer=setTimeout(()=>finish(),50);
  });
}
// While a map change keeps its loading screen (or the held picture of the map being left)
// up, no frame reaches the player. A preparation then yields a task and not a frame, works in
// COVERED_BUDGET_MS slices and leaves the per-frame work budget alone. Measured on the forest
// camp (Node, 60 Hz frames simulated, 2026-11-28): four foe kinds took 1,017 ms with 48 frame
// waits, 248 ms without them. Read at every boundary: the moment the cover goes, a preparation
// still running is as gentle as before. A caller that brings its own `frame` keeps it.
// 0.3 road travel holds it (v03/next-map-prefetch.js travel -> arrived/cancel).
let covers=0;
export const COVERED_BUDGET_MS=8,COVERED_BLOCKS=256;
export function coverPreparation(){covers++;let held=true;return ()=>{if(held){held=false;covers--;}};}
export const preparationCovered=()=>covers>0;
const coveredTask=()=>new Promise(resolve=>setTimeout(resolve,0));
export function runPreparationSync(work){let next;do{next=work.next();}while(!next.done);return next.value;}
export function createBossPreparation({isCurrent=()=>true,frame=bossPreparationFrame,now=()=>performance.now(),incremental=true,budgetMs=1.5,maxBlocks=4,timeoutMs=45000,scene,coordinator}={}){
  const stats={yields:0,slices:0,blocks:0,maxSliceMs:0,coalescedPauses:0,frameWaitMs:0,steps:[]};
  const controller=new AbortController(),started=now(),waiters=new Set();let reason=null,sliceStarted=started,sliceBlocks=0,firstFrame=true;
  const shared=incremental?createFrameWorkLease({scene,coordinator,now}):null;let sharedStarted=false;
  // last: the boundary the running stretch began at. A stretch over the shared budget is recorded
  // as 'after <that boundary>' (or the label its caller gives), so a recording names the code that
  // ran long between two boundaries; before 2026-11-22 they were all 'unlabelled'.
  let last='start';
  const fast=()=>covers>0&&incremental&&frame===bossPreparationFrame,blockLimit=()=>fast()?Math.max(maxBlocks,COVERED_BLOCKS):maxBlocks,budget=()=>fast()?Math.max(budgetMs,COVERED_BUDGET_MS):budgetMs,due=()=>!fast()&&!!shared?.due();
  const checkpoint=(label='after '+last)=>{if(sharedStarted)shared?.checkpoint(label);else{shared?.reset();sharedStarted=true;}};
  const cancel=(error=bossPreparationCancelled())=>{if(reason)return;reason=error;controller.abort(error);for(const reject of [...waiters])reject(error);};
  const check=()=>{if(!reason&&!isCurrent())cancel();if(!reason&&now()-started>=timeoutMs)cancel(bossPreparationTimeout());if(reason)throw reason;};
  const preparation={incremental,stats,check,cancel,signal:controller.signal,get pendingWaits(){return waiters.size;},
    // Account synchronous SDK work before a final ready check returns. Without
    // this boundary its last slice was invisible to another preparation owner.
    checkpoint(label){check();checkpoint(label);},
    wait(value,label='wait'){
      try{check();}catch(error){Promise.resolve(value).catch(()=>{});return Promise.reject(error);}checkpoint();last=label;
      return new Promise((resolve,reject)=>{
        let done=false,timer;
        const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);waiters.delete(abort);shared?.reset();if(error)reject(error);else resolve(result);};
        const abort=error=>finish(error),poll=()=>{try{check();}catch(error){finish(error);return;}timer=setTimeout(poll,Math.max(1,Math.min(30,timeoutMs-(now()-started))));};
        waiters.add(abort);Promise.resolve(value).then(result=>{try{check();finish(null,result);}catch(error){finish(error);}},error=>finish(error));poll();
      });
    },
    sleep(ms){
      check();const signal=controller.signal;
      const delay=new Promise((resolve,reject)=>{let timer;const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason??bossPreparationCancelled());};signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);});
      return this.wait(delay,last);
    },
    async nextFrame(){check();checkpoint();stats.yields++;const start=now(),token=shared?.beforeWait();await this.wait(fast()?coveredTask():frame(controller.signal),last);shared?.afterWait(token);stats.frameWaitMs+=Math.max(0,now()-start);sliceStarted=now();sliceBlocks=0;firstFrame=false;},
    async pause(){
      check();if(!incremental)return;checkpoint();
      // Cheap preparation boundaries can share one task slice. The first
      // boundary still gives UI/cancellation a frame, and either the existing
      // time budget or block ceiling forces the next scheduling opportunity.
      if(firstFrame||sliceBlocks>=blockLimit()||now()-sliceStarted>=budget()||due())await this.nextFrame();else stats.coalescedPauses++;
      while(due())await this.nextFrame();
      sliceBlocks++;
    },
    async step(name,fn){await this.pause();const start=now();let value;try{value=fn();}finally{shared?.charge(Math.max(0,now()-start),name);}stats.steps.push({name,ms:Math.max(0,now()-start)});last=name;check();return value;},
    async run(work){
      check();if(!incremental)return runPreparationSync(work);checkpoint();
      let next;
      do{
        check();if(firstFrame||sliceBlocks>=blockLimit()||now()-sliceStarted>=budget()||due())await this.nextFrame();while(due())await this.nextFrame();const start=now();let blocks=0;
        do{const blockStarted=now();try{next=work.next();}finally{shared?.charge(Math.max(0,now()-blockStarted),'run');}blocks++;stats.blocks++;sliceBlocks++;}while(!next.done&&blocks<blockLimit()&&sliceBlocks<blockLimit()&&now()-sliceStarted<budget()&&!due());
        stats.slices++;stats.maxSliceMs=Math.max(stats.maxSliceMs,Math.max(0,now()-start));
        if(!next.done)await this.nextFrame();
      }while(!next.done);
      last='run';check();return next.value;
    }
  };return preparation;
}
