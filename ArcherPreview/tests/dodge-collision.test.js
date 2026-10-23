import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainDodge } from '../src/dodge-collision.js';
const enemy=(x,z,radius=.7,mode='idle')=>({active:true,actor:{position:{x,z}},radius,brain:{hp:100,mode}});
test('a roll cannot tunnel through a bear, goblin or downed enemy, even in one long frame',()=>{
 for(const monster of [enemy(0,2),enemy(0,2,.34),enemy(0,2,.7,'down')]){
  const original={...monster.actor.position},p={x:0,z:5};
  constrainDodge(p,{x:0,z:0},{obstacles:[]},[monster]);
  assert.ok(p.z<2-monster.radius-.65);assert.ok(p.z>0);
  assert.deepEqual(monster.actor.position,original);
 }
});
test('wall behind an enemy and diagonal tree contact stop only the player',()=>{
 const tree={x:1,z:2,radius:.6},monster=enemy(0,1.8),p={x:0,z:6};
 constrainDodge(p,{x:0,z:0},{obstacles:[tree]},[monster]);assert.ok(p.z<.45);
 const diagonal={x:3,z:6};constrainDodge(diagonal,{x:0,z:0},{obstacles:[tree]},[]);
 assert.ok(Math.hypot(diagonal.x-1,diagonal.z-2)>=.92);assert.ok(diagonal.z<2);
});
test('overlap permits escape, dead enemies do not block, and arena bounds remain solid',()=>{
 const monster=enemy(0,.7),out={x:0,z:-2},into={x:0,z:2};
 constrainDodge(out,{x:0,z:0},{obstacles:[]},[monster]);assert.equal(out.z,-2);
 constrainDodge(into,{x:0,z:0},{obstacles:[]},[monster]);assert.equal(into.z,0);
 monster.brain.hp=0;into.z=2;constrainDodge(into,{x:0,z:0},{obstacles:[]},[monster]);assert.equal(into.z,2);
 const edge={x:0,z:14};constrainDodge(edge,{x:0,z:10},{obstacles:[]},[]);assert.equal(edge.z,11);
});
test('30 and 60 FPS rolls stop at the same enemy boundary without moving the enemy',()=>{
 const stops=[30,60].map(fps=>{const monster=enemy(0,2),p={x:0,z:0};for(let i=0;i<fps;i++){
  const from={...p};p.z+=3/fps;constrainDodge(p,from,{obstacles:[]},[monster]);
 }assert.deepEqual(monster.actor.position,{x:0,z:2});return p.z;});
 assert.ok(Math.abs(stops[0]-stops[1])<.004);
});
