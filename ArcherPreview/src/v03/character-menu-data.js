import {equipmentStats,equipmentStyles} from '../equipment-stats.js';
import {POTION} from '../healing-potion.js';
import {t} from './i18n.js';
import {TOWN_ITEMS,itemName} from './town-items.js';

// Slot ids; the label is t('char.slot.<id>').
export const SLOTS = ['sword','shield','helmet','armor','gloves','boots','charm1','charm2'];

// Rows use stable ids for logic (type: Gear/Supplies/Materials, stat:
// attack/defense) and carry the translated name the page shows.
export function characterItems(state){
  if(Array.isArray(state.tradeBag))return state.tradeBag;
  const items=[];
  const equipped=equipmentStats(state.equipment);
  for(const slot of ['sword','shield']){
    const attack=slot==='sword',stat=attack?'attack':'defense';
    for(const style of equipmentStyles(slot)){
      const value=attack?style.attackBonus:style.defense;
      const icon=Object.keys(TOWN_ITEMS).find(id=>TOWN_ITEMS[id].slot===slot&&TOWN_ITEMS[id].finish===style.id&&!TOWN_ITEMS[id].profile);
      items.push({id:slot+'/'+style.id,name:t('char.gear.'+slot+'.'+style.id),type:'Gear',icon,
        slot,style:style.id,worn:state.equipment[slot]===style.id,
        stat,value,delta:value-(attack?equipped.attackBonus:equipped.defense)});
    }
  }
  if(state.armorDefense>0)items.push({id:'armor/leather',name:itemName('leather-coat'),type:'Gear',slot:'armor',
    icon:'leather-coat',worn:true,stat:'defense',value:state.armorDefense,delta:0});
  if(state.potions>0)items.push({id:'potion',name:itemName('potion'),type:'Supplies',icon:'potion',quantity:state.potions,
    note:t('char.potionNote',{amount:POTION.amount,seconds:POTION.pulses})});
  return items;
}

export function bagContents(items,filter,sort,lang='ko'){
  const list=items.filter(item=>filter==='All'||item.type===filter);
  if(sort==='Name')list.sort((a,b)=>a.name.localeCompare(b.name,lang));
  return list;
}

// The skills page describes controls the same combat runtime already implements.
// content: the chapter's COMBAT_HINTS and TIPS, already in the player's language
// (cloneChapter + localizeChapter).
export function combatSkills(content,touch,allows){
  const mode=touch?'touch':'keys';
  const hint=id=>content.COMBAT_HINTS.find(row=>row.id===id)[mode];
  const pairs=[
    ['combo','attack',hint('attack')],
    ['heavy','attack',hint('heavy')],
    ['guard','guard',hint('guard')],
    ['push','guard',hint('push')],
    ['justGuard','guard',t('guide.justGuardText')],
    ['dodge','dodge',hint('dodge')],
    ['sprint','dodge',content.TIPS.find(row=>row.id==='sprint')[mode]]
  ];
  return pairs.map(([id,action,control])=>({id,name:t('char.skill.'+id),control,available:allows(action)}));
}
