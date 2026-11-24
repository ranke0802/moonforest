// Camera turn marker for the long frame recording (2026-11-24).
// The off-screen update work (actors that stop posing while unseen) is judged
// by what the player sees right after swinging the camera round, so the
// recording keeps, for every large turn, the worst frame of the following
// half second. A turn is a yaw change of at least `turnRadians` within
// `withinMs`; the window then runs `windowMs` from the frame that crossed it.
// Fixed buffers only: this runs on every recorded frame.
const RING=64;
export class CameraTurnWatch {
 constructor({turnRadians=Math.PI*2/3,withinMs=400,windowMs=500,limit=256}={}){
  Object.assign(this,{turnRadians,withinMs,windowMs,limit});
  this.times=new Float64Array(RING);this.yaws=new Float64Array(RING);
  this.reset();this.turns=[];this.dropped=0;
 }
 // Forget the yaw history (page reload, a paused gap): a jump across a gap is not a turn.
 reset(){this.head=0;this.size=0;this.lastYaw=NaN;this.total=0;this.active=null;}
 // atMs: frame start relative to the recording; intervalMs: time since the
 // previous frame start; workMs: this frame's JavaScript; wakes: actors the
 // frame brought back from an off-screen pause (section `ambientWakes`).
 frame(atMs,yaw,intervalMs,workMs,map,wakes=0){
  if(!Number.isFinite(yaw)||!Number.isFinite(atMs))return;
  if(Number.isFinite(this.lastYaw)){const d=yaw-this.lastYaw;this.total+=Math.atan2(Math.sin(d),Math.cos(d));}
  this.lastYaw=yaw;
  const active=this.active;
  if(active){
   active.frames++;
   if(this.total<active.low)active.low=this.total;if(this.total>active.high)active.high=this.total;
   if(intervalMs>active.worstFrameMs){active.worstFrameMs=intervalMs;active.worstAtMs=Math.round(atMs-active.startMs);}
   if(workMs>active.worstWorkMs)active.worstWorkMs=workMs;
   if(intervalMs>=33.4)active.framesOver33++;
   if(wakes>0)active.wakes+=wakes;
   if(atMs-active.startMs>=this.windowMs)this.finish();
   this.push(atMs);return;
  }
  this.push(atMs);
  let low=this.total,high=this.total;
  for(let i=1;i<this.size;i++){
   const at=(this.head-1-i+RING)%RING;if(atMs-this.times[at]>this.withinMs)break;
   const value=this.yaws[at];if(value<low)low=value;if(value>high)high=value;
  }
  if(high-low<this.turnRadians)return;
  this.active={atSecond:Math.round(atMs/100)/10,startMs:atMs,map:map??null,degrees:0,low,high,frames:0,worstFrameMs:0,worstAtMs:0,worstWorkMs:0,framesOver33:0,wakes:0};
  // The turn that crossed the line must not trigger again from its own history.
  this.size=1;
 }
 push(atMs){this.times[this.head]=atMs;this.yaws[this.head]=this.total;this.head=(this.head+1)%RING;if(this.size<RING)this.size++;}
 finish(){
  const turn=this.active;this.active=null;if(!turn)return;
  this.close(turn);
  if(this.turns.length<this.limit)this.turns.push(turn);else this.dropped++;
 }
 // A snapshot includes an unfinished window as it stands.
 list(){
  if(!this.active)return this.turns;
  const turn=this.close({...this.active,partial:true});
  return [...this.turns,turn];
 }
 // degrees: the whole swing, including what the camera kept turning inside the window.
 close(turn){
  turn.degrees=Math.round((turn.high-turn.low)*180/Math.PI);turn.worstFrameMs=Math.round(turn.worstFrameMs*10)/10;turn.worstWorkMs=Math.round(turn.worstWorkMs*10)/10;
  delete turn.startMs;delete turn.low;delete turn.high;return turn;
 }
}
