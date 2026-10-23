import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Matrix,Vector3,Quaternion} from '@babylonjs/core';
import {loadPoseAsset} from './helpers/gltf-pose.js';
import {GoblinEncounter} from '../src/goblin-encounter.js';
import {PlayerStrikeSampler} from '../src/player-strikes.js';
import {MeleeContactGate} from '../src/melee-collision.js';

const warrior=loadPoseAsset(new URL('../assets/models/violet-warrior-v2.glb',import.meta.url));
const goblin=loadPoseAsset(new URL('../assets/models/hooded-goblin.glb',import.meta.url));
const config=JSON.parse(readFileSync(new URL('../assets/goblin/config.json',import.meta.url)));
const poses=[['Walking',0],['Running',.2],['Sneaky_Walk_inplace',.8],['Right_Jab_from_Guard',.4],['Sword_Judgment',.8]];
const attacks=[['slash','Right_Hand_Sword_Slash'],['attack','Thrust_Slash'],['judgment','Sword_Judgment']];

function capsulesAt(pose,time,distance,x=0){
 const nodes=goblin.pose(pose,time),hip=nodes['mixamorig:Hips'].getTranslation();
 const clip=config.catalog.find(c=>c.name===pose),ground=clip.groundTrack[Math.floor(time*30)];
 const world=Matrix.Compose(Vector3.One().scale(config.scale),Quaternion.RotationYawPitchRoll(Math.PI,0,0),new Vector3(x,0,distance));
 const enemy=new GoblinEncounter({},()=>{});enemy.config=config;enemy.brain={mode:'move'};enemy.actor={position:new Vector3(x,0,distance)};
 enemy.nodes=Object.fromEntries(Object.entries(nodes).map(([name,matrix])=>[name,{getAbsolutePosition:()=>Vector3.TransformCoordinates(matrix.getTranslation().subtract(new Vector3(hip.x,-ground,hip.z)),world)}]));
 return enemy.hurtCapsules();
}
function strike(state,clip,capsules){
 const sampler=new PlayerStrikeSampler(),gate=new MeleeContactGate(),hits=[];let matrix;
 const sword={computeWorldMatrix(){},getWorldMatrix:()=>matrix};
 for(let t=0;t<warrior.durations[clip]+.4;t+=1/60){
  matrix=warrior.pose(clip,Math.min(t,warrior.durations[clip])).Golden_Oathblade;
  const sample=sampler.sample({state,clipTime:t,actionId:1,actionElapsed:t},sword,null);
  hits.push(...gate.collect({...sample,capsules}).hits);
 }
 return hits;
}

test('actual sword motion hits the small goblin across walking, crouching and attack poses',()=>{
 for(const [pose,time] of poses)for(const distance of [1.05,1.3])for(const [state,clip] of attacks){
  const hits=strike(state,clip,capsulesAt(pose,time,distance));
  assert.ok(hits.length>0,`${pose}/${distance}/${state}`);
  if(state==='judgment')assert.deepEqual(hits.map(h=>h.damage),[20,20,24]);
  else assert.equal(new Set(hits.map(h=>h.id)).size,hits.length,'One hit per actual strike window');
 }
});
test('goblin height assistance does not award hits outside the actual horizontal sword sweep',()=>{
 for(const [state,clip] of attacks){
  assert.deepEqual(strike(state,clip,capsulesAt('Walking',0,4)),[]);
  assert.deepEqual(strike(state,clip,capsulesAt('Walking',0,1.3,3)),[]);
 }
 const capsules=capsulesAt('Walking',0,1.3),gate=new MeleeContactGate();
 const blade=[[0,.5,1.3],[0,1.5,1.3]];
 assert.deepEqual(gate.collect({actionId:null,window:null,blade,capsules}).hits,[],'Idle sword is harmless');
});
