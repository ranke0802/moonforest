import {BOSS_MOTIONS} from './boss-spec.js';
import {GOBLIN_MOTIONS} from './goblin-spec.js';
import {ELENA_ACTIVE_CLIPS,ELENA_SIZE,MOURNING_SIZE,MOURNING_MOVEMENT} from './elena-spec.js';
import {CHARACTER_STYLE_DEFAULTS} from './character-style-settings.js';

function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
const identity=names=>Object.fromEntries(names.map(name=>[name,name]));
const common={definitionVersion:1,style:{toon:'existing-monster-toon',outline:'existing-character-outline',internalLine:'existing-character-surface-style',group:'boss',defaults:CHARACTER_STYLE_DEFAULTS.boss},bounds:{mode:'prepared-independent-skinned-bounds',renderRangePadding:3},spawn:{group:'development-actor-lab',count:1,intervalSeconds:0,maps:['village','great-plains','monster-forest','witch-cave'],area:'current-map-navigation',pausePolicy:'game-paused-or-map-inactive'},respawn:{enabled:true,delaySeconds:8,pausePolicy:'game-paused-or-map-inactive'},lod:{mode:'existing-full-quality',levels:[],futurePolicy:'per-definition-screen-coverage',reduceExisting:false},scheduling:{nearDistance:20,farDecisionSeconds:1}};
function definition(value){return freeze({...common,...value,actorDefinitionId:value.actorDefinitionId,spawn:{...common.spawn,...value.spawn},population:{maxPooled:20,idleSeconds:30,...value.population}});}

