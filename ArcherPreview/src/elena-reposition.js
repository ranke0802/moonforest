import {ELENA_HOME} from './elena-spec.js';

// Pick once after a cast. A tested straight segment needs no new path search
// each frame; ordinary collision constraints still handle moving actors.
export function chooseElenaReposition(origin,player,{phase=1,turn=0,radius=.34,navigation,terrain,home=ELENA_HOME,length:travelLength}={}){
  const dx=player.x-origin.x,dz=player.z-origin.z,distance=Math.hypot(dx,dz),x=distance>.001?dx/distance:0,z=distance>.001?dz/distance:1;
  const side=turn%2?1:-1,length=travelLength??(phase===2?2.1:2.65);
  const radial=distance<3.5?-.85:distance>5.5?.55:-.15;
  for(const shorten of [1,.6])for(const [along,across] of [[radial,side],[radial,-side],[-.65,side*.5],[-.65,-side*.5],[.5,side*.75],[.5,-side*.75]]){
    const norm=Math.hypot(along,across),step=length*shorten/norm;
    const target={x:origin.x+(x*along+z*across)*step,z:origin.z+(z*along-x*across)*step};
    if(Math.hypot(target.x-home.x,target.z-home.z)>9.5)continue;
    const fromPlayer=Math.hypot(target.x-player.x,target.z-player.z);
    if(fromPlayer<radius+1.1||fromPlayer>7.5)continue;
    if(terrain&&Math.abs(terrain.heightAt(target.x,target.z)-terrain.heightAt(origin.x,origin.z))>.8)continue;
    if(navigation&&(!navigation.free(target,radius)||!navigation.segmentClear(origin,target,radius)))continue;
    return target;
  }
  return null;
}

// A charge closes the gap without contact damage. Its complete floor segment
// is checked once before the warning is shown, and the aim never follows a dodge.
export function chooseElenaCharge(origin,player,{radius=.9,navigation,terrain,home=ELENA_HOME}={}){
  const dx=player.x-origin.x,dz=player.z-origin.z,distance=Math.hypot(dx,dz),length=Math.min(6.3,distance-radius-.95);
  if(length<2)return null;
  const target={x:origin.x+dx/distance*length,z:origin.z+dz/distance*length};
  if(Math.hypot(target.x-home.x,target.z-home.z)>9.5)return null;
  if(navigation&&(!navigation.free(target,radius)||!navigation.segmentClear(origin,target,radius)))return null;
  if(terrain){
    const start=terrain.heightAt(origin.x,origin.z),steps=Math.ceil(length/.35);
    for(let i=1;i<=steps;i++){const t=i/steps;if(Math.abs(terrain.heightAt(origin.x+(target.x-origin.x)*t,origin.z+(target.z-origin.z)*t)-start)>.65)return null;}
  }
  return target;
}
