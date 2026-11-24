import {TOWN_ITEMS,STOCK,RECIPES,BOOSTS,FORGE_RULES,gradeStrike} from './town-items.js';
import {validateItemDrop} from '../item-drop-data.js';
const slots=['sword','shield','armor'];
const qty=n=>Number.isSafeInteger(n)&&n>0&&n<=99999?n:0;
const baseDur=(id,level)=>Math.max(FORGE_RULES.minDurability,TOWN_ITEMS[id].max-level*FORGE_RULES.durabilityCost);
const defaultGear={sword:'field-sword',shield:'field-shield',armor:null};
const own=(state,id)=>!!state.bag[id];
export function normalizeTown(raw,legacy={}){
 const bag={'field-sword':1,'field-shield':1};
 if(!raw){
  bag.potion=3;
  const swords={original:'oathblade','teal-bronze':'bronze-blade','violet-silver':'violet-blade','soldier-sword':'field-sword'};
  const shields={original:'field-shield','teal-bronze':'oak-shield','violet-silver':'silver-shield'};
  const gear={...defaultGear};
  if(swords[legacy.sword])bag[gear.sword=swords[legacy.sword]]=1;
  if(shields[legacy.shield])bag[gear.shield=shields[legacy.shield]]=1;
  if(legacy.armor==='leather')bag[gear.armor='leather-coat']=1;
  raw={bag,equipped:gear};
 }
 for(const [id,count] of Object.entries(raw.bag??{}))if(TOWN_ITEMS[id]&&qty(count))bag[id]=qty(count);
 const equipped={...defaultGear},condition={};
 for(const slot of slots){const id=raw.equipped?.[slot];if(bag[id]&&TOWN_ITEMS[id]?.slot===slot)equipped[slot]=id;}
 for(const id of Object.keys(bag)){
  if(!TOWN_ITEMS[id].slot)continue;
  const source=raw.condition?.[id]??raw.weapons?.[id],level=Math.min(FORGE_RULES.maxLevel,qty(source?.level)),max=baseDur(id,level);
  condition[id]={level,hp:Number.isSafeInteger(source?.hp)?Math.max(0,Math.min(max,source.hp)):max};
 }
 const opened=Array.isArray(raw.opened)?[...new Set(raw.opened.filter(v=>typeof v==='string'&&v.length<120))].slice(0,128):[];
 const drops=Array.isArray(raw.drops)?raw.drops.filter(d=>validateItemDrop(d)&&Object.keys(d.rewards).every(id=>TOWN_ITEMS[id])).slice(0,128):[];
 return {version:1,bag,equipped,condition,opened,drops,quick:TOWN_ITEMS[raw.quick]?.quick?raw.quick:'potion',
   boost:Math.max(0,Math.min(90,Number(raw.boost)||0)),boostRate:raw.boostRate===1.75?1.75:1.5};
}
function give(state,id,count){
 const item=TOWN_ITEMS[id];if(!item||!qty(count))return;
 state.bag[id]=Math.min(99999,(state.bag[id]??0)+count);
 if(item.slot&&!state.condition[id])state.condition[id]={level:0,hp:item.max};
}
function take(state,id,count){state.bag[id]-=count;if(!state.bag[id])delete state.bag[id];}
export function createTownEconomy(wallet,legacy={}){
 let state=normalizeTown(wallet.town,legacy),dirty=false,unsavedSeconds=0,lastAction=null;
 function transact(delta,change){
  const next=structuredClone(state);
  if(change(next)===false||!wallet.tradeTown(delta,next))return false;
  state=next;dirty=false;unsavedSeconds=0;return true;
 }
 function flush(){
  if(!dirty)return true;
  if(!wallet.tradeTown(0,structuredClone(state)))return false;
  dirty=false;unsavedSeconds=0;return true;
 }
 function gear(id=state.equipped.sword){
  const item=TOWN_ITEMS[id],status=state.condition[id];
  if(!item||!status)return null;
  return {...status,max:baseDur(id,status.level),attack:status.hp&&item.attack?item.attack+status.level*FORGE_RULES.attackGain:0,defense:status.hp&&item.defense?item.defense+status.level*FORGE_RULES.defenseGain:0};
 }
 // Village service events for the story's errands ({type:'town',action,item}).
 // One listener at a time; the story sets it on start and clears it on stop.
 let listener=null;
 const told=(ok,action,item)=>{if(ok)try{listener?.({type:'town',action,item});}catch(error){console.warn('[MoonForest 0.3] town event',error);}return ok;};
 const api={
  set onEvent(fn){listener=typeof fn==='function'?fn:null;},
  get state(){return state;},get gold(){return wallet.balance;},
  get attack(){const id=state.equipped.sword,w=state.condition[id];return w.hp?TOWN_ITEMS[id].attack+w.level*FORGE_RULES.attackGain:0;},
  get defense(){let total=0;for(const slot of ['shield','armor']){const id=state.equipped[slot],w=state.condition[id];if(w?.hp)total+=TOWN_ITEMS[id].defense+w.level*FORGE_RULES.defenseGain;}return total;},
  get regen(){return state.boost>0?state.boostRate:1;},gear,flush,
  reset(legacy={}){state=normalizeTown(wallet.town,legacy);dirty=false;unsavedSeconds=0;lastAction=null;},
  tick(dt){if(state.boost>0&&dt>0){state.boost=Math.max(0,state.boost-dt);dirty=true;}if(dirty&&(unsavedSeconds+=dt)>=12){unsavedSeconds=0;flush();}},
  damageWeapon(actionId){
   if(actionId!=null&&lastAction===actionId)return false;lastAction=actionId;
   const w=state.condition[state.equipped.sword];if(!w?.hp)return false;
   w.hp--;dirty=true;return true;
  },
  wearDefense(blocked){const w=state.condition[state.equipped[blocked?'shield':'armor']];if(!w?.hp)return false;w.hp--;dirty=true;return true;},
  buy(shop,id){const price=STOCK[shop]?.[id];return told(!!price&&transact(-price,s=>give(s,id,1)),'buy',id);},
  sell(shop,id){
   const item=TOWN_ITEMS[id];return !!item?.sell&&!!STOCK[shop]&&own(state,id)&&transact(item.sell,s=>take(s,id,1));
  },
  craft(shop,id){const recipe=RECIPES[shop]?.[id];return told(!!recipe&&Object.entries(recipe.inputs).every(([k,n])=>(state.bag[k]??0)>=n)&&transact(-recipe.gold,s=>{
   for(const [key,n] of Object.entries(recipe.inputs))take(s,key,n);give(s,id,1);
  }),'craft',id);},
  repairCost(id){const w=gear(id);return w?Math.ceil((w.max-w.hp)/7):0;},
  repair(id=state.equipped.sword){const cost=api.repairCost(id);return told(cost>0&&transact(-cost,s=>{s.condition[id].hp=gear(id).max;}),'repair',id);},
  forgeCost(id){return 12+4*(gear(id)?.level??0);},
  canForge(id){const w=gear(id);return !!w&&w.level<FORGE_RULES.maxLevel&&wallet.balance>=api.forgeCost(id)&&['wolf-fang','boar-tusk','iron-scrap','tainted-fang','grave-dust','rune-shard'].some(id=>own(state,id));},
  forge(position,id=state.equipped.sword){if(!Number.isFinite(position)||!api.canForge(id))return null;
   const grade=gradeStrike(position);
   const material=['iron-scrap','wolf-fang','boar-tusk','grave-dust','tainted-fang','rune-shard'].find(id=>own(state,id));
   return told(transact(-api.forgeCost(id),s=>{
    take(s,material,1);const w=s.condition[id];
    if(grade==='Perfect'||grade==='Success'){w.level=Math.min(FORGE_RULES.maxLevel,w.level+(grade==='Perfect'?FORGE_RULES.perfectGain:1));w.hp=baseDur(id,w.level);}
    if(grade==='Failed')w.hp=Math.max(0,w.hp-FORGE_RULES.failureWear);
   }),'forge',id)?grade:null;
  },
  grant(id,count=1){return !!TOWN_ITEMS[id]&&qty(count)>0&&transact(0,s=>give(s,id,count));},
  // Hands bag items over (an errand delivery). All or nothing.
  spend(id,count=1){return !!TOWN_ITEMS[id]&&qty(count)>0&&(state.bag[id]??0)>=count&&transact(0,s=>take(s,id,count));},
  equip(id){const item=TOWN_ITEMS[id];return Boolean(item?.slot&&own(state,id))&&transact(0,s=>{s.equipped[item.slot]=id;});},
  register(id){return !!TOWN_ITEMS[id]?.quick&&own(state,id)&&transact(0,s=>{s.quick=id;});},
  drink(){const id=state.quick;if(!own(state,id)||!TOWN_ITEMS[id]?.quick)return false;
   return transact(0,s=>{take(s,id,1);if(BOOSTS[id]){s.boost=BOOSTS[id].seconds;s.boostRate=BOOSTS[id].rate;}});
  },
  // A chest and its on-ground items must either both exist or neither be committed.
  scatter(drops,chestId=null){
   if((chestId&&state.opened.includes(chestId))||!drops.length||state.drops.length+drops.length>128||!drops.every(validateItemDrop))return false;
   return transact(0,s=>{if(chestId)s.opened.push(chestId);s.drops.push(...drops);});
  },
  collect(ids){
   const set=new Set(ids),taken=state.drops.filter(d=>set.has(d.id));if(!taken.length)return null;
   const rewards={};
   for(const d of taken)for(const [id,n] of Object.entries(d.rewards))rewards[id]=(rewards[id]??0)+n;
   return transact(0,s=>{s.drops=s.drops.filter(d=>!set.has(d.id));for(const [id,n] of Object.entries(rewards))give(s,id,n);})?rewards:null;
  }
 };
 return api;
}
