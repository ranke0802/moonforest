import test from 'node:test';import assert from 'node:assert/strict';import {createMonsterGroupScheduler} from '../src/monster-group-scheduler.js';
const tick=()=>new Promise(r=>setImmediate(r)),member=(id,extra={})=>({id,groupId:'pack',spawnMode:'start',delaySeconds:5,respawn:true,...extra});
test('group respawns together after all members die and game-time delay expires',async()=>{const actors=[],removed=[];const s=createMonsterGroupScheduler({spawn:async row=>{const a={id:row.id,alive:true};actors.push(a);return a;},isAlive:a=>a.alive,remove:a=>removed.push(a.id)});s.load([member('a'),member('b')]);s.update(0);await tick();assert.equal(s.inspect()[0].state,'active');actors[0].alive=false;s.update(1);assert.equal(s.inspect()[0].dead,1);assert.equal(actors.length,2);actors[1].alive=false;s.update(1);assert.equal(s.inspect()[0].state,'waiting');s.update(10,{paused:true});assert.equal(s.inspect()[0].remaining,5);s.update(5);await tick();assert.equal(actors.length,4);assert.deepEqual(removed,['a','b']);s.dispose();});
test('permanent death persists and map cancellation removes late actors',async()=>{let complete;const saved=[],removed=[],s=createMonsterGroupScheduler({spawn:row=>row.id==='slow'?new Promise(r=>complete=r):Promise.resolve({id:row.id}),isAlive:()=>false,remove:a=>removed.push(a.id),onPermanentDeath:id=>saved.push(id)});s.load([member('a',{respawn:false})]);s.update(0);await tick();s.update(1);assert.deepEqual(saved,['a']);assert.equal(s.inspect()[0].state,'complete');s.load([member('a',{respawn:false})],{permanentlyDead:saved});assert.equal(s.inspect().length,0);s.load([member('slow')]);s.update(0);s.leave();complete({id:'slow'});await tick();assert.ok(removed.includes('slow'));s.dispose();});
test('whole-group admission reserves before asynchronous preparation and exposes capacity wait without partial spawns',async()=>{
 let used=0,checks=0;const actors=[],released=[];const s=createMonsterGroupScheduler({canLaunch:rows=>{checks++;if(used+rows.length>3)return 'population-capacity';used+=rows.length;return true;},releaseAdmission:rows=>{used-=rows.length;released.push(rows[0].groupId);},spawn:async row=>{const actor={id:row.id,alive:true};actors.push(actor);return actor;},isAlive:a=>a.alive});
 s.load([member('a',{respawn:false}),member('b',{respawn:false}),member('c',{groupId:'second'}),member('d',{groupId:'second'})]);s.update(0);await tick();assert.equal(actors.length,2);assert.equal(used,2);assert.equal(s.inspect()[1].state,'capacity-wait');assert.equal(s.inspect()[1].capacityReason,'population-capacity');const before=checks;s.update(10,{paused:true});assert.equal(checks,before);
 for(const actor of actors)actor.alive=false;s.update(0);await tick();assert.equal(actors.length,4);assert.equal(used,2);assert.deepEqual(released,['pack']);s.leave();assert.equal(used,0);assert.deepEqual(released,['pack','second']);s.dispose();
});
test('one group finishes and publishes before an unrelated slow model can occupy the serialized actor queue',async()=>{
 async function scenario(preparationGroups){let finishFar,tail=Promise.resolve();const order=[],commits=[],far=new Promise(resolve=>finishFar=resolve),scheduler=createMonsterGroupScheduler({preparationGroups,spawn:row=>{const task=tail.then(async()=>{order.push(row.id);if(row.id==='far')await far;return {id:row.id};});tail=task.catch(()=>{});return task;},commit:handles=>commits.push(handles.map(handle=>handle.id))});
  scheduler.load([member('near1',{delaySeconds:45}),member('near2',{delaySeconds:45}),member('far',{groupId:'far-pack',delaySeconds:45})]);scheduler.update(0);await tick();return {scheduler,order,commits,finishFar};
 }
 const old=await scenario(Infinity);assert.deepEqual(old.order,['near1','far']);assert.deepEqual(old.commits,[['near1']],'round-robin group awaits put near2 behind an unrelated cold model (near1 is already out)');old.finishFar();await tick();old.scheduler.dispose();
 const fixed=await scenario(1);assert.deepEqual(fixed.order,['near1','near2','far']);assert.deepEqual(fixed.commits,[['near1'],['near2']],'each member appears as it is ready');assert.equal(fixed.scheduler.inspect()[0].initialDelaySeconds,0,'respawn45 never becomes first-spawn delay');assert.equal(fixed.scheduler.inspect()[0].preparedCount,2);assert.equal(fixed.scheduler.inspect()[0].state,'active');assert.equal(fixed.scheduler.inspect()[1].state,'preparing');fixed.scheduler.leave();fixed.finishFar();await tick();assert.deepEqual(fixed.scheduler.inspect(),[]);fixed.scheduler.dispose();
});

