// How often the browser actually hands the page a frame (requestAnimationFrame
// callbacks per second), independent of the game's own frame cap. Shown next
// to the FPS counter so a 60 FPS reading can be told apart: browser at 60 Hz
// vs. game work too slow (2026-11-19: a 240 Hz laptop whose Chrome ran at 60).
export function createRefreshMeter(view=globalThis){
 const raf=view?.requestAnimationFrame?.bind(view);
 const meter={hz:null,frames:0,started:null,stopped:false};
 if(!raf)return meter;
 const tick=time=>{
  if(meter.stopped)return;
  if(meter.started===null)meter.started=time;
  meter.frames++;
  if(time-meter.started>=1000){meter.hz=Math.round(meter.frames*1000/(time-meter.started));meter.frames=0;meter.started=time;}
  raf(tick);
 };
 raf(tick);
 meter.stop=()=>{meter.stopped=true;};
 return meter;
}
// A fixed amount of arithmetic, timed. On one device it costs the same every
// time unless the CPU itself slows down (heat, power saving), so a rising value
// over a session separates device slowdown from the game doing more work.
const calibration=new Float64Array(4096);
export function calibrationMs(now=()=>performance.now()){
 const start=now();let x=1;
 for(let round=0;round<40;round++)for(let i=0;i<4096;i++){x=(x*1.0000001+calibration[i]+i)%1000;calibration[i]=x;}
 return Math.round((now()-start)*1000)/1000;
}
