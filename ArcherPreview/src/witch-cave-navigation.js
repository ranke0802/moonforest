import {VillageNavigation} from './village-navigation.js';
import {caveClearance} from './witch-cave-terrain.js';
import {caveMeshClearance} from './witch-cave-collision.js';
import {ARENA_RADIUS} from './world-limits.js';
const clearance=(x,z)=>Math.min(caveClearance(x,z),caveMeshClearance(x,z));
export class CaveNavigation extends VillageNavigation {
  clearanceAt(x,z,radius=0){return clearance(x,z);}
  free(p,radius,limit=ARENA_RADIUS){return this.clearanceAt(p.x,p.z,radius)>=radius+.08&&super.free(p,radius,limit);}
  segmentClear(a,b,radius=0,combat=false){
    if(!super.segmentClear(a,b,radius,combat))return false;
    const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.4));
    for(let i=0;i<=count;i++){const t=i/count;if(this.clearanceAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,radius)<radius+.08)return false;}
    return true;
  }
  obstacleContact(from,delta,radius){
    let hit=super.obstacleContact(from,delta,radius);
    const count=Math.max(1,Math.ceil(Math.hypot(delta.x,delta.z)/.2)),end=hit?.time??1;
    for(let i=1;i<=count;i++){
      const time=Math.min(end,i/count),x=from.x+delta.x*time,z=from.z+delta.z*time;
      if(this.clearanceAt(x,z,radius)<radius+.08){
        let low=Math.max(0,(i-1)/count),high=time;
        for(let j=0;j<12;j++){const mid=(low+high)/2;if(this.clearanceAt(from.x+delta.x*mid,from.z+delta.z*mid,radius)>=radius+.08)low=mid;else high=mid;}
        const px=from.x+delta.x*low,pz=from.z+delta.z*low;
        const nx=this.clearanceAt(px+.05,pz,radius)-this.clearanceAt(px-.05,pz,radius),nz=this.clearanceAt(px,pz+.05,radius)-this.clearanceAt(px,pz-.05,radius),d=Math.hypot(nx,nz)||1;
        return {time:low,nx:nx/d,nz:nz/d,enemy:false};
      }
      if(time===end)break;
    }
    return hit;
  }
}
