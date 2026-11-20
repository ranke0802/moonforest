// The last stage a run reached, kept across a page kill (0.3, 2026-11-20).
// iOS Safari reloads a page that runs out of memory without telling it, and
// gives no memory figures: the only trace is where the run before stopped.
// The next run reads it (diagnostic record: previousRun). A run that ended
// with ended=false and hidden=false was killed while it was on screen.
// One small localStorage write per stage change, none per frame.
const KEY='moonforest:run-trail:v1',KEEP=12;

export function createRunTrail({storage=null,now=()=>Date.now()}={}){
 let previous=null;
 try{
  const raw=storage?.getItem(KEY);
  if(raw){
   const value=JSON.parse(raw);
   if(value&&typeof value==='object'){
    // The entry page hands over to the game's own address (measured: a boot-only
    // run that left normally sits between two real runs). It passes on the run
    // before it instead of hiding it.
    const passThrough=value.ended===true&&(value.trail?.length??0)<=1;
    previous=passThrough?value.carried??null:value;
    if(previous)previous={...previous,carried:undefined};
   }
  }
 }catch{/* unreadable: no previous run */}
 const state={startedAt:now(),stage:'boot',at:now(),ended:false,hidden:false,trail:[['boot',0]],carried:previous};
 const write=()=>{try{storage?.setItem(KEY,JSON.stringify(state));}catch{/* private mode or full: the game goes on */}};
 write();
 return {
  // The run before this one: {startedAt,stage,at,ended,hidden,trail:[[stage,secondsSinceStart],...]} or null.
  get previous(){return previous;},
  get stage(){return state.stage;},
  mark(stage){
   if(!stage||state.stage===stage)return;
   state.stage=stage;state.at=now();state.trail.push([stage,Math.round((state.at-state.startedAt)/100)/10]);
   if(state.trail.length>KEEP)state.trail.splice(0,state.trail.length-KEEP);
   write();
  },
  // The page was put in the background (a later discard there is not a crash).
  setHidden(hidden){hidden=!!hidden;if(state.hidden===hidden)return;state.hidden=hidden;write();},
  // The page is leaving normally.
  end(){if(state.ended)return;state.ended=true;write();},
 };
}
