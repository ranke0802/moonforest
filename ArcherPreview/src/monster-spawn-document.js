import {ITEM_DROP_CHOICES} from './item-drop-data.js';
import {PLAINS_MONSTER_SPAWNS,PLAINS_MONSTER_SPAWNS_REVISION,PLAINS_MONSTER_SPAWNS_R1,PLAINS_MONSTER_SPAWNS_R1_REVISION,PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS_R2_REVISION} from './plains-monster-spawns.js';
// Data-only monster placement document. Never execute values from imported files.
export const MONSTER_SPAWN_FORMAT='moonforest-monster-spawns';
export const MONSTER_SPAWN_MAPS=Object.freeze(['village','great-plains','monster-forest','witch-cave']);
export const MONSTER_SPAWN_DEFINITIONS=Object.freeze(['guardian-bear.standard','hooded-goblin.standard','alpha-wolf.r8','gray-wolf.r1','stylized-wolf.r1','wolf-3.r1','fox.r1','boar.r1']);
const validId=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;
const plainsDefaultIds=new Set(PLAINS_MONSTER_SPAWNS.maps['great-plains'].map(row=>row.id));
export const emptyMonsterSpawns=()=>({format:MONSTER_SPAWN_FORMAT,version:1,maps:{}});
export function validateMonsterSpawns(input){
 let document;try{const text=typeof input==='string'?input:JSON.stringify(input);if(new TextEncoder().encode(text).length>262144)throw Error('파일이 256 KiB를 초과합니다.');document=JSON.parse(text);}catch(error){return {valid:false,errors:[error.message]};}
 const errors=[],fail=message=>errors.push(message);
 if(!document||document.format!==MONSTER_SPAWN_FORMAT||document.version!==1||!document.maps||typeof document.maps!=='object'||Array.isArray(document.maps))return {valid:false,errors:['몬스터 배치 파일 형식이 올바르지 않습니다.']};
 if(document.defaultRevisions!==undefined&&(!Array.isArray(document.defaultRevisions)||document.defaultRevisions.length>32||new Set(document.defaultRevisions).size!==document.defaultRevisions.length||document.defaultRevisions.some(id=>typeof id!=='string'||!validId.test(id))))fail('기본 배치 revision 기록을 확인하세요.');
 if(document.defaultRowIds!==undefined){
  if(!document.defaultRowIds||typeof document.defaultRowIds!=='object'||Array.isArray(document.defaultRowIds))fail('기본 배치 ID 기록을 확인하세요.');
  else for(const [mapId,ids]of Object.entries(document.defaultRowIds))if(!MONSTER_SPAWN_MAPS.includes(mapId)||!Array.isArray(ids)||ids.length>64||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!validId.test(id)))fail(mapId+': 기본 배치 ID 기록을 확인하세요.');
 }
 for(const [mapId,rows] of Object.entries(document.maps)){
  // A migrated default layer may coexist with the previous custom20. This is
  // document capacity only: runtime admission stays20, editor creation stays20.
  const installedIds=document.defaultRowIds?.[mapId],migratedPlains=mapId==='great-plains'&&[PLAINS_MONSTER_SPAWNS_R1_REVISION,PLAINS_MONSTER_SPAWNS_R2_REVISION,PLAINS_MONSTER_SPAWNS_REVISION].some(revision=>document.defaultRevisions?.includes?.(revision))&&Array.isArray(installedIds)&&installedIds.length===plainsDefaultIds.size&&installedIds.every(id=>plainsDefaultIds.has(id));
  const extra=migratedPlains?14:0;
  if(!MONSTER_SPAWN_MAPS.includes(mapId)||!Array.isArray(rows)||rows.length>20+extra){fail(mapId+': 지역 또는 몬스터 수를 확인하세요.');continue;}
  const ids=new Set(),groups=new Map();for(const row of rows){
   if(!row||typeof row!=='object'||!validId.test(row.id??'')||ids.has(row.id)){fail(mapId+': 몬스터 ID가 중복되거나 올바르지 않습니다.');continue;}ids.add(row.id);
   if(!MONSTER_SPAWN_DEFINITIONS.includes(row.definitionId)||!validId.test(row.groupId??'')||!['start','random'].includes(row.spawnMode)||typeof row.respawn!=='boolean'||typeof row.rewardEnabled!=='boolean'||!Number.isFinite(row.x)||!Number.isFinite(row.z)||Math.abs(row.x)>10000||Math.abs(row.z)>10000||!Number.isFinite(row.yaw)||Math.abs(row.yaw)>1000||!Number.isFinite(row.delaySeconds)||row.delaySeconds<1||row.delaySeconds>86400||!Number.isFinite(row.randomRadius)||row.randomRadius<0||row.randomRadius>100)fail(row.id+': 배치 설정을 확인하세요.');
   if(row.y!==undefined&&(!Number.isFinite(row.y)||Math.abs(row.y)>10000))fail(row.id+': 배치 높이를 확인하세요.');
   if(row.territory!==undefined){const area=row.territory;if(!area||typeof area!=='object'||Array.isArray(area)||!Number.isFinite(area.x)||!Number.isFinite(area.z)||Math.abs(area.x)>10000||Math.abs(area.z)>10000||!Number.isFinite(area.radius)||area.radius<=0||area.radius>1000||Math.hypot(row.x-area.x,row.z-area.z)>area.radius||['returnRadius','reengageRadius','wanderRadius'].some(key=>area[key]!==undefined&&(!Number.isFinite(area[key])||area[key]<0||area[key]>area.radius))||area.combatRadius!==undefined&&(!Number.isFinite(area.combatRadius)||area.combatRadius<=0||area.combatRadius>area.radius))fail(row.id+': 활동 영역을 확인하세요.');}
   if(row.territory&&Number.isFinite(row.territory.radius)&&Math.hypot(row.x-row.territory.x,row.z-row.territory.z)>row.territory.radius)fail(row.id+': 배치 위치가 활동 영역 밖입니다.');
   if(!row.drop||typeof row.drop!=='object'||!ITEM_DROP_CHOICES.some(([id])=>id===row.drop.assetId)||typeof row.drop.effectEnabled!=='boolean')fail(row.id+': 드롭 설정을 확인하세요.');
   const signature=JSON.stringify([row.spawnMode,row.respawn,row.delaySeconds]);if(groups.has(row.groupId)&&groups.get(row.groupId)!==signature)fail(row.groupId+': 같은 그룹의 등장·리스폰 설정이 서로 다릅니다.');else groups.set(row.groupId,signature);
  }
 }
 return {valid:errors.length===0,errors,document:errors.length?null:document};
}

