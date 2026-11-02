import {isWorldCharacter,mapForCharacter} from './map-route.js';
import {villageTravelLimit} from './map-travel.js';

export const MAP_RESUME_KEY='moonforest-map-position-v1';
const limit=(character,p)=>character==='warrior-plains'?106:character==='warrior-v3'?villageTravelLimit(p,48):character==='warrior-v4'?62:74;
const valid=p=>p&&[p.x,p.z,p.yaw].every(Number.isFinite)&&Math.abs(p.x)<=110&&Math.abs(p.z)<=110&&Math.abs(p.yaw)<1e6;
function read(storage){try{const data=JSON.parse(storage?.getItem(MAP_RESUME_KEY)??'null');return data?.version===1&&data.maps&&typeof data.maps==='object'?data.maps:{};}catch{return {};}}
function free(world,character,p,radius){return Number.isFinite(world.terrain.heightAt(p.x,p.z))&&world.navigation.free(p,radius,limit(character,p));}
export function readMapResume(storage,character,world,{radius=.289,portalArrival=false}={}){
 if(portalArrival||!isWorldCharacter(character)||mapForCharacter(character)!==world.mapId)return null;
 const saved=read(storage)[character];if(!valid(saved))return null;
 let point={x:saved.x,z:saved.z};
 if(!free(world,character,point,radius)){
  point=null;
  // A changed wall may cover an old save. Only relocate nearby on the same
  // shelf; never search the entire dungeon or respawn across a ravine.
  const floor=world.terrain.heightAt(saved.x,saved.z);
  for(let r=.3;r<=3&&!point;r+=.3)for(let i=0;i<24;i++){
   const p={x:saved.x+Math.sin(i*Math.PI/12)*r,z:saved.z+Math.cos(i*Math.PI/12)*r};
   if(free(world,character,p,radius)&&Math.abs(world.terrain.heightAt(p.x,p.z)-floor)<.8){point=p;break;}
  }
  if(!point)return null;
 }
 const camera=saved.camera;
 return {...point,yaw:saved.yaw,camera:camera&&[camera.alpha,camera.beta,camera.radius].every(Number.isFinite)&&camera.beta>0&&camera.beta<Math.PI&&camera.radius>=.8&&camera.radius<=200?{...camera}:null};
}
export class MapResumeStore{
 constructor(storage){this.storage=storage;this.next=0;this.last='';this.writes=0;}
 save({character,world,actor,camera,ready=true,alive=true,radius=.289},now=performance.now(),{force=false}={}){
  if(!ready||!alive||!actor||!isWorldCharacter(character)||world.mapId!==mapForCharacter(character)||(!force&&now<this.next))return false;
  this.next=now+2000;
  const pose={x:actor.position.x,z:actor.position.z,yaw:actor.rotation.y};if(!valid(pose)||!free(world,character,pose,radius))return false;
  const round=n=>Math.round(n*1000)/1000;
  const record={x:round(pose.x),z:round(pose.z),yaw:round(pose.yaw),camera:{alpha:round(camera.alpha),beta:round(camera.beta),radius:round(camera.radius)}};
  const signature=character+JSON.stringify(record);if(signature===this.last)return false;
  const maps=read(this.storage),clean={};for(const id of ['warrior-v3','warrior-plains','warrior-v4','warrior-v5'])if(valid(maps[id]))clean[id]=maps[id];clean[character]=record;
  try{this.storage?.setItem(MAP_RESUME_KEY,JSON.stringify({version:1,maps:clean}));this.last=signature;this.writes++;return !!this.storage;}catch{return false;}
 }
}
