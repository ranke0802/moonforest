import test from 'node:test';import assert from 'node:assert/strict';
import {emptyMonsterSpawns,validateMonsterSpawns,mergeMonsterSpawnDefaults} from '../src/monster-spawn-document.js';
import {createPlainsMonsterSpawns,PLAINS_MONSTER_SPAWNS_REVISION,PLAINS_MONSTER_SPAWNS_R1,PLAINS_MONSTER_SPAWNS_R1_REVISION,PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS_R2_REVISION,PLAINS_MONSTER_SPAWNS_R3,PLAINS_MONSTER_SPAWNS_R3_REVISION,PLAINS_MONSTER_SPAWNS_R4,PLAINS_MONSTER_SPAWNS_R4_REVISION} from '../src/plains-monster-spawns.js';
const row=(id,extra={})=>({id,definitionId:'hooded-goblin.standard',groupId:'pack',spawnMode:'start',respawn:true,rewardEnabled:true,x:1,z:2,yaw:0,delaySeconds:30,randomRadius:3,drop:{assetId:'',effectEnabled:false},...extra});
test('monster placement records round trip and grouped lifetime configuration stays consistent',()=>{const doc=emptyMonsterSpawns();doc.maps['great-plains']=[row('one'),row('two',{x:4})];assert.equal(validateMonsterSpawns(JSON.stringify(doc)).valid,true);doc.maps['great-plains'][1].respawn=false;assert.match(validateMonsterSpawns(doc).errors.join(),/같은 그룹/);});
test('invalid maps, duplicates, unsupported monsters and nonfinite placement values are rejected',()=>{const doc=emptyMonsterSpawns();doc.maps.village=[row('one'),row('one',{definitionId:'evil',x:Infinity})];assert.equal(validateMonsterSpawns(doc).valid,false);doc.maps={other:[]};assert.equal(validateMonsterSpawns(doc).valid,false);});
test('all approved plains quadruped definitions and finite contained territories round trip',()=>{
 const doc=createPlainsMonsterSpawns();assert.equal(validateMonsterSpawns(doc).valid,true);assert.equal(new Set(doc.maps['great-plains'].map(row=>row.groupId)).size,11);assert.equal(doc.maps['great-plains'].length,19);
 for(const area of [{x:0,z:0,radius:1},{x:6.6,z:-69,radius:8,returnRadius:9},{x:6.6,z:-69,radius:Infinity},{x:6.6,z:-69,radius:8,combatRadius:0},{x:6.6,z:-69,radius:8,combatRadius:9},{x:6.6,z:-69,radius:8,wanderRadius:-1}]){const bad=structuredClone(doc);bad.maps['great-plains'][0].territory=area;assert.equal(validateMonsterSpawns(bad).valid,false);}
});
test('default migration preserves custom values and aliases conflicting IDs/groups without mutating its input',()=>{
 const doc=emptyMonsterSpawns(),defaults=createPlainsMonsterSpawns(),first=defaults.maps['great-plains'][0];doc.maps['great-plains']=[row(first.id,{groupId:first.groupId,x:88,respawn:false})];const original=structuredClone(doc);
 const merged=mergeMonsterSpawnDefaults(doc,defaults,PLAINS_MONSTER_SPAWNS_REVISION);assert.equal(merged.addedRows,19);assert.equal(merged.aliasedRows,1);assert.deepEqual(doc,original);
 const rows=merged.document.maps['great-plains'];assert.deepEqual(rows.at(-1),original.maps['great-plains'][0]);assert.equal(rows.length,20);assert.notEqual(rows[0].id,first.id);assert.notEqual(rows[0].groupId,first.groupId);
 rows.splice(0,1);rows[0].x+=.1;const again=mergeMonsterSpawnDefaults(merged.document,defaults,PLAINS_MONSTER_SPAWNS_REVISION);assert.equal(again.changed,false);assert.deepEqual(again.document,merged.document);
});
test('only recognized historical14 or current19 IDs permit bounded migration storage capacity34 or39',()=>{
 const doc=emptyMonsterSpawns();doc.maps['great-plains']=Array.from({length:20},(_,i)=>row('custom-'+i,{groupId:'custom-'+i}));const merged=mergeMonsterSpawnDefaults(doc,createPlainsMonsterSpawns(),PLAINS_MONSTER_SPAWNS_REVISION).document;
 assert.equal(merged.maps['great-plains'].length,39);assert.equal(validateMonsterSpawns(merged).valid,true);assert.deepEqual(merged.maps['great-plains'].slice(19),doc.maps['great-plains']);
 for(const change of [value=>delete value.defaultRevisions,value=>value.defaultRevisions=['arbitrary'],value=>value.defaultRowIds['great-plains'][0]='arbitrary',value=>value.maps['great-plains'].push(row('extra'))]){const bad=structuredClone(merged);change(bad);assert.equal(validateMonsterSpawns(bad).valid,false);}
 const village=emptyMonsterSpawns();village.maps.village=Array.from({length:21},(_,i)=>row('v-'+i));village.defaultRevisions=[PLAINS_MONSTER_SPAWNS_REVISION];village.defaultRowIds=merged.defaultRowIds;assert.equal(validateMonsterSpawns(village).valid,false);
});
test('future default revisions add new IDs but do not restore deleted or overwrite edited previously installed defaults',()=>{
 const a=emptyMonsterSpawns(),seed=emptyMonsterSpawns();seed.maps.village=[row('first')];const one=mergeMonsterSpawnDefaults(a,seed,'small-r1').document;one.maps.village=[];
 seed.maps.village.push(row('second',{groupId:'second'}));const two=mergeMonsterSpawnDefaults(one,seed,'small-r2');assert.deepEqual(two.document.maps.village.map(row=>row.id),['second']);assert.deepEqual(two.document.defaultRowIds.village,['first','second']);
});
test('R1 to R2 upgrades only unchanged default territories/homes and preserves edits, deletions and custom rows',()=>{
 const installed=mergeMonsterSpawnDefaults(emptyMonsterSpawns(),PLAINS_MONSTER_SPAWNS_R1,PLAINS_MONSTER_SPAWNS_R1_REVISION).document,rows=installed.maps['great-plains'];
 rows[0].territory.radius+=.5;rows[1].x+=.1;rows[2].yaw=1.1;rows.splice(3,1);rows.push(row('custom',{groupId:'custom'}));const before=structuredClone(installed);
 const upgraded=mergeMonsterSpawnDefaults(installed,PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS_R2_REVISION),next=upgraded.document.maps['great-plains'];
 assert.equal(upgraded.upgradedRows,11);assert.equal(upgraded.addedRows,0);assert.equal(next.length,14);assert.deepEqual(installed,before);
 assert.deepEqual(next[0],before.maps['great-plains'][0]);assert.deepEqual(next[1],before.maps['great-plains'][1]);assert.equal(next[2].yaw,1.1);assert.equal(next[2].territory.radius,11);assert.deepEqual(next.at(-1),before.maps['great-plains'].at(-1));assert.ok(!next.some(row=>row.id==='plains-fox-east-2'));
 assert.deepEqual(upgraded.document.defaultRevisions,[PLAINS_MONSTER_SPAWNS_R1_REVISION,PLAINS_MONSTER_SPAWNS_R2_REVISION]);assert.equal(mergeMonsterSpawnDefaults(upgraded.document,PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS_R2_REVISION).changed,false);
});
test('R1 custom20 migration documents remain valid at34 and collision aliases upgrade without changing custom originals',()=>{
 const saved=emptyMonsterSpawns(),first=PLAINS_MONSTER_SPAWNS_R1.maps['great-plains'][0];saved.maps['great-plains']=Array.from({length:20},(_,i)=>row('c-'+i,{groupId:'c-'+i}));saved.maps['great-plains'][0]={...structuredClone(first),respawn:false};
 const r1=mergeMonsterSpawnDefaults(saved,PLAINS_MONSTER_SPAWNS_R1,PLAINS_MONSTER_SPAWNS_R1_REVISION).document;assert.equal(validateMonsterSpawns(r1).valid,true);assert.equal(r1.maps['great-plains'].length,34);
 const r2=mergeMonsterSpawnDefaults(r1,PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS_R2_REVISION);assert.equal(r2.upgradedRows,14);assert.equal(r2.document.maps['great-plains'].length,34);assert.equal(validateMonsterSpawns(r2.document).valid,true);assert.deepEqual(r2.document.maps['great-plains'].slice(14),saved.maps['great-plains']);
 const moved=structuredClone(r1);moved.maps['great-plains'][0].x+=.1;const kept=mergeMonsterSpawnDefaults(moved,PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS_R2_REVISION);assert.equal(kept.upgradedRows,13);assert.deepEqual(kept.document.maps['great-plains'][0],moved.maps['great-plains'][0]);assert.deepEqual(kept.document.maps['great-plains'].slice(14),saved.maps['great-plains']);
});
test('R2 to R3 moves only pristine wolf defaults while preserving custom home/area/deletions and remains idempotent',()=>{
 const r2=mergeMonsterSpawnDefaults(emptyMonsterSpawns(),PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS_R2_REVISION).document,rows=r2.maps['great-plains'];
 rows.find(row=>row.id==='plains-alpha-pack-2').x+=.1;rows.find(row=>row.id==='plains-alpha-pack-3').territory.radius+=.5;const removed=rows.findIndex(row=>row.id==='plains-wolf-meadow-1');rows.splice(removed,1);rows.push(row('custom-r3',{groupId:'custom-r3'}));const before=structuredClone(r2);
 const merged=mergeMonsterSpawnDefaults(r2,PLAINS_MONSTER_SPAWNS_R3,PLAINS_MONSTER_SPAWNS_R3_REVISION),next=merged.document.maps['great-plains'];assert.equal(merged.addedRows,0);assert.equal(merged.upgradedRows,4);assert.equal(next.length,14);assert.deepEqual(r2,before);
 for(const id of ['plains-alpha-pack-2','plains-alpha-pack-3','custom-r3'])assert.deepEqual(next.find(row=>row.id===id),before.maps['great-plains'].find(row=>row.id===id));assert.ok(!next.some(row=>row.id==='plains-wolf-meadow-1'));
 for(const id of ['plains-alpha-pack-1','plains-alpha-pack-4','plains-wolf-meadow-2','plains-wolf-meadow-3'])assert.deepEqual(next.find(row=>row.id===id),PLAINS_MONSTER_SPAWNS_R3.maps['great-plains'].find(row=>row.id===id));
 assert.equal(mergeMonsterSpawnDefaults(merged.document,PLAINS_MONSTER_SPAWNS_R3,PLAINS_MONSTER_SPAWNS_R3_REVISION).changed,false);
 const custom20=emptyMonsterSpawns();custom20.maps['great-plains']=Array.from({length:20},(_,i)=>row('extra-'+i,{groupId:'extra-'+i}));const full=mergeMonsterSpawnDefaults(custom20,PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS_R2_REVISION).document;assert.equal(validateMonsterSpawns(full).valid,true);assert.equal(mergeMonsterSpawnDefaults(full,PLAINS_MONSTER_SPAWNS_R3,PLAINS_MONSTER_SPAWNS_R3_REVISION).document.maps['great-plains'].length,34);
});
test('R4 adds five new actors, moves pristine west foxes only and preserves R3 edits/deletions and historical capacity',()=>{
 const custom=emptyMonsterSpawns();custom.maps['great-plains']=Array.from({length:20},(_,i)=>row('r4-custom-'+i,{groupId:'r4-custom-'+i}));const r3=mergeMonsterSpawnDefaults(custom,PLAINS_MONSTER_SPAWNS_R3,PLAINS_MONSTER_SPAWNS_R3_REVISION).document;
 assert.equal(r3.maps['great-plains'].length,34);assert.equal(validateMonsterSpawns(r3).valid,true);const pristine=mergeMonsterSpawnDefaults(r3,PLAINS_MONSTER_SPAWNS_R4,PLAINS_MONSTER_SPAWNS_R4_REVISION);assert.equal(pristine.addedRows,5);assert.equal(pristine.upgradedRows,2);assert.equal(pristine.document.maps['great-plains'].length,39);assert.equal(validateMonsterSpawns(pristine.document).valid,true);assert.deepEqual(pristine.document.maps['great-plains'].slice(19),custom.maps['great-plains']);
 const edited=structuredClone(r3);edited.maps['great-plains'][0].territory.radius+=.25;edited.maps['great-plains']=edited.maps['great-plains'].filter(row=>row.id!=='plains-fox-west-2');const before=structuredClone(edited),result=mergeMonsterSpawnDefaults(edited,PLAINS_MONSTER_SPAWNS_R4,PLAINS_MONSTER_SPAWNS_R4_REVISION);assert.equal(result.addedRows,5);assert.equal(result.upgradedRows,0);assert.deepEqual(result.document.maps['great-plains'].slice(5),before.maps['great-plains']);assert.equal(mergeMonsterSpawnDefaults(result.document,PLAINS_MONSTER_SPAWNS_R4,PLAINS_MONSTER_SPAWNS_R4_REVISION).changed,false);
});