test('waiting groups are prepared nearest the focus point first, re-read every frame',async()=>{
 const started=[];let point={x:100,z:0};
 const scheduler=createMonsterGroupScheduler({preparationGroups:1,random:()=>.5,focus:()=>point,spawn:async row=>{started.push(row.groupId);return {row};}});
 const row=(groupId,x)=>({id:groupId+'-1',groupId,definitionId:'wolf',x,z:0,spawnMode:'start',delaySeconds:0});
 scheduler.load([row('west',-100),row('middle',0),row('east',100)]);
 scheduler.update(0);
 assert.equal(started[0],'east','nearest the focus, not the list order');
 // The player turns toward the west pack while the east one is preparing.
 point={x:-100,z:0};await tick();scheduler.update(0);await tick();
 assert.equal(started[1],'west','the focus moved: the next group follows it');
 scheduler.dispose();
});

test('pack members appear one by one as each is ready, leader first',async()=>{
 const shown=[];let release;const gate=new Promise(r=>release=r);
 const scheduler=createMonsterGroupScheduler({spawn:async row=>{if(row.id!=='leader')await gate;return {id:row.id};},commit:handles=>shown.push(...handles.map(h=>h.id)),isAlive:()=>true});
 scheduler.load([member('leader'),member('second'),member('third')]);scheduler.update(0);await tick();
 assert.deepEqual(shown,['leader'],'the leader is out before the rest are ready');
 assert.equal(scheduler.inspect()[0].state,'preparing');
 release();await tick();await tick();await tick();
 assert.deepEqual(shown,['leader','second','third']);assert.equal(scheduler.inspect()[0].state,'active');
 scheduler.dispose();
});

test('a packmate that fails to load never removes the leader already in the fight',async()=>{
 const shown=[],removed=[],errors=[];
 const scheduler=createMonsterGroupScheduler({spawn:async row=>{if(row.id==='second')throw new Error('decoder timeout');return {id:row.id};},commit:handles=>shown.push(...handles.map(h=>h.id)),remove:handle=>removed.push(handle.id),isAlive:()=>true,onError:error=>errors.push(error.message)});
 scheduler.load([member('leader'),member('second'),member('third')]);scheduler.update(0);await tick();await tick();await tick();
 assert.deepEqual(shown,['leader','third'],'each member is shown once; the failed one sits out');
 assert.deepEqual(removed,[],'nothing already shown is taken away');
 assert.deepEqual(errors,['decoder timeout']);
 const row=scheduler.inspect()[0];assert.equal(row.state,'active');assert.equal(row.dead,1,'the failed member counts as gone for completion');
 scheduler.update(1);await tick();assert.deepEqual(shown,['leader','third'],'no second commit of the same handles');
 scheduler.dispose();
});
