// Authored homes on the existing plains; no scenery, navigation, model or
// combat edits. Heights are sampled from the actual triangulated height field
// and checked by plains-monster-spawns.test.js. Runtime re-reads terrain height.
export const PLAINS_MONSTER_SPAWNS_R1_REVISION='great-plains-monsters-2026-11-16-r1';
export const PLAINS_MONSTER_SPAWNS_R2_REVISION='great-plains-monsters-2026-11-16-r2';
export const PLAINS_MONSTER_SPAWNS_R3_REVISION='great-plains-monsters-2026-11-16-r3';
export const PLAINS_MONSTER_SPAWNS_R4_REVISION='great-plains-monsters-2026-11-16-r4';
export const PLAINS_MONSTER_SPAWNS_REVISION='great-plains-monsters-2026-11-16-r5';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

const r2Groups=freeze([
 {id:'plains-fox-west',label:'서쪽 숲 아래 여우',territory:{x:8,z:-69,radius:12,combatRadius:6.8,wanderRadius:2.4,returnRadius:.8,reengageRadius:10.5},members:[
  ['fox.r1',6.6,-69,3.393040657043457,.5],['fox.r1',9.4,-69,3.3158355474472048,-.5],
 ]},
 {id:'plains-fox-east',label:'동쪽 숲 아래 여우',territory:{x:37,z:-74,radius:11,combatRadius:6.2,wanderRadius:2.2,returnRadius:.8,reengageRadius:9.5},members:[
  ['fox.r1',36,-75.2,.1237268120050427,.4],['fox.r1',38,-74.5,.1302207037806511,-.4],
 ]},
 {id:'plains-boar-north-bank',label:'강 북쪽 둔치 멧돼지',territory:{x:66,z:32,radius:10,combatRadius:5.8,wanderRadius:2.4,returnRadius:.8,reengageRadius:8.5},members:[
  ['boar.r1',66,32,.4011885076761246,-Math.PI/2],
 ]},
 {id:'plains-boar-south-bank',label:'강 남쪽 둔치 멧돼지',territory:{x:66,z:-13,radius:10,combatRadius:5.8,wanderRadius:2.4,returnRadius:.8,reengageRadius:8.5},members:[
  ['boar.r1',66,-13,.24721749871969217,-Math.PI/2],
 ]},
 {id:'plains-wolf-meadow',label:'초원 일반 늑대 무리',territory:{x:29,z:37,radius:18,combatRadius:10.8,wanderRadius:3,returnRadius:1,reengageRadius:16.5},members:[
  ['gray-wolf.r1',26,36,1.4912266731262207,2.4],['stylized-wolf.r1',31,35,2.0019168853759766,2.9],['wolf-3.r1',31,39,2.0010646283626556,2.7],
 ]},
 {id:'plains-alpha-pack',label:'우두머리와 일반 늑대 무리',territory:{x:-25,z:60,radius:26,combatRadius:15.6,wanderRadius:4,returnRadius:1.5,reengageRadius:24.5},members:[
  ['alpha-wolf.r8',-25,60,1.0376407504081737,Math.PI],
  ['gray-wolf.r1',-30,56,1.2338894605636597,2.6],['stylized-wolf.r1',-22,55,1.7406060993671417,-2.8],['wolf-3.r1',-18,61,1.0051190406084047,-2.4],
 ]},
 {id:'plains-lookout-bear',label:'높은 언덕 정상 곰 보스',territory:{x:-25,z:-16,radius:17,combatRadius:10.2,wanderRadius:2.5,returnRadius:1,reengageRadius:15.5},members:[
  ['guardian-bear.standard',-25,-16,8.100000381469727,Math.PI],
 ]},
]);

// R3 swaps the two wolf territories. The larger leader uses a checked nearby
// gap at29.25,37; source models, group IDs, composition and all other homes stay.
const r3Groups=freeze(r2Groups.map(group=>group.id==='plains-wolf-meadow'?{...group,territory:{...r2Groups.find(row=>row.id==='plains-alpha-pack').territory},members:[
 ['gray-wolf.r1',-28,59,1.0405574142932892,2.4],['stylized-wolf.r1',-23,58,1.3438690602779388,2.9],['wolf-3.r1',-23,62,.8845127522945404,2.7],
]}:group.id==='plains-alpha-pack'?{...group,territory:{...r2Groups.find(row=>row.id==='plains-wolf-meadow').territory},members:[
 ['alpha-wolf.r8',29.25,37,1.858901560306549,Math.PI],['gray-wolf.r1',24,33,1.1823619902133964,2.6],['stylized-wolf.r1',32,32,1.9618545770645142,-2.8],['wolf-3.r1',36,38,2.343322515487671,-2.4],
]}:group));
const r4Groups=freeze([...r3Groups.map(group=>group.id==='plains-fox-west'?{...group,label:'서남쪽 숲 아래 여우',territory:{...group.territory,x:-53,z:-64},members:[
 ['fox.r1',-54.4,-64,3.8136508464813232,.5],['fox.r1',-51.6,-64,3.67986500263214,-.5],
]}:group),{id:'plains-riverbank-bear',label:'강 남쪽 서안 곰',territory:{x:72,z:-49,radius:14,combatRadius:8,wanderRadius:2,returnRadius:1,reengageRadius:12.5},members:[
 ['guardian-bear.standard',72,-49,.2932288721203804,-Math.PI/2],
 ]},{id:'plains-stylized-wolf-pack',label:'서쪽 초원 늑대2 무리',territory:{x:-49,z:14,radius:18,combatRadius:9,wanderRadius:2.5,returnRadius:1,reengageRadius:16.5},members:[
 ['stylized-wolf.r1',-52,11,.34020696580410004,2.4],['stylized-wolf.r1',-46,11,.18587123230099678,2.9],['stylized-wolf.r1',-52,17,.2715796157717705,2.6],['stylized-wolf.r1',-46,17,.18941158801317215,-2.8],
]}]);

