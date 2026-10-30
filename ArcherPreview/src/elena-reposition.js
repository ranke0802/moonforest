import {ELENA_HOME,MOURNING_SIZE} from './elena-spec.js';

// Pick once after a cast. A tested straight segment needs no new path search
// each frame; ordinary collision constraints still handle moving actors.
export function chooseElenaReposition(origin,player,{phase=1,turn=0,radius,navigation,terrain,home=ELENA_HOME,length:travelLength}={}){
  radius??=phase===2?MOURNING_SIZE.radius:.34;
  const dx=player.x-origin.x,dz=player.z-origin.z,distance=Math.hypot(dx,dz),x=distance>.001?dx/distance:0,z=distance>.001?dz/distance:1;
  const side=turn%2?1:-1,length=travelLength??(phase===2?Math.max(2.1,radius+1.1-distance+.15):2.65);
  // Keep the same tactical distance from the body's surface, not its center.
  const growth=phase===2?Math.max(0,radius-.9):0,radial=distance<3.5+growth?-.85:distance>5.5+growth?.55:-.15;
  for(const shorten of [1,.6])for(const [along,across] of [[radial,side],[radial,-side],[-.65,side*.5],[-.65,-side*.5],[.5,side*.75],[.5,-side*.75]]){
    const norm=Math.hypot(along,across),step=length*shorten/norm;
    const target={x:origin.x+(x*along+z*across)*step,z:origin.z+(z*along-x*across)*step};
    if(Math.hypot(target.x-home.x,target.z-home.z)>(phase===2?MOURNING_SIZE.homeRadius:9.5))continue;
    const fromPlayer=Math.hypot(target.x-player.x,target.z-player.z);
    if(fromPlayer<radius+1.1||fromPlayer>7.5+growth)continue;
    if(terrain&&Math.abs(terrain.heightAt(target.x,target.z)-terrain.heightAt(origin.x,origin.z))>.8)continue;
    if(navigation&&(!navigation.free(target,radius)||!navigation.segmentClear(origin,target,radius)))continue;
    return target;
  }
  return null;
}

// Charge through the originally aimed position. Its complete floor segment
// is checked once before the warning is shown, and the aim never follows a dodge.
export function chooseElenaCharge(origin,player,{radius=MOURNING_SIZE.radius,navigation,terrain,home=ELENA_HOME}={}){
  const dx=player.x-origin.x,dz=player.z-origin.z,distance=Math.hypot(dx,dz),length=Math.min(6.3,distance+radius);
  if(distance<Math.max(2.5,radius+1.1))return null;
  const target={x:origin.x+dx/distance*length,z:origin.z+dz/distance*length};
  if(Math.hypot(target.x-home.x,target.z-home.z)>MOURNING_SIZE.homeRadius)return null;
  if(navigation&&(!navigation.free(target,radius)||!navigation.segmentClear(origin,target,radius)))return null;
  if(terrain){
    const start=terrain.heightAt(origin.x,origin.z),steps=Math.ceil(length/.35);
    for(let i=1;i<=steps;i++){const t=i/steps;if(Math.abs(terrain.heightAt(origin.x+(target.x-origin.x)*t,origin.z+(target.z-origin.z)*t)-start)>.65)return null;}
  }
  return target;
}

// A bounded local search for the enlarged resident. Keep the full-pose mask
// authoritative, but favour open, less recently visited places over a repeated
// left/right first match. This runs once per action, not once per frame.
export function chooseMourningReposition(origin,player,{turn=0,radius=MOURNING_SIZE.radius,navigation,terrain,home=ELENA_HOME,length=2.1,recent=[],recovery=false}={}){
  const dx=player.x-origin.x,dz=player.z-origin.z,distance=Math.hypot(dx,dz),heading=Math.atan2(dx,dz);
  const preferred=heading+(turn%2?1:-1)*Math.PI/2,minimum=recovery?radius+.35:radius+1.1;
  const contact=Math.max(0,Math.min(radius+.25,distance)-.03),ground=terrain?.heightAt(origin.x,origin.z);
  let best=null,bestScore=-Infinity;
  for(const fraction of [1,.66,.4])for(let direction=0;direction<12;direction++){
    const travel=Math.max(.8,length*fraction),angle=heading+direction*Math.PI/6+(turn%3-1)*.12;
    const x=Math.sin(angle)*travel,z=Math.cos(angle)*travel,target={x:origin.x+x,z:origin.z+z};
    const fromPlayer=Math.hypot(target.x-player.x,target.z-player.z);
    if(fromPlayer<minimum||fromPlayer>8.5||Math.hypot(target.x-home.x,target.z-home.z)>MOURNING_SIZE.homeRadius)continue;
    // Normal sidesteps must not try to pass through the player and then spend
    // their whole action being pushed back by the physical contact separation.
    const t=Math.max(0,Math.min(1,(dx*x+dz*z)/(travel*travel)));
    if(Math.hypot(origin.x+x*t-player.x,origin.z+z*t-player.z)<contact)continue;
    if(terrain&&Math.abs(terrain.heightAt(target.x,target.z)-ground)>.8)continue;
    if(navigation&&(!navigation.free(target,radius)||!navigation.segmentClear(origin,target,radius)))continue;
    const clearance=navigation?.clearanceAt?.(target.x,target.z,radius),open=Number.isFinite(clearance)?Math.max(0,Math.min(2,clearance-radius-.08)):0;
    let repeat=0;
    for(let i=0;i<recent.length;i++)repeat+=Math.max(0,1-Math.hypot(target.x-recent[i].x,target.z-recent[i].z)/2.2)*(i+1)/recent.length;
    const score=travel*.45+open*(recovery?1.2:.6)-Math.abs(fromPlayer-5.2)*.18+Math.cos(angle-preferred)*.28-repeat*1.8;
    if(score>bestScore){bestScore=score;best=target;}
  }
  return best;
}
