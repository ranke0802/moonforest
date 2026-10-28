// Break runtime placement/BVH setup into short chunks. Startup stays synchronous
// behind the loading curtain. A frame boundary (not just a microtask) lets input
// and rendering continue between chunks; no geometry or texture is downgraded.
export class VillageWorkBudget {
  constructor(active,cancelled,{now=()=>performance.now(),frame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),milliseconds=3}={}){
    Object.assign(this,{active,cancelled,now,frame,milliseconds});this.started=now();
  }
  due(){return this.active()&&!this.cancelled()&&this.now()-this.started>=this.milliseconds;}
  async yield(){await this.frame();this.started=this.now();}
}
