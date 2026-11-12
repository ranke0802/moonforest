import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Vector3} from '@babylonjs/core';
import {wolfHuntFixture,beginWolfHunt,stepWolfHunt} from '../tests/helpers/wolf-hunt-fixture.js';
import {WOLF_V02_BY_ID} from '../src/wolf-v02-spec.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
const project=path.resolve(import.meta.dirname,'../..'),out=path.join(project,'Docs/Reviews/2026-11-12/wolf-feral-r10/runtime-poses');fs.mkdirSync(out,{recursive:true});
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
 }
 for(const radius of [3,5]){
  await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);f.player.position.set(0,0,radius);e.brain.beginStalk();e.brain.flankRemaining=20;
  for(let i=0;i<18;i++){if(radius===5)f.player.position.x+=.3/60;stepWolfHunt(f,e,1/60);}
  rows.push(save(e,'orbit-'+radius+'m-runtime'));
 }
 await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);f.player.position.set(0,0,18);e.brain.start(WOLF_CLIPS.watch,'idle');e.brain.behavior='position';e.brain.plannedId='pin';
 for(let i=0;i<36;i++)stepWolfHunt(f,e,1/60);
 rows.push(save(e,'running-runtime'));
 const sources=Object.fromEntries(['wolf-v02-spec.js','wolf-v02-encounter.js','wolf-v02-locomotion.js','wolf-v02-authored-clips.js','wolf-v02-feral-clips.json'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(project,'ArcherPreview/src',name))).digest('hex')]));
 fs.writeFileSync(path.join(out,'index.json'),JSON.stringify({sources,rows},null,2)+'\n');console.log(JSON.stringify({out,rows}));
}finally{await f.dispose();}
