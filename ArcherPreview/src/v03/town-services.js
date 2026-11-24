import {createTownEconomy} from './town-economy.js';
import {TOWN_ITEMS,itemName,itemNote,itemUsage,boostText} from './town-items.js';
import {t} from './i18n.js';
import {createTownTreasure} from './town-treasure.js';

export function setupTownServices({root,world,wallet,legacy,player,battle,controls,appearance,canInteract,onPause,notify,sound}){
 const economy=createTownEconomy(wallet,legacy()),win=root.ownerDocument.defaultView;
 let shop=null,generation=0,disposed=false,wasPlaying=false,lastGear=null,appliedTo=null,treasure=null;
 const items=()=>economy.state;
 function apply(){
  const e=appearance(),s=items(),sword=TOWN_ITEMS[s.equipped.sword],shield=TOWN_ITEMS[s.equipped.shield];
  if(e&&(lastGear!==s.equipped.sword+'/'+s.equipped.shield||appliedTo!==e)){
   e.selectTrophy(sword.finish,sword.profile);e.select('shield',shield.finish);
   lastGear=s.equipped.sword+'/'+s.equipped.shield;appliedTo=e;
  }
  const b=battle();if(b)b.combat.defense=economy.defense;
  const c=controls();if(c)c.staminaRecoveryScale=economy.regen;
 }
 function canDrink(){
  const b=battle(),s=items(),id=s.quick;if(!b||b.loading||b.grab?.active||!b.playerAlive||!s.bag[id])return false;
  return id==='potion'?b.playerHp<b.playerMaxHp&&!b.potions.active:s.boost<=0;
 }
 function bag(){
  const s=items(),equipment=[];
  for(const [id,count] of Object.entries(s.bag)){
   const it=TOWN_ITEMS[id];if(!it||!count)continue;
   const row={id,name:itemName(id),type:it.type,icon:id,quantity:count,
    worn:!!it.slot&&s.equipped[it.slot]===id,slot:it.slot,tradeId:id,quick:it.quick,registered:it.quick&&id===s.quick};
   if(it.slot==='sword'){
    const w=economy.gear(id);row.stat='attack';row.value=w.attack;row.delta=row.value-economy.attack;
    row.name+=w.level?' +'+w.level:'';row.note=t('char.durability',{hp:w.hp,max:w.max})+(it.usage?' · '+itemUsage(id):'');
   }else if(it.slot){const w=economy.gear(id);row.stat='defense';row.value=w.defense;row.delta=w.defense-(economy.gear(s.equipped[it.slot])?.defense??0);row.name+=w.level?' +'+w.level:'';row.note=t('char.durability',{hp:w.hp,max:w.max});}
   else row.note=itemNote(id)??t('char.materialNote');
   equipment.push(row);
  }
  return equipment;
 }
 function flush(){economy.flush();}
 const onVisibility=()=>{if(root.ownerDocument.hidden)flush();};
 win.addEventListener('pagehide',flush);root.ownerDocument.addEventListener('visibilitychange',onVisibility);
 function reset(keepOld){generation++;shop?.close();treasure?.clear();economy.reset(keepOld?legacy():{});lastGear=null;wasPlaying=false;apply();}
 function getTreasure(){return treasure??=createTownTreasure({root,world,economy,player,canInteract,notify,sound});}
 return {economy,bag,canDrink,apply,
  get quick(){return items().quick;},get quickName(){return itemName(items().quick);},get remaining(){return items().bag[items().quick]??0;},
  get open(){return !!shop?.open;},get armorDefense(){return economy.gear(items().equipped.armor)?.defense??0;},
  get equippedFinishes(){const e=items().equipped;return {sword:TOWN_ITEMS[e.sword].finish,shield:TOWN_ITEMS[e.shield].finish};},
  drink(){
   if(!canDrink())return false;
   const b=battle(),id=items().quick;if(!economy.drink())return false;
   if(id==='potion'){b.potions.remaining=(items().bag.potion??0)+1;b.potions.use(b.playerHp,b.playerMaxHp);}
   else{notify(boostText('item.boosted',id));apply();}
   return true;
  },
  equip(id){if(!economy.equip(id))return false;apply();sound('equip');return true;},
  register:id=>economy.register(id),
  grantArmor(id){if(id!=='leather'||items().bag['leather-coat'])return false;
   if(!economy.grant('leather-coat'))return false;if(!items().equipped.armor)economy.equip('leather-coat');apply();return true;},
  addPotions(count){return economy.grant('potion',count)?count:0;},
  rest(){const n=3-(items().bag.potion??0);if(n>0)economy.grant('potion',n);},
  get equippedSwordName(){return itemName(items().equipped.sword);},
  reset,clear(){generation++;shop?.close();treasure?.clear();flush();},
  async openShop(id){
   if(!['smith','herbalist'].includes(id)||!world.v03?.playing||world.mapId!=='village')return;
   const token=generation;const [{createTownShop}]=await Promise.all([import('./town-shop.js'),import('./town-shop.css')]);
   if(disposed||generation!==token||!world.v03?.playing||world.mapId!=='village')return;
   shop??=createTownShop({root,economy,onPause,onChange:apply});await shop.show(id);
  },
  defeat(event){if(world.v03?.playing)getTreasure().defeat(event);},
  tick(dt){
   if(!world.v03?.playing){if(wasPlaying){treasure?.clear();flush();}wasPlaying=false;return;}
   if(!wasPlaying||appearance()!==appliedTo){wasPlaying=true;apply();}
   economy.tick(dt);const c=controls();if(c&&c.staminaRecoveryScale!==economy.regen)c.staminaRecoveryScale=economy.regen;
   getTreasure().tick(dt);
  },
  dispose(){disposed=true;generation++;flush();shop?.dispose();treasure?.dispose();win.removeEventListener('pagehide',flush);root.ownerDocument.removeEventListener('visibilitychange',onVisibility);}
 };
}
