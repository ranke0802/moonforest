import { Vector3 } from '@babylonjs/core';
import { BossEncounter } from './boss-encounter.js';
import { BossModelLibrary } from './boss-models.js';
import { PlayerCombat } from './player-combat.js';
import { GoblinEncounter } from './goblin-encounter.js';
import { ElenaEncounter } from './elena-encounter.js';
import { MourningElenaEncounter } from './mourning-elena-encounter.js';
import { ELENA_HOME, MOURNING_SIZE } from './elena-spec.js';
import { isEnemySolid } from './enemy-collision.js';
import { ENEMY_ARENA_RADIUS } from './world-limits.js';

export const MAX_BOSSES = 5;
export function normalizeBossCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(1, Math.min(MAX_BOSSES, Math.floor(count))) : 1;
}
export function bossSpawnPositions(player, value) {
  const count = normalizeBossCount(value), center = player.position.clone();
  center.y = 0;
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
  constructor(world, onChange, onDamage = () => {}, onPlayerHit = () => {}, { models, goblinModels, elenaModels, mourningModels, onDefeat=()=>{},onDiagnosticEvent=()=>{} } = {}) {
    this.world = world; this.onChange = onChange; this.onDamage = onDamage; this.onPlayerHit = onPlayerHit;
    this.onDefeat=onDefeat;this.onDiagnosticEvent=onDiagnosticEvent;
    this.models = models ?? new BossModelLibrary(world.scene);
    this.goblinModels=goblinModels??new BossModelLibrary(world.scene,'hooded-goblin');this.goblinPool=[];
    this.elenaModels=elenaModels??new BossModelLibrary(world.scene,'elena');this.elenaPool=[];this.residentRevision=0;
    this.mourningModels=mourningModels??new BossModelLibrary(world.scene,'mourning-elena');this.mourningPool=[];this.residentPhase=1;this.residentHome=ELENA_HOME;
    this.combat = new PlayerCombat(); this.pool = []; this.encounters = [];this.frameEncounters=[];
    this.active = false; this.loading = false; this.revision = 0; this.actionVersion = 0;
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
  get allPooled(){return [...this.pool,...this.goblinPool,...this.elenaPool,...this.mourningPool];}
  setAttackSettings(value){this.attackSettings=value;for(const enemy of this.allPooled)this.applyAttackSettings(enemy);}
  applyAttackSettings(enemy){const kind=enemy.kind==='elena'?(enemy.phase===2?'mourning-elena':'elena'):enemy.kind;enemy.brain?.configureAttacks?.(this.attackSettings?.[kind]??{});}
  async activateResident(player,{reset=false,phase:resetPhase=1,home=ELENA_HOME}={}){
    if(!this.world.cave)return false;
    if(reset){this.residentPhase=resetPhase===2?2:1;this.residentHome={x:home.x,z:home.z};this.residentError=null;this.mourningNeedsReset=true;}
    if(this.residentPending){
      const revision=this.residentPendingRevision,phase=this.residentPendingPhase,result=await this.residentPending;
      return revision===this.residentRevision&&phase===this.residentPhase?result:this.activateResident(player,{reset,phase:resetPhase,home});
    }
    const request=this.residentRevision,phase=this.residentPhase,models=phase===2?this.mourningModels:this.elenaModels,pool=phase===2?this.mourningPool:this.elenaPool;
    this.residentPendingRevision=request;
    this.residentPendingPhase=phase;
    const pending=(async()=>{
      let completed=false;
      this.onDiagnosticEvent({type:'begin',label:phase===2?'비탄의 마녀':'타락한 성녀',trigger:reset?'선택 소환':'거처/변신',mode:pool[0]?.asset?'reuse':models.container?'cached-model':'cold'});
      try{
      await models.load();
      this.onDiagnosticEvent({type:'stage',stage:'model'});
      if(request!==this.residentRevision||!this.world.cave)return false;
      let resident=pool[0];
      if(!resident){
        const Encounter=phase===2?MourningElenaEncounter:ElenaEncounter;
        resident=new Encounter(this.world,b=>this.bossChanged(b),this.onDamage,(...args)=>this.playerHit(...args),{combat:this.combat,loadAsset:()=>models.instantiate(),onDefeat:this.onDefeat,onPreparationStage:stage=>this.onDiagnosticEvent({type:'stage',stage})});
        resident.id=phase===2?'mourning-elena':'elena';resident.number=1;pool.push(resident);
        if(phase===1)resident.onTransform=()=>this.transformResident(this.currentPlayer??player);
      }
      if(!resident.asset||reset||(phase===2&&this.mourningNeedsReset)){
        const position=new Vector3(this.residentHome.x,0,this.residentHome.z);
        await resident.summon(player,{position,rotationY:0});
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
      this.active=true;this.onChange(this);completed=true;this.onDiagnosticEvent({type:'ready'});return true;
      }catch(error){completed=true;this.onDiagnosticEvent({type:'error',error:String(error.message??error).slice(0,160)});throw error;}
      finally{if(!completed)this.onDiagnosticEvent({type:'cancel',reason:'지역/요청 변경'});}
    })();
    this.residentPending=pending;
    try{return await pending;}finally{if(this.residentPending===pending)this.residentPending=null;}
  }
  transformResident(player){
    if(this.residentPhase===2||!this.world.cave)return this.residentPending;
    this.residentPhase=2;this.lastHit='타락한 성녀가 비탄의 마녀로 변합니다';this.onChange(this);
    return this.activateResident(player).catch(error=>{this.residentError=String(error.message??error);this.lastHit='광폭화 모델을 불러오지 못했습니다. 연결을 확인해 주세요.';this.onChange(this);console.error('[Elena transformation]',error);return false;});
  }
  preloadMourning(){
    if(this.mourningWarmRequested)return;this.mourningWarmRequested=true;
    this.onDiagnosticEvent({type:'prefetch-start',label:'광폭화 모델'});
    this.mourningModels.load().then(()=>this.onDiagnosticEvent({type:'prefetch-end',label:'광폭화 모델'})).catch(error=>{this.residentError=String(error.message??error);this.onDiagnosticEvent({type:'prefetch-end',label:'광폭화 모델',error:this.residentError});console.warn('[Elena preload]',error);});
  }
  async summonResident(player,phase=1){
    if(this.loading||this.residentPending||!this.world.cave)return false;
    this.loading=true;this.onChange(this);
    try{
      const radius=phase===2?MOURNING_SIZE.radius:.34,position=bossSpawnPositions(player,1)[0];
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
  async summon(player, value = 1, kind='bear') {
    if (this.loading) return false;
    const others=this.encounters.filter(b=>b.kind!==kind);
    const request = ++this.revision, count = normalizeBossCount(value);
    const models=kind==='goblin'?this.goblinModels:this.models,pool=kind==='goblin'?this.goblinPool:this.pool,Encounter=kind==='goblin'?GoblinEncounter:BossEncounter,radius=kind==='goblin'?.34:.7;
    this.loading = true; this.onChange(this);
    try {
      await models.load();
      if (request !== this.revision) return false;
      for(const old of pool)old.hide();
      if(!others.some(b=>b.brain.hp>0))this.combat.reset();
      const positions = bossSpawnPositions(player, count);
      const occupied=[{x:player.position.x,z:player.position.z,radius:.8},...others.filter(b=>b.brain.hp>0).map(b=>({x:b.actor.position.x,z:b.actor.position.z,radius:b.radius}))];
      if(this.world.navigation)for(const position of positions){this.world.navigation.constrain(position,null,radius,ENEMY_ARENA_RADIUS);const safe=this.world.navigation.findFree(position,radius,ENEMY_ARENA_RADIUS,occupied);position.x=safe.x;position.z=safe.z;occupied.push({...safe,radius});}
      for (let index = 0; index < count; index++) {
        if (!pool[index]) {
          const boss = new Encounter(this.world, boss => this.bossChanged(boss), this.onDamage,
            (duration, options) => this.playerHit(duration, options), { combat: this.combat, loadAsset: () => models.instantiate(), onDefeat:this.onDefeat });
          boss.number=index+1;boss.id=kind==='goblin'?`g${index+1}`:index+1;pool.push(boss);
        }
        const boss = pool[index], position = positions[index];
        await boss.summon(player, { position, rotationY: Math.atan2(player.position.x - position.x, player.position.z - position.z) });
        this.applyAttackSettings(boss);
        if (request !== this.revision) { boss.hide(); return false; }
        boss.brain.wait += index * .17;
        boss.lastReportedHit = null;
      }
      this.encounters = [...others,...pool.slice(0,count)];
      this.active = true; this.lastHit = null; this.actionVersion++;
      return true;
    } catch (error) { this.hide(); throw error; }
    finally { this.loading = false; this.onChange(this); }
  }
  hide() {
    this.residentRevision++;
    this.revision++; this.active = false; this.updating = true;
    for (const boss of this.allPooled) boss.hide();
    this.encounters = []; this.potions.cancel(); this.playerReaction.reset();
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
    this.combat.update(dt, player, this.onDamage);
    this.updating = true;
    for (const boss of this.encounters) boss.update(dt, player);
    if(this.world.prefetchResources&&this.residentPhase===1&&this.encounters.some(b=>b.kind==='elena'&&b.engaged))this.preloadMourning();
    const running=this.frameEncounters;running.length=0;
    for(const boss of this.encounters)if(boss.active&&!boss.corpseGone){(boss.separationFrom??=new Vector3()).copyFrom(boss.actor.position);running.push(boss);}
    if(running.length>1)separateBosses(running, this.combat.grabOwner);
    for(const boss of running){(boss.movementNavigation??this.world.navigation)?.constrain(boss.actor.position,boss.separationFrom,boss.radius,ENEMY_ARENA_RADIUS);this.world.terrain?.place(boss.actor.position);boss.warningRing.update(boss.actor.position,boss.attackRange(boss.motionSpec(boss.brain.state)));}
    this.updating = false; this.onChange(this);
  }
  poseAndContacts(player, result, sample, shield) {
    if (!this.active) return 0;
    let hitStop = 0;
    const version = this.actionVersion;
    for (const boss of this.encounters) {
      if(!boss.active||boss.corpseGone)continue;
      const canceled = version !== this.actionVersion || this.grab.active;
      hitStop = Math.max(hitStop, boss.poseAndContacts(player, canceled ? { state: 'idle', actionId: null } : result, canceled ? null : sample, shield) || 0);
    }
    return hitStop;
  }
  inspect() {
    return { active: this.active, loading: this.loading, count: this.encounters.length, living: this.livingCount,
      playerHp: this.playerHp, potions: this.potions.remaining, capturedBy: this.combat.grabOwner?.id ?? null,
      pooledModels: this.allPooled.length, modelLoads: this.models.loads, goblinModelLoads:this.goblinModels.loads,elenaModelLoads:this.elenaModels.loads,mourningModelLoads:this.mourningModels.loads,residentPhase:this.residentPhase,residentError:this.residentError??null,
      bearCount:this.encounters.filter(b=>b.kind==='bear').length,goblinCount:this.encounters.filter(b=>b.kind==='goblin').length,bosses: this.encounters.map(boss => boss.inspect()) };
  }
}
