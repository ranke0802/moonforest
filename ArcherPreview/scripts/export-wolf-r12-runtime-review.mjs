import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {Vector3} from '@babylonjs/core';
import {wolfRamFixture} from '../tests/helpers/wolf-ram-fixture.js';
const project=path.resolve(import.meta.dirname,'../..'),out=path.join(project,'exports/review/wolf-v02-ram-r12');fs.mkdirSync(out,{recursive:true});
const sources=['wolf-v02-spec.js','wolf-v02-encounter.js','wolf-v02-authored-clips.js','wolf-v02-ram-clips.json','wolf-v02-ram.js','wolf-v02-locomotion.js','warrior-v2.js','animation.js'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(project,'ArcherPreview/src',p))).digest('hex')])),before=hashes();
const api=await wolfRamFixture(),f=api.f,rows=[];
function skin(meshes,origin,scale,role){return meshes.filter(m=>m.getTotalVertices()>0&&!m.metadata?.moonforestOutline).map(m=>{const positions=[],normals=[],v=new Vector3(),p=m.getPositionData(true,true),n=m.getNormalsData(true,true),matrix=m.getWorldMatrix();for(let i=0;i<p.length;i+=3){Vector3.TransformCoordinatesToRef(Vector3.FromArray(p,i),matrix,v);positions.push([(v.x-origin.x)/scale,-(v.z-origin.z)/scale,(v.y-origin.y)/scale]);Vector3.TransformNormalToRef(Vector3.FromArray(n,i),matrix,v);v.normalize();normals.push([v.x,-v.z,v.y]);}return {name:m.name,role,positions,normals,indices:Array.from(m.getIndices()),uv:Array.from(m.getVerticesData('uv')??[])};});}
function save(e,name){for(const s of [...e.asset.skeletons,...api.playerAsset.skeletons])s.prepare(true);const origin=e.actor.position.clone(),scale=e.config.scale;const data={name,elapsed:api.elapsed,sourceTime:e.brain.time,clip:e.brain.state,playerState:api.result.state,playerClipTime:api.result.clipTime,body:api.bodyPoints(),ram:e.inspect().ram??null,scope:'Actual post-contact Babylon CPU-skinned wolf and native warrior pose at 1.6m. Wolf original colour; player rendered with neutral review material, not game GPU screenshot.',meshes:[...skin(e.asset.meshes,origin,scale,'wolf'),...skin(api.playerAsset.meshes,origin,scale,'player')]};const p=path.join(out,name+'.json');fs.writeFileSync(p,JSON.stringify(data));rows.push({name,elapsed:data.elapsed,sourceTime:data.sourceTime,clip:data.clip,playerState:data.playerState,playerClipTime:data.playerClipTime,bytes:fs.statSync(p).size,sha256:createHash('sha256').update(fs.readFileSync(p)).digest('hex')});}
try{f.player.position.set(0,0,35);await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;e.brain.random=()=>.5;e.brain.hp=900;e.brain.configureAttacks({custom:true,sequence:['lunge'],speed:1});
 let attackSerial=null,lastHp=e.playerHp,hits=0,ramClock=null;const saved=new Set(),seen=new Set();
 const capture=name=>{if(!saved.has(name)){save(e,name);saved.add(name);}};
 for(let frame=0;frame<1600&&saved.size<6;frame++){
  api.step(1/60);seen.add(e.brain.mode+'/'+e.brain.state+'/'+e.brain.actionId);if(attackSerial===null&&e.brain.actionId==='lunge'&&e.brain.mode==='attack')attackSerial=e.brain.serial;
  if(attackSerial!==null&&e.brain.serial===attackSerial){
   if(!e.brain.state.startsWith('Wolf_Ram_'))throw Error('R12 runtime clip not installed');
   if(!hits&&e.brain.time>=2.40)capture('prepare');
   if(e.playerHp<lastHp){hits++;if(hits===1){ramClock=api.elapsed;capture('head-ram');}else capture('ground-bite-'+(hits-1));}
   if(ramClock!==null&&api.elapsed>=ramClock+.50&&hits===1)capture('falling');
   if(hits===3&&e.brain.time>=4.75)capture('recover');
  }
  lastHp=e.playerHp;
 }
 if(saved.size!==6||hits!==3)throw Error('Incomplete R12 actual contact sequence '+JSON.stringify({saved:[...saved],hits,seen:[...seen],actor:e.actor.position.asArray(),player:f.player.position.asArray(),brain:e.brain.inspect?.()}));
 const after=hashes();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Runtime inputs changed during CPU export');
 const index={scope:'Actual autonomous R12 charge from 35m, unmodified native player fall/recoil, two real prone contact phases and recovery. Intermediate skin data is regenerable and excluded from portable package exports.',sources:after,sourceHashesUnchangedDuringExport:true,rows};fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index,null,2)+'\n');const review=path.join(project,'Docs/Reviews/2026-11-13/wolf-ram-r12');fs.mkdirSync(review,{recursive:true});fs.writeFileSync(path.join(review,'runtime-poses.json'),JSON.stringify(index,null,2)+'\n');console.log(JSON.stringify({out,rows:rows.map(({bytes,sha256,...r})=>r)}));
}finally{await api.dispose();}
