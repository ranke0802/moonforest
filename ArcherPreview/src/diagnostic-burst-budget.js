// Reserve detail time by wall-clock minute so an early noisy phase cannot
// exhaust the entire 10-minute session. Each minute has a 500 ms ordinary
// budget and an independent 500 ms reserve for death/fade or critical stalls.
export class DiagnosticBurstBudget {
 constructor({durationMs=600000,slotMs=60000,ordinaryMs=500,criticalMs=500}={}){Object.assign(this,{durationMs,slotMs,ordinaryMs,criticalMs});this.slots=new Map();}
 take(elapsedMs,critical=false){
  if(!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>=this.durationMs)return 0;
  const slot=Math.floor(elapsedMs/this.slotMs),kind=critical?'critical':'ordinary';let state=this.slots.get(slot);
  if(!state){state={ordinary:false,critical:0};this.slots.set(slot,state);}
  if(critical){const remaining=this.criticalMs-state.critical;if(remaining<=0)return 0;const used=Math.min(250,remaining,this.durationMs-elapsedMs);state.critical+=used;return used;}
  if(state[kind])return 0;state[kind]=true;return Math.min(this.ordinaryMs,this.durationMs-elapsedMs);
 }
}
