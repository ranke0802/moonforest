import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {wolfHuntFixture,stepWolfHunt,resetFeral,poseRow,quantile,gaitCalibration,supportMotion} from '../../tests/helpers/wolf-feral-fixture.js';
import {WOLF_CLIPS} from '../../src/wolf-spec.js';
const label=process.argv[2]??'current',f=await wolfHuntFixture(),cases=[];
try{
 let e=await resetFeral(f,{distance:15});const runFloor=gaitCalibration(e,WOLF_CLIPS.run),walkFloor=gaitCalibration(e,WOLF_CLIPS.walk);
 e=await resetFeral(f,{distance:15});let rows=[];
 for(let i=0;i<60*12&&e.brain.mode!=='attack';i++){stepWolfHunt(f,e,1/60);rows.push(poseRow(e,f.player,i/60));}
 const approach=rows.filter(r=>r.mode==='move'),run=approach.filter(r=>r.clip===WOLF_CLIPS.run),walk=approach.filter(r=>r.clip===WOLF_CLIPS.walk);
 cases.push({case:'autonomous-approach',initialRange:15,runFrames:run.length,walkFrames:walk.length,runWallSeconds:run.length/60,walkWallSeconds:walk.length/60,
  runSpeed:run.slice(1).map((r,i)=>Math.hypot(r.actor[0]-run[i].actor[0],r.actor[2]-run[i].actor[2])*60).reduce((a,b)=>a+b,0)/Math.max(1,run.length-1),
  runSupport: supportMotion(run,runFloor),walkSupport:supportMotion(walk,walkFloor),attackStart:rows.at(-1),trace:rows.filter((_,i)=>i%10===0)});
 for(const movePlayer of [false,true]){
  e=await resetFeral(f,{distance:5,behavior:'observe'});e.brain.observation=5;for(let warm=0;warm<24;warm++)stepWolfHunt(f,e,1/60);e.brain.beginStalk();e.brain.flankRemaining=5;rows=[];
  for(let i=0;i<300&&e.brain.behavior==='flank';i++){
   if(movePlayer){f.player.position.x=Math.sin(i/60*.28)*5;f.player.position.z=Math.cos(i/60*.28)*5;}
   stepWolfHunt(f,e,1/60);rows.push(poseRow(e,f.player,i/60));
  }
  const angles=rows.filter(r=>r.wallTime>=.3).map(r=>r.gaze.degrees),radii=rows.map(r=>Math.hypot(r.actor[0]-r.player[0],r.actor[2]-r.player[2]));
  cases.push({case:'actual-head-stalking',movePlayer,frames:rows.length,angleP50:quantile(angles,.5),angleP95:quantile(angles,.95),angleMax:Math.max(...angles),minRadius:Math.min(...radii),maxRadius:Math.max(...radii),actorTravel:Math.hypot(rows.at(-1).actor[0]-rows[0].actor[0],rows.at(-1).actor[2]-rows[0].actor[2]),trace:rows.filter((_,i)=>i%10===0)});
 }
 const sourceHashes=Object.fromEntries(['src/wolf-v02-spec.js','src/wolf-v02-encounter.js','src/wolf-v02-authored-clips.js','src/wolf-v02-attack-clips.json'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
 const out={scope:'Actual packed R8 skeleton and game sampler/update/contact pipeline on flat CPU NullEngine. Head gaze is actual head world local +Y, not actor yaw. Foot ground tolerance selects stable stance samples; it is a diagnostic, not visual approval. No browser, GPU, real-device or FPS claim.',sourceHashes,cases};
 fs.writeFileSync(new URL(label+'-motion.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(cases.map(({trace,attackStart,...c})=>c),null,2));
}finally{await f.dispose();}
