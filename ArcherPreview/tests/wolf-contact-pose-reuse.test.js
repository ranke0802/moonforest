import fs from 'node:fs';
import assert from 'node:assert/strict';
import {wolfMomentumR14Fixture} from './helpers/wolf-momentum-r14-fixture.js';
import test from 'node:test';
test('alpha contact pose reuses completed alignment but preserves every world matrix, damage and native player state',async()=>{
const api=await wolfMomentumR14Fixture();let baseline=[],maxError=0,counts=[],events=[];
try{
 for(const legacy of [true,false]){
  const e=await api.summon({distance:6,sequence:['lunge']}),align=e.alignPose,nodes=[e.actor,e.carrier,...e.animator.nodes],rows=[];let refreshes=0;
  const ensure=e.animator.ensurePoseCurrent;e.animator.ensurePoseCurrent=function(...args){refreshes++;return ensure.apply(this,args);};
  if(legacy)e.alignPose=function(...args){align.apply(this,args);};
  try{
   for(let frame=0;frame<1200;frame++){
    if(api.f.battle.combat.hp<150)api.f.battle.combat.hp=500;
    if(api.controller.captured&&frame%7===0)api.f.battle.escapeGrab();
    api.step(1/60);
    const pose=nodes.flatMap(n=>Array.from(n.getWorldMatrix().m));
    const state=[e.brain.state,e.brain.mode,e.brain.ramStage,api.result.state,e.playerHp];rows.push(state);
    if(legacy)baseline.push(pose);else{assert.equal(pose.length,baseline[frame].length);for(let i=0;i<pose.length;i++)maxError=Math.max(maxError,Math.abs(pose[i]-baseline[frame][i]));assert.deepEqual(state,events[0][frame]);}
   }
   counts.push(refreshes);events.push(rows);
  }finally{e.animator.ensurePoseCurrent=ensure;if(legacy)e.alignPose=align;}
 }
 assert.ok(maxError<2e-5,'world-matrix mismatch '+maxError);assert.ok(counts[1]<counts[0]);
 const result={frames:1200,beforeRefreshes:counts[0],afterRefreshes:counts[1],maxWorldMatrixError:maxError,stageDamageAndPlayerStateEqual:true,scope:'Actual alpha-wolf and native player coupled CPU fixture, legacy second refresh A/B; not mobile GPU/FPS'};
 console.log(JSON.stringify(result));
}finally{await api.dispose();}

});
