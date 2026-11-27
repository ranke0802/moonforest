import {createTownEconomy} from './town-economy.js';
import {TOWN_ITEMS,itemName,gearName,itemNote,itemUsage,boostText} from './town-items.js';
import {t} from './i18n.js';
import {monsterExperience} from './character-progression.js';
import {createTownTreasure} from './town-treasure.js';
import {createWeaponConditionHud} from './weapon-condition-hud.js';
import {createPotionHud} from './potion-hud.js';

// random: the economy's dice (temper wear, blessed crafting); tests fix it.
export function setupTownServices({root,world,wallet,legacy,player,battle,controls,appearance,canInteract,onPause,notify,sound,usePotion,canOpenPotionPicker,onPotionLayout,onLevelUp=null,random=Math.random}){
 const economy=createTownEconomy(wallet,legacy(),{random}),win=root.ownerDocument.defaultView;
 const healthHud=root.querySelector('#player-hud'),durabilityHud=healthHud?createWeaponConditionHud(healthHud):null;
 let shop=null,generation=0,disposed=false,wasPlaying=false,lastGear=null,appliedTo=null,treasure=null;
 const items=()=>economy.state;
 function syncDurability(){
  if(durabilityHud){const id=items().equipped.sword;durabilityHud.update(id,economy.gear(id));}
 }
 function apply(){
  const e=appearance(),s=items(),sword=TOWN_ITEMS[s.equipped.sword],shield=TOWN_ITEMS[s.equipped.shield];
  if(e&&(lastGear!==s.equipped.sword+'/'+s.equipped.shield||appliedTo!==e)){
   e.selectTrophy(sword.finish,sword.profile);e.select('shield',shield.finish);
   lastGear=s.equipped.sword+'/'+s.equipped.shield;appliedTo=e;
  }
  const b=battle();if(b)b.combat.defense=economy.defense;
  const c=controls();
  if(c){
   c.staminaRecoveryScale=economy.regen;
   c.greatAttackLevel=s.progression.skills.greatAttack;
   world.v03?.prepareGreatAttack?.(c.greatAttackLevel);
  }
  syncDurability();
 }
 // xpRatio: how far into the current level the bar stood at the last gain (the banner fills from it).
 let xpRatio=null;
 const ratioOf=p=>p.nextXp?p.xp/p.nextXp:1;
 function announceLevel(previous){
  const p=economy.progression,level=p.level,fromRatio=xpRatio??0;xpRatio=ratioOf(p);
  if(level<=previous)return;
  // 0.3 level-up moment (reward-celebration.js); the old message when nothing takes it.
  if(onLevelUp?.({level,points:level-previous,cap:p.cap,ratio:xpRatio,fromRatio})!==true)notify(t('reward.levelUp',{level}));
 }
 function canDrink(slot=items().selectedQuickSlot){
  const b=battle(),s=items(),id=s.quickSlots[slot];if(!b||b.loading||b.grab?.active||!b.playerAlive||b.playerHp<=0||!s.bag[id])return false;
  return id==='potion'?b.playerHp<b.playerMaxHp&&!b.potions.active:s.boost<=0;
 }
 function bag(){
  const s=items(),equipment=[];
  // Keep a depleted registration editable until the player removes it.
  for(const id of new Set([...Object.keys(s.bag),...s.quickSlots.filter(Boolean)])){
   const it=TOWN_ITEMS[id],count=s.bag[id]??0;if(!it)continue;
   const row={id,name:it.slot?gearName(id,s.condition[id]?.blessed===true):itemName(id),type:it.type,icon:id,quantity:count,
    worn:!!it.slot&&s.equipped[it.slot]===id,slot:it.slot,tradeId:id,quick:it.quick,quickSlot:it.quick?s.quickSlots.indexOf(id):-1};
   if(it.slot){
    const gear=economy.gear(id);row.level=gear.level;row.broken=gear.hp===0;
    row.stat=it.slot==='sword'?'attack':'defense';row.value=gear[row.stat];
    row.delta=row.value-(it.slot==='sword'?economy.attack:economy.gear(s.equipped[it.slot])?.defense??0);
    if(gear.level)row.name+=' +'+gear.level;
    row.note=t('char.durability',{hp:gear.hp,max:gear.max})+(it.usage?' · '+itemUsage(id):'');
   }else row.note=itemNote(id)??t('char.materialNote');
   equipment.push(row);
  }
  return equipment;
 }
 function flush(){economy.flush();}
 const onVisibility=()=>{if(root.ownerDocument.hidden)flush();};
 win.addEventListener('pagehide',flush);root.ownerDocument.addEventListener('visibilitychange',onVisibility);
 const potionButton=root.querySelector('#potion-button');
 const potionHud=usePotion&&potionButton?createPotionHud({root,button:potionButton,read:items,canDrink,use:usePotion,canOpen:canOpenPotionPicker,
  select:slot=>economy.selectQuickSlot(slot),onPause,onLayout:onPotionLayout}):null;
 function reset(keepOld){generation++;xpRatio=null;shop?.close();potionHud?.clear();treasure?.clear();economy.reset(keepOld?legacy():{});lastGear=null;wasPlaying=false;apply();}
 function getTreasure(){return treasure??=createTownTreasure({root,world,economy,player,canInteract,sound});}
 // The 3D smith's bench: the game's scene and camera, and the worn mesh of the piece
 // when it is the one worn (other pieces get a stand-in block; their model is not loaded).
 function forgeStage(){
  const scene=world.scene,camera=world.camera,canvas=scene?.getEngine?.()?.getRenderingCanvas?.();
  if(!scene||scene.isDisposed||!camera||!canvas)return null;
  return {scene,camera,canvas,piece(id){
   const slot=TOWN_ITEMS[id]?.slot,worn=appearance()?.slots?.[slot]?.mesh;
   return (slot==='sword'||slot==='shield')&&items().equipped[slot]===id&&worn?.geometry?{mesh:worn}:null;
  }};
 }
 return {economy,bag,canDrink,apply,
  collectGold(amount){getTreasure().collectGold(amount);},
  updatePotionHud(playing,unlocked){potionHud?.update(playing,unlocked);},
  get remaining(){const s=items();return s.bag[s.quickSlots[s.selectedQuickSlot]]??0;},
  get open(){return !!shop?.open||!!potionHud?.open;},
  // The smith's bench keeps the game's sound while the world is paused (2026-11-27).
  get forgeAudible(){return !!shop?.forging;},get armorDefense(){return economy.gear(items().equipped.armor)?.defense??0;},
  get equippedFinishes(){const e=items().equipped;return {sword:TOWN_ITEMS[e.sword].finish,shield:TOWN_ITEMS[e.shield].finish};},
  drink(slot=items().selectedQuickSlot){
   if(!canDrink(slot))return false;
   const b=battle(),id=items().quickSlots[slot];if(!economy.drink(slot))return false;
   if(id==='potion'){b.potions.remaining=(items().bag.potion??0)+1;b.potions.use(b.playerHp,b.playerMaxHp);}
   else{notify(boostText('item.boosted',id));apply();}
   return true;
  },
  equip(id){if(!economy.equip(id))return false;apply();sound('equip');return true;},
  // Only completed durability points need feedback. Repeated contacts of the
  // same swing and the fractional wear between points stay in the economy.
  weaponHit(actionId){
   const id=items().equipped.sword;
   if(!economy.damageWeapon(actionId))return false;
   syncDurability();
   if(economy.gear(id)?.hp===0)notify(t('shop.weaponBroken',{name:gearName(id,economy.gear(id).blessed)}));
   return true;
  },
  // Diagnostics only: the worn blade after a hit (plain values).
  weaponMark(){const id=items().equipped.sword,w=economy.gear(id);return w?{id,level:w.level,hp:w.hp,max:w.max,attack:w.attack}:null;},
  register:(id,slot)=>economy.register(id,slot),unregister:slot=>economy.unregister(slot),
  grantArmor(id){if(id!=='leather'||items().bag['leather-coat'])return false;
   if(!economy.grant('leather-coat'))return false;if(!items().equipped.armor)economy.equip('leather-coat');apply();return true;},
  addPotions(count){return economy.grant('potion',count)?count:0;},
  rest(){const n=3-(items().bag.potion??0);if(n>0)economy.grant('potion',n);},
  get equippedSwordName(){const id=items().equipped.sword;return gearName(id,economy.gear(id)?.blessed);},
  reset,clear(){generation++;shop?.close();potionHud?.clear();treasure?.clear();flush();},
  // view: 'shop' (buy, sell, make) or 'forge' (the smith's bench: repair and temper).
  async openShop(id,view='shop'){
   if(!['smith','herbalist'].includes(id)||!world.v03?.playing||world.mapId!=='village')return;
   const token=generation;const [{createTownShop}]=await Promise.all([import('./town-shop.js'),import('./town-shop.css'),import('./forge-bench.css')]);
   if(disposed||generation!==token||!world.v03?.playing||world.mapId!=='village')return;
   shop??=createTownShop({root,economy,onPause,onChange:apply,sound,stage:forgeStage});await shop.show(id,view);
  },
  creditQuestExperience(ids,quiet=false,chapter=null){
   const previous=economy.progression.level,gain=economy.creditQuests(ids,quiet,chapter);
   if(gain&&!quiet)announceLevel(previous);
   return gain;
  },
  settleQuest(quest,step){
   const previous=economy.progression.level,paid=economy.settleQuest(quest,step);
   if(paid?.armor)apply();if(paid?.xp)announceLevel(previous);return paid;
  },
  defeat(event){
   if(!world.v03?.playing||!event?.position)return;
   const xp=world.v03.story?.replaying?0:monsterExperience(event.kind);
   const previous=xp?economy.progression.level:0;
   // Keep the kill and its random loot in one ledger write. A kill still
   // earns XP when no item rolls or the field has reached its pickup cap.
   if(!getTreasure().defeat(event,xp)&&xp)economy.gainExperience(xp);
   if(xp)announceLevel(previous);
  },
  tick(dt){
   if(!world.v03?.playing){if(wasPlaying){treasure?.clear();flush();}wasPlaying=false;return;}
   if(!wasPlaying||appearance()!==appliedTo){wasPlaying=true;apply();xpRatio??=ratioOf(economy.progression);}
   economy.tick(dt);const c=controls();if(c&&c.staminaRecoveryScale!==economy.regen)c.staminaRecoveryScale=economy.regen;
   getTreasure().tick(dt);
  },
  dispose(){disposed=true;generation++;flush();shop?.dispose();potionHud?.dispose();treasure?.dispose();durabilityHud?.dispose();win.removeEventListener('pagehide',flush);root.ownerDocument.removeEventListener('visibilitychange',onVisibility);}
 };
}
