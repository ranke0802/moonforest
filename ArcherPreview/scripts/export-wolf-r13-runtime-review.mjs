import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Vector3} from '@babylonjs/core';
import {wolfCombatR13Fixture} from '../tests/helpers/wolf-combat-r13-fixture.js';

const project=path.resolve(import.meta.dirname,'../..');
const out=path.join(project,'exports/review/wolf-combat-r13/runtime-poses');
fs.mkdirSync(out,{recursive:true});
const sources=['wolf-v02-spec.js','wolf-v02-encounter.js','wolf-v02-authored-clips.js','wolf-v02-combat-r13-clips.json','wolf-v02-ram.js','wolf-v02-locomotion.js','wolf-v02-support.js','wolf-v02-contact-shapes.js','wolf-v02-hurt.js','wolf-v02-shield.js','wolf-v02-telegraph.js','warrior-v2.js','animation.js'];
const hashes=()=>Object.fromEntries(sources.filter(p=>fs.existsSync(path.join(project,'ArcherPreview/src',p))).map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(project,'ArcherPreview/src',p))).digest('hex')]));
const before=hashes(),api=await wolfCombatR13Fixture(),rows=[];
function skin(meshes,origin,scale,role){
 return meshes.filter(m=>m.getTotalVertices()>0&&!m.metadata?.moonforestOutline&&!m.name.includes('silhouette')).map(m=>{
  const positions=[],normals=[],v=new Vector3(),p=m.getPositionData(true,true),n=m.getNormalsData(true,true),matrix=m.getWorldMatrix();
  for(let i=0;i<p.length;i+=3){Vector3.TransformCoordinatesToRef(Vector3.FromArray(p,i),matrix,v);positions.push([(v.x-origin.x)/scale,-(v.z-origin.z)/scale,(v.y-origin.y)/scale]);Vector3.TransformNormalToRef(Vector3.FromArray(n,i),matrix,v);v.normalize();normals.push([v.x,-v.z,v.y]);}
  return {name:m.name,role,positions,normals,indices:Array.from(m.getIndices()),uv:Array.from(m.getVerticesData('uv')??[])};
 });
}
function save(e,name,extra={}){
 for(const s of [...e.asset.skeletons,...api.playerAsset.skeletons])s.prepare(true);
 const origin=e.actor.position.clone(),scale=e.config.scale;
 const data={name,elapsed:api.elapsed,sourceTime:e.brain.time,clip:e.brain.state,playerState:api.result.state,playerClipTime:api.result.clipTime,playerPosition:api.f.player.position.asArray(),wolfPosition:e.actor.position.asArray(),body:api.bodyPoints(),ram:e.inspect().ram??null,brainMode:e.brain.mode,scope:'Actual post-contact Babylon CPU-skinned wolf and unmodified native 1.6m warrior. Original wolf colour, neutral player review material. Offline review, not game GPU screenshot.',...extra,meshes:[...skin(e.asset.meshes,origin,scale,'wolf'),...skin(api.playerAsset.meshes,origin,scale,'player')]};
 const file=path.join(out,name+'.json');fs.writeFileSync(file,JSON.stringify(data));
 rows.push({name,elapsed:data.elapsed,sourceTime:data.sourceTime,clip:data.clip,playerState:data.playerState,playerClipTime:data.playerClipTime,brainMode:data.brainMode,ramElapsed:data.ramElapsed??null,bytes:fs.statSync(file).size,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
}
try{
 const e=await api.summon({distance:15,sequence:['lunge']});
 let hits=0,lastHp=e.playerHp,ramAt=null,serial=null;const saved=new Set();
 const capture=(name)=>{if(!saved.has(name)){save(e,name,{ramElapsed:ramAt===null?null:api.elapsed-ramAt});saved.add(name);}};
 for(let frame=0;frame<1800;frame++){
  api.step(1/60);
  if(serial===null&&e.brain.mode==='attack'&&e.brain.actionId==='lunge')serial=e.brain.serial;
  if(e.brain.serial===serial){
   if(!hits&&e.brain.time>.45)capture('ram-prepare');
   if(e.playerHp<lastHp){hits++;if(hits===1){ramAt=api.elapsed;capture('head-ram');}else capture('ground-bite-'+(hits-1));}
   if(ramAt!==null){const t=api.elapsed-ramAt;if(t>=.45)capture('native-fall');if(t>=.90)capture('chase-start');if(t>=1.05)capture('chase-step');if(t>=1.18)capture('chase-settle');if(hits===3&&t>=2.25)capture('ram-recovery');if(hits===3&&e.brain.time>=3.20)capture('ram-recovery-end');}
  }
  lastHp=e.playerHp;
  if(hits===3&&e.brain.serial!==serial&&e.brain.behavior==='recovery'){capture('ram-watch');break;}
 }
 if(hits!==3||!saved.has('chase-step')||!saved.has('ram-recovery-end')||!saved.has('ram-watch'))throw Error('Incomplete real fall/chase/maul: '+JSON.stringify({hits,saved:[...saved],state:e.brain.inspect(),ram:e.inspect().ram}));
 const down=await api.summon({distance:2.8});api.watch(down);for(let i=0;i<24;i++)api.step(1/60);api.controller.startAttack('judgment');
 const downSaved=new Set();
 for(let frame=0;frame<600;frame++){
  api.step(1/60);
  let name=null;
  if(down.brain.mode==='down'&&down.brain.time>=.85&&!downSaved.has('wolf-collapse'))name='wolf-collapse';
  if(down.brain.state==='Wolf_Supported_Get_Up_V02'&&down.brain.time>=.45&&!downSaved.has('wolf-supported-rise'))name='wolf-supported-rise';
  if(down.brain.state==='Wolf_Supported_Get_Up_V02'&&down.brain.time>=1.35&&!downSaved.has('wolf-getup'))name='wolf-getup';
  if(name){save(down,name);downSaved.add(name);}
  if(downSaved.size===3)break;
 }
 if(downSaved.size!==3)throw Error('Real heavy knockdown/get-up export incomplete '+JSON.stringify({names:[...downSaved],brain:down.brain.inspect()}));
 const after=hashes();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Runtime inputs changed during CPU pose export; rerun after freeze');
 const index={scope:'Actual autonomous 15m run -> head ram -> native player fall -> fast supported pursuit -> two real prone bites, plus native warrior heavy -> wolf nonlethal collapse -> supported get-up. CPU/offline evidence only.',sourceHashesUnchangedDuringExport:true,sources:after,rows};
 fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index,null,2)+'\n');
 const review=path.join(project,'Docs/Reviews/2026-11-13/wolf-combat-r13');fs.mkdirSync(review,{recursive:true});fs.writeFileSync(path.join(review,'runtime-poses.json'),JSON.stringify(index,null,2)+'\n');
 console.log(JSON.stringify({out,rows:rows.map(({bytes,sha256,...row})=>row)}));
}finally{await api.dispose();}
