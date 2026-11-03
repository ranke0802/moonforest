import {ArcRotateCamera,Matrix,NullEngine,Scene,TransformNode,Vector3,Viewport} from '@babylonjs/core';
import {VILLAGE_PLAINS_BOUNDARY,villageToPlains,plainsToVillage} from '../../src/village-plains-boundary.js';
import {FOREST_PLAINS_BOUNDARY,forestToPlains,plainsToForest} from '../../src/plains-forest-boundary.js';
import {FOREST_ROUTES} from '../../src/monster-forest-layout.js';
import {captureRoadHandoff} from '../../src/village-plains-handoff.js';
import {carryPortalPose} from '../../src/map-transition.js';
import {CameraFollow} from '../../src/camera-follow.js';
import {CameraPitch} from '../../src/camera-pitch.js';
import {CameraZoom} from '../../src/camera-zoom.js';
import {WARRIOR_DIMENSIONS} from '../../src/player-dimensions.js';

export const boundaryContracts=[
 {id:'village',character:'warrior-v3',map:'village',portal:VILLAGE_PLAINS_BOUNDARY.villagePortal,plainsPortal:VILLAGE_PLAINS_BOUNDARY.plainsPortal,yaw:VILLAGE_PLAINS_BOUNDARY.yaw,width:VILLAGE_PLAINS_BOUNDARY.roadWidth,samples:VILLAGE_PLAINS_BOUNDARY.villageSamples,toPlains:villageToPlains,fromPlains:plainsToVillage},
 {id:'forest',character:'warrior-v4',map:'monster-forest',portal:FOREST_PLAINS_BOUNDARY.forestPortal,plainsPortal:FOREST_PLAINS_BOUNDARY.plainsPortal,yaw:FOREST_PLAINS_BOUNDARY.yaw,width:FOREST_ROUTES[0].width,samples:FOREST_ROUTES[0].samples,toPlains:forestToPlains,fromPlains:plainsToForest},
];

// Follow the original sampled centre line, rather than resampling a shortened
// spline: the next control point bends the forest's nominally straight entry.
export function firstTriggerPose(contract,reverse=false){
 const points=contract.samples.filter(([x,z])=>Math.hypot(x-contract.portal.x,z-contract.portal.z)<13).map(([x,z])=>({x,z})).sort((a,b)=>reverse?b.z-a.z:a.z-b.z);
 const inside=p=>Math.hypot(p.x-contract.portal.x,p.z-contract.portal.z)<3;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];if(inside(a)||!inside(b))continue;
  let lo=0,hi=1;for(let n=0;n<45;n++){const t=(lo+hi)/2,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};if(inside(p))hi=t;else lo=t;}
  const t=Math.min(1,hi+1e-5),position={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},direction={x:b.x-a.x,z:b.z-a.z};
  if(reverse){const at=contract.toPlains(position),next=contract.toPlains({x:position.x+direction.x,z:position.z+direction.z});return {position:at,yaw:Math.atan2(next.x-at.x,next.z-at.z),canonical:position};}
  return {position,yaw:Math.atan2(direction.x,direction.z),canonical:position};
 }
 throw Error('Original road does not enter the portal: '+contract.id+' reverse='+reverse);
}

export function makeBoundaryCases(terrains,{width=1280,height=720,beta=1.35}={}){
 const engine=new NullEngine({renderWidth:width,renderHeight:height}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const camera=new ArcRotateCamera('actual-sdk-boundary-review',0,1.35,17,Vector3.Zero(),scene);camera.fov=.65;camera.minZ=.05;camera.maxZ=1024;
 const actor=new TransformNode('review-player-anchor',scene);actor.metadata={playerDimensions:WARRIOR_DIMENSIONS};
 const follow=new CameraFollow(),pitch=new CameraPitch(camera,{warrior:true}),zoom=new CameraZoom(camera);pitch.setBodyScale(WARRIOR_DIMENSIONS.ratio);
 const focus=pan=>{pitch.follow(follow.focus(actor,null).add(new Vector3(pan.x,pan.y,pan.z)),0,{snap:true});camera.getViewMatrix(true);camera.getProjectionMatrix(true);};
 const shot=(map,character,pan)=>({map,character,actor:{position:actor.position.asArray(),yaw:actor.rotation.y},camera:{alpha:camera.alpha,beta:camera.beta,radius:camera.radius,fov:camera.fov,verticalFov:true,minZ:camera.minZ,maxZ:camera.maxZ,position:camera.globalPosition.asArray(),target:camera.target.asArray(),pan:{...pan}},viewport:{width,height},projectionProbes:[[-3,0,-4],[3,0,4],[0,3,0],[-6,4,8],[6,2,-8]].map(([x,y,z])=>{const p=actor.position.add(new Vector3(x,y,z)),screen=Vector3.Project(p,Matrix.Identity(),camera.getTransformationMatrix(),new Viewport(0,0,width,height));return {position:p.asArray(),screen:screen.asArray()};})});
 const cases=[];
 try{for(const c of boundaryContracts)for(const reverse of [false,true]){
  const pose=firstTriggerPose(c,reverse),from=reverse?'warrior-plains':c.character,to=reverse?c.character:'warrior-plains',sourceMap=reverse?'great-plains':c.map,destinationMap=reverse?c.map:'great-plains',pan={x:0,y:0,z:0};
  actor.position.set(pose.position.x,0,pose.position.z);terrains[sourceMap].place(actor.position);actor.rotation.y=pose.yaw;
  camera.alpha=-Math.PI/2-pose.yaw;camera.beta=beta;camera.radius=17;zoom.apply();focus(pan);
  const before=shot(sourceMap,from,pan),handoff=captureRoadHandoff(from,to,actor,camera,pan);
  actor.position.set(handoff.position.x,0,handoff.position.z);terrains[destinationMap].place(actor.position);actor.rotation.y=handoff.yaw;camera.alpha=handoff.alpha;Object.assign(pan,handoff.pan);carryPortalPose(actor,camera,pan,{from,to});focus(pan);
  cases.push({id:c.id+(reverse?'-plains-to-native':'-native-to-plains'),boundary:c.id,reverse,canonicalTrigger:pose.canonical,before,after:shot(destinationMap,to,pan),handoff});
 }}finally{scene.dispose();engine.dispose();}
 return {cases,method:`Deterministic original-road first trigger; actual Babylon ArcRotate + production CameraFollow/CameraPitch/CameraZoom + capture/carry helpers. Forward orbit, beta${beta}, stable focus, default zoom clamp. This is a reproducible review pose, not a recorded player session.`,browserAutomation:false};
}
