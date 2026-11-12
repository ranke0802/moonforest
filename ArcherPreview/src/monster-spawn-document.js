import {ITEM_DROP_CHOICES} from './item-drop-data.js';
// Data-only monster placement document. Never execute values from imported files.
export const MONSTER_SPAWN_FORMAT='moonforest-monster-spawns';
export const MONSTER_SPAWN_MAPS=Object.freeze(['village','great-plains','monster-forest','witch-cave']);
export const MONSTER_SPAWN_DEFINITIONS=Object.freeze(['guardian-bear.standard','hooded-goblin.standard','alpha-wolf.r8']);
const validId=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;
export const emptyMonsterSpawns=()=>({format:MONSTER_SPAWN_FORMAT,version:1,maps:{}});
export function validateMonsterSpawns(input){
 let document;try{const text=typeof input==='string'?input:JSON.stringify(input);if(new TextEncoder().encode(text).length>262144)throw Error('파일이 256 KiB를 초과합니다.');document=JSON.parse(text);}catch(error){return {valid:false,errors:[error.message]};}
 const errors=[],fail=message=>errors.push(message);
 if(!document||document.format!==MONSTER_SPAWN_FORMAT||document.version!==1||!document.maps||typeof document.maps!=='object'||Array.isArray(document.maps))return {valid:false,errors:['몬스터 배치 파일 형식이 올바르지 않습니다.']};
 for(const [mapId,rows] of Object.entries(document.maps)){
  if(!MONSTER_SPAWN_MAPS.includes(mapId)||!Array.isArray(rows)||rows.length>20){fail(mapId+': 지역 또는 몬스터 수를 확인하세요.');continue;}
  const ids=new Set(),groups=new Map();for(const row of rows){
   if(!row||typeof row!=='object'||!validId.test(row.id??'')||ids.has(row.id)){fail(mapId+': 몬스터 ID가 중복되거나 올바르지 않습니다.');continue;}ids.add(row.id);
   if(!MONSTER_SPAWN_DEFINITIONS.includes(row.definitionId)||!validId.test(row.groupId??'')||!['start','random'].includes(row.spawnMode)||typeof row.respawn!=='boolean'||typeof row.rewardEnabled!=='boolean'||!Number.isFinite(row.x)||!Number.isFinite(row.z)||Math.abs(row.x)>10000||Math.abs(row.z)>10000||!Number.isFinite(row.yaw)||Math.abs(row.yaw)>1000||!Number.isFinite(row.delaySeconds)||row.delaySeconds<1||row.delaySeconds>86400||!Number.isFinite(row.randomRadius)||row.randomRadius<0||row.randomRadius>100)fail(row.id+': 배치 설정을 확인하세요.');
   if(!row.drop||typeof row.drop!=='object'||!ITEM_DROP_CHOICES.some(([id])=>id===row.drop.assetId)||typeof row.drop.effectEnabled!=='boolean')fail(row.id+': 드롭 설정을 확인하세요.');
   const signature=JSON.stringify([row.spawnMode,row.respawn,row.delaySeconds]);if(groups.has(row.groupId)&&groups.get(row.groupId)!==signature)fail(row.groupId+': 같은 그룹의 등장·리스폰 설정이 서로 다릅니다.');else groups.set(row.groupId,signature);
  }
 }
 return {valid:errors.length===0,errors,document:errors.length?null:document};
}
