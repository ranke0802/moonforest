import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Quaternion,Vector3} from '@babylonjs/core';
import {MonsterWatchLook} from '../src/monster-watch-look.js';
import {BEAR_V02_SIZE} from '../src/bear-size.js';
import {playerDimensions} from '../src/player-dimensions.js';

const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('guardian-bear.json',base))),gltf=JSON.parse(readFileSync(new URL(config.model,base)));
function fixture(t,{samples=true}={}){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;const actor=new TransformNode('bear-actor',scene);actor.scaling.setAll(BEAR_V02_SIZE.scale);actor.rotation.y=.6;
 const nodes=gltf.nodes.map(source=>{const node=new TransformNode(source.name,scene);node.position.copyFromFloats(...(source.translation??[0,0,0]));node.rotationQuaternion=Quaternion.FromArray(source.rotation??[0,0,0,1]);node.scaling.copyFromFloats(...(source.scale??[1,1,1]));return node;});
 gltf.nodes.forEach((node,i)=>(node.children??[]).forEach(child=>nodes[child].parent=nodes[i]));for(const node of nodes)if(!node.parent)node.parent=actor;
 const e={kind:'bear',bearSize:BEAR_V02_SIZE,active:true,actor,nodes:Object.fromEntries(nodes.map(node=>[node.name,node])),animator:samples?{samples:1}:{},brain:{mode:'idle',hp:900,stagger:0},territoryState:{enabled:true,phase:'watch'},player:{position:new Vector3()},world:{release:'moonforest-0.2'}};
 const look=new MonsterWatchLook(e),head=e.nodes['mixamorig:Head'],neck=e.nodes['mixamorig:Neck'],front=e.nodes.headfront;for(const node of nodes)node.computeWorldMatrix();
 const forward=front.getAbsolutePosition().subtract(head.getAbsolutePosition()),yaw=Math.atan2(forward.x,forward.z),origin=head.getAbsolutePosition();e.player.position.set(origin.x+Math.sin(yaw+.5)*5,origin.y-playerDimensions(e.player).bodyAimHeight+.3,origin.z+Math.cos(yaw+.5)*5);
 t.after(()=>{scene.dispose();engine.dispose();});return {e,look,head,neck,front,nodes};
}
const values=node=>({position:node.position.asArray(),scale:node.scaling.asArray(),quaternion:node.rotationQuaternion?.asArray(),rotation:node.rotation.asArray()});
const nearQuaternion=(a,b)=>assert.ok(a.every((value,index)=>Math.abs(value-b[index])<1e-6));

test('actual bear headfront rig aims neck/head while actor, torso, every position and scale remain exact',t=>{
 const f=fixture(t),before=new Map(f.nodes.map(node=>[node,values(node)])),actor=values(f.e.actor),direction=()=>f.front.getAbsolutePosition().subtract(f.head.getAbsolutePosition()).normalize(),target=()=>new Vector3(f.e.player.position.x,f.e.player.position.y+playerDimensions(f.e.player).bodyAimHeight,f.e.player.position.z).subtract(f.head.getAbsolutePosition()).normalize(),dot=Vector3.Dot(direction(),target());
 assert.equal(f.front.parent,f.head);assert.ok(Math.abs(f.front.position.z-.30594679713249207)<1e-12);assert.equal(f.look.apply(),true);assert.ok(Vector3.Dot(direction(),target())>dot);
 assert.notDeepEqual(f.head.rotationQuaternion.asArray(),before.get(f.head).quaternion);assert.notDeepEqual(f.neck.rotationQuaternion.asArray(),before.get(f.neck).quaternion);
 assert.deepEqual(values(f.e.actor),actor);for(const node of f.nodes){const prior=before.get(node);assert.deepEqual(node.position.asArray(),prior.position);assert.deepEqual(node.scaling.asArray(),prior.scale);if(node!==f.head&&node!==f.neck)assert.deepEqual(node.rotationQuaternion.asArray(),prior.quaternion,node.name);}
 f.look.restore();for(const node of [f.head,f.neck])assert.deepEqual(node.rotationQuaternion.asArray(),before.get(node).quaternion);
});

