import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Vector3} from '@babylonjs/core';
import {wolfHuntFixture,beginWolfHunt,stepWolfHunt} from '../tests/helpers/wolf-hunt-fixture.js';
import {WOLF_V02_BY_ID} from '../src/wolf-v02-spec.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
const project=path.resolve(import.meta.dirname,'../..'),out=path.join(project,'Docs/Reviews/2026-11-13/wolf-predator-r11/runtime-poses');fs.mkdirSync(out,{recursive:true});
const f=await wolfHuntFixture();
function save(e,name){
 for(const s of e.asset.skeletons)s.prepare(true);
 const origin=e.actor.position,scale=e.config.scale;
 const meshes=e.asset.meshes.filter(m=>m.getTotalVertices()>0&&!m.metadata?.moonforestOutline).map(m=>{
  const p=m.getPositionData(true,true),n=m.getNormalsData(true,true),world=m.getWorldMatrix(),positions=[],normals=[],v=new Vector3();
  for(let i=0;i<p.length;i+=3){Vector3.TransformCoordinatesToRef(Vector3.FromArray(p,i),world,v);positions.push([(v.x-origin.x)/scale,-(v.z-origin.z)/scale,(v.y-origin.y)/scale]);Vector3.TransformNormalToRef(Vector3.FromArray(n,i),world,v);v.normalize();normals.push([v.x,-v.z,v.y]);}
  return {name:m.name,positions,normals,indices:Array.from(m.getIndices()),uv:Array.from(m.getVerticesData('uv')??[])};
 });
 const p=f.player.position,head=e.nodes.head.getAbsolutePosition();
 const data={case:name,scope:'Actual Babylon CPU skin after runtime root, gaze and foot-plant correction. Offline Blender renders use original colour materials, not game GPU shaders.',clip:e.brain.state,sourceTime:e.brain.time,player:[(p.x-origin.x)/scale,-(p.z-origin.z)/scale,(p.y-origin.y)/scale],playerHeight:1.6/scale,head:[(head.x-origin.x)/scale,-(head.z-origin.z)/scale,(head.y-origin.y)/scale],runtime:e.inspect().locomotion,meshes};
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data));return {name,clip:data.clip,sourceTime:data.sourceTime,meshCount:meshes.length};
}
const rows=[];
try{
 for(const id of ['quick-bite','paw-swipe']){
  const e=await beginWolfHunt(f,id);let frame=0;while(e.brain.time<WOLF_V02_BY_ID[id].impact&&frame++<500)stepWolfHunt(f,e,1/120);
  rows.push(save(e,id+'-runtime-impact'));
  while(e.brain.time<WOLF_V02_BY_ID[id].impact+.18&&frame++<700)stepWolfHunt(f,e,1/120);
  rows.push(save(e,id+'-runtime-followthrough'));
 }
 for(const radius of [3,5]){
  await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);f.player.position.set(0,0,radius);e.brain.beginStalk();e.brain.flankRemaining=20;
  for(let i=0;i<18;i++){if(radius===5)f.player.position.x+=.3/60;stepWolfHunt(f,e,1/60);}
  rows.push(save(e,'orbit-'+radius+'m-runtime'));
 }
 // This gallery isolates a run pose after its observation gate. Autonomous
 // complete observation/approach timing is tested and reported separately.
 await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);f.player.position.set(0,0,18);e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.behavior='position';e.brain.boutObserved=true;e.brain.plannedId='pin';
 for(let i=0;i<36;i++)stepWolfHunt(f,e,1/60);
 rows.push(save(e,'running-runtime'));
 // Retain the unmodified summon/rise/observation route for the distant
 // orbit-to-run handoff; inspect released stance anchors without stretching.
 f.player.position.set(0,0,35);await f.battle.summon(f.player,1,'wolf');
 const far=f.battle.encounters[0];far.actor.position.setAll(0);far.actor.rotation.y=0;far.brain.random=()=>.5;far.brain.configureAttacks({custom:true,sequence:['lunge'],speed:1});
 let sawOrbit=false,moveFrame=0;
 for(let frame=0;frame<1800;frame++){
  far.playerHp=500;stepWolfHunt(f,far,1/60);sawOrbit||=far.brain.behavior==='flank';
  if(sawOrbit&&far.brain.mode==='move'){
   if([0,2,4,8,16,24].includes(moveFrame))rows.push(save(far,'far-orbit-run-'+String(moveFrame).padStart(2,'0')));
   if(++moveFrame>24)break;
  }
 }
 if(moveFrame<=24)throw Error('Missing genuine distant orbit-to-run transition');
 const sources=Object.fromEntries(['wolf-v02-spec.js','wolf-v02-encounter.js','wolf-v02-locomotion.js','wolf-v02-authored-clips.js','wolf-v02-feral-clips.json','wolf-v02-predator-clips.json'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(project,'ArcherPreview/src',name))).digest('hex')]));
 for(const kind of ['brace','death']){
  await f.battle.summon(f.player,1,'wolf');const reaction=f.battle.encounters[0];reaction.actor.position.setAll(0);f.player.position.set(0,0,4);reaction.brain.hit({heavy:true,damage:kind==='death'?1e6:20});
  for(let i=0;i<(kind==='death'?210:42);i++)stepWolfHunt(f,reaction,1/120);rows.push(save(reaction,kind+'-runtime'));
 }
 fs.writeFileSync(path.join(out,'index.json'),JSON.stringify({sources,rows},null,2)+'\n');console.log(JSON.stringify({out,rows}));
}finally{await f.dispose();}
