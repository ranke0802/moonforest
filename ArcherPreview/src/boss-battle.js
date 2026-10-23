import { Vector3 } from '@babylonjs/core';
import { BossEncounter } from './boss-encounter.js';
import { BossModelLibrary } from './boss-models.js';
import { PlayerCombat } from './player-combat.js';

export const MAX_BOSSES = 5;
export function normalizeBossCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(1, Math.min(MAX_BOSSES, Math.floor(count))) : 1;
}
export function bossSpawnPositions(player, value) {
  const count = normalizeBossCount(value), center = player.position.clone();
  center.y = 0;
  const limit = count === 1 ? 6.5 : 2.3, distance = Math.hypot(center.x, center.z);
  if (distance > limit) { center.x *= limit / distance; center.z *= limit / distance; }
  return Array.from({ length: count }, (_, index) => {
    const yaw = player.rotation.y + (count === 1 ? 0 : -1.1 + 2.2 * index / (count - 1));
    const position = center.add(new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).scale(count === 1 ? 2.8 : 4));
    const radius = Math.hypot(position.x, position.z);
    if (radius > 6.5) { position.x *= 6.5 / radius; position.z *= 6.5 / radius; }
    return position;
  });
}

export function separateBosses(encounters, grabOwner) {
  const movable = boss => boss !== grabOwner && !['down', 'recover'].includes(boss.brain.mode);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < encounters.length; i++) for (let j = i + 1; j < encounters.length; j++) {
    const a = encounters[i], b = encounters[j];
    if (a.brain.hp <= 0 || b.brain.hp <= 0) continue;
    const aMoves = movable(a), bMoves = movable(b), weight = Number(aMoves) + Number(bMoves);
    if (!weight) continue;
    const dx = b.actor.position.x - a.actor.position.x, dz = b.actor.position.z - a.actor.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= 1.6) continue;
    const x = distance > .0001 ? dx / distance : 1, z = distance > .0001 ? dz / distance : 0;
    const push = (1.6 - distance) / weight;
    if (aMoves) { a.actor.position.x -= x * push; a.actor.position.z -= z * push; }
    if (bMoves) { b.actor.position.x += x * push; b.actor.position.z += z * push; }
  }
}

