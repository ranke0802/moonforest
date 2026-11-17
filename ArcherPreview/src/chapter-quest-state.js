import {validateItemDrop,DROP_MAPS} from './item-drop-data.js';
import {CHAPTER_QUESTS} from './chapter-quest-data.js';
import {chestRewardDrops} from './chest-reward-data.js';
export const CHAPTER_SAVE='moonforest-chapter-one-v1';
export const CHAPTER_BACKUP=CHAPTER_SAVE+':last-good';
export const CHAPTER_PRESERVED=CHAPTER_SAVE+':preserved-original';
const lookup=new Map(CHAPTER_QUESTS.map(q=>[q.id,q]));
const integer=n=>Number.isSafeInteger(n)&&n>=0?Math.min(n,100000):0;
const goldInteger=n=>Number.isSafeInteger(n)&&n>=0?n:0;
const addGold=(a,b)=>Math.min(Number.MAX_SAFE_INTEGER,goldInteger(a)+goldInteger(b));
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
// Editor re-closing starts a new reward cycle without erasing quest history.
export const chestOpenToken=(id,cycle=0)=>'point:'+id+(Number.isSafeInteger(cycle)&&cycle>0?':cycle:'+cycle:'');
const initial=()=>({version:1,active:['M00'],done:[],facts:{},seen:[],bag:{},xp:0,tracked:'M00',quickPie:false,pendingDrops:[]});
function decode(raw){
 const v=JSON.parse(raw);if(!object(v)||v.version!==1)throw Object.assign(new Error('지원하지 않는 저장 버전입니다.'),{code:'unsupported'});
 const value=initial();
 for(const key of ['active','done'])value[key]=[...new Set((Array.isArray(v[key])?v[key]:[]).filter(id=>lookup.has(id)))];
 for(const key of ['facts','bag'])for(const [id,n]of Object.entries(object(v[key])?v[key]:{}))if(/^[a-zA-Z0-9:_-]{1,90}$/.test(id))value[key][id]=key==='bag'&&id==='gold'?goldInteger(n):integer(n);
 value.seen=[...new Set((Array.isArray(v.seen)?v.seen:[]).filter(k=>typeof k==='string'&&k.length<120))].slice(-5000);
 value.pendingDrops=(Array.isArray(v.pendingDrops)?v.pendingDrops:[]).filter(validateItemDrop).slice(0,512);
 value.xp=integer(v.xp);value.tracked=lookup.has(v.tracked)?v.tracked:'M00';value.quickPie=v.quickPie===true;return value;
}
/** Persistent quest facts are independent of NPC meshes and combat object pools. */
export class ChapterJourney{
 constructor(storage){this.storage=storage;this.value=initial();this.saveState='new';this.volatile=false;this.originalRaw=null;this._expectedRaw=null;this._lastValidRaw=null;this._blocked=false;this._readFailed=false;this.backupError=false;
  if(!storage||storage.available===false||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'){this.saveState='unavailable';this.volatile=true;}
  else try{const raw=storage.getItem(CHAPTER_SAVE)??null;this._expectedRaw=raw;if(raw!==null){this.originalRaw=raw;try{this.value=decode(raw);this._lastValidRaw=raw;this.saveState='saved';}catch(error){this.saveState=error.code==='unsupported'?'unsupported':'corrupt';this._blocked=true;this.volatile=true;}}}catch{this.saveState='failed';this.volatile=true;this._readFailed=true;}
  this.seen=new Set(this.value.seen);
 }
 _write(value,{replace=false}={}){
  if(!this.storage||this.storage.available===false){this.saveState='unavailable';this.volatile=true;return false;}
  if(this._blocked&&!replace){this.volatile=true;return false;}
  try{
   const current=this.storage.getItem(CHAPTER_SAVE)??null;
   if(current!==this._expectedRaw||(this._readFailed&&current!==null)){this.saveState='conflict';this.volatile=true;return false;}
   const raw=JSON.stringify(value);
   if(replace&&this._blocked&&this.originalRaw!==null){this.storage.setItem(CHAPTER_PRESERVED,this.originalRaw);if(this.storage.getItem(CHAPTER_PRESERVED)!==this.originalRaw)throw new Error('기존 저장 원본 보존 실패');}
   this.storage.setItem(CHAPTER_SAVE,raw);
   if(this.storage.getItem(CHAPTER_SAVE)!==raw)throw new Error('저장 확인 실패');
   this._expectedRaw=raw;this._lastValidRaw=raw;this._readFailed=false;this._blocked=false;this.originalRaw=null;this.saveState='saved';this.volatile=false;return true;
  }catch{this.saveState='failed';this.volatile=true;return false;}
 }
 save(){return this._write(this.value);}
 // Called at safe UI/periodic boundaries, never twice per reward or per frame.
 flushBackup(){if(!this._lastValidRaw||this.saveState!=='saved')return false;try{if(this.storage.getItem(CHAPTER_SAVE)!==this._expectedRaw){this.saveState='conflict';this.volatile=true;return false;}if(this.storage.getItem(CHAPTER_BACKUP)!==this._lastValidRaw)this.storage.setItem(CHAPTER_BACKUP,this._lastValidRaw);this.backupError=this.storage.getItem(CHAPTER_BACKUP)!==this._lastValidRaw;return !this.backupError;}catch{this.backupError=true;return false;}}
 get hasBackup(){try{const raw=this.storage?.getItem(CHAPTER_BACKUP);return !!raw&&!!decode(raw);}catch{return false;}}
 exportSave(){return JSON.stringify({format:'moonforest-progress',version:1,createdAt:new Date().toISOString(),progress:this.value,...(this.originalRaw!==null?{preservedOriginal:this.originalRaw}:{})},null,2);}
 importSave(text){try{if(typeof text!=='string'||text.length>4*1024*1024)return false;const document=JSON.parse(text),value=decode(JSON.stringify(document?.format==='moonforest-progress'&&document.version===1?document.progress:document));if(!this._write(value,{replace:true}))return false;this.value=value;this.seen=new Set(value.seen);return true;}catch{return false;}}
 recoverBackup(){try{const raw=this.storage?.getItem(CHAPTER_BACKUP);return !!raw&&this.importSave(raw);}catch{return false;}}
 status(id){const q=lookup.get(id),v=this.value;if(!q)return 'missing';if(v.done.includes(id))return 'done';if(v.active.includes(id))return this.ready(id)?'ready':'active';return q.requires.every(p=>v.done.includes(p))?'available':'locked';}
 accept(id){if(this.status(id)!=='available')return false;this.value.active.push(id);this.value.tracked=id;this.save();return true;}
 progress(q){return q.objectives.map(o=>({...o,value:Math.min(o.count,this.value.facts[o.key]??0)}));}
 ready(id){const q=lookup.get(id);return !!q&&q.objectives.every(o=>(this.value.facts[o.key]??0)>=o.count);}
 _record(key,amount,token){if(!Number.isSafeInteger(amount)||amount<=0||!key||token&&this.seen.has(token))return false;
  if(token){this.seen.add(token);this.value.seen.push(token);}this.value.facts[key]=Math.min(100000,(this.value.facts[key]??0)+amount);return true;}
 record(key,amount=1,token=null){if(!this._record(key,amount,token))return false;this.save();return true;}
 // Facts, bag and exactly-once token become durable together in one write.
 collect(item,count=1,token){if(!this._record('item:'+item,count,token))return false;this.value.bag[item]=item==='gold'?addGold(this.value.bag[item],count):(this.value.bag[item]??0)+count;this.save();return true;}
 // The chest-open token and the uncollected reward are one durable write.
 openChest(point,{origin,position,poses}={}){
  let parts;try{parts=chestRewardDrops(point);}catch{return null;}
  const token=chestOpenToken(point?.id,point?.openCycle),originalToken=chestOpenToken(point?.id);
  if(!parts||!point?.id||!point?.key||!DROP_MAPS.includes(point.map)||this.seen.has(token)||this.value.pendingDrops.length+parts.length>512||this.value.pendingDrops.filter(drop=>drop.mapId===point.map).length+parts.length>128)return null;
  const id='chest:'+point.id+(token===originalToken?'':':cycle:'+point.openCycle),drops=parts.map((part,index)=>({id:id+(index?':item:'+index:''),mapId:point.map,...part,effectEnabled:point.dropEffectEnabled===true,...(poses?.[index]??{origin,position})}));
  if(!drops.every(validateItemDrop))return null;
  if(!this.seen.has(originalToken)){this.seen.add(originalToken);this.value.seen.push(originalToken);this.value.facts[point.key]=Math.min(100000,(this.value.facts[point.key]??0)+1);}
  if(token!==originalToken){this.seen.add(token);this.value.seen.push(token);}this.value.pendingDrops.push(...drops);this.save();return drops[0]??{empty:true,rewards:{}};
 }
 queueMonsterDrop(drop){if(!validateItemDrop(drop)||this.value.pendingDrops.some(item=>item.id===drop.id))return false;
  if(this.value.pendingDrops.length>=512||this.value.pendingDrops.filter(item=>item.mapId===drop.mapId).length>=128){const existing=this.value.pendingDrops.find(item=>item.mapId===drop.mapId&&Object.keys({...item.rewards,...drop.rewards}).length<=16&&Object.entries(drop.rewards).every(([key,n])=>(item.rewards[key]??0)+n<=100000));if(!existing)return false;for(const [key,n]of Object.entries(drop.rewards))existing.rewards[key]=(existing.rewards[key]??0)+n;if(drop.sourceKind==='boss')existing.sourceKind='boss';}
  else this.value.pendingDrops.push(structuredClone(drop));return true;}
 addMonsterDrop(drop){if(!this.queueMonsterDrop(drop))return false;this.save();return true;}
 recordDefeatDrop(key,drop){if(!key||!this.queueMonsterDrop(drop))return false;this.value.facts[key]=Math.min(100000,(this.value.facts[key]??0)+1);this.save();return true;}
 recordDefeatReward(key,rewards){if(!key)return null;const granted={};this.value.facts[key]=Math.min(100000,(this.value.facts[key]??0)+1);for(const [item,count] of Object.entries(rewards)){if(!Number.isSafeInteger(count)||count<=0)continue;const previous=this.value.bag[item]??0,next=item==='gold'?addGold(previous,count):Math.min(100000,previous+count);this.value.bag[item]=next;if(next>previous)granted[item]=next-previous;if(item!=='gold')this.value.facts['item:'+item]=Math.min(100000,(this.value.facts['item:'+item]??0)+next-previous);}this.save();return granted;}

 collectDrop(id){const index=this.value.pendingDrops.findIndex(drop=>drop.id===id);if(index<0)return null;const [drop]=this.value.pendingDrops.splice(index,1);for(const [item,count]of Object.entries(drop.rewards)){this.value.bag[item]=item==='gold'?addGold(this.value.bag[item],count):Math.min(100000,(this.value.bag[item]??0)+count);if(item!=='gold')this.value.facts['item:'+item]=Math.min(100000,(this.value.facts['item:'+item]??0)+count);}this.save();return drop;}
 claim(id){if(this.status(id)!=='ready')return null;const q=lookup.get(id),v=this.value;
  v.done.push(id);v.active=v.active.filter(k=>k!==id);v.xp+=q.xp;
  for(const [key,n]of Object.entries(q.rewards))v.bag[key]=key==='gold'?addGold(v.bag[key],n):(v.bag[key]??0)+n;
  const consumed={Q01:{apple:4},Q05:{'goblin-iron':3},Q06:{cargo:3,locket:1}}[id]??{};
  for(const [key,n]of Object.entries(consumed))v.bag[key]=Math.max(0,(v.bag[key]??0)-n);
  const next=CHAPTER_QUESTS.find(q=>q.type==='메인'&&this.status(q.id)==='available');if(next){v.active.push(next.id);v.tracked=next.id;}
  this.save();return {id,xp:q.xp,items:{...q.rewards}};
 }
 use(item,apply){if((this.value.bag[item]??0)<1)return false;if(!apply())return false;this.value.bag[item]--;this.save();return true;}
 track(id){if(!lookup.has(id))return;this.value.tracked=id;this.save();}
 quick(){if((this.value.bag.pie??0)<1)return false;this.value.quickPie=true;this.record('quick:pie',1,'quick:pie');return true;}
}
