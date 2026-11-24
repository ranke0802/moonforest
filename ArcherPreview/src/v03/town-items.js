// Slot-local gear IDs are independent of legacy equipment-preview presets.
const mat=(name,sell)=>({name,type:'Materials',sell});
const blade=(name,attack,max,finish,profile)=>({name,type:'Gear',slot:'sword',attack,max,finish,profile});
const shield=(name,defense,finish)=>({name,type:'Gear',slot:'shield',defense,max:145,finish});
const armor=(name,defense)=>({name,type:'Gear',slot:'armor',defense,max:120});
export const TOWN_ITEMS=Object.freeze({
 'field-sword':blade('Field Longsword',3,180,'soldier-sword',''),
 'oathblade':blade('Oathblade',5,120,'original',''),
 'violet-blade':blade('Silver Oathblade',7,108,'violet-silver',''),
 'bronze-blade':blade('Bronze Oathblade',9,96,'teal-bronze',''),
 'wolf-blade':blade('Wolf-Fang Blade',10,100,'violet-silver','fang'),
 'goblin-cleaver':blade('Goblin Cleaver',8,96,'teal-bronze','cleaver'),
 'hunter-knife':blade('Tracker’s Longknife',8,94,'soldier-sword','knife'),
 'ritual-blade':blade('Shaman’s Ritual Blade',12,82,'violet-silver','ritual'),
 'war-blade':blade('Hobgoblin Warblade',14,86,'teal-bronze','great'),
 'rust-blade':blade('Rusted Falchion',8,82,'soldier-sword','cleaver'),
 'ghoul-blade':blade('Ghoul Cleaver',16,80,'original','trophy:ghoul-cleaver'),
 'raider-dagger':blade('Raider’s Dagger',8,94,'original','trophy:goblin-warrior-dagger'),
 'field-bow':{...blade('Scout’s Field Bow',7,98,'original','trophy:goblin-archer-bow'),usage:'The warrior uses the reinforced bow as a close-range striking weapon.'},
 'crooked-staff':{...blade('Rune Staff',12,88,'original','trophy:goblin-shaman-staff'),usage:'The warrior grips this carved staff for melee strikes.'},
 'spiked-club':blade('Hobgoblin War Club',14,103,'original','trophy:hobgoblin-club'),
 'cave-claw':blade('Black Bear Clawblade',14,101,'teal-bronze','cleaver'),
 'cave-fang':blade('Black Wolf Fangblade',13,91,'violet-silver','fang'),
 'field-shield':shield('Field Shield',2,'original'),
 'oak-shield':shield('Oaken Shield',4,'teal-bronze'),
 'silver-shield':shield('Silver Shield',6,'violet-silver'),
 'leather-coat':armor('Leather Coat',2),'hunter-coat':armor('Hunter’s Coat',4),'guard-armor':armor('Guard Armor',6),
 'potion':{name:'Healing Potion',type:'Supplies',quick:true},'stamina-tonic':{name:'Stamina Tonic',type:'Supplies',quick:true},
 'bear-bile':{name:'Bear Bile',type:'Supplies',quick:true,sell:18},
 'moon-herb':mat('Moondew Herb',2),'boar-meat':mat('Boar Meat',4),'boar-tusk':mat('Boar Tusk',8),
 'bear-meat':mat('Bear Meat',7),'bear-hide':mat('Bear Hide',12),'bear-fur':mat('Bear Fur',10),
 'wolf-pelt':mat('Wolf Pelt',5),'wolf-bone':mat('Wolf Bone',4),'wolf-fang':mat('Wolf Fang',7),
 'fox-pelt':mat('Fox Pelt',5),'iron-scrap':mat('Iron Scrap',4),'grave-dust':mat('Grave Dust',6),
 'rune-shard':mat('Rune Shard',9),'tainted-fang':mat('Tainted Fang',11),
 'arrow-fletching':mat('Scout Fletching',5),'ward-cord':mat('Shaman’s Ward Cord',8),
 'iron-stud':mat('Black Iron Stud',9),'burial-clasp':mat('Burial Clasp',6),'ghoul-mail':mat('Ghoul Mail Link',12),
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
export const POTION_NOTES={potion:'Restores up to 160 HP over four seconds.','stamina-tonic':'Raises stamina recovery by 50% for 45 seconds.','bear-bile':'Raises stamina recovery by 75% for 90 seconds.'};
export function gradeStrike(position){
 const error=Math.abs(Math.max(0,Math.min(1,position))-.5)*2;
 return error<=.12?'Perfect':error<=.39?'Success':error<=.69?'Near miss':'Failed';
}
export function forgeCursor(elapsed){const phase=((elapsed%1800)+1800)%1800/900;return phase<=1?phase:2-phase;}
