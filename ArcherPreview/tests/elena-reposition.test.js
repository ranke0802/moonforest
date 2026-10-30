import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from '@babylonjs/core';
import {chooseElenaReposition} from '../src/elena-reposition.js';
import {ElenaBrain,ELENA_HOME,MOURNING_MOVEMENT,spellImpact} from '../src/elena-spec.js';
import {ElenaEncounter} from '../src/elena-encounter.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter} from '../src/world-limits.js';

const origin={x:ELENA_HOME.x,y:6,z:ELENA_HOME.z},player={x:origin.x,z:origin.z+4};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function brain(phase){const config=JSON.parse(readFileSync(new URL(`../public/assets/${phase===2?'mourning-elena':'elena'}.json`,import.meta.url)));return new ElenaBrain(Object.fromEntries(config.catalog.map(c=>[c.name,c.duration])),{mourning:phase===2});}

test('reposition alternates lateral sides, backs away when close, and approaches from farther range',()=>{
  for(const phase of [1,2]){
    const radius=phase===2?.9:.34,length=phase===2?2.1:2.65,left=chooseElenaReposition(origin,player,{phase,turn:0,radius}),right=chooseElenaReposition(origin,player,{phase,turn:1,radius});
    assert.ok(left.x<origin.x);assert.ok(right.x>origin.x);near(distance(left,origin),length);near(distance(right,origin),length);near(left.z,right.z);
    const close={x:origin.x,z:origin.z+2},back=chooseElenaReposition(origin,close,{phase,radius});assert.ok(back.z<origin.z);assert.ok(distance(back,close)>distance(origin,close));
    const far={x:origin.x,z:origin.z+7},forward=chooseElenaReposition(origin,far,{phase,radius});assert.ok(forward.z>origin.z);assert.ok(distance(forward,far)<distance(origin,far));
    const coincident=chooseElenaReposition(origin,origin,{phase,radius});assert.ok(Object.values(coincident).every(Number.isFinite));assert.ok(distance(coincident,origin)>=radius+1.1);
  }
  assert.deepEqual(origin,{x:29,y:6,z:-27});assert.deepEqual(player,{x:29,z:-23});
});

test('blocked sides, unsafe segments and height steps choose a tested alternate or shorter destination',()=>{
  let freeCalls=0,segmentCalls=0;
  const navigation={free(p,r){freeCalls++;assert.equal(r,.9);return true;},segmentClear(a,b,r){segmentCalls++;assert.strictEqual(a,origin);assert.equal(r,.9);return b.x>origin.x;}};
  const alternate=chooseElenaReposition(origin,player,{phase:2,radius:.9,navigation});assert.ok(alternate.x>origin.x);assert.equal(freeCalls,2);assert.equal(segmentCalls,2);
  const shortNavigation={free:p=>distance(p,origin)<2,segmentClear:()=>true};const shorter=chooseElenaReposition(origin,player,{navigation:shortNavigation});near(distance(shorter,origin),2.65*.6);
  const terrain={heightAt:(x,z)=>distance({x,z},origin)>2?8:6};const low=chooseElenaReposition(origin,player,{terrain});near(distance(low,origin),2.65*.6);assert.equal(terrain.heightAt(low.x,low.z),6);
  let attempts=0;const none=chooseElenaReposition(origin,player,{navigation:{free(){attempts++;return false;},segmentClear(){throw new Error('free rejection must short circuit');}}});assert.equal(none,null);assert.equal(attempts,12);
});

test('a selected resident home translates the same movement pattern away from the cave default',()=>{
  const home={x:-4,z:7},shiftedOrigin={...home,y:6},shiftedPlayer={x:home.x,z:home.z+4};
  for(const phase of [1,2])for(const turn of [0,1]){
    const original=chooseElenaReposition(origin,player,{phase,turn}),shifted=chooseElenaReposition(shiftedOrigin,shiftedPlayer,{phase,turn,home});
    assert.ok(shifted);near(shifted.x-home.x,original.x-origin.x);near(shifted.z-home.z,original.z-origin.z);assert.ok(distance(shifted,home)<=9.5);
  }
  assert.equal(chooseElenaReposition(shiftedOrigin,shiftedPlayer),null,'the custom home must be used instead of the cave anchor');
});

