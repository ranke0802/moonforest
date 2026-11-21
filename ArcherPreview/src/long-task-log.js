// The browser's own list of main-thread tasks of 50 ms or more (PerformanceObserver
// 'longtask'), kept for the frame recording. The recording shows long frame intervals with
// no work measured inside the frame (phone, 2026-11-20: while scenery is prepared); those
// are tasks outside the frame loop, and this says when they ran and how long. The last
// `limit` tasks only; nothing is measured by this code itself.
// Where the browser has 'long-animation-frame' it also names the scripts inside the slow
// frames (callback kind, function, bundle file and position): a long task alone says when,
// not what. Frames of `frameMs` or more, the last `frameLimit`, four largest scripts each.
const short=text=>String(text??'').replace(/blob:[^"\]\s]+/g,'blob').replace(/https?:\/\/[^"\]\s]*\//g,'').slice(0,48);
export function createLongTaskLog({limit=60,frameLimit=40,frameMs=60,Observer=globalThis.PerformanceObserver}={}){
  const tasks=[],frames=[];let observer=null,frameObserver=null,total=0,totalMs=0;
  try{
    if(typeof Observer==='function'&&(Observer.supportedEntryTypes??[]).includes('longtask')){
      observer=new Observer(list=>{for(const entry of list.getEntries()){total++;totalMs+=entry.duration;tasks.push(Math.round(entry.startTime),Math.round(entry.duration));if(tasks.length>limit*2)tasks.splice(0,2);}});
      observer.observe({entryTypes:['longtask']});
    }
  }catch{observer=null;}
  try{
    if(typeof Observer==='function'&&(Observer.supportedEntryTypes??[]).includes('long-animation-frame')){
      frameObserver=new Observer(list=>{for(const entry of list.getEntries()){
        if(!(entry.duration>=frameMs))continue;
        const scripts=[];for(const script of entry.scripts??[])if(script.duration>=5)scripts.push({ms:Math.round(script.duration),by:short(script.invoker),fn:short(script.sourceFunctionName),file:short(script.sourceURL),at:script.sourceCharPosition??-1});
        scripts.sort((a,b)=>b.ms-a.ms);scripts.length=Math.min(scripts.length,4);
        frames.push({startMs:Math.round(entry.startTime),ms:Math.round(entry.duration),scripts});if(frames.length>frameLimit)frames.shift();
      }});
      frameObserver.observe({type:'long-animation-frame'});
    }
  }catch{frameObserver=null;}
  return {
    supported:observer!==null,
    // startMs is on the page clock (performance.now), the same one the frame events use.
    snapshot(){const recent=[];for(let i=0;i<tasks.length;i+=2)recent.push({startMs:tasks[i],ms:tasks[i+1]});const result={supported:observer!==null,total,totalMs:Math.round(totalMs),recent};if(frameObserver)result.frames=frames.map(frame=>({...frame,scripts:frame.scripts.slice()}));return result;},
    dispose(){try{observer?.disconnect();frameObserver?.disconnect();}catch{/* already gone */}observer=null;frameObserver=null;tasks.length=0;frames.length=0;},
  };
}