export class BossBattle {
  constructor(world, onChange, onDamage = () => {}, onPlayerHit = () => {}, { models } = {}) {
    this.world = world; this.onChange = onChange; this.onDamage = onDamage; this.onPlayerHit = onPlayerHit;
    this.models = models ?? new BossModelLibrary(world.scene);
    this.combat = new PlayerCombat(); this.pool = []; this.encounters = [];
    this.active = false; this.loading = false; this.revision = 0; this.actionVersion = 0;
    this.noGrab = { active: false, label: '' };
  }
  get playerHp() { return this.combat.hp; }
  get playerMaxHp() { return this.combat.maxHp; }
  get playerAlive() { return !this.active || this.playerHp > 0; }
  get playerReaction() { return this.combat.reaction; }
  get potions() { return this.combat.potions; }
  get grab() { return this.combat.grabOwner?.grab ?? this.noGrab; }
  get playerNodes() { return this.combat.nodes; }
  set playerNodes(nodes) { this.combat.nodes = nodes; }
  get livingCount() { return this.encounters.filter(boss => boss.brain.hp > 0).length; }
  get canUsePotion() { return this.active && !this.loading && !this.grab.active && this.potions.canUse(this.playerHp, this.playerMaxHp); }
  usePotion() {
    if (!this.canUsePotion) return false;
    this.potions.use(this.playerHp, this.playerMaxHp);
    this.lastHit = '물약 사용 · 1초마다 40씩 4회 회복'; this.onChange(this); return true;
  }
  bossChanged(boss) {
    if (boss.lastHit && boss.lastHit !== boss.lastReportedHit) {
      boss.lastReportedHit = boss.lastHit;
      this.lastHit = this.encounters.length > 1 ? `곰 ${boss.id} · ${boss.lastHit}` : boss.lastHit;
    }
    if (!this.updating && !this.loading) this.onChange(this);
  }
  playerHit(duration, options) {
    const reacted = this.onPlayerHit(duration, options);
    if (reacted !== false) {
      this.actionVersion++;
      for (const boss of this.pool) boss.gate.reset();
    }
    return reacted;
  }
  async summon(player, value = 1) {
    if (this.loading) return false;
    this.hide();
    const request = ++this.revision, count = normalizeBossCount(value);
    this.loading = true; this.onChange(this);
    try {
      await this.models.load();
      if (request !== this.revision) return false;
      this.combat.reset();
      const positions = bossSpawnPositions(player, count);
      const occupied=[{x:player.position.x,z:player.position.z,radius:.8}];
      if(this.world.navigation)for(const position of positions){this.world.navigation.constrain(position,null,.7,6.5);const safe=this.world.navigation.findFree(position,.7,6.5,occupied);position.x=safe.x;position.z=safe.z;occupied.push({...safe,radius:.7});}
      for (let index = 0; index < count; index++) {
        if (!this.pool[index]) {
          const boss = new BossEncounter(this.world, boss => this.bossChanged(boss), this.onDamage,
            (duration, options) => this.playerHit(duration, options), { combat: this.combat, loadAsset: () => this.models.instantiate() });
          boss.id = index + 1; this.pool.push(boss);
        }
        const boss = this.pool[index], position = positions[index];
        await boss.summon(player, { position, rotationY: Math.atan2(player.position.x - position.x, player.position.z - position.z) });
        if (request !== this.revision) { boss.hide(); return false; }
        boss.brain.wait += index * .17;
        boss.lastReportedHit = null;
      }
      this.encounters = this.pool.slice(0, count);
      this.active = true; this.lastHit = null; this.actionVersion++;
      return true;
    } catch (error) { this.hide(); throw error; }
    finally { this.loading = false; this.onChange(this); }
  }
  hide() {
    this.revision++; this.active = false; this.updating = true;
    for (const boss of this.pool) boss.hide();
    this.encounters = []; this.potions.cancel(); this.playerReaction.reset();
    this.updating = false; this.lastHit = null; this.onChange(this);
  }
  resetBattle() { this.hide(); this.combat.reset(); this.onChange(this); }
  nearestTarget(position) {
    let target = null, nearest = Infinity;
    for (const boss of this.encounters) {
      if (!boss.active || boss.brain.hp <= 0) continue;
      const distance = Vector3.DistanceSquared(position, boss.actor.position);
      if (distance < nearest) { nearest = distance; target = boss; }
    }
    return target;
  }
  update(dt, player) {
    if (!this.active) return;
    this.combat.update(dt, player, this.onDamage);
    this.updating = true;
    for (const boss of this.encounters) boss.update(dt, player);
    const beforeSeparation=this.encounters.map(boss=>boss.actor.position.clone());
    separateBosses(this.encounters, this.combat.grabOwner);
    this.encounters.forEach((boss,i)=>this.world.navigation?.constrain(boss.actor.position,beforeSeparation[i],.7,10.5));
    for (const boss of this.encounters) boss.ring.position.set(boss.actor.position.x, .025, boss.actor.position.z);
    this.updating = false; this.onChange(this);
  }
  poseAndContacts(player, result, sample, shield) {
    if (!this.active) return 0;
    let hitStop = 0;
    const version = this.actionVersion;
    for (const boss of this.encounters) {
      const canceled = version !== this.actionVersion || this.grab.active;
      hitStop = Math.max(hitStop, boss.poseAndContacts(player, canceled ? { state: 'idle', actionId: null } : result, canceled ? null : sample, shield) || 0);
    }
    return hitStop;
  }
  inspect() {
    return { active: this.active, loading: this.loading, count: this.encounters.length, living: this.livingCount,
      playerHp: this.playerHp, potions: this.potions.remaining, capturedBy: this.combat.grabOwner?.id ?? null,
      pooledModels: this.pool.length, modelLoads: this.models.loads, bosses: this.encounters.map(boss => boss.inspect()) };
  }
}
