import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {wolfHuntFixture,beginWolfHunt,stepWolfHunt} from '../../tests/helpers/wolf-hunt-fixture.js';
import {WOLF_V02_ACTIONS} from '../../src/wolf-v02-spec.js';

const sourceHashes=Object.fromEntries(['src/wolf-v02-spec.js','src/wolf-v02-encounter.js'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const f=await wolfHuntFixture(),rows=[],poses=[];
try{
 for(const a of WOLF_V02_ACTIONS.filter(a=>!a.chain)){
  for(const offset of [-.15,0,.15]){
   const e=await beginWolfHunt(f,a.id),time=a.impact+offset;
   e.brain.time=time;e.animator.transition(a.sourceClip,{clipTime:time,actionId:e.brain.serial,blendDuration:0});e.animator.update(0);e.alignPose();
   const root=a.sourceClip===e.config.catalog.find(c=>c.name===a.sourceClip)?.name?e.animator.root.position:null;
   // Record local pose in actor space; world impact root is measured separately below.
   poses.push({action:a.id,time,root:root?.asArray(),parts:Object.fromEntries(['jaw','head','fore.L.paw','fore.R.paw'].map(n=>[n,e.nodes[n].getAbsolutePosition().asArray()]))});
  }
  for(const dz of [-.5,0,.5])for(const x of [-.9,-.5,0,.5,.9]){
   const e=await beginWolfHunt(f,a.id,{x,z:a.preferredDistance+dz});let at=null,observations=[],ticks=0;
   while(ticks++<1200&&(e.brain.mode==='attack'||e.brain.behavior==='recovery'||e.grab.active)){
    const before=e.playerHp;stepWolfHunt(f,e,1/60);
    if(e.pendingEvents?.length)observations.push(e.pendingEvents);
    if(e.playerHp<before||e.grab.active){at??={sourceTime:e.brain.time,actor:e.actor.position.asArray(),player:f.player.position.asArray(),contact:structuredClone(e.v02LastContact)};}
   }
   rows.push({action:a.id,x,z:a.preferredDistance+dz,dz,hit:e.playerHp<500,captured:e.grab.active,at,lastContact:e.v02LastContact});
  }
 }
 const report={scope:'Real R8 packed rig and gameplay pipeline, flat CPU NullEngine in great-plains world limits. Forced attack profile, no GPU or physical-device claim.',sourceHashes,rows,poses};
 const name=process.argv[2]??'baseline-contact-matrix.json';fs.mkdirSync('reports/wolf-v02-hunt',{recursive:true});fs.writeFileSync('reports/wolf-v02-hunt/'+name,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({file:name,summary:WOLF_V02_ACTIONS.filter(a=>!a.chain).map(a=>{const subset=rows.filter(r=>r.action===a.id);return {id:a.id,hits:subset.filter(r=>r.hit).length,total:subset.length,misses:subset.filter(r=>!r.hit).map(r=>({x:r.x,dz:r.dz,contact:r.lastContact}))};}),poses}));
}finally{await f.dispose();}
