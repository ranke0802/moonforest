import {isEnemySolid} from './enemy-collision.js';

const movable=(enemy,owner)=>enemy!==owner&&!['down','recover'].includes(enemy.brain.mode);

// The narrow phase and its i/j order are unchanged. Re-query after moving i:
// a push can bring a previously distant, later j into contact in this pass.
function resolvePair(a,b,owner){
 if(!isEnemySolid(a)||!isEnemySolid(b))return 0;
 const am=movable(a,owner),bm=movable(b,owner),weight=Number(am)+Number(bm);
 if(!weight)return 0;
 const dx=b.actor.position.x-a.actor.position.x,dz=b.actor.position.z-a.actor.position.z;
 const distance=Math.hypot(dx,dz),spacing=(a.separationRadius??.8)+(b.separationRadius??.8);
 if(distance>=spacing)return 0;
 const x=distance>.0001?dx/distance:1,z=distance>.0001?dz/distance:0,push=(spacing-distance)/weight;
 if(am){a.actor.position.x-=x*push;a.actor.position.z-=z*push;}
 if(bm){b.actor.position.x+=x*push;b.actor.position.z+=z*push;}
 return Number(am)|Number(bm)<<1;
}

export class EnemySeparationWorkspace{
 constructor(){this.buckets=new Map();this.bucketPool=[];this.keys=[];this.candidates=[];this.stats={mode:'idle',actors:0,allPairs:0,testedPairs:0,queries:0,pushes:0};}
 clear(){for(const bucket of this.buckets.values()){bucket.length=0;this.bucketPool.push(bucket);}this.buckets.clear();this.keys.length=0;this.candidates.length=0;this.encounters=null;}
 build(encounters){
  this.clear();this.encounters=encounters;let radius=.8;
  for(const enemy of encounters){const r=enemy.separationRadius??.8,p=enemy.actor.position;if(!Number.isFinite(r)||r<0||!Number.isFinite(p.x)||!Number.isFinite(p.z))return false;radius=Math.max(radius,r);}
  this.radius=radius;this.cellSize=Math.max(2,2*radius);
  for(let i=0;i<encounters.length;i++)this.insert(i);
  return true;
 }
 key(position){return Math.floor(position.x/this.cellSize)+':'+Math.floor(position.z/this.cellSize);}
 insert(i){const key=this.key(this.encounters[i].actor.position);let bucket=this.buckets.get(key);if(!bucket){bucket=this.bucketPool.pop()??[];this.buckets.set(key,bucket);}bucket.push(i);this.keys[i]=key;}
 move(i){const next=this.key(this.encounters[i].actor.position),old=this.keys[i];if(next===old)return;const bucket=this.buckets.get(old),index=bucket.indexOf(i);bucket[index]=bucket[bucket.length-1];bucket.pop();this.insert(i);}
 query(i,after){
  this.stats.queries++;const result=this.candidates;result.length=0;
  const enemy=this.encounters[i],p=enemy.actor.position,r=(enemy.separationRadius??.8)+this.radius,size=this.cellSize;
  for(let x=Math.floor((p.x-r)/size);x<=Math.floor((p.x+r)/size);x++)for(let z=Math.floor((p.z-r)/size);z<=Math.floor((p.z+r)/size);z++){
   const bucket=this.buckets.get(x+':'+z);if(!bucket)continue;
   for(const j of bucket)if(j>after)result.push(j);
  }
  result.sort((a,b)=>a-b);return result;
 }
 inspect(){return {...this.stats};}
}

export function separateEnemies(encounters,grabOwner,workspace=new EnemySeparationWorkspace()){
 const count=encounters.length,stats=workspace.stats;Object.assign(stats,{mode:count>=12?'spatial':'ordered',actors:count,allPairs:count*(count-1),testedPairs:0,queries:0,pushes:0});
 for(let pass=0;pass<2;pass++){
  const spatial=count>=12&&workspace.build(encounters);
  if(!spatial){stats.mode='ordered';for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){stats.testedPairs++;if(resolvePair(encounters[i],encounters[j],grabOwner))stats.pushes++;}continue;}
  for(let i=0;i<count;i++){
   let after=i;
   for(;;){
    const candidates=workspace.query(i,after);let moved=false;
    for(const j of candidates){
     after=j;stats.testedPairs++;const mask=resolvePair(encounters[i],encounters[j],grabOwner);
     if(mask){stats.pushes++;if(mask&1)workspace.move(i);if(mask&2)workspace.move(j);}
     if(mask&1){moved=true;break;}
    }
    if(!moved)break;
   }
  }
 }
 // Retain small empty buckets, never references to live/old-map actors.
 workspace.clear();return stats;
}