// R5 keeps the total population at19: two paired fox groups become single
// foxes near the village, with two separate lone-wolf encounters nearby.
export const PLAINS_MONSTER_GROUPS=freeze([...r4Groups.map(group=>group.id==='plains-fox-west'?{
 ...group,label:'마을 남쪽 외곽 여우',territory:{x:-77,z:-52,radius:8,combatRadius:4.5,wanderRadius:2.2,returnRadius:.8,reengageRadius:7},members:[['fox.r1',-77,-52,.11999999731779099,.5]],
}:group.id==='plains-fox-east'?{
 ...group,label:'마을 북쪽 외곽 여우',territory:{x:-72,z:-10,radius:8,combatRadius:4.5,wanderRadius:2.2,returnRadius:.8,reengageRadius:7},members:[['fox.r1',-72,-10,.6468173563480377,.4]],
}:group.id==='plains-stylized-wolf-pack'?{
 ...group,label:'먼 북서쪽 초원 늑대2 무리',territory:{...group.territory,x:-70,z:52},members:[
  ['stylized-wolf.r1',-73,49,1.056545451283455,2.4],['stylized-wolf.r1',-67,49,1.386963665485382,2.9],['stylized-wolf.r1',-73,55,1.891736775636673,2.6],['stylized-wolf.r1',-67,55,2.410731613636017,-2.8],
 ],
}:group),{id:'plains-village-wolf-south',label:'마을 남동쪽 외곽 외톨이 늑대',territory:{x:-57,z:-50,radius:9,combatRadius:5,wanderRadius:2.2,returnRadius:.8,reengageRadius:8},members:[['gray-wolf.r1',-57,-50,3.61909681558609,2.4]]},
{id:'plains-village-wolf-north',label:'마을 북쪽 초원 외톨이 늑대',territory:{x:-82,z:8,radius:9,combatRadius:5,wanderRadius:2.2,returnRadius:.8,reengageRadius:8},members:[['gray-wolf.r1',-82,8,1.7152364253997803,2.7]]}]);

const spawnDocument=groups=>({format:'moonforest-monster-spawns',version:1,maps:{'great-plains':groups.flatMap(group=>group.members.map(([definitionId,x,z,y,yaw],index)=>({
 id:group.id+'-'+(index+1),groupId:group.id,definitionId,x,y,z,yaw,
 spawnMode:'start',respawn:true,delaySeconds:45,randomRadius:0,rewardEnabled:true,
 drop:{assetId:'',effectEnabled:false},territory:{...group.territory},
})))}});
export const PLAINS_MONSTER_SPAWNS=freeze(spawnDocument(PLAINS_MONSTER_GROUPS));
export const PLAINS_MONSTER_SPAWNS_R4=freeze(spawnDocument(r4Groups));
export const PLAINS_MONSTER_SPAWNS_R3=freeze(spawnDocument(r3Groups));
export const PLAINS_MONSTER_SPAWNS_R2=freeze(spawnDocument(r2Groups));

// R1 is retained as immutable migration evidence. Only an unchanged original
// home and this exact old territory may receive the R2 territory replacement.
const oldTerritories={
 'plains-fox-west':{x:8,z:-69,radius:8,returnRadius:.8,reengageRadius:6.5},
 'plains-fox-east':{x:37,z:-74,radius:7,returnRadius:.8,reengageRadius:5.5},
 'plains-boar-north-bank':{x:66,z:32,radius:6,returnRadius:.8,reengageRadius:4.5},
 'plains-boar-south-bank':{x:66,z:-13,radius:6,returnRadius:.8,reengageRadius:4.5},
 'plains-wolf-meadow':{x:29,z:37,radius:12,returnRadius:1,reengageRadius:10.5},
 'plains-alpha-pack':{x:-25,z:60,radius:18,returnRadius:1.5,reengageRadius:16.5},
 'plains-lookout-bear':{x:-25,z:-16,radius:10.5,returnRadius:1,reengageRadius:9},
};
export const PLAINS_MONSTER_SPAWNS_R1=freeze(spawnDocument(r2Groups.map(group=>({...group,territory:oldTerritories[group.id]}))));

export function createPlainsMonsterSpawns(){return structuredClone(PLAINS_MONSTER_SPAWNS);}
