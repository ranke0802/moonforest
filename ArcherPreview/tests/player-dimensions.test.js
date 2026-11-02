import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {configurePlayerSize,playerDimensions,WARRIOR_DIMENSIONS,WARRIOR_SCALE,WARRIOR_SOURCE_HEIGHT,LEGACY_PLAYER_DIMENSIONS} from '../src/player-dimensions.js';
import {CameraFollow,playerChinTarget} from '../src/camera-follow.js';
import {PlayerStrikeSampler} from '../src/player-strikes.js';
import {constrainDodge} from '../src/dodge-collision.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';
import {CAVE_STORY_INSPECTIONS} from '../src/cave-story-inspection.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(t){const engine=new NullEngine(),scene=new Scene(engine),actor=new TransformNode('player',scene);configurePlayerSize(actor,{scale:1.8146016164162133},{warrior:true});t.after(()=>engine.dispose());return {actor,scene};}
test('160 cm profile uses measured body height without repacking 8K model or scaling twice on reload',t=>{
 const {actor}=fixture(t);near(WARRIOR_SOURCE_HEIGHT*actor.scaling.y,1.6);near(actor.scaling.y,WARRIOR_SCALE);
 for(let i=0;i<12;i++)configurePlayerSize(actor,{scale:1.8146016164162133},{warrior:true});near(actor.scaling.y,WARRIOR_SCALE);
 assert.equal(playerDimensions(actor),WARRIOR_DIMENSIONS);assert.equal(playerDimensions({}),LEGACY_PLAYER_DIMENSIONS);
});
test('stable camera and head fallback follow the smaller body independently of bob and map altitude',t=>{
 const {actor}=fixture(t),follow=new CameraFollow();actor.position.set(29,6,-30);
 near(follow.focus(actor,null).y,6+WARRIOR_DIMENSIONS.stableFocusHeight);near(playerChinTarget(actor,null).y,6+WARRIOR_DIMENSIONS.chinHeight);
 follow.update({followMotion:true});near(follow.focus(actor,null).y,6+WARRIOR_DIMENSIONS.headHeight);
});
test('weapon endpoints inherit the actor once while contact margins use its body profile',t=>{
 const {actor,scene}=fixture(t),sword=new TransformNode('sword',scene);sword.parent=actor;sword.computeWorldMatrix(true);
 const sampler=new PlayerStrikeSampler(),sample=sampler.sample({actionId:1,state:'slash',clipTime:.5},sword,null,true,0,0,WARRIOR_DIMENSIONS);
 near(sample.blade[0][1],.405*WARRIOR_SCALE);near(sample.lateral.halfWidth,.3*WARRIOR_DIMENSIONS.ratio);near(sample.bladeRadius,WARRIOR_DIMENSIONS.bladeRadius);
});
test('roll world sweep and enemy standing clearance use the same smaller body',t=>{
 const {actor}=fixture(t);let radius;
 const navigation={obstacles:[],obstacleContact:(from,delta,r)=>{radius=r;return null;}};
 const p={x:0,z:1};constrainDodge(p,{x:0,z:0},navigation,[],70,WARRIOR_DIMENSIONS);near(radius,WARRIOR_DIMENSIONS.moveRadius+.002);
 const enemy={player:actor,radius:.7,dodgeContactClearance:false};near(BossEncounter.prototype.contactSeparation.call(enemy),.7+WARRIOR_DIMENSIONS.standingClearance);
 enemy.dodgeContactClearance=true;near(BossEncounter.prototype.contactSeparation.call(enemy),.7+WARRIOR_DIMENSIONS.rollRadius);
});
test('Joachim body is absent while the altar, stable IDs and truthful inspection remain',()=>{
 assert.equal(CAVE_PLACEMENTS.some(p=>p.asset==='joachim-resting'),false);
 assert.ok(CAVE_PLACEMENTS.some(p=>p.asset==='cave-15-resurrection-altar'));
 assert.equal(new Set(CAVE_PLACEMENTS.map(p=>p.id)).size,CAVE_PLACEMENTS.length);
 const point=CAVE_STORY_INSPECTIONS.find(p=>p.id==='resurrection');assert.equal(point.placement.asset,'cave-15-resurrection-altar');assert.match(point.paragraphs.join(' '),/비어 있는/);
});
