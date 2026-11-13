import {WolfEncounter} from './wolf-encounter.js';
import {WolfV02Encounter} from './wolf-v02-encounter.js';
import {WOLF_BALANCE} from './wolf-spec.js';
import { Vector3 } from '@babylonjs/core';
import { BossEncounter } from './boss-encounter.js';
import { BossModelLibrary } from './boss-models.js';
import { PlayerCombat } from './player-combat.js';
import { GoblinEncounter } from './goblin-encounter.js';
import { ElenaEncounter } from './elena-encounter.js';
import { MourningElenaEncounter } from './mourning-elena-encounter.js';
import { ELENA_HOME, ELENA_SIZE, MOURNING_SIZE } from './elena-spec.js';
import { isEnemySolid } from './enemy-collision.js';
import { ENEMY_ARENA_RADIUS } from './world-limits.js';
import { createBossPreparation } from './boss-preparation.js';
import { ArenaNavigation } from './navigation.js';
import { VillageNavigation } from './village-navigation.js';
import { CaveNavigation } from './witch-cave-navigation.js';
import { MourningCaveNavigation } from './mourning-cave-navigation.js';
import { TerrainHeightField } from './terrain.js';
import {MAX_SUMMON_PER_KIND,normalizeSummonCount} from './summon-limits.js';

function stableMapCollision(navigation,terrain){
  const type=navigation?.constructor;
  if((type!==ArenaNavigation&&type!==VillageNavigation&&type!==CaveNavigation&&type!==MourningCaveNavigation)||terrain?.constructor!==TerrainHeightField)return false;
  const move=type===ArenaNavigation?ArenaNavigation.prototype.move:VillageNavigation.prototype.move;
  const free=type===ArenaNavigation?ArenaNavigation.prototype.free:type===VillageNavigation?VillageNavigation.prototype.free:CaveNavigation.prototype.free;
  const findFree=type===MourningCaveNavigation?MourningCaveNavigation.prototype.findFree:ArenaNavigation.prototype.findFree;
  return navigation.constrain===ArenaNavigation.prototype.constrain&&navigation.move===move&&navigation.free===free&&navigation.findFree===findFree&&terrain.place===TerrainHeightField.prototype.place&&terrain.heightAt===TerrainHeightField.prototype.heightAt&&!terrain.surfaceHeight;
}

export const MAX_BOSSES = MAX_SUMMON_PER_KIND;
export const normalizeBossCount=normalizeSummonCount;
export function bossSpawnPositions(player, value, {radius=.7,separationRadius=.8}={}) {
  const count = normalizeBossCount(value), center = player.position.clone();
  center.y = 0;
  if(count>5||radius>.7){
    const spacing=Math.max(2,2*separationRadius+.3),positions=[];
    let ring=Math.max(4,radius+1.2);
    while(positions.length<count){
      const capacity=Math.max(1,Math.floor(Math.PI/Math.asin(Math.min(1,spacing/(2*ring))))),remaining=Math.min(capacity,count-positions.length);
      const offset=positions.length?Math.PI/capacity:0;
      for(let i=0;i<remaining;i++){
        const yaw=player.rotation.y+2*Math.PI*i/remaining+offset;
        const position=center.add(new Vector3(Math.sin(yaw)*ring,0,Math.cos(yaw)*ring));
        const distance=Math.hypot(position.x,position.z),limit=Math.max(0,ENEMY_ARENA_RADIUS-radius);
        if(distance>limit){position.x*=limit/distance;position.z*=limit/distance;}
        positions.push(position);
      }
      ring+=spacing;
    }
    return positions;
  }
  const limit = ENEMY_ARENA_RADIUS-(count===1?2.8:4), distance = Math.hypot(center.x, center.z);
  if (distance > limit) { center.x *= limit / distance; center.z *= limit / distance; }
  return Array.from({ length: count }, (_, index) => {
    const yaw = player.rotation.y + (count === 1 ? 0 : -1.1 + 2.2 * index / (count - 1));
    const position = center.add(new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).scale(count === 1 ? 2.8 : 4));
    const radius = Math.hypot(position.x, position.z);
    if (radius > ENEMY_ARENA_RADIUS) { position.x *= ENEMY_ARENA_RADIUS / radius; position.z *= ENEMY_ARENA_RADIUS / radius; }
    return position;
  });
}