// References are canonical manifest IDs + the current shipped version. The
// development lab is the only consumer; nothing here starts a production spawn.
export const ACTOR_DEFINITIONS=freeze({
  'guardian-bear.standard':definition({actorDefinitionId:'guardian-bear.standard',label:'수호 곰',assetId:'guardian-bear',assetVersion:'Guardian Bear · 20 original motions',category:'boss',encounterType:'bear',animation:identity(BOSS_MOTIONS.map(m=>m.name)),collider:{radius:.7,stopDistance:1.65,separationRadius:.8,source:'BossEncounter'},behavior:{type:'existing-bear-brain',source:'BossBrain'},movement:{walkSpeed:1.65,runSpeed:3.25,source:'BossBrain'},hp:900,spawn:{safeDistance:1.5},population:{estimatedBytes:16*1024*1024},drop:{handler:'GoldLoot.drop',kind:'bear'},quest:{handler:'ChapterQuests.defeat',kind:'bear'}}),
  'hooded-goblin.standard':definition({actorDefinitionId:'hooded-goblin.standard',label:'후드 고블린',assetId:'hooded-goblin',assetVersion:'Hooded Goblin - 12 source motions',category:'monster',encounterType:'goblin',animation:identity(GOBLIN_MOTIONS.map(m=>m.name)),collider:{radius:.34,stopDistance:1.05,separationRadius:.42,source:'GoblinEncounter'},behavior:{type:'existing-goblin-brain',source:'GoblinBrain'},movement:{walkSpeed:1.8,sneakSpeed:2.5,runSpeed:5.2,source:'GoblinBrain'},hp:180,spawn:{safeDistance:1.14},population:{estimatedBytes:12*1024*1024},drop:{handler:'GoldLoot.drop',kind:'goblin'},quest:{handler:'ChapterQuests.defeat',kind:'goblin'}}),
  'elena.fallen':definition({actorDefinitionId:'elena.fallen',label:'타락한 성녀 엘레나',assetId:'elena',assetVersion:'Fallen Saint Elena · approved 56,918 triangles',category:'boss',encounterType:'elena',animation:identity(ELENA_ACTIVE_CLIPS),collider:{radius:ELENA_SIZE.radius,stopDistance:ELENA_SIZE.stopDistance,separationRadius:ELENA_SIZE.separationRadius,source:'ELENA_SIZE'},behavior:{type:'existing-elena-brain',phase:1,source:'ElenaEncounter'},movement:{walkSpeed:1.1,runSpeed:2.1,repositionSpeed:1.1,source:'ElenaBrain'},hp:1200,spawn:{safeDistance:ELENA_SIZE.radius+.8},population:{maxPooled:4,estimatedBytes:64*1024*1024},drop:null,quest:{handler:'ChapterQuests.defeat',kind:'elena',phase:1}}),
  'elena.mourning':definition({actorDefinitionId:'elena.mourning',label:'비탄의 마녀 엘레나',assetId:'mourning-elena',assetVersion:'Mourning Elena · r10 motion · approved 49,982 triangles',category:'boss',encounterType:'mourning',animation:{idle:'Chimera_Prayer_Idle_6s',walk:'Chimera_Organic_Walk_2p4s',cast:'Chimera_Arcane_Cast_3s',hit:'Chimera_Hit_Reaction_1p3s',dead:'Chimera_Death_Lament_5p2s',cast_slam:'Chimera_Advance_Slam_3s',cast_alternate:'Chimera_Alternating_Cast_3s'},collider:{radius:MOURNING_SIZE.radius,stopDistance:MOURNING_SIZE.stopDistance,separationRadius:MOURNING_SIZE.separationRadius,source:'MOURNING_SIZE'},bounds:{...common.bounds,renderRangePadding:MOURNING_SIZE.renderRangePadding},behavior:{type:'existing-elena-brain',phase:2,source:'MourningElenaEncounter'},movement:{...MOURNING_MOVEMENT,source:'MOURNING_MOVEMENT'},hp:1800,spawn:{safeDistance:MOURNING_SIZE.radius+.8},population:{maxPooled:4,estimatedBytes:96*1024*1024},drop:null,quest:{handler:'ChapterQuests.defeat',kind:'elena',phase:2}}),
  'village.guard':definition({actorDefinitionId:'village.guard',label:'대화 연결 검증용 자경단',assetId:'hooded-goblin',assetVersion:'Hooded Goblin - 12 source motions',category:'npc',encounterType:'npc',animation:identity(GOBLIN_MOTIONS.map(m=>m.name)),collider:{radius:.34,stopDistance:1.05,separationRadius:.42,source:'peaceful-goblin-visual'},behavior:{type:'stationary-npc',hostile:false},movement:{walkSpeed:0},hp:null,spawn:{safeDistance:1.14,maps:['village']},respawn:{enabled:false,delaySeconds:0,pausePolicy:'game-paused-or-map-inactive'},population:{maxPooled:4,estimatedBytes:12*1024*1024},drop:null,quest:{handler:'ChapterQuests.talk',reference:'talk:guard'},npc:{interactionId:'guard',range:3,visualRepresentative:true,dialogue:'existing-chapter-guard'}}),
});

export function getActorDefinition(id){const result=ACTOR_DEFINITIONS[id];if(!result)throw new Error('Unknown actor definition: '+id);return result;}

// Reject unsafe positions explicitly; the caller can choose another sample.
// Never silently lower a requested count or move a spawn through a wall.
export function validateActorSpawn(definition,world,{position,player,occupied=[]}={}){
  if(!position||![position.x,position.z].every(Number.isFinite))return {valid:false,reason:'invalid-position'};
  if(world.mapId&&!definition.spawn.maps.includes(world.mapId))return {valid:false,reason:'wrong-map'};
  const radius=definition.collider.radius;
  if(player&&Math.hypot(position.x-player.position.x,position.z-player.position.z)<definition.spawn.safeDistance)return {valid:false,reason:'player-safety-distance'};
  if(world.navigation?.free&&!world.navigation.free(position,radius))return {valid:false,reason:'blocked-navigation'};
  if(occupied.some(other=>Math.hypot(position.x-(other.position??other).x,position.z-(other.position??other).z)<radius+(other.radius??.8)))return {valid:false,reason:'occupied'};
  return {valid:true,position};
}
