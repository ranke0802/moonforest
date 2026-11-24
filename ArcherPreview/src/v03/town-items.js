// Slot-local gear IDs are independent of legacy equipment-preview presets.
// Player-facing names and notes are ui keys (item.<id>, item.usage.<id>,
// item.note.*) in locales/*.js; read them with itemName/itemNote/itemUsage.
import {t} from './i18n.js';
import {POTION} from '../healing-potion.js';

const mat=sell=>({type:'Materials',sell});
const blade=(attack,max,finish,profile)=>({type:'Gear',slot:'sword',attack,max,finish,profile});
const shield=(defense,finish)=>({type:'Gear',slot:'shield',defense,max:145,finish});
const armor=defense=>({type:'Gear',slot:'armor',defense,max:120});
export const TOWN_ITEMS=Object.freeze({
 'field-sword':blade(3,180,'soldier-sword',''),
 'oathblade':blade(5,120,'original',''),
 'violet-blade':blade(7,108,'violet-silver',''),
 'bronze-blade':blade(9,96,'teal-bronze',''),
 'wolf-blade':blade(10,100,'violet-silver','fang'),
 'goblin-cleaver':blade(8,96,'teal-bronze','cleaver'),
 'hunter-knife':blade(8,94,'soldier-sword','knife'),
 'ritual-blade':blade(12,82,'violet-silver','ritual'),
 'war-blade':blade(14,86,'teal-bronze','great'),
 'rust-blade':blade(8,82,'soldier-sword','cleaver'),
 'ghoul-blade':blade(16,80,'original','trophy:ghoul-cleaver'),
 'raider-dagger':blade(8,94,'original','trophy:goblin-warrior-dagger'),
 'field-bow':{...blade(7,98,'original','trophy:goblin-archer-bow'),usage:true},
 'crooked-staff':{...blade(12,88,'original','trophy:goblin-shaman-staff'),usage:true},
 'spiked-club':blade(14,103,'original','trophy:hobgoblin-club'),
 'cave-claw':blade(14,101,'teal-bronze','cleaver'),
 'cave-fang':blade(13,91,'violet-silver','fang'),
 'field-shield':shield(2,'original'),
 'oak-shield':shield(4,'teal-bronze'),
 'silver-shield':shield(6,'violet-silver'),
 'leather-coat':armor(2),'hunter-coat':armor(4),'guard-armor':armor(6),
 'potion':{type:'Supplies',quick:true},'stamina-tonic':{type:'Supplies',quick:true},
 'bear-bile':{type:'Supplies',quick:true,sell:18},
 'moon-herb':mat(2),'boar-meat':mat(4),'boar-tusk':mat(8),
 'bear-meat':mat(7),'bear-hide':mat(12),'bear-fur':mat(10),
 'wolf-pelt':mat(5),'wolf-bone':mat(4),'wolf-fang':mat(7),
 'fox-pelt':mat(5),'iron-scrap':mat(4),'grave-dust':mat(6),
 'rune-shard':mat(9),'tainted-fang':mat(11),
 'arrow-fletching':mat(5),'ward-cord':mat(8),
 'iron-stud':mat(9),'burial-clasp':mat(6),'ghoul-mail':mat(12),
});
const wolf=[['wolf-pelt',.6],['wolf-bone',.45],['wolf-fang',.28]];
const bear=[['bear-meat',.85],['bear-hide',.55],['bear-fur',.48],['bear-bile',.27]];
export const LOOT_TABLES={
 fox:[['fox-pelt',.72]],boar:[['boar-meat',.80],['boar-tusk',.40]],bear,
 wolf:[...wolf,['wolf-blade',.22]],'gray-wolf':wolf,'stylized-wolf':wolf,'wolf-2':wolf,'wolf-3':wolf,
 goblin:[['iron-scrap',.7],['goblin-cleaver',.15]],'goblin-warrior':[['iron-scrap',.7],['raider-dagger',.18]],
 'goblin-archer':[['arrow-fletching',.70],['field-bow',.20]],'goblin-shaman':[['ward-cord',.55],['rune-shard',.7],['crooked-staff',.18]],
 hobgoblin:[['iron-stud',.72],['spiked-club',.23],['oak-shield',.17]],
 zombie:[['grave-dust',.67],['burial-clasp',.42],['rust-blade',.14]],'ghoul-warrior':[['grave-dust',.8],['ghoul-mail',.58],['ghoul-blade',.22]],
 'black-bear':[...bear,['tainted-fang',.65],['cave-claw',.13]],'black-wolf':[...wolf,['tainted-fang',.5],['cave-fang',.15]],
 elena:[['rune-shard',1],['ritual-blade',.36]],
};
const lootFamily={
 'hobgoblin-boss':'hobgoblin','corrupted-wolf':'black-wolf','corrupted-bear':'black-bear',
 'alpha-wolf':'wolf','guardian-bear':'bear','wild-boar':'boar',
};
export function monsterRewards(kind,random=Math.random){
 const table=LOOT_TABLES[lootFamily[kind]??kind]??[];
 return Object.fromEntries(table.filter(([,chance])=>random()<chance).map(([id])=>[id,1]));
}
const gradePool=[['field-sword','field-shield','leather-coat','potion'],['hunter-knife','oak-shield','hunter-coat','potion'],['wolf-blade','silver-shield','hunter-coat','stamina-tonic'],['ritual-blade','war-blade','silver-shield','guard-armor'],['ghoul-blade','war-blade','guard-armor','silver-shield']];
export function treasureRewards(tier,random=Math.random){
 const pool=gradePool[Math.max(0,Math.min(4,Math.floor(tier)-1))];
 const reward=pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
 return reward==='potion'?{potion:2}:{[reward]:1,potion:1};
}
export const STOCK={
 smith:{'oathblade':55,'goblin-cleaver':95,'oak-shield':65,'silver-shield':155,'leather-coat':55,'guard-armor':165,'iron-scrap':7},
 herbalist:{potion:15,'stamina-tonic':29,'moon-herb':4}
};
export const RECIPES={
 smith:{'wolf-blade':{gold:22,inputs:{'wolf-fang':2,'iron-scrap':2}},'hunter-knife':{gold:12,inputs:{'boar-tusk':1,'iron-scrap':1}},'hunter-coat':{gold:12,inputs:{'wolf-pelt':2,'fox-pelt':1}}},
 herbalist:{potion:{gold:2,inputs:{'moon-herb':2}},'stamina-tonic':{gold:4,inputs:{'moon-herb':1,'boar-meat':1}}}
};
// Stamina boosts: how long and how much faster stamina recovers (town-economy drink()).
export const BOOSTS=Object.freeze({'stamina-tonic':Object.freeze({seconds:45,rate:1.5}),'bear-bile':Object.freeze({seconds:90,rate:1.75})});
export const itemName=id=>t('item.'+id);
export const itemUsage=id=>TOWN_ITEMS[id]?.usage?t('item.usage.'+id):'';
export const boostText=(key,id)=>{const b=BOOSTS[id];return t(key,{seconds:b.seconds,pct:Math.round((b.rate-1)*100)});};
// What a supply does, or null for gear and materials.
export function itemNote(id){
 if(id==='potion')return t('item.note.potion',{amount:POTION.amount*POTION.pulses,seconds:POTION.pulses*POTION.interval});
 return BOOSTS[id]?boostText('item.note.boost',id):null;
}
export function gradeStrike(position){
 const error=Math.abs(Math.max(0,Math.min(1,position))-.5)*2;
 return error<=.12?'Perfect':error<=.39?'Success':error<=.69?'Near miss':'Failed';
}
// gradeStrike returns stable ids (saved and tested); this is what the player reads.
const GRADE_KEYS={Perfect:'perfect',Success:'success','Near miss':'near',Failed:'failed'};
export const gradeLabel=grade=>t('shop.grade.'+GRADE_KEYS[grade]);
export function forgeCursor(elapsed){const phase=((elapsed%1800)+1800)%1800/900;return phase<=1?phase:2-phase;}
