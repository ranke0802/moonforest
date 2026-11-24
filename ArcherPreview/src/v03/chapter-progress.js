export const JOURNAL_QUEST_IDS=Object.freeze(['E01','E02']);

// A chapter becomes eligible only when it has both content and a cleared prerequisite.
export const CHAPTERS=Object.freeze([
 {id:1,entry:'warrior-plains',requires:null},
 {id:2,entry:'warrior-v3',requires:1,questIds:JOURNAL_QUEST_IDS,load:async lang=>(await import('./data/chapter2.js')).elenaJournal(lang)},
 {id:3,entry:null,requires:2},{id:4,entry:null,requires:3},
 {id:5,entry:null,requires:4},{id:6,entry:null,requires:5},{id:7,entry:null,requires:6},
]);
const KEY='v03-chapters-v1';
export const questKey=(id,replay=false)=>(replay?'replay:':'')+(id===1?'v03-story-v1':'v03-story-chapter-'+id);
function read(storage){try{return JSON.parse(storage.getItem(KEY))??{};}catch{return {};}}
export function chapterProgress(storage,questSets){
 const record=read(storage);
 const done=new Set((Array.isArray(record.done)?record.done:[]).filter(id=>CHAPTERS.some(row=>row.id===id&&row.entry)));
 // The end pointer was saved by shipped 0.3 builds, including the last inn conversation.
 for(const row of CHAPTERS){
  if(!questSets[row.id]?.length||done.has(row.id))continue;
  let log;try{log=JSON.parse(storage.getItem(questKey(row.id)));}catch{continue;}
  if(log?.quest===questSets[row.id].length&&log.step===0&&Array.isArray(log.done))done.add(row.id);
 }
 const available=id=>{const row=CHAPTERS.find(row=>row.id===id);return !!row?.entry&&!!questSets[id]?.length&&(!row.requires||done.has(row.requires));};
 const id=available(record.id)?record.id:1;
 const replay=record.replay===true&&done.has(id);
 const places={...record.places};
 const lane=(id,replay)=>String(id)+(replay?'-replay':'');
 const persist=value=>{try{storage.setItem(KEY,JSON.stringify(value));return true;}catch{return false;}};
 return {id,replay,done,available,
  markComplete(){if(done.has(id))return;done.add(id);persist({id,replay,done:[...done],places});},
  select(next,{again=false,current}={}){
   if(!available(next)||(again&&!done.has(next)))return null;
   if(current?.character)places[lane(id,replay)]={character:current.character,title:current.title,titleKey:current.titleKey,place:current.place};
   const checkpoint=again?null:places[lane(next,false)];
   const destination=checkpoint??{character:CHAPTERS.find(row=>row.id===next).entry};
   if(!persist({id:next,replay:again,done:[...done],places}))return null;
   if(again)storage.removeItem(questKey(next,true));
   return destination;
  },
 };
}
