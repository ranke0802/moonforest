// Preparation owns no gameplay clock. Long vertex proofs yield only at fixed
// block boundaries, preserving the synchronous arithmetic and buffer order.
export function bossPreparationCancelled(){const error=new Error('보스 준비 요청이 변경되었습니다.');error.name='AbortError';return error;}
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
export function runPreparationSync(work){let next;do{next=work.next();}while(!next.done);return next.value;}
export function createBossPreparation({isCurrent=()=>true,frame=bossPreparationFrame,now=()=>performance.now(),incremental=true,budgetMs=1.5,maxBlocks=4,timeoutMs=45000}={}){
  const stats={yields:0,slices:0,blocks:0,maxSliceMs:0,coalescedPauses:0,frameWaitMs:0,steps:[]};
  const controller=new AbortController(),started=now(),waiters=new Set();let reason=null,sliceStarted=started,sliceBlocks=0,firstFrame=true;
  const cancel=(error=bossPreparationCancelled())=>{if(reason)return;reason=error;controller.abort(error);for(const reject of [...waiters])reject(error);};
  const check=()=>{if(!reason&&!isCurrent())cancel();if(!reason&&now()-started>=timeoutMs)cancel(bossPreparationTimeout());if(reason)throw reason;};
  const preparation={incremental,stats,check,cancel,signal:controller.signal,get pendingWaits(){return waiters.size;},
    wait(value){
      try{check();}catch(error){Promise.resolve(value).catch(()=>{});return Promise.reject(error);}
      return new Promise((resolve,reject)=>{
        let done=false,timer;
        const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);waiters.delete(abort);if(error)reject(error);else resolve(result);};
        const abort=error=>finish(error),poll=()=>{try{check();}catch(error){finish(error);return;}timer=setTimeout(poll,Math.max(1,Math.min(30,timeoutMs-(now()-started))));};
        waiters.add(abort);Promise.resolve(value).then(result=>{try{check();finish(null,result);}catch(error){finish(error);}},error=>finish(error));poll();
      });
    },
    sleep(ms){
      check();const signal=controller.signal;
      const delay=new Promise((resolve,reject)=>{let timer;const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason??bossPreparationCancelled());};signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);});
      return this.wait(delay);
    },
    async nextFrame(){check();stats.yields++;const start=now();await this.wait(frame(controller.signal));stats.frameWaitMs+=Math.max(0,now()-start);sliceStarted=now();sliceBlocks=0;firstFrame=false;},
    async pause(){
      check();if(!incremental)return;
      // Cheap preparation boundaries can share one task slice. The first
      // boundary still gives UI/cancellation a frame, and either the existing
      // time budget or block ceiling forces the next scheduling opportunity.
      if(firstFrame||sliceBlocks>=maxBlocks||now()-sliceStarted>=budgetMs)await this.nextFrame();else stats.coalescedPauses++;
      sliceBlocks++;
    },
    async step(name,fn){await this.pause();const start=now();const value=fn();stats.steps.push({name,ms:Math.max(0,now()-start)});check();return value;},
    async run(work){
      check();if(!incremental)return runPreparationSync(work);
      let next;
      do{
        check();if(firstFrame||sliceBlocks>=maxBlocks||now()-sliceStarted>=budgetMs)await this.nextFrame();const start=now();let blocks=0;
        do{next=work.next();blocks++;stats.blocks++;sliceBlocks++;}while(!next.done&&blocks<maxBlocks&&sliceBlocks<maxBlocks&&now()-sliceStarted<budgetMs);
        stats.slices++;stats.maxSliceMs=Math.max(stats.maxSliceMs,Math.max(0,now()-start));
        if(!next.done)await this.nextFrame();
      }while(!next.done);
      check();return next.value;
    }
  };return preparation;
}
