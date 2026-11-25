// Counts shader programs that came into being since the previous frame, for the
// frame recorder (2026-11-25 S23 reading: draw submission jumped to 64-143 ms the
// first time a wolf faded, the horse was mounted and the raid goblins appeared;
// the recording could not say whether a new program was built in that frame).
// Diagnostics only: the caller runs frame() while the recorder is collecting.
// The count walks the engine's program table without allocating; names are read
// only in a frame where the table grew. Holds key strings, never Effect objects.
const RECENT=12,SEEN_LIMIT=4096;
const short=(value,limit)=>typeof value==='string'?(value.length>limit?value.slice(0,limit)+'…':value):null;
function nameOf(effect){
 const name=effect?.name;
 if(typeof name==='string')return short(name,80);
 return short([name?.vertex??name?.vertexElement,name?.fragment??name?.fragmentElement].filter(Boolean).join(' / ')||'effect',80);
}
export function createShaderBirthWatch(getEngine,now=()=>performance.now()){
 let count=-1,table=null;const seen=new Set(),recent=[];
 const size=effects=>{let n=0;for(const key in effects)n++;return n;};
 return {
  // New programs since the last call; 0 on the first call for an engine.
  frame(){
   const effects=getEngine()?._compiledEffects;
   if(!effects){count=-1;table=null;return 0;}
   const n=size(effects);
   if(table!==effects||count<0){
    table=effects;count=n;seen.clear();for(const key in effects)seen.add(key);return 0;
   }
   if(n===count)return 0;
   let born=0;const at=Math.round(now());
   for(const key in effects){
    if(seen.has(key))continue;
    born++;if(seen.size<SEEN_LIMIT)seen.add(key);
    if(recent.length>=RECENT)recent.shift();
    recent.push({atMs:at,shader:nameOf(effects[key]),defines:short(effects[key]?.defines,160)});
   }
   // Programs released since the last call leave the table; forget them when it shrinks.
   if(n<count+born)for(const key of seen)if(!(key in effects))seen.delete(key);
   count=n;return born;
  },
  recent(){return recent.map(entry=>({...entry}));},
  // Not recording this frame: programs built meanwhile (loading) are not this watch's births.
  pause(){count=-1;},
  reset(){count=-1;table=null;seen.clear();recent.length=0;}
 };
}
