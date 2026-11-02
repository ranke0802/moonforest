// One palette for in-world treasure ink, pickup feedback and inventory frames.
// Linear RGB is derived by the renderer; CSS keeps the authored sRGB colours.
export const LOOT_RARITIES=Object.freeze([
 {tier:1,name:'일반',color:'#c6cbc8',chest:'여행자 보급함',item:'travel-tonic',itemName:'여행자 회복약',heal:160,gold:15},
 {tier:2,name:'고급',color:'#72b87a',chest:'순찰대 보급함',item:'concentrated-tonic',itemName:'농축 회복약',heal:240,gold:35},
 {tier:3,name:'희귀',color:'#689edf',chest:'탐험가 보물함',item:'refined-tonic',itemName:'정제 회복약',heal:320,gold:70},
 {tier:4,name:'영웅',color:'#df7873',chest:'봉인된 보물함',item:'greater-tonic',itemName:'상급 회복약',heal:420,gold:140},
 {tier:5,name:'전설',color:'#e9c55c',chest:'빛바랜 성물함',item:'restoration-water',itemName:'완전 회복 성수',heal:500,gold:280},
].map(v=>Object.freeze(v)));
export const lootRarity=tier=>LOOT_RARITIES.find(v=>v.tier===tier)??LOOT_RARITIES[0];
export const lootItem=id=>LOOT_RARITIES.find(v=>v.item===id);
export function itemRarity(id){
 const item=lootItem(id);if(item)return item;
 return lootRarity({'herb':2,'pie':2,'antidote':2,'key-2':2,'key-3':3,'equipment-voucher':3,'armor-voucher':3,'antidote-charm':4,'church-seal':5}[id]??1);
}
export function chestRewards(tier){
 if(!LOOT_RARITIES.some(v=>v.tier===tier))return null;
 const grade=lootRarity(tier);return {[grade.item]:1,gold:grade.gold};
}
