import {Vector3} from '@babylonjs/core';
import {ActorPopulation} from './actor-population.js';
import {ACTOR_DEFINITIONS,validateActorSpawn} from './actor-definitions.js';
import {createActorEncounterFactory} from './actor-encounter-adapter.js';
import {createMonsterGroupScheduler} from './monster-group-scheduler.js';
import {emptyMonsterSpawns,validateMonsterSpawns,MONSTER_SPAWN_DEFINITIONS,mergeMonsterSpawnDefaults,preserveMonsterDefaultHistory} from './monster-spawn-document.js';
import {safeMonsterSceneryHome} from './monster-scenery-space.js';
export const MONSTER_SPAWN_STORAGE='moonforest-monster-spawns-v1';
const DEATH_STORAGE='moonforest-monster-spawn-deaths-v1';
const definitions=Object.fromEntries(Object.entries(ACTOR_DEFINITIONS).filter(([id])=>MONSTER_SPAWN_DEFINITIONS.includes(id)).map(([id,def])=>[id,{...def,respawn:{...def.respawn,enabled:false}}]));
export function orderMonsterSpawnPreparation(rows,player,{defaults=[]}={}){
 const groups=new Map();for(const row of rows){let group=groups.get(row.groupId);if(!group){group={rows:[],index:groups.size};groups.set(row.groupId,group);}group.rows.push(row);}
 const isDefault=row=>defaults.some(seed=>(row.id===seed.id||row.id.startsWith(seed.id.slice(0,60)+':default:'))&&row.definitionId===seed.definitionId&&row.x===seed.x&&row.z===seed.z);
 const ordered=[...groups.values()].map(group=>{const first=group.rows[0],x=first.territory?.x??group.rows.reduce((n,row)=>n+row.x,0)/group.rows.length,z=first.territory?.z??group.rows.reduce((n,row)=>n+row.z,0)/group.rows.length;return {...group,priority:defaults.length&&!group.rows.some(isDefault)?1:0,distance:player?Math.hypot(x-player.x,z-player.z):0};});
 ordered.sort((a,b)=>a.priority-b.priority||a.distance-b.distance||a.index-b.index);return ordered.flatMap(group=>group.rows);
}
export function createAuthoredMonsterRuntime({world,battle,getPlayer,getState,storage,defaultDocument,defaultRevision,onDefeat=()=>{},onError=()=>{},getFocus=null,active:startActive=true,random=Math.random,Factory=createActorEncounterFactory,Population=ActorPopulation}){
 let active=startActive!==false,disposed=false,mapId=null,document=emptyMonsterSpawns(),dead={},scheduler,savedUnreadable=false,defaultMigration=null;
 try{const raw=storage?.getItem(MONSTER_SPAWN_STORAGE);if(raw){const checked=validateMonsterSpawns(raw);if(checked.valid)document=checked.document;else{savedUnreadable=true;onError(Error('저장된 몬스터 배치를 읽지 못했습니다.'));}}}catch(error){savedUnreadable=true;onError(error);}
 if(defaultDocument){
  try{const merged=mergeMonsterSpawnDefaults(document,defaultDocument,defaultRevision);document=merged.document;defaultMigration={revision:merged.revision,changed:merged.changed,addedRows:merged.addedRows,aliasedRows:merged.aliasedRows,upgradedRows:merged.upgradedRows,persisted:!merged.changed,storageError:null};
   if(merged.changed){if(savedUnreadable)defaultMigration.storageError='Existing unreadable placement data was preserved';else if(!storage?.setItem)defaultMigration.storageError='Storage unavailable; defaults active in memory';else try{storage.setItem(MONSTER_SPAWN_STORAGE,JSON.stringify(document));defaultMigration.persisted=true;}catch(error){defaultMigration.storageError=String(error?.message??error);onError(error);}}
  }catch(error){defaultMigration={revision:defaultRevision??null,changed:false,persisted:false,error:String(error?.message??error)};onError(error);}
 }
 try{const value=JSON.parse(storage?.getItem(DEATH_STORAGE)??'{}');if(value&&typeof value==='object'&&!Array.isArray(value))dead=value;}catch{}
 const byActor=new Map(),admissions=new Map(),factory=Factory({world,battle,getPlayer,rewardsEnabled:true,onDefeat:event=>{const row=byActor.get(event.actorId);if(row)onDefeat(event,row);}});
 const population=new Population({definitions,createAdapter:factory,autoRecycle:false,validateSpawn:(definition,context)=>validateActorSpawn(definition,world,context),limits:{total:20,active:20,concurrentPreparations:3,estimatedMemoryBytes:512*1024*1024},onDeath:record=>{const row=record.spawnContext?.row;if(row&&!row.respawn){dead[world.mapId]??=[];if(!dead[world.mapId].includes(row.id)){dead[world.mapId].push(row.id);try{storage?.setItem(DEATH_STORAGE,JSON.stringify(dead));}catch(error){onError(error);}}}},onError});
 function occupied(){const result=new Map();for(const e of battle.encounters??[])if(e.active&&e.actor?.position)result.set(e,{position:e.actor.position,radius:e.radius??.8});for(const record of population.entries??[]){const e=record.adapter?.encounter;if(record.state==='active'&&e?.actor?.position)result.set(e,{position:e.actor.position,radius:e.radius??.8});}return [...result.values()];}
 function positionFor(row,player){const def=definitions[row.definitionId],used=occupied();for(let i=0;i<24;i++){const radius=row.spawnMode==='random'?Math.sqrt(random())*row.randomRadius:0,angle=random()*Math.PI*2,x=row.x+Math.cos(angle)*radius,z=row.z+Math.sin(angle)*radius,requested=new Vector3(x,world.terrain.heightAt(x,z),z),accept=position=>validateActorSpawn(def,world,{position,player,occupied:used}).valid,point=safeMonsterSceneryHome(world,row,requested,accept);if(point)return {position:new Vector3(point.x,point.y,point.z),player,occupied:used};if(!radius)break;}throw Error(row.id+': 안전한 등장 위치가 없습니다.');}
 function canLaunch(rows){
  const requested=[...[...admissions.values()].flat(),...rows],ids=new Set(requested.map(row=>row.id)),limits=population.limits??{total:20,active:20,estimatedMemoryBytes:512*1024*1024};let reservedBytes=0,extraEntries=0;const counts=new Map();
  for(const row of requested){const def=definitions[row.definitionId];counts.set(row.definitionId,(counts.get(row.definitionId)??0)+1);reservedBytes+=def.population.estimatedBytes;}
  for(const record of population.entries??[]){if(record.state==='dormant'&&!record.operation)continue;const row=record.operation?.context?.row??record.spawnContext?.row,expected=row&&ids.has(row.id)?definitions[row.definitionId]?.population.estimatedBytes??0:0;if(!expected)extraEntries++;reservedBytes+=Math.max(0,(record.estimatedBytes??expected)-expected);}
  if(requested.length+extraEntries>Math.min(limits.total??20,limits.active??20))return 'population-capacity';
  if(reservedBytes>(limits.estimatedMemoryBytes??512*1024*1024))return 'estimated-memory-capacity';
  for(const [id,total]of counts)if(total>Math.min(definitions[id].population.maxPooled,typeof limits.perDefinition==='number'?limits.perDefinition:limits.perDefinition?.[id]??20))return 'definition-capacity';
  admissions.set(rows[0].groupId,rows);return true;
 }
 scheduler=createMonsterGroupScheduler({random,onError,preparationGroups:1,focus:()=>({player:getPlayer()?.position??null,spot:getFocus?.()??null}),canLaunch,releaseAdmission:rows=>admissions.delete(rows[0].groupId),canCommit:()=>{const state=getState();return state.ready&&!state.dead&&!state.paused;},spawn:async(row,{isCurrent})=>{const player=getPlayer();if(!player||!isCurrent())throw Error('지역이 준비되지 않았습니다.');const context={...positionFor(row,player),mapId:world.mapId,rotationY:row.yaw,row,staged:true};const record=await population.spawn(row.definitionId,context);if(!isCurrent()){population.recycle(record);throw Error('지역 변경으로 등장 취소');}byActor.set(record.adapter.id,row);return record;},commit:records=>{for(const record of records)if(!record.adapter?.reveal?.())throw Error('그룹 몬스터를 표시하지 못했습니다.');},remove:record=>{if(record?.adapter)byActor.delete(record.adapter.id);population.recycle(record,{respawn:false});},isAlive:record=>!record.flags?.death||!record.adapter?.snapshot?.().corpseGone});
 // Every species placed on the map is fetched, decoded and compiled at once
 // (the loading screen waits on this), not one cold load per pack in play.
 const held=new Map();let preloadTask=null,preloadMap=null;
 function preload(){
  if(disposed||!factory.retain)return Promise.resolve();const map=world.mapId;if(preloadMap===map&&preloadTask)return preloadTask;
  const gone=Array.isArray(dead[map])?dead[map]:[],ids=new Set((document.maps[map]??[]).filter(row=>!gone.includes(row.id)&&definitions[row.definitionId]).map(row=>row.definitionId));
  // Kept across maps (village <-> plains trips do not decode again); only a
  // large set is trimmed back to this map's species.
  if(held.size+ids.size>10)for(const [id,handle] of held)if(!ids.has(id)){held.delete(id);try{handle.release();}catch(error){onError(error);}}
  const waits=[];for(const id of ids){let handle=held.get(id);if(!handle){try{handle=factory.retain(definitions[id]);held.set(id,handle);}catch(error){onError(error);continue;}}
   const current=handle;waits.push(current.ready.catch(error=>{if(held.get(id)===current){held.delete(id);current.release();}onError(error);}));}
  preloadMap=map;return preloadTask=Promise.all(waits).then(()=>{});
 }
 function loadMap(){mapId=world.mapId;byActor.clear();void preload();// getFocus (optional): prepare the groups nearest a point of interest first
  // (0.3: the current quest spot), otherwise nearest the player.
  const ordered=orderMonsterSpawnPreparation(document.maps[mapId]??[],getFocus?.()??getPlayer()?.position,{defaults:defaultDocument?.maps?.[mapId]??[]});scheduler.load(ordered,{permanentlyDead:Array.isArray(dead[mapId])?dead[mapId]:[]});}
 function leaveMap(){scheduler.leave();admissions.clear();byActor.clear();population.leaveMap();mapId=null;}
 function replace(input){const checked=validateMonsterSpawns(input);if(!checked.valid)throw Error(checked.errors.join('\n'));const next=validateMonsterSpawns(preserveMonsterDefaultHistory(checked.document,document));if(!next.valid)throw Error(next.errors.join('\n'));if(!storage)throw Error('저장 공간을 사용할 수 없습니다.');storage.setItem(MONSTER_SPAWN_STORAGE,JSON.stringify(next.document));leaveMap();document=next.document;}
 // Loading screen: species first, then the packs themselves (hidden until play).
 async function prepareForLoading(options){if(disposed||!active)return;await preload();if(mapId!==world.mapId)loadMap();await scheduler.prewarm(options);}
 return {getDocument:()=>structuredClone(document),replace,prepareForLoading,resetPermanent(map=world.mapId){delete dead[map];try{storage?.setItem(DEATH_STORAGE,JSON.stringify(dead));}catch(error){onError(error);}leaveMap();},leaveMap,preload,activate(){active=true;},
  // Back to the title without a reload (0.3): the placed monsters leave; activate() places them again on the next update.
  deactivate(){if(disposed||!active)return;active=false;leaveMap();},get active(){return active;},beforeBattle(dt,player){if(disposed||!active)return;const state=getState();if(mapId!==world.mapId)loadMap();const paused=!state.ready||state.dead||state.paused;population.setPaused(paused);population.update(dt,{player,mapId:world.mapId});scheduler.update(dt,{paused});},afterBattle(player){if(disposed||!active)return;population.observe({player,mapId:world.mapId});const state=getState();scheduler.update(0,{paused:!state.ready||state.dead||state.paused});},inspect:()=>({mapId,groups:scheduler.inspect(),population:population.diagnostics(),defaultMigration:defaultMigration?{...defaultMigration}:null}),dispose(){if(disposed)return;disposed=true;for(const handle of held.values())try{handle.release();}catch{}held.clear();scheduler.dispose();population.dispose();factory.dispose?.();byActor.clear();}};
}
