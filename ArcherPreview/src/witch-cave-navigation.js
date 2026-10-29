import {VillageNavigation} from './village-navigation.js';
import {caveClearance} from './witch-cave-terrain.js';
import {ARENA_RADIUS} from './world-limits.js';
export class CaveNavigation extends VillageNavigation {
  free(p,radius,limit=ARENA_RADIUS){return caveClearance(p.x,p.z)>=radius+.08&&super.free(p,radius,limit);}
  segmentClear(a,b,radius=0,combat=false){
    if(!super.segmentClear(a,b,radius,combat))return false;
    const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.4));
    for(let i=0;i<=count;i++){const t=i/count;if(caveClearance(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t)<radius+.08)return false;}
    return true;
  }
  obstacleContact(from,delta,radius){
    let hit=super.obstacleContact(from,delta,radius);
    const count=Math.max(1,Math.ceil(Math.hypot(delta.x,delta.z)/.2)),end=hit?.time??1;
    for(let i=1;i<=count;i++){
      const time=Math.min(end,i/count),x=from.x+delta.x*time,z=from.z+delta.z*time;
      if(caveClearance(x,z)<radius+.08){
        let low=Math.max(0,(i-1)/count),high=time;
        for(let j=0;j<12;j++){const mid=(low+high)/2;if(caveClearance(from.x+delta.x*mid,from.z+delta.z*mid)>=radius+.08)low=mid;else high=mid;}
        const px=from.x+delta.x*low,pz=from.z+delta.z*low;
        const nx=caveClearance(px+.05,pz)-caveClearance(px-.05,pz),nz=caveClearance(px,pz+.05)-caveClearance(px,pz-.05),d=Math.hypot(nx,nz)||1;
        return {time:low,nx:nx/d,nz:nz/d,enemy:false};
      }
      if(time===end)break;
    }
    return hit;
  }
}
