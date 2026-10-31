import test from 'node:test';
import assert from 'node:assert/strict';
import {CAVE_PLACEMENTS,CAVE_STORY_ZONES,CAVE_BOSS} from '../src/witch-cave-layout.js';
import {MOURNING_CAVE_CLEARANCE_DATA as mask} from '../src/mourning-cave-clearance-data.js';
import {mourningCaveClearance} from '../src/mourning-cave-clearance.js';
import {ELENA_HOME} from '../src/elena-spec.js';

test('refuge, laboratory and resurrection apparatus form three readable functional clusters',()=>{
 const zone=id=>CAVE_PLACEMENTS.filter(p=>p.storyZone===id),has=(id,asset)=>zone(id).some(p=>p.asset===asset);
 assert.ok(CAVE_PLACEMENTS.length<314,'the previous overlapping 314-placement dressing is not restored');
 for(const [id,assets]of [['refuge',['cave-20-modest-cot','cave-17-faded-sacred-emblem','crate-barrel-cluster','firewood']],['laboratory',['cave-18-alchemy-workbench','cave-19-apothecary-shelf','handcart']],['resurrection',['cave-15-resurrection-altar','joachim-resting','cave-16-soul-collector-arm']]]){
  for(const asset of assets)assert.ok(has(id,asset),id+' has '+asset);const center=CAVE_STORY_ZONES[id];for(const p of zone(id))assert.ok(Math.hypot(p.x-center.x,p.z-center.z)<=(center.r??7)+.1,p.id+' belongs to its intended working/living area');
 }
 const ritual=zone('resurrection'),altar=ritual.find(p=>p.asset==='cave-15-resurrection-altar'),body=ritual.find(p=>p.asset==='joachim-resting'),collectors=ritual.filter(p=>p.asset==='cave-16-soul-collector-arm');
 assert.equal(collectors.length,2,'rear apparatus uses two collectors, with the old forward pair removed');assert.equal(altar.scale,1.25);assert.equal(body.x,altar.x);assert.equal(body.z,altar.z);assert.ok(body.elevation>altar.elevation);assert.ok(ritual.every(p=>p.z<CAVE_BOSS.z-5),'ritual props stay behind the battle foreground');
});

test('rearranging the apparatus preserves or expands the original complete-motion safe area',()=>{
 let cells=0;for(let i=1;i<mask.runs.length;i+=2)cells+=mask.runs[i];const area=cells*mask.step*mask.step;
 assert.ok(area>=39.8125,'safe connected area must not shrink below the previous 39.8125 square metres');assert.ok(mourningCaveClearance(ELENA_HOME.x,ELENA_HOME.z)>.08);assert.equal(CAVE_BOSS.r,14);assert.equal(CAVE_BOSS.height,6);assert.ok(mask.poseSamples>=541,'keep all existing living/cast/hit/death pose coverage');
});
