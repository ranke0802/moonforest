import {Vector3} from '@babylonjs/core';
import {MeleeContactGate} from './melee-collision.js';

// Falling/getting up remains vulnerable to real weapon contact. The shared
// biped convenience radius must not turn an empty swing beside a wolf into a hit.
export class WolfV02ContactGate extends MeleeContactGate{
 collect(sample){
  sample.rangeContact=false;const result=super.collect(sample);
  for(const hit of result.hits)if(hit.id==='jump-cut'&&hit.burstIndex!=null){hit.cosmeticHeavy=hit.heavy;hit.heavy=hit.burstIndex===1;}
  return result;
 }
}

// Model-metre capsules fitted to the approved R8 CPU-skinned surface, in the
// named bone's local frame. A bone pivot alone misses the mane, belly and muzzle.
// Keep leg gaps empty; these are separate anatomy volumes, not an actor sphere.
const fit=(name,node,a,b,radius)=>Object.freeze({name,node,a:Object.freeze(a),b:Object.freeze(b),radius});
export const WOLF_V02_HURT_VOLUMES=Object.freeze([
 fit('haunch','pelvis',[-.025,-.08,.015],[-.025,.15,.015],.355),
 fit('flank','spine',[-.04,.02,.025],[-.04,.31,.025],.37),
 fit('ribcage','chest',[-.025,-.03,.035],[-.025,.29,.035],.40),
 fit('belly','chest',[-.025,.02,.235],[-.025,.26,.235],.25),
 fit('flank.L','chest',[-.18,.03,.22],[-.18,.26,.22],.25),
 fit('flank.R','chest',[.15,.03,.22],[.15,.26,.22],.25),
 fit('mane','neck',[-.04,-.08,.055],[-.04,.18,.055],.415),
 fit('skull','head',[-.025,.055,-.005],[-.025,.22,-.005],.26),
 fit('muzzle','head',[0,.23,.13],[0,.385,.13],.115),
 fit('jaw','jaw',[0,.055,.01],[0,.16,.01],.075),
 ...['L','R'].flatMap(side=>[
  fit('fore.'+side+'.upper','fore.'+side+'.upper',[side==='L'?.035:-.035,.09,-.025],[side==='L'?.035:-.035,.31,-.025],.17),
  fit('fore.'+side+'.lower','fore.'+side+'.lower',[0,.025,-.03],[0,.24,-.03],.10),
  fit('hind.'+side+'.upper','hind.'+side+'.upper',[0,.13,0],[0,.33,0],.16),
  fit('hind.'+side+'.lower','hind.'+side+'.lower',[0,.02,.025],[0,.32,.025],.12),
 ]),
]);

export class WolfV02HurtVolumes{
 constructor(nodes,scale){
  this.bindings=WOLF_V02_HURT_VOLUMES.filter(fit=>nodes[fit.node]).map(fit=>({
   node:nodes[fit.node],a:Vector3.FromArray(fit.a),b:Vector3.FromArray(fit.b),
   volume:{name:fit.name,points:[[0,0,0],[0,0,0]],radius:fit.radius*scale},
  }));
  this.capsules=this.bindings.map(binding=>binding.volume);this.scratch=new Vector3();
  const groups=new Map();for(const binding of this.bindings){let group=groups.get(binding.node);if(!group){group={node:binding.node,flag:null,bindings:[]};groups.set(binding.node,group);}group.bindings.push(binding);}
  this.groups=[...groups.values()];this.transforms=0;this.reused=0;
 }
 sample(){
  for(const group of this.groups){
   const matrix=group.node.getWorldMatrix();
   if(Number.isFinite(matrix.updateFlag)&&group.flag===matrix.updateFlag){this.reused+=group.bindings.length;continue;}group.flag=matrix.updateFlag;
   for(const binding of group.bindings){const points=binding.volume.points;
   Vector3.TransformCoordinatesToRef(binding.a,matrix,this.scratch);points[0][0]=this.scratch.x;points[0][1]=this.scratch.y;points[0][2]=this.scratch.z;
   Vector3.TransformCoordinatesToRef(binding.b,matrix,this.scratch);points[1][0]=this.scratch.x;points[1][1]=this.scratch.y;points[1][2]=this.scratch.z;
   this.transforms+=2;}
  }
  return this.capsules;
 }
}
