import {CaveNavigation} from './witch-cave-navigation.js';
import {mourningCaveClearance} from './mourning-cave-clearance.js';
import {MOURNING_CAVE_CLEARANCE_DATA as data} from './mourning-cave-clearance-data.js';
import {ARENA_RADIUS} from './world-limits.js';

// Full-pose environment clearance is independent of the 1.9 m combat core.
// The bake covers rotation, walking, casting, hit reactions and the halo orbit;
// no render geometry, skinning or morph processing runs in collision queries.
export class MourningCaveNavigation extends CaveNavigation {
  clearanceAt(x,z,radius=0){return Math.min(super.clearanceAt(x,z,radius),mourningCaveClearance(x,z)+radius);}
  segmentClear(a,b,radius=0,combat=false){
    if(!super.segmentClear(a,b,radius,combat))return false;
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    if(length<1e-7)return true;
    // Fixed 40 cm samples can jump across a narrow concave corner of the
    // full-pose region even though actual swept movement stops there. Advance
    // only inside each point's certified safe ball; reject costly edge grazes.
    let travelled=0;
    for(let steps=0;steps<160;steps++){
      const t=travelled/length,margin=mourningCaveClearance(a.x+dx*t,a.z+dz*t)-.08;
      if(margin<1e-7)return false;
      if(length-travelled<=margin)return true;
      travelled+=margin*.9;
    }
    return false;
  }
  findFree(p,radius,limit=ARENA_RADIUS,occupied=[]){
    const available=q=>this.free(q,radius,limit)&&occupied.every(o=>Math.hypot(q.x-o.x,q.z-o.z)>=radius+(o.radius??radius)+.12);
    if(available(p))return {x:p.x,z:p.z};
    // A summon requested in a narrow cave passage still has a valid destination
    // in the dwelling. Search only baked safe cells, not expanding world rings.
    let best=null,cost=Infinity;
    for(let r=0;r<data.runs.length;r+=2)for(let i=data.runs[r];i<data.runs[r]+data.runs[r+1];i++){
      const q={x:data.minX+(i%data.width+.5)*data.step,z:data.minZ+(Math.floor(i/data.width)+.5)*data.step};
      const d=(q.x-p.x)**2+(q.z-p.z)**2;
      if(d<cost&&available(q)){best=q;cost=d;}
    }
    if(!best)throw new Error('비탄의 마녀가 안전하게 등장할 거처 공간이 없습니다.');
    return best;
  }
}
