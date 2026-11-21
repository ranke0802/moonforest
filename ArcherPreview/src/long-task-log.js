// The browser's own list of main-thread tasks of 50 ms or more (PerformanceObserver
// 'longtask'), kept for the frame recording. The recording shows long frame intervals with
// no work measured inside the frame (phone, 2026-11-20: while scenery is prepared); those
// are tasks outside the frame loop, and this says when they ran and how long. The last
// `limit` tasks only; nothing is measured by this code itself.
export function createLongTaskLog({limit=60,Observer=globalThis.PerformanceObserver}={}){
  const tasks=[];let observer=null,total=0,totalMs=0;
  try{
    if(typeof Observer==='function'&&(Observer.supportedEntryTypes??[]).includes('longtask')){
      observer=new Observer(list=>{for(const entry of list.getEntries()){total++;totalMs+=entry.duration;tasks.push(Math.round(entry.startTime),Math.round(entry.duration));if(tasks.length>limit*2)tasks.splice(0,2);}});
      observer.observe({entryTypes:['longtask']});
    }
  }catch{observer=null;}
  return {
    supported:observer!==null,
    // startMs is on the page clock (performance.now), the same one the frame events use.
    snapshot(){const recent=[];for(let i=0;i<tasks.length;i+=2)recent.push({startMs:tasks[i],ms:tasks[i+1]});return {supported:observer!==null,total,totalMs:Math.round(totalMs),recent};},
    dispose(){try{observer?.disconnect();}catch{/* already gone */}observer=null;tasks.length=0;},
  };
}
