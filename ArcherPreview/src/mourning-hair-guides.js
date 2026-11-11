import {Matrix,Quaternion,Vector3} from '@babylonjs/core';

// Approved 49,982-triangle repair: follow the abdomen only during slam/hit.
// Capture the original idle once. No vertex/weight/clip edits, physics or timers.
export class MourningHairGuides {
  constructor(animator){
    this.animator=animator;this.enabled=true;this.strength=1;
    this.abdomen=animator.asset.transformNodes.find(n=>n.name==='DEF_Abdomen');
    const inverse=this.abdomen.getWorldMatrix().clone().invert();
    this.v=new Vector3();this.q=Quaternion.Identity();this.s=new Vector3();
    this.guides=animator.asset.transformNodes.filter(n=>/^DEF_Hair_\d+_\d+$/.test(n.name)).map(bone=>{
      const depth=Number(bone.name.split('_').at(-1));
      return {bone,depth,follow:({1:.40,2:.85,3:1}[depth]??1),reference:bone.getWorldMatrix().multiply(inverse),current:Matrix.Identity(),target:Matrix.Identity(),local:Matrix.Identity(),parentInv:Matrix.Identity(),cp:new Vector3(),cq:Quaternion.Identity(),cs:new Vector3(),tp:new Vector3(),tq:Quaternion.Identity(),ts:new Vector3()};
    }).sort((a,b)=>a.depth-b.depth);
  }
  apply(){
    const a=this.animator;
    if(!(typeof this.enabled==='function'?this.enabled():this.enabled)||a.current==='dead')return;
    const slam=a.current==='cast'&&a.castVariant==='cast_slam'?(a.weights?.cast??0):0;
    const weight=Math.max(slam,a.weights?.hit??0,a.hitPulseWeight??0);
    if(weight<=0)return;
    // Snapshot before changing parents, so child compensation never compounds.
    for(const c of this.guides){c.current.copyFrom(c.bone.getWorldMatrix());c.reference.multiplyToRef(this.abdomen.getWorldMatrix(),c.target);}
    for(const c of this.guides){
      const t=weight*c.follow*this.strength;
      c.current.decompose(c.cs,c.cq,c.cp);c.target.decompose(c.ts,c.tq,c.tp);
      Vector3.LerpToRef(c.cp,c.tp,t,this.v);Quaternion.SlerpToRef(c.cq,c.tq,t,this.q);Vector3.LerpToRef(c.cs,c.ts,t,this.s);
      Matrix.ComposeToRef(this.s,this.q,this.v,c.target);c.bone.parent.getWorldMatrix().invertToRef(c.parentInv);c.target.multiplyToRef(c.parentInv,c.local);
      c.local.decompose(c.bone.scaling,c.bone.rotationQuaternion,c.bone.position);c.bone.markAsDirty();c.bone.computeWorldMatrix(true);
    }
  }
}

// Install once on the real gameplay animator, after its original idle reset.
// Keep the independently fingerprinted combat sampler intact. Contact/camera
// refreshes must never reapply this sampled visual correction.
export function installMourningHairGuides(animator){
  if(animator.hairGuides)return animator.hairGuides;
  animator.reset();animator.refreshPose();
  const guides=new MourningHairGuides(animator),refresh=animator.refreshPose.bind(animator),sample=animator.sample.bind(animator);let pending=false;
  animator.hairGuides=guides;
  animator.sample=function(dt){pending=true;try{return sample(dt);}finally{pending=false;}};
  animator.refreshPose=function(){refresh();if(!pending||this.current==='dead')return;pending=false;guides.apply();};
  return guides;
}
