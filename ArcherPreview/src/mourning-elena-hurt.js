import {Vector3} from '@babylonjs/core';

const segment=(name,a,b,radius)=>({name,a,b,radius});
const limbs=['FrontHand.L','MidHand.L','OuterHand.L','InnerHand.L','RearHand.L','RearInnerHand.R','RearOuterHand.R','OuterHand.R','MidHand.R'];
// Fitted to CPU-skinned r7 walk/cast surfaces, in each bone's local coordinates.
// A palm's pivot lies at its wrist, so a wrist sphere alone misses the fingers.
const fitted={
  'MidHand.R.upper':[[.0655,.0833,-.0752],[.0212,.1416,-.0213],.225],
  'OuterHand.R.upper':[[.0268,.1352,-.0812],[.0377,.1851,.0286],.285],
  'RearHand.L.upper':[[-.0927,.1469,.0194],[.0145,.19,.0062],.16],
  'RearHand.L.lower':[[-.0324,.04,.0801],[.0293,.0906,-.0177],.285],
  'RearInnerHand.R.lower':[[-.029,.0694,-.0196],[.0722,.1243,.0386],.255],
  'OuterHand.R.lower':[[.0069,-.0133,-.0268],[.0055,.1424,.0158],.325],
  'MidHand.L.hand':[[-.0144,.0365,.0571],[.0262,.0849,-.0484],.25],
  'OuterHand.L.hand':[[.0163,.0412,.0457],[-.0109,.063,-.0361],.20],
  'InnerHand.L.hand':[[.0123,.0287,.0325],[-.0092,.095,-.0675],.28],
  'RearHand.L.hand':[[.0353,.0353,.0315],[-.0309,.1003,-.0561],.24],
  'RearInnerHand.R.hand':[[.0344,.0124,.0376],[-.0209,.077,-.0382],.18],
  'RearOuterHand.R.hand':[[-.0523,.0469,.0169],[.052,.0718,-.036],.22],
  'OuterHand.R.hand':[[.0147,.0435,.0381],[.0015,.0878,-.0721],.285],
  'MidHand.R.hand':[[-.0357,.0473,.0065],[.0591,.1434,-.0256],.325],
};
const limbSegment=(name,part,from,to,radius)=>{
  const fit=fitted[name+'.'+part],node='DEF_'+name+'_'+from;
  return fit?segment(name+'.'+part,{node,offset:fit[0]},{node,offset:fit[1]},fit[2]):segment(name+'.'+part,node,'DEF_'+name+'_'+to,radius);
};
// World-metre radii follow the packed rig's actual asymmetric anatomy. Each
// limb stays separate so the spaces between its planted hands remain empty.
export const MOURNING_HURT_SEGMENTS=Object.freeze([
  segment('abdomen','DEF_Abdomen','DEF_Spine',.43),
  segment('spine','DEF_Spine','DEF_Chest',.32),
  segment('chest','DEF_Chest','DEF_Neck',.31),
  segment('head','DEF_Neck',{node:'DEF_Head',offset:[0,.05,0]},.24),
  ...['OuterHand.L','OuterHand.R','RearHand.L','RearOuterHand.R'].map(name=>segment('abdomen.'+name,'DEF_Abdomen','DEF_'+name+'_UpperArm',.35)),
  ...limbs.flatMap(name=>[
    limbSegment(name,'upper','UpperArm','Forearm',name==='RearOuterHand.R'?.35:name==='FrontHand.L'?.28:.23),
    limbSegment(name,'lower','Forearm','Palm',name==='FrontHand.L'?.29:name==='RearOuterHand.R'?.26:.24),
    limbSegment(name,'hand','Palm','Finger3_3',name==='FrontHand.L'?.37:.22),
  ]),
  // The large casting hand spreads its digits; five narrow fingers preserve
  // that shape without filling the entire hand's bounding sphere.
  ...[1,2,3,4,5].map(index=>segment('FrontHand.L.finger'+index,'DEF_FrontHand.L_Finger'+index+'_1','DEF_FrontHand.L_Finger'+index+'_3',.095)),
  segment('FrontFoot.R.thigh','DEF_FrontFoot.R_Thigh','DEF_FrontFoot.R_Shin',.23),
  segment('FrontFoot.R.shin','DEF_FrontFoot.R_Shin','DEF_FrontFoot.R_Foot',.20),
  segment('FrontFoot.R.foot','DEF_FrontFoot.R_Foot','DEF_FrontFoot.R_Toe3_3',.18),
  ...['L','R'].flatMap(side=>[
    segment('prayer.'+side+'.upper','DEF_Prayer_UpperArm.'+side,'DEF_Prayer_Forearm.'+side,.11),
    segment('prayer.'+side+'.lower','DEF_Prayer_Forearm.'+side,'DEF_Prayer_Hand.'+side,.11),
    segment('prayer.'+side+'.hand','DEF_Prayer_Hand.'+side,'DEF_Prayer_Finger3_3.'+side,.09),
  ]),
]);

/** Binds once per resident; sampling only writes already allocated endpoints. */
export class MourningHurtVolumes {
  constructor(nodes){
    this.endpoints=[];const points=new Map();
    const bind=descriptor=>{
      const name=typeof descriptor==='string'?descriptor:descriptor.node,offset=descriptor.offset;
      const key=name+(offset?':'+offset.join(','):'');if(points.has(key))return points.get(key);
      const node=nodes[name];if(!node)return null;
      const point=[0,0,0];this.endpoints.push({node,point,offset:offset?Vector3.FromArray(offset):null});points.set(key,point);return point;
    };
    this.capsules=MOURNING_HURT_SEGMENTS.flatMap(({name,a,b,radius})=>{const first=bind(a),last=bind(b);return first&&last?[{name,points:[first,last],radius}]:[];});
    this.scratch=new Vector3();
  }
  sample(){
    for(const {node,point,offset} of this.endpoints){
      const position=offset?Vector3.TransformCoordinatesToRef(offset,node.getWorldMatrix(),this.scratch):node.getAbsolutePosition();
      point[0]=position.x;point[1]=position.y;point[2]=position.z;
    }
    return this.capsules;
  }
}
