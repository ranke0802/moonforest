import {TOWN_ITEMS,STOCK,RECIPES,BOOSTS,FORGE_RULES,FORGE_MATERIALS,gradeStrike,forgeMax,forgeResult,forgeGain,forgeWear,legacyForgeBonus} from './town-items.js';
import {validateItemDrop} from '../item-drop-data.js';
import {MAX_TOTAL_XP,PASSIVE_LIMITS,SKILL_REFUND_GOLD,normalizeProgression,progressionStatus,questExperience,weaponWearInterval} from './character-progression.js';
export const MAX_GROUND_DROPS=128;
export const POTION_SLOT_COUNT=4;
const validPotionSlot=i=>Number.isInteger(i)&&i>=0&&i<POTION_SLOT_COUNT;
const slots=['sword','shield','armor'];
const qty=n=>Number.isSafeInteger(n)&&n>0&&n<=99999?n:0;
const defaultGear={sword:'field-sword',shield:'field-shield',armor:null};
const own=(state,id)=>!!state.bag[id];
const goldSource=quest=>(quest.giver?'v03-errand-':'v03-quest-')+quest.id;
const validQuestId=id=>typeof id==='string'&&/^[A-Za-z0-9:_-]{1,80}$/.test(id);
// One point in units divisible by 10, 15, 20, 25, 30 and 35 contacts.
// A skill change alters future contacts without rounding away existing wear.
const WEAR_UNITS=2100;
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
  const source=raw.condition?.[id]??raw.weapons?.[id],level=Math.min(FORGE_RULES.maxLevel,qty(source?.level));
  // Old saves inferred the maximum from level and extra loss on failures.
  const max=Number.isSafeInteger(source?.max)&&source.max>=FORGE_RULES.minDurability&&source.max<=TOWN_ITEMS[id].max
   ?source.max:forgeMax(id,level,qty(source?.loss));
  // A level used to be worth a fixed amount; since 2026-11-26 each attempt adds its own gain.
  const bonus=Number.isSafeInteger(source?.bonus)&&source.bonus>=0&&source.bonus<=level*(FORGE_RULES.attackGains.Perfect+FORGE_RULES.blessedBonus)
   ?source.bonus:legacyForgeBonus(TOWN_ITEMS[id].slot,level);
  condition[id]={level,bonus,max,hp:Number.isSafeInteger(source?.hp)?Math.max(0,Math.min(max,source.hp)):max};
  if(source?.blessed===true)condition[id].blessed=true;
  if(TOWN_ITEMS[id].slot==='sword'&&condition[id].hp>0&&Number.isInteger(source?.wearUnits)&&source.wearUnits>0&&source.wearUnits<WEAR_UNITS)
   condition[id].wearUnits=source.wearUnits;
 }
 // The ground-drop budget applies to live pickups. Opened chests are permanent per-slot history.
 const opened=Array.isArray(raw.opened)?[...new Set(raw.opened.filter(id=>typeof id==='string'&&
   (id.length<120||/^placed:(?:village|great-plains|monster-forest|witch-cave):[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(id))))]:[];
 const drops=Array.isArray(raw.drops)?raw.drops.filter(d=>validateItemDrop(d)&&Object.keys(d.rewards).every(id=>TOWN_ITEMS[id])).slice(0,MAX_GROUND_DROPS):[];
 const settledQuests=[...new Set(Array.isArray(raw.settledQuests)?raw.settledQuests.filter(validQuestId):[])];
 const quickSlots=Array(POTION_SLOT_COUNT).fill(null);
 // Preserve deliberately empty slots. Only a pre-belt ledger may supply a legacy default.
 const saved=Object.hasOwn(raw,'quickSlots')?(Array.isArray(raw.quickSlots)?raw.quickSlots:[]):[Object.hasOwn(raw,'quick')?raw.quick:bag.potion?'potion':null];
 for(let i=0;i<quickSlots.length;i++)if(typeof saved[i]==='string'&&TOWN_ITEMS[saved[i]]?.quick&&!quickSlots.includes(saved[i]))quickSlots[i]=saved[i];
 const selectedQuickSlot=validPotionSlot(raw.selectedQuickSlot)&&quickSlots[raw.selectedQuickSlot]?raw.selectedQuickSlot:Math.max(0,quickSlots.findIndex(Boolean));
 return {version:1,bag,equipped,condition,opened,drops,settledQuests,progression:normalizeProgression(raw.progression),quickSlots,selectedQuickSlot,quick:quickSlots[0],
   boost:Math.max(0,Math.min(90,Number(raw.boost)||0)),boostRate:raw.boostRate===1.75?1.75:1.5};
}
function give(state,id,count){
 const item=TOWN_ITEMS[id];if(!item||!qty(count))return;
 state.bag[id]=Math.min(99999,(state.bag[id]??0)+count);
 if(item.slot&&!state.condition[id])state.condition[id]={level:0,bonus:0,max:item.max,hp:item.max};
}
function take(state,id,count){
 state.bag[id]-=count;
 if(state.bag[id])return;
 delete state.bag[id];
 const slot=TOWN_ITEMS[id]?.slot;
 if(slot){delete state.condition[id];if(state.equipped[slot]===id)state.equipped[slot]=defaultGear[slot];}
}
function addKillExperience(state,amount){
 if(Number.isSafeInteger(amount)&&amount>0)state.progression.totalXp=Math.min(MAX_TOTAL_XP,state.progression.totalXp+amount);
}
// A cart is {id:count}; every entry must pass `allowed` and hold a whole count.
const cartOf=(cart,allowed)=>{
 const entries=Object.entries(cart??{});
 return entries.length&&entries.every(([id,n])=>allowed(id)&&qty(n))?entries:null;
};
export function createTownEconomy(wallet,legacy={},{random=Math.random}={}){
 let state=normalizeTown(wallet.town,legacy),dirty=false,unsavedSeconds=0,lastAction=null;
 function transact(delta,change,creditTotals=null){
  const next=structuredClone(state);
  if(change(next)===false)return false;
  next.quick=next.quickSlots[0]; // Keep slot 1 readable by a cached single-slot client.
  if(!wallet.tradeTown(delta,next,creditTotals))return false;
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
  return {level:status.level,bonus:status.bonus,blessed:status.blessed===true,hp:status.hp,max:status.max,attack:status.hp&&item.attack?item.attack+status.bonus:0,defense:status.hp&&item.defense?item.defense+status.bonus:0};
 }
 // Village service events for the story's errands ({type:'town',action,item}).
 // One listener at a time; the story sets it on start and clears it on stop.
 let listener=null;
 const told=(ok,action,item)=>{if(ok)try{listener?.({type:'town',action,item});}catch(error){console.warn('[MoonForest 0.3] town event',error);}return ok;};
 const api={
  set onEvent(fn){listener=typeof fn==='function'?fn:null;},
  get state(){return state;},get gold(){return wallet.balance;},
  get attack(){const id=state.equipped.sword,w=state.condition[id];return w.hp?TOWN_ITEMS[id].attack+w.bonus:0;},
  get defense(){let total=state.progression.skills.guardTraining;for(const slot of ['shield','armor']){const id=state.equipped[slot],w=state.condition[id];if(w?.hp)total+=TOWN_ITEMS[id].defense+w.bonus;}return total;},
  get regen(){return (state.boost>0?state.boostRate:1)*(1+.02*state.progression.skills.endurance);},gear,flush,
  get progression(){return progressionStatus(state.progression);},
  gainExperience(amount){
   if(!Number.isSafeInteger(amount)||amount<=0)return 0;
   const gain=Math.min(amount,MAX_TOTAL_XP-state.progression.totalXp);
   return gain>0&&transact(0,s=>{s.progression.totalXp+=gain;})?gain:0;
  },
  // Shipped saves only recorded completed quests and XP. Carry those completions
  // forward without reissuing consumables the player may already have used.
  creditQuests(ids,adoptCompleted=false,chapter=null){
   const known=[...new Set(ids)].filter(id=>questExperience(id)>0);
   const pending=known.filter(id=>!state.progression.quests.includes(id));
   const definitions=adoptCompleted&&chapter?[...(chapter.QUESTS??[]),...(chapter.ERRANDS??[])]:[];
   // Older shops kept both the quest XP entry and the cumulative gold source,
   // but discarded settledQuests when serializing their own inventory schema.
   const paid=definitions.filter(q=>q.reward?.gold>0&&state.progression.quests.includes(q.id)&&
    (wallet.credits?.[goldSource(q)]??0)>=q.reward.gold).map(q=>q.id);
   const settled=adoptCompleted?[...new Set([...known,...paid])].filter(id=>!state.settledQuests.includes(id)):[];
   if(!pending.length&&!settled.length)return 0;
   const gain=Math.min(MAX_TOTAL_XP-state.progression.totalXp,pending.reduce((sum,id)=>sum+questExperience(id),0));
   // The old ledger already marked each quest gold payment. A bare, nonzero
   // legacy balance has no provenance, so leave that balance intact.
   let gold=0;const credits={};
   if(settled.length&&chapter&&(wallet.saveState==='saved'||wallet.balance===0)){
    for(const q of definitions){
     if(!q.reward?.gold||!settled.includes(q.id))continue;
     const source=goldSource(q),due=q.reward.gold-(wallet.credits?.[source]??0);
     if(due>0){gold+=due;credits[source]=q.reward.gold;}
    }
   }
   gold=Math.min(gold,Number.MAX_SAFE_INTEGER-wallet.balance);
   return transact(gold,s=>{s.progression.totalXp+=gain;s.progression.quests.push(...pending);s.settledQuests.push(...settled);},gold?credits:null)?gain:0;
  },
  hasSettledQuest(id){return state.settledQuests.includes(id);},
  settleQuest(quest,step){
   const id=quest.id;if(!validQuestId(id))return null;
   if(api.hasSettledQuest(id))return {};
   const legacyPaid=state.progression.quests.includes(id);
   const cost=step?.type==='deliver'&&!legacyPaid?step:null;
   if(cost&&(!TOWN_ITEMS[cost.item]||!qty(cost.count)||(state.bag[cost.item]??0)<cost.count))return null;
   const reward=quest.reward??{},source=goldSource(quest);
   const gold=Math.min(Number.MAX_SAFE_INTEGER-wallet.balance,Math.max(0,(reward.gold??0)-(wallet.credits?.[source]??0)));
   const xp=legacyPaid?0:Math.min(MAX_TOTAL_XP-state.progression.totalXp,questExperience(id));
   const potions=legacyPaid?0:Math.min(reward.potions??0,99999-(state.bag.potion??0));
   const armor=!legacyPaid&&reward.armor==='leather'&&!own(state,'leather-coat')?'leather':null;
   // The receipt, delivery debit and all rewards share the same wallet write.
   const ok=transact(gold,s=>{
    if(cost)take(s,cost.item,cost.count);
    if(potions)give(s,'potion',potions);
    if(armor){give(s,'leather-coat',1);s.equipped.armor??='leather-coat';}
    s.progression.totalXp+=xp;
    if(questExperience(id)>0&&!s.progression.quests.includes(id))s.progression.quests.push(id);
    s.settledQuests.push(id);
   },reward.gold&&(wallet.credits?.[source]??0)<reward.gold?{[source]:reward.gold}:null);
   return ok?{gold,xp,potions,armor}:null;
  },
  learnSkill(id){
   if(!Object.hasOwn(PASSIVE_LIMITS,id)||state.progression.skills[id]>=PASSIVE_LIMITS[id]||!api.progression.points)return false;
   return transact(0,s=>{s.progression.skills[id]++;});
  },
  refundSkills(){
   if(!api.progression.spent||api.gold<SKILL_REFUND_GOLD)return false;
   return transact(-SKILL_REFUND_GOLD,s=>{for(const id of Object.keys(PASSIVE_LIMITS))s.progression.skills[id]=0;});
  },
  reset(legacy={}){state=normalizeTown(wallet.town,legacy);dirty=false;unsavedSeconds=0;lastAction=null;},
  resetWeaponAction(){lastAction=null;},
  tick(dt){if(state.boost>0&&dt>0){state.boost=Math.max(0,state.boost-dt);dirty=true;}if(dirty&&(unsavedSeconds+=dt)>=12){unsavedSeconds=0;flush();}},
  damageWeapon(actionId){
   if(actionId==null||lastAction===actionId)return false;lastAction=actionId;
   const w=state.condition[state.equipped.sword];if(!w?.hp)return false;
   const interval=weaponWearInterval(state.progression.skills.weaponCare);
   w.wearUnits=(w.wearUnits??0)+WEAR_UNITS/interval;dirty=true;
   if(w.wearUnits<WEAR_UNITS)return false;
   w.hp--;w.wearUnits=w.hp?w.wearUnits-WEAR_UNITS:0;
   return true;
  },
  wearDefense(blocked){const w=state.condition[state.equipped[blocked?'shield':'armor']];if(!w?.hp)return false;w.hp--;dirty=true;return true;},
  // One wallet write for the whole cart ({id:count}); all of it or none (2026-11-26, user:
  // pick quantities, then one button at the bottom).
  buyAll(shop,cart){
   const stock=STOCK[shop],items=stock&&cartOf(cart,id=>stock[id]>0);if(!items)return false;
   if(!transact(-items.reduce((sum,[id,n])=>sum+stock[id]*n,0),s=>{for(const [id,n] of items)give(s,id,n);}))return false;
   for(const [id] of items)told(true,'buy',id);return true;
  },
  buy(shop,id,count=1){return api.buyAll(shop,{[id]:count});},
  sellAll(shop,cart){
   const items=STOCK[shop]&&cartOf(cart,id=>TOWN_ITEMS[id]?.sell>0);
   if(!items||items.some(([id,n])=>(state.bag[id]??0)<n))return false;
   return transact(items.reduce((sum,[id,n])=>sum+TOWN_ITEMS[id].sell*n,0),s=>{for(const [id,n] of items)take(s,id,n);});
  },
  sell(shop,id,count=1){return api.sellAll(shop,{[id]:count});},
  // Returns {blessed:[ids]} or null. A crafted piece of gear is blessed one time in ten
  // (2026-11-26, user); the blessing belongs to that kind of piece in this bag from then on.
  craftAll(shop,cart){
   const recipes=RECIPES[shop],items=recipes&&cartOf(cart,id=>!!recipes[id]);if(!items)return null;
   const need={};let gold=0;
   for(const [id,n] of items){gold+=recipes[id].gold*n;for(const [key,each] of Object.entries(recipes[id].inputs))need[key]=(need[key]??0)+each*n;}
   if(Object.entries(need).some(([key,n])=>(state.bag[key]??0)<n))return null;
   const blessed=[];
   for(const [id,n] of items){
    if(!TOWN_ITEMS[id].slot||state.condition[id]?.blessed)continue;
    let lucky=false;for(let i=0;i<n;i++)if(random()<FORGE_RULES.blessChance)lucky=true;
    if(lucky)blessed.push(id);
   }
   if(!transact(-gold,s=>{
    for(const [key,n] of Object.entries(need))take(s,key,n);
    for(const [id,n] of items)give(s,id,n);
    for(const id of blessed)s.condition[id].blessed=true;
   }))return null;
   for(const [id] of items)told(true,'craft',id);return {blessed};
  },
  craft(shop,id,count=1){return !!api.craftAll(shop,{[id]:count});},
  repairCost(id){const w=gear(id);return w?Math.ceil((w.max-w.hp)/7):0;},
  repair(id=state.equipped.sword){const cost=api.repairCost(id);return told(cost>0&&transact(-cost,s=>{s.condition[id].hp=gear(id).max;delete s.condition[id].wearUnits;}),'repair',id);},
  forgeCost(id){return 12+4*(gear(id)?.level??0);},
  canForge(id){const w=gear(id);return !!w&&w.level<FORGE_RULES.maxLevel&&wallet.balance>=api.forgeCost(id)&&FORGE_MATERIALS.some(key=>own(state,key));},
  // Every attempt counts towards +N and is written at once, whatever its grade.
  forge(position,id=state.equipped.sword){if(!Number.isFinite(position)||!api.canForge(id))return null;
   const grade=gradeStrike(position),wear=forgeWear(random);
   const material=FORGE_MATERIALS.find(key=>own(state,key));
   return told(transact(-api.forgeCost(id),s=>{
    take(s,material,1);const w=s.condition[id];
    const next=forgeResult(w.level,w.max,wear);
    w.bonus+=forgeGain(TOWN_ITEMS[id].slot,grade,w.blessed===true);
    w.level=next.level;w.max=next.max;w.hp=Math.min(w.hp,w.max);
   }),'forge',id)?grade:null;
  },
  grant(id,count=1,experience=0){return !!TOWN_ITEMS[id]&&qty(count)>0&&transact(0,s=>{
   give(s,id,count);addKillExperience(s,experience);
  });},
  // Hands bag items over (an errand delivery). All or nothing.
  spend(id,count=1){const item=TOWN_ITEMS[id];return !!item&&qty(count)>0&&(state.bag[id]??0)>=count&&
   !(defaultGear[item.slot]===id&&count===state.bag[id])&&transact(0,s=>take(s,id,count));},
  equip(id){const item=TOWN_ITEMS[id];return Boolean(item?.slot&&own(state,id))&&transact(0,s=>{s.equipped[item.slot]=id;});},
  register(id,slot=state.selectedQuickSlot){
   if(!validPotionSlot(slot)||typeof id!=='string'||!TOWN_ITEMS[id]?.quick)return false;
   const previous=state.quickSlots.indexOf(id);
   if(previous<0&&!own(state,id))return false;
   if(previous===slot)return true;
   return transact(0,s=>{
    if(previous>=0)s.quickSlots[previous]=s.quickSlots[slot];
    s.quickSlots[slot]=id;
    if(!s.quickSlots[s.selectedQuickSlot])s.selectedQuickSlot=slot;
   });
  },
  unregister(slot){
   if(!validPotionSlot(slot)||!state.quickSlots[slot])return false;
   return transact(0,s=>{s.quickSlots[slot]=null;if(s.selectedQuickSlot===slot)s.selectedQuickSlot=Math.max(0,s.quickSlots.findIndex(Boolean));});
  },
  selectQuickSlot(slot){
   if(!validPotionSlot(slot)||!state.quickSlots[slot])return false;
   return slot===state.selectedQuickSlot||transact(0,s=>{s.selectedQuickSlot=slot;});
  },
  drink(slot=state.selectedQuickSlot){const id=state.quickSlots[slot];if(!validPotionSlot(slot)||!own(state,id)||!TOWN_ITEMS[id]?.quick||BOOSTS[id]&&state.boost>0)return false;
   return transact(0,s=>{take(s,id,1);if(BOOSTS[id]){s.boost=BOOSTS[id].seconds;s.boostRate=BOOSTS[id].rate;}});
  },
  // A chest and its on-ground items must either both exist or neither be committed.
  scatter(drops,chestId=null,experience=0){
   if((chestId&&state.opened.includes(chestId))||!drops.length||state.drops.length+drops.length>MAX_GROUND_DROPS||!drops.every(validateItemDrop))return false;
   return transact(0,s=>{
    if(chestId)s.opened.push(chestId);
    s.drops.push(...drops);
    addKillExperience(s,experience);
   });
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
