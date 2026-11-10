import test from 'node:test';
import assert from 'node:assert/strict';
import {BossEncounter} from '../src/boss-encounter.js';
import {EnemyDeath} from '../src/enemy-death.js';

test('held witch death skips unchanged visibility writes while preserving external correction and first fade',()=>{
 let value=1,writes=0,probes=0;const mesh={get visibility(){return value;},set visibility(v){writes++;value=v;}};
 const death=new EnemyDeath();death.reset({holdPose:true,clipSeconds:5.2});
 const enemy=Object.assign(Object.create(BossEncounter.prototype),{death,deathVisibility:[[mesh,1]],deathShadowsRemoved:false,grab:{reset(){}},gate:{reset(){}},onDefeat(){},actor:{position:{clone:()=>({})}},world:{shadows:{removeShadowCaster(){}},requestDeathDiagnostic(){probes++;}},pendingEvents:[],bossReaction:{reset(){}},knockVelocity:{setAll(){}}});
 for(let i=0;i<60;i++)enemy.updateDeath(.05);assert.equal(writes,0);assert.equal(probes,0);
 value=.5;enemy.updateDeath(.05);assert.equal(value,1);assert.equal(writes,1,'external visibility is corrected as before');
 enemy.updateDeath(3);assert.ok(value<1);assert.equal(writes,2);assert.equal(probes,1);enemy.updateDeath(.1);assert.equal(probes,1,'one probe only at the alpha transition');
});
