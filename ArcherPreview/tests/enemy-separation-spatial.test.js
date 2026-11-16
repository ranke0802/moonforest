import test from 'node:test';
import assert from 'node:assert/strict';
import {EnemySeparationWorkspace,separateEnemies} from '../src/enemy-separation.js';
import {isEnemySolid} from '../src/enemy-collision.js';

function original(encounters,owner){
 const movable=b=>b!==owner&&!['down','recover'].includes(b.brain.mode);
 for(let pass=0;pass<2;pass++)for(let i=0;i<encounters.length;i++)for(let j=i+1;j<encounters.length;j++){
  const a=encounters[i],b=encounters[j];if(!isEnemySolid(a)||!isEnemySolid(b))continue;
  const am=movable(a),bm=movable(b),weight=Number(am)+Number(bm);if(!weight)continue;
  const dx=b.actor.position.x-a.actor.position.x,dz=b.actor.position.z-a.actor.position.z,d=Math.hypot(dx,dz),spacing=(a.separationRadius??.8)+(b.separationRadius??.8);if(d>=spacing)continue;
  const x=d>.0001?dx/d:1,z=d>.0001?dz/d:0,push=(spacing-d)/weight;
  if(am){a.actor.position.x-=x*push;a.actor.position.z-=z*push;}
  if(bm){b.actor.position.x+=x*push;b.actor.position.z+=z*push;}
 }
}
const actor=(x,z,r=.8,mode='idle',active=true,hp=300)=>({active,brain:{hp,mode},actor:{position:{x,y:0,z}},separationRadius:r});
function compare(input,ownerIndex=-1){const a=structuredClone(input),b=structuredClone(input),workspace=new EnemySeparationWorkspace();original(a,a[ownerIndex]);const stats=separateEnemies(b,b[ownerIndex],workspace);assert.deepEqual(b,a);assert.equal(workspace.encounters,null);assert.equal(workspace.buckets.size,0);return stats;}

test('spatial separation is exactly ordered like both original passes for mixed moving, dead, down and captured actors',()=>{
 let state=123456789;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
 for(let seed=0;seed<90;seed++){
  const rows=Array.from({length:12+seed%60},(_,i)=>actor((random()-.5)*(seed%3?80:7),(random()-.5)*(seed%3?80:7),.2+random()*3,['idle','move','down','recover','dead'][i%5],i%11!==0,i%13?300:0));
  compare(rows,seed%rows.length);
 }
});
test('coincident clusters and chain pushes crossing buckets find newly reachable later pairs',()=>{
 compare(Array.from({length:50},(_,i)=>actor(i%4?0:3.9,i%7?0:-3.9,.25+i%8*.33)),7);
 compare(Array.from({length:64},(_,i)=>actor(i*1.1-33,0,i%3?.8:1.4)),2);
});
test('80 spread actors avoid most distance tests and workspace reuse retains no actors',()=>{
 const rows=Array.from({length:80},(_,i)=>actor((i%10)*8,Math.floor(i/10)*8)),stats=compare(rows);
 assert.equal(stats.mode,'spatial');assert.equal(stats.allPairs,6320);assert.ok(stats.testedPairs<stats.allPairs*.1,JSON.stringify(stats));
 const workspace=new EnemySeparationWorkspace();for(let i=0;i<20;i++)separateEnemies(structuredClone(rows),null,workspace);
 assert.equal(workspace.encounters,null);assert.equal(workspace.keys.length,0);assert.equal(workspace.candidates.length,0);
});
test('small and nonfinite input preserve the original fallback behavior',()=>{
 compare([actor(0,0),actor(0,0),actor(.1,.1,.8,'idle')]);
 const rows=Array.from({length:14},(_,i)=>actor(i,0));rows[5].actor.position.x=NaN;compare(rows);
});