test('candidates remain in the dwelling, outside the player body, and inside usable spell distance',t=>{
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const edge={x:origin.x+9.4,z:origin.z},inwardPlayer={x:edge.x-4,z:edge.z};
  const candidate=chooseElenaReposition(edge,inwardPlayer,{phase:2,radius:.9});assert.ok(candidate);assert.ok(distance(candidate,ELENA_HOME)<=9.5);assert.ok(distance(candidate,inwardPlayer)>=2);assert.ok(distance(candidate,inwardPlayer)<=7.5);
  assert.equal(chooseElenaReposition({x:90,z:90},{x:91,z:90}),null);
  const terrain=createWitchCaveTerrain(),navigation=new CaveNavigation(caveObstacles());let accepted=0;
  for(const phase of [1,2])for(let angle=0;angle<Math.PI*2;angle+=Math.PI/18)for(const spacing of [2,4,7]){
    const radius=phase===2?.9:.34,p={x:origin.x+Math.sin(angle)*spacing,z:origin.z+Math.cos(angle)*spacing},target=chooseElenaReposition(origin,p,{phase,radius,navigation,terrain,turn:accepted});
    if(!target)continue;accepted++;
    assert.ok(navigation.free(target,radius));assert.ok(navigation.segmentClear(origin,target,radius));assert.ok(Math.abs(terrain.heightAt(target.x,target.z)-terrain.heightAt(origin.x,origin.z))<=.8);
    assert.ok(distance(target,ELENA_HOME)<=9.5);assert.ok(distance(target,p)>=radius+1.1);assert.ok(distance(target,p)<=7.5);
    // Actual constrained travel along the chosen segment stays outside cave walls.
    const position=new Vector3(origin.x,6,origin.z);
    for(let frame=1;frame<=24;frame++){const previous=position.clone();position.x=origin.x+(target.x-origin.x)*frame/24;position.z=origin.z+(target.z-origin.z)*frame/24;navigation.constrain(position,previous,radius);assert.ok(navigation.free(position,radius));}
  }
  assert.ok(accepted>100);
});

test('a phase-two movement chooses once, holds its destination, then starts a fresh cast on arrival',()=>{
  let queries=0;const e=Object.create(ElenaEncounter.prototype);Object.assign(e,{phase:2,radius:.9,stopDistance:3,actor:{position:new Vector3(origin.x,6,origin.z)},world:{navigation:{free(){queries++;return true;},segmentClear(){queries++;return true;}},terrain:{heightAt:()=>6}},brain:brain(2)});
  e.brain.reposition();const result={speed:.673},first=e.movementPlan({position:player},result),calls=queries;assert.ok(first.direct);assert.equal(first.stopDistance,.12);
  for(let i=0;i<120;i++)assert.strictEqual(e.movementPlan({position:{x:player.x+i*.01,z:player.z}},result).target,first.target);
  assert.equal(queries,calls,'fixed safe destination must not trigger fresh candidate tests each frame');
  e.actor.position.set(first.target.x,6,first.target.z);const final=e.movementPlan({position:player},result);assert.equal(result.speed,0);assert.strictEqual(final.target,e.actor.position);assert.equal(e.brain.repositioning,false);assert.equal(e.brain.mode,'attack');near(e.brain.time,0);
});

test('no safe route ends the movement action immediately without repeated searches',()=>{
  let queries=0;const e=Object.create(ElenaEncounter.prototype);Object.assign(e,{phase:1,radius:.34,stopDistance:1.08,actor:{position:new Vector3(origin.x,6,origin.z)},world:{navigation:{free(){queries++;return false;},segmentClear(){return false;}}},brain:brain(1)});
  e.brain.reposition();const result={speed:1.1};e.movementPlan({position:player},result);assert.equal(result.speed,0);assert.equal(e.brain.mode,'idle');assert.equal(queries,12);
  for(let i=0;i<60;i++)e.movementPlan({position:player},{speed:0});assert.equal(queries,12);
});

for(const phase of [1,2])test(`phase ${phase} performs one release and bounded movement before a fresh cast`,()=>{
  const b=brain(phase);b.cast();const duration=b.durations[b.state],impact=spellImpact(b.spell,duration);
  assert.equal(b.update(impact+.001,4,true).events.length,1);assert.equal(b.update(duration-impact+.01,4,true).events.length,0);assert.equal(b.repositioning,true);assert.equal(b.mode,'move');assert.equal(b.state,b.walk);
  const limit=b.repositionRemaining;assert.ok(limit>=2.2&&limit<=2.7);let elapsed=0;
  while(b.repositioning){const result=b.update(1/60,4,true);elapsed+=1/60;assert.equal(result.events.length,0);if(b.repositioning)near(result.speed,phase===2?MOURNING_MOVEMENT.walkSpeed:1.1);}
  assert.ok(elapsed<=limit+1/60);if(phase===1){assert.equal(b.mode,'idle');b.update(.39,4,true);assert.notEqual(b.mode,'attack');b.update(.02,4,true);}assert.equal(b.mode,'attack');assert.equal(b.time,0);
  b.cancelCast();assert.equal(b.mode,'idle');b.update(1.19,4,true);assert.notEqual(b.mode,'attack');
  b.cast();b.update(b.durations[b.state]+.01,4,true,{manual:true});b.update(.001,4,true,{manual:true});assert.equal(b.mode,'idle');assert.equal(b.repositioning,false,'manual review must not introduce automatic travel');
});