test('R5 relocates the four-wolf pack, retires only pristine paired foxes and installs two lone wolves once',()=>{
 const custom=emptyMonsterSpawns();custom.maps['great-plains']=Array.from({length:20},(_,i)=>row('r5-custom-'+i,{groupId:'r5-custom-'+i}));
 const r4=mergeMonsterSpawnDefaults(custom,PLAINS_MONSTER_SPAWNS_R4,PLAINS_MONSTER_SPAWNS_R4_REVISION).document,before=structuredClone(r4),result=mergeMonsterSpawnDefaults(r4,createPlainsMonsterSpawns(),PLAINS_MONSTER_SPAWNS_REVISION),next=result.document;
 assert.deepEqual(r4,before);assert.equal(result.addedRows,2);assert.equal(result.removedRows,2);assert.equal(result.upgradedRows,6);assert.equal(next.maps['great-plains'].length,39);assert.equal(next.defaultRowIds['great-plains'].length,21);assert.equal(validateMonsterSpawns(next).valid,true);
 assert.deepEqual(next.maps['great-plains'].slice(19),custom.maps['great-plains']);
 for(const expected of createPlainsMonsterSpawns().maps['great-plains'])assert.deepEqual(next.maps['great-plains'].find(value=>value.id===expected.id),expected);
 assert.ok(!next.maps['great-plains'].some(value=>['plains-fox-west-2','plains-fox-east-2'].includes(value.id)));assert.equal(mergeMonsterSpawnDefaults(next,createPlainsMonsterSpawns(),PLAINS_MONSTER_SPAWNS_REVISION).changed,false);
});

