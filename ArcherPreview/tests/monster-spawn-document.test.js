import test from 'node:test';import assert from 'node:assert/strict';
import {emptyMonsterSpawns,validateMonsterSpawns,mergeMonsterSpawnDefaults} from '../src/monster-spawn-document.js';
import {createPlainsMonsterSpawns,PLAINS_MONSTER_SPAWNS_REVISION} from '../src/plains-monster-spawns.js';
const row=(id,extra={})=>({id,definitionId:'hooded-goblin.standard',groupId:'pack',spawnMode:'start',respawn:true,rewardEnabled:true,x:1,z:2,yaw:0,delaySeconds:30,randomRadius:3,drop:{assetId:'',effectEnabled:false},...extra});
test('monster placement records round trip and grouped lifetime configuration stays consistent',()=>{const doc=emptyMonsterSpawns();doc.maps['great-plains']=[row('one'),row('two',{x:4})];assert.equal(validateMonsterSpawns(JSON.stringify(doc)).valid,true);doc.maps['great-plains'][1].respawn=false;assert.match(validateMonsterSpawns(doc).errors.join(),/같은 그룹/);});
test('invalid maps, duplicates, unsupported monsters and nonfinite placement values are rejected',()=>{const doc=emptyMonsterSpawns();doc.maps.village=[row('one'),row('one',{definitionId:'evil',x:Infinity})];assert.equal(validateMonsterSpawns(doc).valid,false);doc.maps={other:[]};assert.equal(validateMonsterSpawns(doc).valid,false);});
test('all approved plains quadruped definitions and finite contained territories round trip',()=>{
 const doc=createPlainsMonsterSpawns();assert.equal(validateMonsterSpawns(doc).valid,true);assert.equal(new Set(doc.maps['great-plains'].map(row=>row.groupId)).size,7);assert.equal(doc.maps['great-plains'].length,14);
 for(const area of [{x:0,z:0,radius:1},{x:6.6,z:-69,radius:8,returnRadius:9},{x:6.6,z:-69,radius:Infinity}]){const bad=structuredClone(doc);bad.maps['great-plains'][0].territory=area;assert.equal(validateMonsterSpawns(bad).valid,false);}
});
test('default migration preserves custom values and aliases conflicting IDs/groups without mutating its input',()=>{
 const doc=emptyMonsterSpawns(),defaults=createPlainsMonsterSpawns(),first=defaults.maps['great-plains'][0];doc.maps['great-plains']=[row(first.id,{groupId:first.groupId,x:88,respawn:false})];const original=structuredClone(doc);
 const merged=mergeMonsterSpawnDefaults(doc,defaults,PLAINS_MONSTER_SPAWNS_REVISION);assert.equal(merged.addedRows,14);assert.equal(merged.aliasedRows,1);assert.deepEqual(doc,original);
 const rows=merged.document.maps['great-plains'];assert.deepEqual(rows.at(-1),original.maps['great-plains'][0]);assert.equal(rows.length,15);assert.notEqual(rows[0].id,first.id);assert.notEqual(rows[0].groupId,first.groupId);
 rows.splice(0,1);rows[0].x+=.1;const again=mergeMonsterSpawnDefaults(merged.document,defaults,PLAINS_MONSTER_SPAWNS_REVISION);assert.equal(again.changed,false);assert.deepEqual(again.document,merged.document);
});
test('only the exact plains default revision and known14 ID history permit migration storage capacity up to34',()=>{
 const doc=emptyMonsterSpawns();doc.maps['great-plains']=Array.from({length:20},(_,i)=>row('custom-'+i,{groupId:'custom-'+i}));const merged=mergeMonsterSpawnDefaults(doc,createPlainsMonsterSpawns(),PLAINS_MONSTER_SPAWNS_REVISION).document;
 assert.equal(merged.maps['great-plains'].length,34);assert.equal(validateMonsterSpawns(merged).valid,true);assert.deepEqual(merged.maps['great-plains'].slice(14),doc.maps['great-plains']);
 for(const change of [value=>delete value.defaultRevisions,value=>value.defaultRevisions=['arbitrary'],value=>value.defaultRowIds['great-plains'][0]='arbitrary',value=>value.maps['great-plains'].push(row('extra'))]){const bad=structuredClone(merged);change(bad);assert.equal(validateMonsterSpawns(bad).valid,false);}
 const village=emptyMonsterSpawns();village.maps.village=Array.from({length:21},(_,i)=>row('v-'+i));village.defaultRevisions=[PLAINS_MONSTER_SPAWNS_REVISION];village.defaultRowIds=merged.defaultRowIds;assert.equal(validateMonsterSpawns(village).valid,false);
});
test('future default revisions add new IDs but do not restore deleted or overwrite edited previously installed defaults',()=>{
 const a=emptyMonsterSpawns(),seed=emptyMonsterSpawns();seed.maps.village=[row('first')];const one=mergeMonsterSpawnDefaults(a,seed,'small-r1').document;one.maps.village=[];
 seed.maps.village.push(row('second',{groupId:'second'}));const two=mergeMonsterSpawnDefaults(one,seed,'small-r2');assert.deepEqual(two.document.maps.village.map(row=>row.id),['second']);assert.deepEqual(two.document.defaultRowIds.village,['first','second']);
});