// Applied-revision markers survive edits/deletions. The original default IDs
// also act as tombstones when a later revision adds new groups: an edited or
// deleted existing default is never silently restored or overwritten.
export function preserveMonsterDefaultHistory(document,previous){
 const revisions=[...new Set([...(previous.defaultRevisions??[]),...(document.defaultRevisions??[])])],maps={};
 for(const source of [previous.defaultRowIds??{},document.defaultRowIds??{}])for(const [map,ids]of Object.entries(source))maps[map]=[...new Set([...(maps[map]??[]),...ids])];
 if(revisions.length)document.defaultRevisions=revisions;if(Object.keys(maps).length)document.defaultRowIds=maps;return document;
}
function upgradePlainsTerritories(document,revision){
 if(![PLAINS_MONSTER_SPAWNS_R2_REVISION,PLAINS_MONSTER_SPAWNS_REVISION].includes(revision))return 0;
 const history=document.defaultRevisions??[],hasR1=history.includes(PLAINS_MONSTER_SPAWNS_R1_REVISION),hasR2=history.includes(PLAINS_MONSTER_SPAWNS_R2_REVISION),installed=new Set(document.defaultRowIds?.['great-plains']??[]),rows=document.maps['great-plains']??[],upgraded=new Set();
 const sameArea=(a,b)=>a&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(key=>a[key]===b[key]);
 const upgrade=(before,after,moveHome=false,eligible)=>{const next=new Map(after.maps['great-plains'].map(row=>[row.id,row]));for(const original of before.maps['great-plains']){
  if(!installed.has(original.id))continue;
  const sameHome=row=>row.definitionId===original.definitionId&&row.x===original.x&&row.z===original.z&&row.y===original.y;
  // R1 names colliding defaults with deterministic row/group aliases. Prefer
  // that generated pair so an existing custom row retaining the base ID is safe.
  const aliases=rows.filter(row=>row.id.startsWith(original.id.slice(0,60)+':default:'));
  const candidates=aliases.length?aliases.filter(row=>row.groupId.startsWith(original.groupId.slice(0,60)+':default:')):rows.filter(row=>row.id===original.id&&(row.groupId===original.groupId||row.groupId.startsWith(original.groupId.slice(0,60)+':default:')));
  for(const row of candidates){
   if(eligible&&!eligible.has(row)||!sameHome(row)||!sameArea(row.territory,original.territory))continue;const target=next.get(original.id);
   if(moveHome){if(!['yaw','spawnMode','respawn','delaySeconds','randomRadius','rewardEnabled'].every(key=>row[key]===original[key])||!sameArea(row.drop,original.drop))continue;if(target.x===row.x&&target.y===row.y&&target.z===row.z&&sameArea(row.territory,target.territory))continue;row.x=target.x;row.y=target.y;row.z=target.z;}
   row.territory={...target.territory};upgraded.add(row);
  }
 }};
 if(hasR1&&!hasR2)upgrade(PLAINS_MONSTER_SPAWNS_R1,PLAINS_MONSTER_SPAWNS_R2);
 if(revision===PLAINS_MONSTER_SPAWNS_REVISION&&(hasR1||hasR2))upgrade(PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS,true,hasR2?undefined:new Set(upgraded));
 return upgraded.size;
}
export function mergeMonsterSpawnDefaults(input,defaults,revision){
 const saved=validateMonsterSpawns(input),seed=validateMonsterSpawns(defaults);if(!saved.valid||!seed.valid||typeof revision!=='string'||!validId.test(revision))throw Error('기본 몬스터 배치 또는 revision이 올바르지 않습니다.');
 const document=saved.document;if(document.defaultRevisions?.includes(revision))return {document,changed:false,addedRows:0,aliasedRows:0,upgradedRows:0,revision};
 const upgradedRows=upgradePlainsTerritories(document,revision);
 const revisions=[...(document.defaultRevisions??[]),revision];document.defaultRevisions=revisions;document.defaultRowIds??={};let addedRows=0,aliasedRows=0;
 const unique=(id,used)=>{if(!used.has(id)){used.add(id);return id;}let serial=1,alias;do{alias=id.slice(0,60)+':default:'+serial++;}while(used.has(alias));used.add(alias);return alias;};
 for(const [map,rows]of Object.entries(seed.document.maps)){
  const current=document.maps[map]??[],seen=new Set(document.defaultRowIds[map]??[]),ids=new Set(current.map(row=>row.id)),groups=new Set(current.map(row=>row.groupId)),aliases=new Map(),added=[];
  for(const row of rows){if(seen.has(row.id))continue;seen.add(row.id);const id=unique(row.id,ids);if(id!==row.id)aliasedRows++;if(!aliases.has(row.groupId))aliases.set(row.groupId,unique(row.groupId,groups));added.push({...row,id,groupId:aliases.get(row.groupId)});addedRows++;}
  // Newly installed requested groups reserve preparation first. Existing custom
  // rows retain their IDs, values and relative order behind the new defaults.
  document.maps[map]=[...added,...current];document.defaultRowIds[map]=[...seen];
 }
 const checked=validateMonsterSpawns(document);if(!checked.valid)throw Error(checked.errors.join('\n'));return {document:checked.document,changed:true,addedRows,aliasedRows,upgradedRows,revision};
}
