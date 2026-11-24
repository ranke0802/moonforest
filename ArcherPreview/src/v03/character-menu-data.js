import {equipmentStats,equipmentStyles} from '../equipment-stats.js';
import {POTION} from '../healing-potion.js';

export const SLOTS = [
  ['sword','Sword'],['shield','Shield'],['helmet','Helmet'],['armor','Armor'],
  ['gloves','Gloves'],['boots','Boots'],['charm1','Charm I'],['charm2','Charm II']
];
const FINISH = {original:'', 'violet-silver':'Violet Silver', 'teal-bronze':'Teal Bronze'};
function gearName(slot,style){
  if(style.id==='soldier-sword')return 'Soldier’s Sword';
  const base=slot==='sword'?'Oathblade':'Bunnyguard Shield';
  const finish=FINISH[style.id];
  return finish?finish+' '+base:base;
}

export function characterItems(state){
  const items=[];
  const equipped=equipmentStats(state.equipment);
  for(const slot of ['sword','shield']){
    const attack=slot==='sword',stat=attack?'Strike bonus':'Defense';
    for(const style of equipmentStyles(slot)){
      const value=attack?style.attackBonus:style.defense;
      items.push({id:slot+'/'+style.id,name:gearName(slot,style),type:'Gear',icon:slot,
        slot,style:style.id,worn:state.equipment[slot]===style.id,
        stat,value,delta:value-(attack?equipped.attackBonus:equipped.defense)});
    }
  }
  if(state.armorDefense>0)items.push({id:'armor/leather',name:'Leather Armor',type:'Gear',slot:'armor',
    icon:'',worn:true,stat:'Defense',value:state.armorDefense,delta:0});
  if(state.potions>0)items.push({id:'potion',name:'Healing Potion',type:'Supplies',icon:'potion',quantity:state.potions,
    note:`Restores up to ${POTION.amount} HP each second for ${POTION.pulses} seconds.`});
  return items;
}

export function bagContents(items,filter,sort){
  const list=items.filter(item=>filter==='All'||item.type===filter);
  if(sort==='Name')list.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  return list;
}

// The skills page describes controls the same combat runtime already implements.
export function combatSkills(pack,touch,allows){
  const hints=pack.story.hints,mode=touch?'touch':'keys';
  const pairs=[
    ['Combo attack','attack',hints.attack[mode]],
    ['Heavy attack','attack',hints.heavy[mode]],
    ['Guard','guard',hints.guard[mode]],
    ['Shield shove','guard',hints.push[mode]],
    ['Just guard','guard',pack.ui['guide.justGuardText']],
    ['Dodge','dodge',hints.dodge[mode]],
    ['Sprint','dodge',pack.story.tips.sprint[mode]]
  ];
  return pairs.map(([name,action,control])=>({name,control,available:allows(action)}));
}
