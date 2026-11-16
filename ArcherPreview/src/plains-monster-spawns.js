// Authored homes on the existing plains; no scenery, navigation, model or
// combat edits. Heights are sampled from the actual triangulated height field
// and checked by plains-monster-spawns.test.js. Runtime re-reads terrain height.
export const PLAINS_MONSTER_SPAWNS_R1_REVISION='great-plains-monsters-2026-11-16-r1';
export const PLAINS_MONSTER_SPAWNS_REVISION='great-plains-monsters-2026-11-16-r2';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

export const PLAINS_MONSTER_GROUPS=freeze([
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

const spawnDocument=groups=>({format:'moonforest-monster-spawns',version:1,maps:{'great-plains':groups.flatMap(group=>group.members.map(([definitionId,x,z,y,yaw],index)=>({
 id:group.id+'-'+(index+1),groupId:group.id,definitionId,x,y,z,yaw,
 spawnMode:'start',respawn:true,delaySeconds:45,randomRadius:0,rewardEnabled:true,
 drop:{assetId:'',effectEnabled:false},territory:{...group.territory},
})))}});
export const PLAINS_MONSTER_SPAWNS=freeze(spawnDocument(PLAINS_MONSTER_GROUPS));

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
export const PLAINS_MONSTER_SPAWNS_R1=freeze(spawnDocument(PLAINS_MONSTER_GROUPS.map(group=>({...group,territory:oldTerritories[group.id]}))));

export function createPlainsMonsterSpawns(){return structuredClone(PLAINS_MONSTER_SPAWNS);}