test('repeated align/apply never compounds and restore respects new animator samples',t=>{
 const f=fixture(t),head=f.head.rotationQuaternion.clone(),neck=f.neck.rotationQuaternion.clone();f.look.apply();const appliedHead=f.head.rotationQuaternion.asArray(),appliedNeck=f.neck.rotationQuaternion.asArray();
 for(let i=0;i<40;i++){f.look.apply();nearQuaternion(f.head.rotationQuaternion.asArray(),appliedHead);nearQuaternion(f.neck.rotationQuaternion.asArray(),appliedNeck);}
 f.e.animator.samples++;const nextHead=head.multiply(Quaternion.RotationAxis(Vector3.Up(),.08)),nextNeck=neck.multiply(Quaternion.RotationAxis(Vector3.Right(),-.04));f.head.rotationQuaternion.copyFrom(nextHead);f.neck.rotationQuaternion.copyFrom(nextNeck);f.look.apply();f.look.restore();nearQuaternion(f.head.rotationQuaternion.asArray(),nextHead.asArray());nearQuaternion(f.neck.rotationQuaternion.asArray(),nextNeck.asArray());
});

test('sample-counter-free bear restores before native sample/align and phase exit, including disengage and pause',t=>{
 const f=fixture(t,{samples:false}),head=f.head.rotationQuaternion.asArray(),neck=f.neck.rotationQuaternion.asArray();
 for(let frame=0;frame<20;frame++){
  f.look.restore();nearQuaternion(f.head.rotationQuaternion.asArray(),head);nearQuaternion(f.neck.rotationQuaternion.asArray(),neck);
  // Root owner samples native animation/alignment here, then applies gaze.
  f.head.computeWorldMatrix();f.neck.computeWorldMatrix();assert.equal(f.look.apply(),true);
 }
 f.e.territoryState.phase='disengage';assert.equal(f.look.apply(),true);f.look.restore();nearQuaternion(f.head.rotationQuaternion.asArray(),head);nearQuaternion(f.neck.rotationQuaternion.asArray(),neck);
 for(const phase of ['ambient','return','combat']){f.e.territoryState.phase='watch';f.look.apply();f.e.territoryState.phase=phase;assert.equal(f.look.apply(),false);nearQuaternion(f.head.rotationQuaternion.asArray(),head);nearQuaternion(f.neck.rotationQuaternion.asArray(),neck);}
});

test('manual/legacy/non-bear, movement and hurt/death cases keep their source pose',t=>{
 const f=fixture(t),source=f.head.rotationQuaternion.asArray();
 for(const configure of [()=>{f.e.territoryState.enabled=false;},()=>{f.e.bearSize=null;},()=>{f.e.kind='wolf';},()=>{f.e.brain.mode='move';},()=>{f.e.brain.stagger=1;},()=>{f.e.brain.hp=0;}]){
  Object.assign(f.e,{kind:'bear',bearSize:BEAR_V02_SIZE});Object.assign(f.e.territoryState,{enabled:true,phase:'watch'});Object.assign(f.e.brain,{mode:'idle',hp:900,stagger:0});configure();assert.equal(f.look.apply(),false);assert.deepEqual(f.head.rotationQuaternion.asArray(),source);
 }
});

test('a target behind and far above cannot exceed the small neck/head correction bounds',t=>{
 const f=fixture(t),original=[f.neck.rotationQuaternion.clone(),f.head.rotationQuaternion.clone()],body=values(f.e.actor),origin=f.head.getAbsolutePosition(),forward=f.front.getAbsolutePosition().subtract(origin).normalize();f.e.player.position.set(origin.x-forward.x*20,origin.y+50,origin.z-forward.z*20);
 assert.equal(f.look.apply(),true);for(const [i,node]of [f.neck,f.head].entries()){const rotation=2*Math.acos(Math.min(1,Math.abs(Quaternion.Dot(original[i],node.rotationQuaternion))));assert.ok(rotation<=[.28+.16,.45+.28][i]+1e-6);}
 assert.deepEqual(values(f.e.actor),body);
});