export function separateBosses(encounters, grabOwner) {
  const movable = boss => boss !== grabOwner && !['down', 'recover'].includes(boss.brain.mode);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < encounters.length; i++) for (let j = i + 1; j < encounters.length; j++) {
    const a = encounters[i], b = encounters[j];
    if (!isEnemySolid(a) || !isEnemySolid(b)) continue;
    const aMoves = movable(a), bMoves = movable(b), weight = Number(aMoves) + Number(bMoves);
    if (!weight) continue;
    const dx = b.actor.position.x - a.actor.position.x, dz = b.actor.position.z - a.actor.position.z;
    const distance = Math.hypot(dx, dz);
    const spacing=(a.separationRadius??.8)+(b.separationRadius??.8);
    if (distance >= spacing) continue;
    const x = distance > .0001 ? dx / distance : 1, z = distance > .0001 ? dz / distance : 0;
    const push = (spacing - distance) / weight;
    if (aMoves) { a.actor.position.x -= x * push; a.actor.position.z -= z * push; }
    if (bMoves) { b.actor.position.x += x * push; b.actor.position.z += z * push; }
  }
}

export class BossBattle {
  constructor(world, onChange, onDamage = () => {}, onPlayerHit = () => {}, { models, goblinModels, wolfModels, elenaModels, mourningModels, onDefeat=()=>{},onDiagnosticEvent=()=>{} } = {}) {
    this.world = world; this.onChange = onChange; this.onDamage = onDamage; this.onPlayerHit = onPlayerHit;
    this.onDefeat=onDefeat;this.onDiagnosticEvent=onDiagnosticEvent;
    this.models = models ?? new BossModelLibrary(world.scene);
    this.wolfModels=wolfModels??new BossModelLibrary(world.scene,'alpha-wolf');this.wolfPool=[];
    this.goblinModels=goblinModels??new BossModelLibrary(world.scene,'hooded-goblin');this.goblinPool=[];
    this.elenaModels=elenaModels??new BossModelLibrary(world.scene,'elena');this.elenaPool=[];this.residentRevision=0;
    this.mourningModels=mourningModels??new BossModelLibrary(world.scene,'mourning-elena');this.mourningPool=[];this.residentPhase=1;this.residentHome=ELENA_HOME;
    this.combat = new PlayerCombat(); this.pool = []; this.encounters = [];this.frameEncounters=[];
    this.active = false; this.loading = false; this.revision = 0; this.actionVersion = 0;this.motionToken={generation:0};
    this.noGrab = { active: false, label: '' };
  }
  get playerHp() { return this.combat.hp; }
  get playerMaxHp() { return this.combat.maxHp; }
  get playerAlive() { return !this.active || this.playerHp > 0; }
  get playerReaction() { return this.combat.reaction; }
  get potions() { return this.combat.potions; }
  get grab() { return this.combat.grabOwner?.grab ?? this.noGrab; }
  get canEscapeGrab() { return this.playerAlive && Boolean(this.grab.canEscape); }
  escapeGrab() {
    const owner=this.combat.grabOwner;
    if(!this.canEscapeGrab||!owner?.grab.escape())return false;
    owner.pendingEvents=[];
    this.actionVersion++;
    this.lastHit='잡기 탈출 · 회피';this.onChange(this);
    return true;
  }
  get playerNodes() { return this.combat.nodes; }
  set playerNodes(nodes) { this.combat.nodes = nodes; }
  get livingCount() { return this.encounters.filter(boss => boss.brain.hp > 0).length; }
  get combatCount(){return this.encounters.filter(b=>b.brain.hp>0&&(b.kind!=='elena'||b.engaged)).length;}
  get allPooled(){return [...this.pool,...this.wolfPool,...this.goblinPool,...this.elenaPool,...this.mourningPool,...(this.developmentPool??[])];}
  setAttackSettings(value){this.attackSettings=value;for(const enemy of this.allPooled)this.applyAttackSettings(enemy);}
  applyAttackSettings(enemy){const kind=enemy.kind==='elena'?(enemy.phase===2?'mourning-elena':'elena'):enemy.kind;enemy.brain?.configureAttacks?.(this.attackSettings?.[kind]??{});}
  residentForPhase(phase){
    const pool=phase===2?this.mourningPool:this.elenaPool,models=phase===2?this.mourningModels:this.elenaModels;
    if(!pool[0]){
      const Encounter=phase===2?MourningElenaEncounter:ElenaEncounter;
      const resident=new Encounter(this.world,b=>this.bossChanged(b),this.onDamage,(...args)=>this.playerHit(...args),{combat:this.combat,loadAsset:()=>models.instantiate(),onDefeat:this.onDefeat,onPreparationStage:stage=>this.onDiagnosticEvent({type:'stage',stage})});
      resident.id=phase===2?'mourning-elena':'elena';resident.number=1;pool.push(resident);
    }
    pool[0].manualSummon=false;
    if(phase===1)pool[0].onTransform=()=>this.transformResident(this.currentPlayer);
    return pool[0];
  }
  residentPreparation(revision=this.residentRevision,{incremental=true,allowAnyMap=false}={}){
    const scene=this.world.scene,map=this.world.mapId;
    return createBossPreparation({incremental,...this.preparationOptions,isCurrent:()=>revision===this.residentRevision&&(allowAnyMap||this.world.cave)&&this.world.scene===scene&&this.world.mapId===map&&!scene.isDisposed});
  }
  async activateResident(player,{reset=false,phase:resetPhase=1,home=ELENA_HOME}={}){
    if(!this.world.cave)return false;
    if(reset){this.residentPhase=resetPhase===2?2:1;this.residentHome={x:home.x,z:home.z};this.residentError=null;this.mourningNeedsReset=true;}
    if(this.residentPending){
      const revision=this.residentPendingRevision,phase=this.residentPendingPhase,result=await this.residentPending;
      return revision===this.residentRevision&&phase===this.residentPhase?result:this.activateResident(player,{reset,phase:resetPhase,home});
    }
    this.currentPlayer=player;
    const request=this.residentRevision,phase=this.residentPhase,models=phase===2?this.mourningModels:this.elenaModels,pool=phase===2?this.mourningPool:this.elenaPool;
    // Phase one also has a dense skinned mesh. Do not run its first outline/
    // vertex preparation synchronously while the game or loading UI is live.
    const preparation=this.residentPreparation(request,{incremental:true});this.residentPendingPreparation=preparation;
    this.residentPendingRevision=request;
    this.residentPendingPhase=phase;
    const pending=(async()=>{
      let completed=false;
      this.onDiagnosticEvent({type:'begin',label:phase===2?'비탄의 마녀':'타락한 성녀',trigger:reset?'선택 소환':'거처/변신',mode:pool[0]?.asset?'reuse':models.container?'cached-model':'cold'});
      try{
      await preparation.wait(models.load());
      this.onDiagnosticEvent({type:'stage',stage:'model'});
      if(request!==this.residentRevision||!this.world.cave)return false;
      const wasManual=pool[0]?.manualSummon===true,resident=this.residentForPhase(phase);
      if(!resident.assetPrepared||!resident.brain||reset||wasManual||(phase===2&&this.mourningNeedsReset)){
        const position=new Vector3(this.residentHome.x,0,this.residentHome.z);
        await resident.summon(player,{position,rotationY:0,preparation});
        this.applyAttackSettings(resident);
        this.residentHome={x:resident.home.x,z:resident.home.z};
        if(phase===2)this.mourningNeedsReset=false;
      }else{
        resident.active=true;resident.actor.setEnabled(!resident.corpseGone);resident.setShadowCasting?.(!resident.corpseGone);resident.routeState={};resident.engaged=false;
        resident.animator.transition(resident.brain.state,{clipTime:resident.brain.time,actionId:resident.brain.serial});
        if(resident.phase===2)resident.animator.sample(0);else resident.animator.update(.2);
      }
      if(request!==this.residentRevision||!this.world.cave){resident.hide();return false;}
      for(const old of this.encounters)if(old.kind==='elena'&&old!==resident)old.hide();
      this.encounters=this.encounters.filter(b=>b.kind!=='elena'||b===resident);
      if(!this.encounters.includes(resident))this.encounters.push(resident);
      this.active=true;this.onChange(this);completed=true;this.onDiagnosticEvent({type:'ready',preparationStats:preparation.stats});return true;
      }catch(error){if(error.name==='AbortError')return false;completed=true;this.onDiagnosticEvent({type:'error',error:String(error.message??error).slice(0,160),preparationStats:preparation.stats});throw error;}
      finally{if(!completed)this.onDiagnosticEvent({type:'cancel',reason:'지역/요청 변경',preparationStats:preparation.stats});}
    })();
    this.residentPending=pending;
    try{return await pending;}finally{if(this.residentPending===pending){this.residentPending=null;this.residentPendingPreparation=null;}}
  }
  transformResident(player){
    if(this.residentPhase===2||!this.world.cave)return this.residentPending;
    this.residentPhase=2;this.lastHit='타락한 성녀가 비탄의 마녀로 변합니다';this.onChange(this);
    return this.activateResident(player).catch(error=>{this.residentError=String(error.message??error);this.lastHit='광폭화 모델을 불러오지 못했습니다. 연결을 확인해 주세요.';this.onChange(this);console.error('[Elena transformation]',error);return false;});
  }
  preloadMourning({modelsOnly=false}={}){
    if(this.mourningWarmRequested)return this.mourningWarmPending??Promise.resolve(this.mourningWarmJob?.status==='prepared');this.mourningWarmRequested=true;
    const preparation=this.residentPreparation(this.residentRevision,{allowAnyMap:modelsOnly}),jobId=this.mourningWarmSerial=(this.mourningWarmSerial??0)+1,job={jobId,status:'loading',preparation};this.mourningWarmJob=job;
    this.onDiagnosticEvent({type:'prefetch-start',label:'광폭화 모델',jobId});
    const pending=preparation.wait(this.mourningModels.load()).then(async()=>{
      preparation.check();
      if(!modelsOnly&&typeof this.mourningModels.instantiate==='function'){
        job.status='preparing';job.resident=this.residentForPhase(2);
        await job.resident.prepareHidden({preparation});
      }
      job.status='prepared';return true;
    }).catch(error=>{
      if(error.name==='AbortError'){job.status='cancelled';return false;}
      job.status='error';job.error=this.residentError=String(error.message??error);console.warn('[Elena preload]',error);return false;
    }).finally(()=>{
      const stats=preparation.stats,preparationStats={yields:stats.yields,slices:stats.slices,maxSliceMs:stats.maxSliceMs,steps:stats.steps.map(({name,ms})=>({name,ms}))};
      this.onDiagnosticEvent({type:'prefetch-end',label:'광폭화 모델',jobId,status:job.status,preparationStats,...(job.error?{error:job.error}:{})});if(this.mourningWarmPending===pending)this.mourningWarmPending=null;
    });
    this.mourningWarmPending=pending;return pending;
  }
  async summonResident(player,phase=1){
    if(!this.world.cave)return this.summon(player,1,phase===2?'mourning-elena':'elena');
    if(this.loading||this.residentPending)return false;
    this.loading=true;this.onChange(this);
    try{
      const radius=phase===2?MOURNING_SIZE.radius:ELENA_SIZE.radius,position=bossSpawnPositions(player,1)[0];
      const occupied=[{x:player.position.x,z:player.position.z,radius:.8},...this.encounters.filter(b=>b.kind!=='elena'&&b.brain.hp>0).map(b=>({x:b.actor.position.x,z:b.actor.position.z,radius:b.radius}))];
      if(this.world.navigation){const safe=this.world.navigation.findFree(position,radius,ENEMY_ARENA_RADIUS,occupied);position.x=safe.x;position.z=safe.z;}
      // The same two pooled actors serve the selector and the resident fight.
      // Resetting one boss never resets player resources or other enemies.
      for(const old of [...this.elenaPool,...this.mourningPool]){old.reviewMode=false;old.hide();}
      const active=await this.activateResident(player,{reset:true,phase,home:position});
      if(active){const resident=this.encounters.find(b=>b.kind==='elena');resident.actor.rotation.y=Math.atan2(player.position.x-resident.actor.position.x,player.position.z-resident.actor.position.z);this.lastHit=resident.displayName+' 소환';this.actionVersion++;}
      return active;
    }finally{this.loading=false;this.onChange(this);}
  }
  get canUsePotion() { return this.active && !this.loading && !this.grab.active && this.potions.canUse(this.playerHp, this.playerMaxHp); }
  usePotion() {
    if (!this.canUsePotion) return false;
    this.potions.use(this.playerHp, this.playerMaxHp);
    this.lastHit = '물약 사용 · 1초마다 40씩 4회 회복'; this.onChange(this); return true;
  }
  bossChanged(boss) {
    if (boss.lastHit && boss.lastHit !== boss.lastReportedHit) {
      boss.lastReportedHit = boss.lastHit;
      this.lastHit = this.encounters.length > 1 ? `${boss.displayName??(boss.kind==='goblin'?'고블린':'곰')} ${boss.number??boss.id} · ${boss.lastHit}` : boss.lastHit;
    }
    if (!this.updating && !this.loading) this.onChange(this);
  }
  playerHit(duration, options) {
    const reacted = this.onPlayerHit(duration, options);
    if (reacted !== false) {
      this.actionVersion++;
      for (const boss of this.allPooled) boss.gate.reset();
    }
    return reacted;
  }
  manualElena(encounter,{reset=false}={}){
    if(reset||!encounter.manualSummon)encounter.summonGeneration=(encounter.summonGeneration??0)+1;
    encounter.manualSummon=true;
    if(encounter.phase===1)encounter.onTransform=()=>this.transformSummonedElena(encounter);
  }
  transformSummonedElena(source){
    const generation=source.summonGeneration,revision=this.residentRevision,scene=this.world.scene,map=this.world.mapId;
    const current=()=>revision===this.residentRevision&&scene===this.world.scene&&map===this.world.mapId&&!scene.isDisposed&&source.manualSummon&&source.active&&source.summonGeneration===generation&&source.brain?.hp<=0;
    const job=async()=>{
      if(!current())return false;
      // A foreground summon owns the shared actor setup budget until complete.
      if(this.summonPending)await this.summonPending.catch(()=>{});
      if(!current())return false;
      let index=this.mourningPool.findIndex(enemy=>!enemy.active||enemy.corpseGone);
      if(index<0)index=this.mourningPool.length;
      if(index>=MAX_BOSSES){(this.blockedManualTransforms??=new Map()).set(source,generation);return false;}
      const preparation=createBossPreparation({...this.preparationOptions,incremental:true,isCurrent:current});
      this.manualTransformPreparation=preparation;this.loading=true;this.onChange(this);
      let target;
      try{
        await preparation.wait(this.mourningModels.load());
        target=this.manualEncounter('mourning-elena',index);
        target.hide();
        this.manualElena(target,{reset:true});
        await target.prepareHidden({preparation});
        const player=this.currentPlayer,position=source.actor.position.clone();
        if(!player)return false;
        const occupied=this.spawnOccupants(player,this.encounters.filter(enemy=>enemy!==source&&enemy!==target));
        const navigation=target.movementNavigation??this.world.navigation;
        if(navigation){const safe=await navigation.findFree(position,target.radius,ENEMY_ARENA_RADIUS,occupied,preparation);position.x=safe.x;position.z=safe.z;}
        await target.summon(player,{position,rotationY:source.actor.rotation.y,occupied,preparation,reuseAnimator:this.canReuseAnimator(target)});
        preparation.check();this.applyAttackSettings(target);
        source.hide();this.encounters=this.encounters.filter(enemy=>enemy!==source&&enemy!==target);this.encounters.push(target);
        this.active=true;this.actionVersion++;this.lastHit='타락한 성녀가 비탄의 마녀로 변합니다';return true;
      }catch(error){target?.hide();if(error.name!=='AbortError'){this.residentError=String(error.message??error);source.manualTransformError=this.residentError;this.lastHit='비탄의 마녀를 불러오지 못했습니다.';}return false;}
      finally{if(this.manualTransformPreparation===preparation)this.manualTransformPreparation=null;this.loading=false;this.onChange(this);}
    };
    const pending=(this.manualTransformPending??Promise.resolve()).catch(()=>{}).then(job);
    this.manualTransformPending=pending;
    pending.finally(()=>{if(this.manualTransformPending===pending)this.manualTransformPending=null;});
    return pending;
  }
  resumeManualTransforms(){
    const blocked=this.blockedManualTransforms;
    if(!blocked?.size||this.loading||this.manualTransformPending)return;
    if(this.mourningPool.length>=MAX_BOSSES&&!this.mourningPool.some(enemy=>!enemy.active||enemy.corpseGone))return;
    for(const [source,generation]of blocked){
      blocked.delete(source);
      if(!source.manualSummon||!source.active||source.summonGeneration!==generation||source.brain?.hp>0)continue;
      this.transformSummonedElena(source);break;
    }
  }
  manualEncounter(kind,index){
    const phase=kind==='mourning-elena'?2:kind==='elena'?1:null;
    const models=phase===2?this.mourningModels:phase===1?this.elenaModels:kind==='wolf'?this.wolfModels:kind==='goblin'?this.goblinModels:this.models;
    const pool=phase===2?this.mourningPool:phase===1?this.elenaPool:kind==='wolf'?this.wolfPool:kind==='goblin'?this.goblinPool:this.pool;
    if(!pool[index]){
      const Encounter=phase===2?MourningElenaEncounter:phase===1?ElenaEncounter:kind==='wolf'?(this.world.release==='moonforest-0.2'?WolfV02Encounter:WolfEncounter):kind==='goblin'?GoblinEncounter:BossEncounter;
      const enemy=new Encounter(this.world,b=>this.bossChanged(b),this.onDamage,(duration,options)=>this.playerHit(duration,options),{combat:this.combat,loadAsset:()=>models.instantiate(),onDefeat:this.onDefeat});
      enemy.number=index+1;enemy.id=kind==='bear'?index+1:kind==='goblin'?`g${index+1}`:`${kind}-${index+1}`;pool.push(enemy);
    }
    return pool[index];
  }
  spawnOccupants(player,encounters){
    return [{x:player.position.x,z:player.position.z,radius:.8},...encounters.filter(b=>b.active&&b.brain?.hp>0).map(b=>({x:b.actor.position.x,z:b.actor.position.z,radius:b.radius}))];
  }
  canReuseAnimator(enemy){return Boolean(enemy.animator&&(typeof enemy.animator.resetForReuse==='function'||typeof enemy.animator.reset==='function'));}
  summon(player,value=1,kind='bear'){
    if(this.loading)return Promise.resolve(false);
    const pending=this.summonGroup(player,value,kind);this.summonPending=pending;
    const finished=()=>{if(this.summonPending===pending)this.summonPending=null;};pending.then(finished,finished);return pending;
  }
  async summonGroup(player, value = 1, kind='bear') {
    if (this.loading) return false;
    if(!['bear','goblin','wolf','elena','mourning-elena'].includes(kind))throw new RangeError('Unknown summon kind: '+kind);
    const phase=kind==='mourning-elena'?2:kind==='elena'?1:null;
    const matches=b=>phase?b.kind==='elena'&&b.phase===phase:b.kind===kind;
    const others=this.encounters.filter(b=>!matches(b));
    const request = ++this.revision, count = normalizeBossCount(value);
    const models=phase===2?this.mourningModels:phase===1?this.elenaModels:kind==='wolf'?this.wolfModels:kind==='goblin'?this.goblinModels:this.models,pool=phase===2?this.mourningPool:phase===1?this.elenaPool:kind==='wolf'?this.wolfPool:kind==='goblin'?this.goblinPool:this.pool,radius=phase===2?MOURNING_SIZE.radius:phase===1?ELENA_SIZE.radius:kind==='wolf'?WOLF_BALANCE.radius:kind==='goblin'?.34:.7;
    const scene=this.world.scene,map=this.world.mapId;
    const preparation=createBossPreparation({...this.preparationOptions,incremental:true,isCurrent:()=>request===this.revision&&this.world.scene===scene&&this.world.mapId===map&&!scene?.isDisposed});
    const started=performance.now(),timings={kind,count,map,mode:pool.slice(0,count).length===count&&pool.slice(0,count).every(e=>e.assetPrepared)?'reuse':models.container?'cached-model':'cold',status:'preparing',loadMs:0,placementMs:0,prepareMs:0,activationMs:0};this.lastSummon=timings;
    this.summonPreparation=preparation;
    this.loading = true; this.onChange(this);
    this.currentPlayer=player;
    try {
      let mark=performance.now();
      await preparation.wait(models.load());
      timings.loadMs=performance.now()-mark;
      if (request !== this.revision) return false;
      for(const old of pool)old.hide();
      if(phase)for(const old of others)if(old.kind==='elena')this.manualElena(old);
      if(!others.some(b=>b.brain.hp>0))this.combat.reset();
      mark=performance.now();
      const plan=async(origin=null)=>{
        const positions=origin?Array.from({length:count},()=>new Vector3(origin.x,0,origin.z)):bossSpawnPositions(player,count,{radius,separationRadius:phase===2?MOURNING_SIZE.separationRadius:phase===1?ELENA_SIZE.separationRadius:kind==='wolf'?WOLF_BALANCE.separationRadius:kind==='goblin'?.42:.8});
        const occupied=this.spawnOccupants(player,others),placements=[];
        for(let index=0;index<count;index++){
          const enemy=this.manualEncounter(kind,index),position=positions[index],navigation=enemy.movementNavigation??this.world.navigation;
          if(navigation){await preparation.pause();const safe=await (enemy.findSummonPosition?enemy.findSummonPosition(position,radius,ENEMY_ARENA_RADIUS,occupied,preparation):navigation.findFree(position,radius,ENEMY_ARENA_RADIUS,occupied,preparation));preparation.check();position.x=safe.x;position.z=safe.z;}
          placements.push([...occupied]);occupied.push({x:position.x,z:position.z,radius});
        }
        return {positions,placements};
      };
      let planned;
      try{planned=await plan();timings.placementAttempts=1;}
      catch(error){
        preparation.check();
        const packingOrigin=phase===2&&this.world.cave?pool[0]?.movementNavigation?.spawnPackingOrigin?.():null;
        if(!packingOrigin)throw error;
        // Nearest-to-player greedy slots can fragment a small room. Retry the
        // complete hidden plan once in a stable boundary order, keeping the
        // same certified cells, actor radii and occupied-player clearance.
        planned=await plan(packingOrigin);timings.placementAttempts=2;
      }
      const {positions,placements}=planned;
      timings.placementMs=performance.now()-mark;mark=performance.now();
      for (let index = 0; index < count; index++) {
        const boss = pool[index];
        if(phase)this.manualElena(boss,{reset:true});
        if(!boss.assetPrepared)await preparation.pause();
        await boss.prepareHidden({preparation});
      }
      timings.prepareMs=performance.now()-mark;mark=performance.now();
      // Keep every requested actor hidden through all frame-yielding work. Once
      // the whole group is ready, summon only joins already-completed promises,
      // so activation and encounter publication finish in the same task.
      for (let index = 0; index < count; index++) {
        const boss = pool[index], position = positions[index];
        await boss.summon(player, { position, rotationY: Math.atan2(player.position.x - position.x, player.position.z - position.z),occupied:placements[index],preparation,reuseAnimator:this.canReuseAnimator(boss),activate:false });
        this.applyAttackSettings(boss);
        if (request !== this.revision) { boss.hide(); return false; }
        boss.brain.wait += index * .17;
        boss.lastReportedHit = null;
        await preparation.pause();
      }
      preparation.check();
      for(const boss of pool.slice(0,count)){boss.active=true;boss.actor.setEnabled(true);boss.ring.setEnabled(true);boss.setShadowCasting?.(true);}
      this.encounters = [...others,...pool.slice(0,count)];
      this.active = true; this.lastHit = null; this.actionVersion++;
      timings.activationMs=performance.now()-mark;timings.status='ready';
      return true;
    } catch (error) {timings.status=error.name==='AbortError'?'cancelled':'error';timings.error=String(error.message??error);if(request===this.revision){for(const enemy of pool)enemy.hide();this.encounters=others;this.active=others.some(e=>e.active);}if(error.name==='AbortError')return false;throw error; }
    finally {timings.totalMs=performance.now()-started;timings.preparation={yields:preparation.stats.yields,blocks:preparation.stats.blocks,placementBlocks:preparation.stats.placementBlocks??0,maxSliceMs:preparation.stats.maxSliceMs,frameWaitMs:preparation.stats.frameWaitMs??null,coalescedPauses:preparation.stats.coalescedPauses??null,stepCount:preparation.stats.steps.length,steps:preparation.stats.steps.slice(0,512).map(s=>({...s}))};if(this.summonPreparation===preparation)this.summonPreparation=null;this.loading = false; this.onChange(this); }
  }
  hide() {
    this.developmentLifecycle?.();
    this.residentRevision++;
    this.residentPendingPreparation?.cancel();this.mourningWarmJob?.preparation.cancel();
    this.summonPreparation?.cancel();
    this.manualTransformPreparation?.cancel();
    this.blockedManualTransforms?.clear();
    this.mourningWarmRequested=false;
    this.revision++; this.active = false; this.updating = true;
    for (const boss of this.allPooled) boss.hide();
    this.encounters = []; this.potions.cancel(); this.playerReaction.reset();this.combat.v02Impact?.reset();
    this.updating = false; this.lastHit = null; this.onChange(this);
  }
  resetBattle() { this.hide(); this.combat.reset(); this.onChange(this); }
  nearestTarget(position) {
    let target = null, nearest = Infinity;
    for (const boss of this.encounters) {
      if (!boss.active || boss.brain.hp <= 0 || (boss.kind==='elena'&&!boss.engaged)) continue;
      const distance = Vector3.DistanceSquared(position, boss.actor.position);
      if (distance < nearest) { nearest = distance; target = boss; }
    }
    return target;
  }
  update(dt, player) {
    if (!this.active) return;
    this.currentPlayer=player;
    this.resumeManualTransforms();
    this.combat.update(dt, player, this.onDamage);
    this.updating = true;
    const updateToken=this.motionToken,generation=++updateToken.generation;
    for (const boss of this.encounters){boss._battleUpdateToken=updateToken;try{boss.update(dt, player);}finally{boss._battleUpdateToken=null;}}
    if(this.world.prefetchResources&&this.encounters.some(b=>b.kind==='elena'&&b.phase===1&&b.engaged))this.preloadMourning({modelsOnly:this.encounters.some(b=>b.kind==='elena'&&b.manualSummon)});
    const running=this.frameEncounters;running.length=0;
    for(const boss of this.encounters)if(boss.active&&!boss.corpseGone){(boss.separationFrom??=new Vector3()).copyFrom(boss.actor.position);running.push(boss);}
    if(running.length>1)separateBosses(running, this.combat.grabOwner);
    for(const boss of running){
      const position=boss.actor.position,navigation=boss.movementNavigation??this.world.navigation,terrain=this.world.terrain,proof=boss._reconciledMotion;
      // The normal map navigator and height field are deterministic for an
      // unchanged pose. Unknown implementations, stale tokens, subclass
      // movement and separation all keep the original second reconciliation.
      const unchanged=proof?.token===updateToken&&proof.generation===generation&&proof.actor===boss.actor&&proof.scene===this.world.scene&&proof.mapId===this.world.mapId&&proof.navigation===navigation&&proof.obstacles===navigation?.obstacles&&proof.cells===navigation?.cells&&proof.terrain===terrain&&proof.heights===terrain?.heights&&proof.size===terrain?.size&&proof.subdivisions===terrain?.subdivisions&&proof.radius===boss.radius&&position.x===proof.x&&position.y===proof.y&&position.z===proof.z&&position.x===boss.separationFrom.x&&position.y===boss.separationFrom.y&&position.z===boss.separationFrom.z&&stableMapCollision(navigation,terrain);
      if(!unchanged){navigation?.constrain(position,boss.separationFrom,boss.radius,ENEMY_ARENA_RADIUS);terrain?.place(position);}
      boss.warningRing.update(position,boss.attackRange(boss.motionSpec(boss.brain.state)));
      if(proof){proof.token=proof.actor=proof.scene=proof.navigation=proof.obstacles=proof.cells=proof.terrain=proof.heights=null;}
    }
    this.updating = false; this.onChange(this);
  }
  poseAndContacts(player, result, sample, shield) {
    if (!this.active) return 0;
    let hitStop = 0;
    const version = this.actionVersion;
    for (const boss of this.encounters) {
      if(!boss.active||boss.corpseGone)continue;
      const canceled = version !== this.actionVersion || this.grab.active;
      // A mauling owner needs the real frozen knockdown pose for its own bite
      // contact. Captured input never supplies a player weapon sample.
      const maulOwner=boss===this.combat.grabOwner&&boss.grab.maulHolding;
      hitStop = Math.max(hitStop, boss.poseAndContacts(player, canceled&&!maulOwner ? { state: 'idle', actionId: null } : result, canceled ? null : sample, shield) || 0);
    }
    return hitStop;
  }
  inspect() {
    return { active: this.active, loading: this.loading, count: this.encounters.length, living: this.livingCount,
      playerHp: this.playerHp, potions: this.potions.remaining, capturedBy: this.combat.grabOwner?.id ?? null,
      pooledModels: this.allPooled.length, modelLoads: this.models.loads,wolfModelLoads:this.wolfModels.loads,wolfCount:this.encounters.filter(b=>b.kind==='wolf').length, goblinModelLoads:this.goblinModels.loads,elenaModelLoads:this.elenaModels.loads,mourningModelLoads:this.mourningModels.loads,residentPhase:this.residentPhase,residentError:this.residentError??null,
      summonLimitPerKind:MAX_BOSSES,lastSummon:this.lastSummon??null,elenaCount:this.encounters.filter(b=>b.kind==='elena'&&b.phase===1).length,mourningCount:this.encounters.filter(b=>b.kind==='elena'&&b.phase===2).length,
      bearCount:this.encounters.filter(b=>b.kind==='bear').length,goblinCount:this.encounters.filter(b=>b.kind==='goblin').length,bosses: this.encounters.map(boss => boss.inspect()) };
  }
}