test('R5 preserves edited former foxes, moved wolves, rewards, deleted defaults and conflicting custom aliases',()=>{
 const custom=emptyMonsterSpawns(),first=structuredClone(PLAINS_MONSTER_SPAWNS_R4.maps['great-plains'][0]);first.respawn=false;custom.maps['great-plains']=[first];
 const saved=mergeMonsterSpawnDefaults(custom,PLAINS_MONSTER_SPAWNS_R4,PLAINS_MONSTER_SPAWNS_R4_REVISION).document,rows=saved.maps['great-plains'];
 rows.find(value=>value.id==='plains-fox-west-2').x+=.1;rows.find(value=>value.id==='plains-stylized-wolf-pack-1').x+=.1;rows.find(value=>value.id==='plains-fox-east-1').drop.effectEnabled=true;rows.splice(rows.findIndex(value=>value.id==='plains-fox-east-2'),1);const before=structuredClone(saved);
 const result=mergeMonsterSpawnDefaults(saved,createPlainsMonsterSpawns(),PLAINS_MONSTER_SPAWNS_REVISION),next=result.document.maps['great-plains'];assert.equal(result.removedRows,0);
 for(const id of ['plains-fox-west-1','plains-fox-west-2','plains-stylized-wolf-pack-1','plains-fox-east-1'])assert.deepEqual(next.find(value=>value.id===id),before.maps['great-plains'].find(value=>value.id===id));
 assert.ok(!next.some(value=>value.id==='plains-fox-east-2'));assert.equal(next.find(value=>value.id.startsWith('plains-fox-west-1:default:')).x,-77);assert.equal(validateMonsterSpawns(result.document).valid,true);
});

test('R1 through R4 pristine save documents all migrate directly to the same R5 homes and composition',()=>{
 for(const [defaults,revision]of [[PLAINS_MONSTER_SPAWNS_R1,PLAINS_MONSTER_SPAWNS_R1_REVISION],[PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS_R2_REVISION],[PLAINS_MONSTER_SPAWNS_R3,PLAINS_MONSTER_SPAWNS_R3_REVISION],[PLAINS_MONSTER_SPAWNS_R4,PLAINS_MONSTER_SPAWNS_R4_REVISION]]){
  const saved=mergeMonsterSpawnDefaults(emptyMonsterSpawns(),defaults,revision).document,result=mergeMonsterSpawnDefaults(saved,createPlainsMonsterSpawns(),PLAINS_MONSTER_SPAWNS_REVISION);assert.equal(result.document.maps['great-plains'].length,19,revision);
  for(const expected of createPlainsMonsterSpawns().maps['great-plains'])assert.deepEqual(result.document.maps['great-plains'].find(value=>value.id===expected.id),expected,revision+' '+expected.id);
 }
});
