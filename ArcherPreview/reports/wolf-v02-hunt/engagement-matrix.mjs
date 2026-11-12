import fs from 'node:fs';
import {wolfHuntFixture,beginWolfHunt,stepWolfHunt} from '../../tests/helpers/wolf-hunt-fixture.js';
import {WOLF_V02_ACTIONS} from '../../src/wolf-v02-spec.js';
const f=await wolfHuntFixture(),rows=[];
try{
 for(const fps of [30,60])for(const speed of [.5,1,2])for(const a of WOLF_V02_ACTIONS.filter(a=>!a.chain))for(const band of ['minDistance','maxDistance']){
  const e=await beginWolfHunt(f,a.id,{z:a[band],speed});let ticks=0,captured=false;
  while(ticks++<1800&&(e.brain.mode==='attack'||e.brain.behavior==='recovery'||e.grab.active)){stepWolfHunt(f,e,1/fps);captured||=e.grab.active;}
  rows.push({id:a.id,fps,speed,band,distance:a[band],hit:e.playerHp<500,captured,contact:structuredClone(e.v02LastContact)});
 }
 fs.mkdirSync('reports/wolf-v02-hunt',{recursive:true});fs.writeFileSync('reports/wolf-v02-hunt/engagement-matrix.json',JSON.stringify({scope:'Stationary player at the actual AI engagement bands, actual rig/sample/contact pipeline on flat CPU NullEngine; no device/GPU claims.',rows},null,2)+'\n');
 console.log(JSON.stringify({cases:rows.length,hits:rows.filter(r=>r.hit).length,misses:rows.filter(r=>!r.hit)}));
}finally{await f.dispose();}
