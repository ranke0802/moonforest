import {encounterInCombat} from '../combat-readability.js';

const KEY = 'moonforest:combat-trail:0.3:v1';
const MAX_EVENTS = 16, MAX_OPPONENTS = 6, WRITE_MS = 2000;

function read(store) {
  try {
    const record = JSON.parse(store?.getItem(KEY) || 'null');
    return record?.version === 1 && Array.isArray(record.events) ? record : null;
  } catch { return null; }
}

function actorInfo(foe) {
  const kind = foe.summonKind ?? foe.regularWolfId ?? foe.actorDefinitionId ?? foe.kind;
  return {
    kind, id: foe.actorId ?? foe.id ?? null,
    name: foe.displayName ?? (kind === 'bear' ? '수호 곰' : kind),
    mode: foe.brain?.mode ?? null, motion: foe.brain?.state ?? null,
    hp: foe.brain?.hp ?? null, phase: foe.phase ?? null,
  };
}

// Keep the last real fight across a kill, a manual close and intermediate title
// documents. Reads do not consume the evidence. Only scalar snapshots are retained.
export function createCombatTrail({local, session, now = Date.now, build = () => []}) {
  const previous = read(session) ?? read(local);
  const startedAt = now();
  let record = null, dirty = false, lastWrite = -Infinity, nextSample = 0;
  let signature = '', engaged = false, lastCritical = -Infinity, lastSampleAt = -Infinity, lastDefeatAt = -Infinity, pendingDefeat = null;
  function flush() {
    if (!dirty) return;
    const json = JSON.stringify(record);
    for (const store of [local, session]) {
      try { store?.setItem(KEY, json); } catch { /* Storage may be disabled or full. */ }
    }
    dirty = false;
    lastWrite = now();
  }
  function append(map, event, foe, playerHp, detail = null, critical = false) {
    const at = now();
    if (!record) record = {version: 1, startedAt, build: build(), events: []};
    if (record.events.length >= MAX_EVENTS) record.events.shift();
    record.events.push({at, map, event, playerHp, ...(foe ? {opponent: actorInfo(foe)} : {}), ...(detail ? {detail} : {})});
    dirty = true;
    // First contact is durable immediately. Collapse simultaneous kills from a
    // crowd into the next checkpoint. A graphics loss/frame exception flushes below.
    if (critical && at - lastCritical >= 250) {
      lastCritical = at;
      flush();
    } else if (at - lastWrite >= WRITE_MS) flush();
  }
  return {
    previous,
    get current() { return record ? {...record, events: record.events.slice()} : null; },
    flush,
    sample(dt, map, foes, playerHp) {
      nextSample -= dt;
      if (nextSample > 0) return;
      nextSample = 0.75;
      let count = 0, opponents;
      for (const foe of foes) {
        if (!foe.active || !foe.brain || foe.brain.hp <= 0 || foe.category === 'npc' || foe.type === 'npc' || !encounterInCombat(foe)) continue;
        if (++count <= MAX_OPPONENTS) (opponents ??= []).push(actorInfo(foe));
      }
      if (count) {
        const next = JSON.stringify([map, count, opponents, playerHp]);
        if (next !== signature || now() - lastSampleAt >= 10000) {
          append(map, engaged ? 'combat-state' : 'combat-start', null, playerHp, {count, opponents});
          signature = next;
          lastSampleAt = now();
        }
      } else if (engaged) {
        append(map, 'combat-ended', null, playerHp);
        signature = '';
      }
      engaged = count > 0;
      if (dirty && now() - lastWrite >= WRITE_MS) flush();
    },
    // detail (main.js, frame diagnostics on only): the damage and the worn blade after the hit.
    hit(map, kind, foe, playerHp, detail = null) {
      if (!foe?.kind && !foe?.summonKind) return;
      append(map, kind === 'enemy' ? 'hit-enemy' : kind === 'player' ? 'hit-player' : kind,
        foe, playerHp, detail, foe.brain?.hp <= 0 || playerHp <= 0);
    },
    defeat(map, foe, playerHp, completed = false) {
      const id = foe.id ?? foe.kind;
      if (!completed && now() - lastDefeatAt >= 500) {
        lastDefeatAt = now();
        pendingDefeat = id;
      }
      append(map, completed ? 'defeat-handler-return' : 'defeat-handler-enter', foe, playerHp);
      if (pendingDefeat === id) flush();
      if (completed && pendingDefeat === id) pendingDefeat = null;
    },
    fault(map, event, playerHp, message) {
      if (!record) return;
      append(map, event, null, playerHp, message ? String(message).slice(0, 160) : null);
      flush();
    },
  };
}
