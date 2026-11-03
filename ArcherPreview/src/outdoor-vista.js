import {VILLAGE_PLAINS_BOUNDARY as boundary} from './village-plains-boundary.js';

export const PLAINS_VISTA_FAR=1024;
export const VILLAGE_MOUNTAIN_SCALE=Object.freeze([1.9,1.3,1.9]);
const vistaRadius=350,eyeHeight=1.5;
// Preserve the village's peak directions/heights as seen at its gateway, while
// moving the background beyond the larger plains. Keeping some source depth
// separates the two ridge layers. This is built once, never deformed per frame.
export function plainsVistaPositions(source){
 const out=new Float32Array(source.length),a=boundary.yaw,c=Math.cos(a),s=Math.sin(a),anchor=boundary.plainsPortal;
 for(let i=0;i<source.length;i+=3){
  const vx=source[i]*1.9-boundary.villagePortal.x,vz=source[i+2]*1.9-boundary.villagePortal.z;
  const dx=c*vx+s*vz,dz=-s*vx+c*vz,d=Math.max(.001,Math.hypot(dx,dz)),ux=dx/d,uz=dz/d;
  const dot=anchor.x*ux+anchor.z*uz;
  const shell=-dot+Math.sqrt(dot*dot+vistaRadius*vistaRadius-anchor.x*anchor.x-anchor.z*anchor.z);
  const scale=Math.max(1,(shell+d*.18)/d);
  out[i]=anchor.x+dx*scale;out[i+1]=eyeHeight+(source[i+1]*1.3-eyeHeight)*scale;out[i+2]=anchor.z+dz*scale;
 }
 return out;
}

const states=new WeakMap();
export function configureOutdoorVista(world,{village=true,plains=false}={}){
 const mesh=world.mountains;let state=states.get(mesh);
 if(!state){state={base:Float32Array.from(mesh.getVerticesData('position')),plains:null,mode:'base'};states.set(mesh,state);}
 const mode=plains?'plains':'base';
 if(state.mode!==mode){
  if(plains&&!state.plains)state.plains=plainsVistaPositions(state.base);
  mesh.setVerticesData('position',plains?state.plains:state.base,false);mesh.refreshBoundingInfo();state.mode=mode;
 }
 mesh.unfreezeWorldMatrix();mesh.scaling.set(...(plains?[1,1,1]:village?VILLAGE_MOUNTAIN_SCALE:[1,1,1]));mesh.freezeWorldMatrix();
 const yaw=plains?boundary.yaw:0;
 if(world.sky?.mesh)world.sky.mesh.rotation.y=yaw;
 world.lighting?.setWorldYaw(yaw);
 if(world.camera)world.camera.maxZ=plains?PLAINS_VISTA_FAR:village?350:220;
}
