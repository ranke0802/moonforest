import {validateItemDrop,ITEM_DROP_MODELS} from './item-drop-data.js';
import {CHAPTER_QUESTS} from './chapter-quest-data.js';
import {chestRewards} from './loot-rarity.js';
export const CHAPTER_SAVE='moonforest-chapter-one-v1';
const lookup=new Map(CHAPTER_QUESTS.map(q=>[q.id,q]));
const integer=n=>Number.isSafeInteger(n)&&n>=0?Math.min(n,100000):0;
const initial=()=>({version:1,active:['M00'],done:[],facts:{},seen:[],bag:{},xp:0,tracked:'M00',quickPie:false,pendingDrops:[]});
/** Persistent quest facts are independent of NPC meshes and combat object pools. */
export class ChapterJourney{
 constructor(storage){this.storage=storage;this.value=initial();this.volatile=false;
  try{const v=JSON.parse(storage?.getItem(CHAPTER_SAVE)||'null');if(v?.version===1){
   for(const key of ['active','done'])this.value[key]=[...new Set((Array.isArray(v[key])?v[key]:[]).filter(id=>lookup.has(id)))];
   for(const key of ['facts','bag'])for(const [id,n]of Object.entries(v[key]??{}))if(/^[a-zA-Z0-9:_-]{1,90}$/.test(id))this.value[key][id]=integer(n);
   this.value.seen=[...new Set((Array.isArray(v.seen)?v.seen:[]).filter(k=>typeof k==='string'&&k.length<120))].slice(-5000);
   this.value.pendingDrops=(Array.isArray(v.pendingDrops)?v.pendingDrops:[]).filter(validateItemDrop).slice(0,512);
   this.value.xp=integer(v.xp);this.value.tracked=lookup.has(v.tracked)?v.tracked:'M00';this.value.quickPie=v.quickPie===true;
  }}catch{}this.seen=new Set(this.value.seen);
 }
 save(){try{this.storage?.setItem(CHAPTER_SAVE,JSON.stringify(this.value));this.volatile=!this.storage;}catch{this.volatile=true;}}
 status(id){const q=lookup.get(id),v=this.value;if(!q)return 'missing';if(v.done.includes(id))return 'done';if(v.active.includes(id))return this.ready(id)?'ready':'active';return q.requires.every(p=>v.done.includes(p))?'available':'locked';}
 accept(id){if(this.status(id)!=='available')return false;this.value.active.push(id);this.value.tracked=id;this.save();return true;}
 progress(q){return q.objectives.map(o=>({...o,value:Math.min(o.count,this.value.facts[o.key]??0)}));}
 ready(id){const q=lookup.get(id);return !!q&&q.objectives.every(o=>(this.value.facts[o.key]??0)>=o.count);}
 record(key,amount=1,token=null){if(!Number.isSafeInteger(amount)||amount<=0||!key||token&&this.seen.has(token))return false;
  if(token){this.seen.add(token);this.value.seen.push(token);}this.value.facts[key]=Math.min(100000,(this.value.facts[key]??0)+amount);this.save();return true;}
 collect(item,count=1,token){if(!this.record('item:'+item,count,token))return false;this.value.bag[item]=(this.value.bag[item]??0)+count;this.save();return true;}
 // The chest-open token and the uncollected reward are one durable write.
 openChest(point,{origin,position}={}){
  const rewards=chestRewards(point?.tier),token='point:'+point?.id;
  if(!rewards||!point?.id||!point?.key||this.seen.has(token)||this.value.pendingDrops.length>=512||this.value.pendingDrops.filter(drop=>drop.mapId===point.map).length>=128)return null;
  if(point.id==='lookout-chest')rewards['equipment-voucher']=1;
  if(['goblin-relic','village-relief'].includes(point.id))rewards['key-3']=1;
  const bonus=Object.entries(ITEM_DROP_MODELS).find(([,asset])=>asset===point.dropAssetId)?.[0];if(bonus)rewards[bonus]=(rewards[bonus]??0)+1;
  const item=Object.keys(rewards).find(key=>ITEM_DROP_MODELS[key]),drop={id:'chest:'+point.id,mapId:point.map,model:point.dropAssetId||ITEM_DROP_MODELS[item],effectEnabled:point.dropEffectEnabled===true,origin,position,rewards};
  if(!validateItemDrop(drop))return null;
  this.seen.add(token);this.value.seen.push(token);this.value.facts[point.key]=Math.min(100000,(this.value.facts[point.key]??0)+1);this.value.pendingDrops.push(drop);this.save();return drop;
 }
 queueMonsterDrop(drop){if(!validateItemDrop(drop)||this.value.pendingDrops.some(item=>item.id===drop.id))return false;
  if(this.value.pendingDrops.length>=512||this.value.pendingDrops.filter(item=>item.mapId===drop.mapId).length>=128){const existing=this.value.pendingDrops.find(item=>item.mapId===drop.mapId&&Object.keys({...item.rewards,...drop.rewards}).length<=16&&Object.entries(drop.rewards).every(([key,n])=>(item.rewards[key]??0)+n<=100000));if(!existing)return false;for(const [key,n]of Object.entries(drop.rewards))existing.rewards[key]=(existing.rewards[key]??0)+n;if(drop.sourceKind==='boss')existing.sourceKind='boss';}
  else this.value.pendingDrops.push(structuredClone(drop));return true;}
 addMonsterDrop(drop){if(!this.queueMonsterDrop(drop))return false;this.save();return true;}
 recordDefeatDrop(key,drop){if(!key||!this.queueMonsterDrop(drop))return false;this.value.facts[key]=Math.min(100000,(this.value.facts[key]??0)+1);this.save();return true;}

 collectDrop(id){const index=this.value.pendingDrops.findIndex(drop=>drop.id===id);if(index<0)return null;const [drop]=this.value.pendingDrops.splice(index,1);for(const [item,count]of Object.entries(drop.rewards)){this.value.bag[item]=Math.min(100000,(this.value.bag[item]??0)+count);if(item!=='gold')this.value.facts['item:'+item]=Math.min(100000,(this.value.facts['item:'+item]??0)+count);}this.save();return drop;}
 claim(id){if(this.status(id)!=='ready')return null;const q=lookup.get(id),v=this.value;
  v.done.push(id);v.active=v.active.filter(k=>k!==id);v.xp+=q.xp;
  for(const [key,n]of Object.entries(q.rewards))v.bag[key]=(v.bag[key]??0)+n;
  const consumed={Q01:{apple:4},Q05:{'goblin-iron':3},Q06:{cargo:3,locket:1}}[id]??{};
  for(const [key,n]of Object.entries(consumed))v.bag[key]=Math.max(0,(v.bag[key]??0)-n);
  const next=CHAPTER_QUESTS.find(q=>q.type==='메인'&&this.status(q.id)==='available');if(next){v.active.push(next.id);v.tracked=next.id;}
  this.save();return {id,xp:q.xp,items:{...q.rewards}};
 }
 use(item,apply){if((this.value.bag[item]??0)<1)return false;if(!apply())return false;this.value.bag[item]--;this.save();return true;}
 track(id){if(!lookup.has(id))return;this.value.tracked=id;this.save();}
 quick(){if((this.value.bag.pie??0)<1)return false;this.value.quickPie=true;this.record('quick:pie',1,'quick:pie');return true;}
}
