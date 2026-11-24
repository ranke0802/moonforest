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

// The skills page is a tree that grows left to right (the approved mockup,
// opus-wip/status-sample-8o96): three branches of two rows each, sword /
// shield / footwork, and a line from each skill to the one it builds on.
// row/col are grid cells (1-based); open cells are where later skills go.
export const SKILL_BRANCHES=Object.freeze(['sword','shield','footwork']);
export const SKILL_TREE=Object.freeze([
  {id:'combo',action:'attack',branch:'sword',row:1,col:1,need:[]},
  {id:'heavy',action:'attack',branch:'sword',row:2,col:2,need:['combo']},
  {id:'guard',action:'guard',branch:'shield',row:3,col:1,need:[]},
  {id:'justGuard',action:'guard',branch:'shield',row:3,col:2,need:['guard']},
  {id:'push',action:'guard',branch:'shield',row:4,col:1,need:['guard']},
  {id:'dodge',action:'dodge',branch:'footwork',row:5,col:1,need:[]},
  {id:'sprint',action:'dodge',branch:'footwork',row:6,col:1,need:['dodge']}
]);
export const SKILL_OPEN=Object.freeze([[1,2],[2,3],[3,3],[4,2],[5,2],[6,2]]);
export const SKILL_COLUMNS=4;

// The controls come from the lessons the same combat runtime already teaches.
// content: the chapter's COMBAT_HINTS and TIPS, already in the player's language
// (cloneChapter + localizeChapter). control is the current input mode's line.
export function combatSkills(content,touch,allows){
  const lesson=id=>content.COMBAT_HINTS.find(row=>row.id===id);
  const sprint=content.TIPS.find(row=>row.id==='sprint');
  const controls={combo:lesson('attack'),heavy:lesson('heavy'),guard:lesson('guard'),push:lesson('push'),
    justGuard:{keys:t('char.skill.justGuardKeys'),touch:t('char.skill.justGuardTouch')},dodge:lesson('dodge'),sprint};
  const text={combo:'guide.comboText',justGuard:'guide.justGuardText'};
  return SKILL_TREE.map(node=>{
    const {keys,touch:tap}=controls[node.id];
    return {...node,name:t('char.skill.'+node.id),text:t(text[node.id]??'char.skillText.'+node.id),
      keys,touch:tap,control:touch?tap:keys,available:allows(node.action)};
  });
}
