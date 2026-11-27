// One physical press is either a short dodge or a held sprint, never both.
// Ownership stays with the input layer so cancellation cannot turn into a tap.
export const DODGE_SPRINT_HOLD_SECONDS=.2;

export class DodgeSprintGesture {
  // pressDodge (optional, 0.3 in a fight): the roll starts on the press instead of the release, so a
  // touch tap is not late by its own length and a long panic press still rolls (then sprints if held).
  constructor({onDodge=()=>{},onSprint=()=>{},now=()=>performance.now(),holdSeconds=DODGE_SPRINT_HOLD_SECONDS,pressDodge=()=>false}={}){
    this.onDodge=onDodge;this.onSprint=onSprint;this.now=now;this.holdSeconds=holdSeconds;this.sources=new Map();this.sprinting=false;
    this.pressDodge=pressDodge;this.rolled=false;
  }
  begin(source,{pointerType='unknown'}={}){
    if(this.sources.has(source))return false;
    const first=!this.sources.size;
    this.sources.set(source,{start:this.now(),pointerType});
    if(first&&this.pressDodge()){this.rolled=true;this.onDodge();}
    return true;
  }
  advance(frameSeconds=0){
    if(this.sprinting||!this.sources.size)return;
    let first=Infinity;
    for(const value of this.sources.values())first=Math.min(first,value.start);
    const elapsed=Math.max(0,(this.now()-first)/1000);
    if(elapsed+1e-8<this.holdSeconds)return;
    this.sprinting=true;
    // Only the part of the current frame after the threshold may sprint.
    this.onSprint(true,Math.min(Math.max(0,frameSeconds),Math.max(0,elapsed-this.holdSeconds)));
  }
  end(source){
    if(!this.sources.has(source))return false;
    this.advance();this.sources.delete(source);
    if(this.sources.size)return true;
    const rolled=this.rolled;this.rolled=false;
    if(this.sprinting){this.sprinting=false;this.onSprint(false,0);}
    else if(!rolled)this.onDodge();
    return true;
  }
  cancel(source){
    if(source!==undefined){if(!this.sources.delete(source))return false;if(this.sources.size)return true;}
    else this.sources.clear();
    this.rolled=false;
    if(this.sprinting){this.sprinting=false;this.onSprint(false,0);}
    return true;
  }
  hasTouchHud(pointerType){
    let touch=false,mouse=false;
    for(const [source,entry]of this.sources)if(source.startsWith('button:')){
      if(entry.pointerType==='mouse')mouse=true;else touch=true;
    }
    return touch&&(!!pointerType||!mouse);
  }
}
