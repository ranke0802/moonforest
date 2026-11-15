// Break runtime placement/BVH setup into short chunks. Startup stays synchronous
// behind the loading curtain. A frame boundary (not just a microtask) lets input
// and rendering continue between chunks; no geometry or texture is downgraded.
import {createFrameWorkLease} from './frame-work-coordinator.js';
export class VillageWorkBudget {
  constructor(active,cancelled,{now=()=>performance.now(),frame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),milliseconds=3,scene,coordinator}={}){
    Object.assign(this,{active,cancelled,now,frame,milliseconds});this.started=now();
    this.shared=createFrameWorkLease({scene,coordinator,now});this.sharedStarted=false;
  }
  due(){if(!this.active()||this.cancelled()){this.shared?.reset();this.sharedStarted=false;return false;}if(this.sharedStarted)this.shared?.checkpoint();else{this.shared?.reset();this.sharedStarted=true;}return this.now()-this.started>=this.milliseconds||this.shared?.due()===true;}
  async yield(){this.shared?.checkpoint();do{const token=this.shared?.beforeWait();await this.frame();this.shared?.afterWait(token);}while(!this.cancelled()&&this.active()&&this.shared?.due());this.started=this.now();}
}
