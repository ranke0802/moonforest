import test from 'node:test';
import assert from 'node:assert/strict';
import {bladeTouchesCapsule,segmentDistanceSquared} from '../src/melee-collision.js';
// Previous detailed algorithm, deliberately without the new rejection bounds.
function reference(previous,current,capsule,radius,lateral){
  if(lateral?.halfWidth>0){
    if(reference(previous,current,capsule,radius))return true;
    const width=lateral.halfWidth,steps=Math.max(2,Math.ceil(width*2/Math.max(.025,radius)));
    for(let i=0;i<=steps;i++)if(reference(previous,current,capsule.map(p=>p.map((v,j)=>v-lateral.axis[j]*(-width+width*2*i/steps))),radius))return true;
    return false;
  }
  const travel=previous?Math.max(...current.map((p,k)=>Math.hypot(...p.map((v,j)=>v-previous[k][j])))):0,steps=Math.max(1,Math.ceil(travel/Math.max(.005,radius*.5)));
  for(let i=0;i<=steps;i++){const blade=current.map((p,k)=>p.map((v,j)=>previous?previous[k][j]+(v-previous[k][j])*i/steps:v));if(segmentDistanceSquared(...blade,...capsule)<=radius*radius)return true;}
  return false;
}
test('swept capsule rejection preserves detailed contacts including lateral cuts and fast crossed frames',()=>{
  let seed=991;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296),point=()=>[random()*4-2,random()*3,random()*4-2];
  for(let i=0;i<500;i++){
    const current=[point(),point()],previous=i%3?[point(),point()]:null,capsule=[point(),point()],radius=.15+random()*.4,yaw=random()*6.28,lateral=i%2?{halfWidth:.3,axis:[Math.cos(yaw),0,-Math.sin(yaw)]}:null;
    assert.equal(bladeTouchesCapsule(previous,current,capsule,radius,lateral),reference(previous,current,capsule,radius,lateral),'sample '+i);
  }
});
