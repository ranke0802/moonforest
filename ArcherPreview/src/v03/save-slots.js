// 0.3 save namespaces. Preferences live at edition level; progress lives in a
// slot. Pure storage logic: no DOM, no engine, safe to import from main.js.
export const SLOT_COUNT=3;
const INDEX_KEY='slots:v1',INTENT_KEY='intent:v1',LAST_KEY='last-slot:v1';
// Display/input preferences a returning 0.2 player keeps. Progress, authored
// drafts and combat sequences are intentionally not inherited.
export const INHERITED_PREFERENCES=Object.freeze(['archer-render-quality','moonforest-frame-rate-v2','moonforest-render-scale-v1','moonforest-plains-view-distance-v2','moonforest-weather-v1','moonforest-sword-trail-v1','moonforest-camera-motion-follow-v1','moonforest-camera-upward-limit-v1','moonforest-player-texture-pc-v1','moonforest-movement-speed-v1','moonforest-character-style-v1']);
const usable=raw=>!!raw&&typeof raw.getItem==='function'&&typeof raw.setItem==='function';
function prefixed(raw,prefix,fallback=null,inherited=[]){
 const inherit=new Set(inherited);
 return {
  get available(){return usable(raw);},
  getItem(key){
   let value=null;try{value=raw?.getItem(prefix+key)??null;}catch{value=null;}
   if(value!==null||!fallback||!inherit.has(key))return value;
   try{return fallback.getItem(key)??null;}catch{return null;}
  },
  setItem(key,value){if(!usable(raw))throw new Error('브라우저 저장소를 사용할 수 없습니다.');raw.setItem(prefix+key,String(value));},
  removeItem(key){if(!usable(raw))throw new Error('브라우저 저장소를 사용할 수 없습니다.');raw.removeItem?.(prefix+key);},
 };
}
export const editionPrefix=edition=>edition+':';
export const slotPrefix=(edition,slot)=>edition+':slot'+slot+':';
export function editionStorage(raw,fallback,edition){return prefixed(raw,editionPrefix(edition)+'pref:',fallback,INHERITED_PREFERENCES);}
export function slotStorage(raw,edition,slot){return prefixed(raw,slotPrefix(edition,slot));}
const validSlot=value=>Number.isInteger(value)&&value>=1&&value<=SLOT_COUNT;
const emptyMeta=slot=>({slot,used:false});
function cleanMeta(slot,value){
 if(!value||typeof value!=='object'||value.used!==true)return emptyMeta(slot);
 const text=(v,max)=>typeof v==='string'?v.slice(0,max):'';
 const number=(v,min,max)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):min;
 return {slot,used:true,chapter:number(value.chapter,1,9),title:text(value.title,60),place:text(value.place,40),character:text(value.character,24),
  level:number(value.level,1,99),playSeconds:Math.floor(number(value.playSeconds,0,3.6e7)),createdAt:number(value.createdAt,0,8.64e15),savedAt:number(value.savedAt,0,8.64e15)};
}
export function readSlotIndex(raw,edition){
 let parsed=null;try{parsed=JSON.parse(raw?.getItem(editionPrefix(edition)+INDEX_KEY)??'null');}catch{parsed=null;}
 return Array.from({length:SLOT_COUNT},(_,i)=>cleanMeta(i+1,parsed?.[i+1]));
}
function writeIndex(raw,edition,index){
 if(!usable(raw))return false;
 const out={};for(const meta of index)if(meta.used)out[meta.slot]=meta;
 try{raw.setItem(editionPrefix(edition)+INDEX_KEY,JSON.stringify(out));return true;}catch{return false;}
}
export function writeSlotMeta(raw,edition,slot,patch){
 if(!validSlot(slot))return false;
 const index=readSlotIndex(raw,edition),current=index[slot-1];
 index[slot-1]=cleanMeta(slot,{...current,...patch,used:true,createdAt:current.used?current.createdAt:patch.createdAt??patch.savedAt});
 return writeIndex(raw,edition,index);
}
// Removes every key of one slot. Other slots, preferences and other editions
// are never touched; an unreadable storage reports false instead of throwing.
export function wipeSlot(raw,edition,slot){
 if(!validSlot(slot)||!usable(raw))return false;
 const prefix=slotPrefix(edition,slot),doomed=[];
 try{
  for(let i=0;i<(raw.length??0);i++){const key=raw.key(i);if(typeof key==='string'&&key.startsWith(prefix))doomed.push(key);}
  for(const key of doomed)raw.removeItem(key);
 }catch{return false;}
 const index=readSlotIndex(raw,edition);index[slot-1]=emptyMeta(slot);
 return writeIndex(raw,edition,index);
}
// The page boots into the slot a first-time "new game" would use, so that
// starting it needs no reload: explicit request → first empty → last played.
export function chooseBootSlot(index,{requested=null,last=null}={}){
 if(validSlot(requested))return requested;
 const empty=index.find(meta=>!meta.used);if(empty)return empty.slot;
 if(validSlot(last))return last;
 return [...index].sort((a,b)=>(b.savedAt??0)-(a.savedAt??0))[0]?.slot??1;
}
export function readIntent(session,edition){
 try{const value=JSON.parse(session?.getItem(editionPrefix(edition)+INTENT_KEY)??'null');
  if(value&&validSlot(value.slot)&&(value.mode==='new'||value.mode==='load'))return {slot:value.slot,mode:value.mode};
 }catch{/* A damaged intent is simply ignored. */}
 return null;
}
export function writeIntent(session,edition,intent){if(!usable(session))return false;try{session.setItem(editionPrefix(edition)+INTENT_KEY,JSON.stringify(intent));return true;}catch{return false;}}
export function clearIntent(session,edition){try{session?.removeItem(editionPrefix(edition)+INTENT_KEY);}catch{/* optional */}}

// One object for the page: which slot this document is bound to, and why.
export function createSaveSession({local,session,edition,now=()=>Date.now()}){
 const intent=readIntent(session,edition);clearIntent(session,edition);
 let last=null;try{last=Number(local?.getItem(editionPrefix(edition)+LAST_KEY));}catch{last=null;}
 const index=readSlotIndex(local,edition),slot=chooseBootSlot(index,{requested:intent?.slot??null,last});
 const journey=slotStorage(local,edition,slot);
 return {
  edition,slot,intent,journey,
  get available(){return usable(local);},
  index:()=>readSlotIndex(local,edition),
  meta:()=>readSlotIndex(local,edition)[slot-1],
  // Marks the bound slot as a real save. Called when a game actually starts.
  commit(patch={}){const at=now();try{local?.setItem(editionPrefix(edition)+LAST_KEY,String(slot));}catch{/* optional */}return writeSlotMeta(local,edition,slot,{...patch,savedAt:at,createdAt:at});},
  // Updates an existing save only: a slot becomes a save through commit().
  touch(patch={}){if(!readSlotIndex(local,edition)[slot-1].used)return false;return writeSlotMeta(local,edition,slot,{...patch,savedAt:now()});},
  wipe:target=>wipeSlot(local,edition,target),
  // A different slot, or restarting a used one, needs a clean document.
  request(target,mode){return writeIntent(session,edition,{slot:target,mode});},
 };
}
