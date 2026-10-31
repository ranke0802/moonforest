import {Vector3} from '@babylonjs/core';
import {upwardFocusLift} from './camera-pitch.js';
import {STABLE_PLAYER_FOCUS_HEIGHT} from './camera-follow.js';
import {caveRoofHeight} from './witch-cave-layout.js';
import {CAVE_CAMERA_DATA as DATA} from './witch-cave-camera-data.js';

// Sparse occupancy: a 16-bit cell lookup plus one 256-bit profile per run.
// Empty air allocates no vertical profile, and repeated neighbouring columns
// share the same immutable bits.
const decode=text=>{const raw=atob(text),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes.buffer;};
const lookup=new Uint16Array(decode(DATA.lookup)),profiles=new Uint32Array(decode(DATA.profiles));
// Match caveCeiling's actual 64-sector / 12-ring triangles. The analytic dome
// lies above its chords near the rim, so the formula alone can miss a ceiling.
const roofVertices=new Float64Array(13*65*3);
for(let ring=0;ring<=12;ring++)for(let i=0;i<=64;i++){const angle=i/64*Math.PI*2,x=Math.cos(angle)*ring*6,z=Math.sin(angle)*ring*6,at=(ring*65+i)*3;roofVertices[at]=x;roofVertices[at+1]=caveRoofHeight(x,z)+.6*Math.sin(x*.24)*Math.cos(z*.19);roofVertices[at+2]=z;}
function roofTriangleHeight(x,z,a,b,c){
 a*=3;b*=3;c*=3;const ax=roofVertices[a],az=roofVertices[a+2],bx=roofVertices[b],bz=roofVertices[b+2],cx=roofVertices[c],cz=roofVertices[c+2];
 const denom=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz),u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/denom,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/denom;
 return u>=-1e-6&&v>=-1e-6&&u+v<=1.000001?u*roofVertices[a+1]+v*roofVertices[b+1]+(1-u-v)*roofVertices[c+1]:NaN;
}
export function caveCameraCeilingHeight(x,z){
 const angle=(Math.atan2(z,x)+Math.PI*2)%(Math.PI*2),sector=Math.min(63,Math.floor(angle/(Math.PI*2)*64)),width=Math.PI*2/64;
 const ring=Math.max(1,Math.min(12,Math.ceil(Math.hypot(x,z)*Math.cos(angle-(sector+.5)*width)/(6*Math.cos(width*.5))))),at=ring*65+sector+1;
 const first=roofTriangleHeight(x,z,at,at-1,at-66);return Number.isFinite(first)?first:roofTriangleHeight(x,z,at,at-66,at-65);
}
// Conservative near-LOD voxels, not body navigation: an arch can block a
// raised camera while remaining open to a player underneath it.
export function caveCameraRockBlocked(x,y,z,padding=.3){
 const x0=Math.floor((x-padding-DATA.min)/DATA.step),x1=Math.floor((x+padding-DATA.min)/DATA.step),z0=Math.floor((z-padding-DATA.min)/DATA.step),z1=Math.floor((z+padding-DATA.min)/DATA.step);
 const from=Math.max(0,Math.floor((y-padding-DATA.bottom)/DATA.unit)),to=Math.min(255,Math.floor((y+padding-DATA.bottom)/DATA.unit));
 for(let zz=Math.max(0,z0);zz<=Math.min(DATA.size-1,z1);zz++)for(let xx=Math.max(0,x0);xx<=Math.min(DATA.size-1,x1);xx++){
  const i=lookup[zz*DATA.size+xx]*8;if(i)for(let layer=from;layer<=to;layer++)if(profiles[i+(layer>>5)]&(1<<(layer&31)))return true;
 }
 return false;
}
export function caveCameraBlocked(terrain,x,y,z,padding=.3){
 if(Math.hypot(x,z)>70)return true;
 if(terrain.heightAt(x,z)+padding>=y)return true;
 if(caveCameraCeilingHeight(x,z)-padding<=y)return true;
 return caveCameraRockBlocked(x,y,z,padding);
}
// Trace the family of valid orbit eyes, including CameraPitch's upward lift.
// No picking, render-mesh access or allocation is performed per sample.
export function caveSafeCameraRadius(terrain,base,alpha,beta,requested,{padding=.3,step=.3,minimum=.15}={}){
 const cos=Math.cos(beta),sin=Math.sin(beta),dx=Math.cos(alpha)*sin,dz=Math.sin(alpha)*sin;
 const blocked=r=>{const lift=Math.max(0,-.35-r*cos);return caveCameraBlocked(terrain,base.x+dx*r,base.y+lift+cos*r,base.z+dz*r,padding);};
 let safe=Math.min(minimum,requested);
 if(blocked(safe))return safe;
 for(let r=Math.min(safe+step,requested);r<=requested;){
  if(blocked(r)){let end=r;for(let i=0;i<8;i++){const mid=(safe+end)*.5;if(blocked(mid))end=mid;else safe=mid;}return safe;}
  safe=r;if(r===requested)break;r=Math.min(r+step,requested);
 }
 return safe;
}

// beginFrame is called before visibility/streaming/HP projection and render.
// End after all screen projection: only the requested radius/target are then
// restored, keeping wheel/pinch/zoom settings independent of wall correction.
export class CaveCameraGuard {
 constructor(world){
  this.world=world;this.base=new Vector3();this.savedTarget=new Vector3();this.renderTarget=new Vector3();this.lastKey=new Float64Array(6).fill(NaN);this.applied=false;this.ready=false;this.effectiveRadius=Infinity;this.dt=0;this.disposed=false;
  this.sceneDispose=world.scene.onDisposeObservable.addOnce(()=>this.dispose());
 }
 follow(baseFocus,dt=0,{stable=false}={}){this.base.copyFrom(baseFocus);this.dt=Math.max(0,Math.min(.1,dt));this.stable=stable;this.ready=true;}
 beginFrame(){
  this.endFrame();const {world}=this,camera=world.camera;
  if(this.disposed||!this.ready||!world.cave){this.effectiveRadius=Infinity;return false;}
  camera.update();this.savedRadius=camera.radius;this.savedTarget.copyFrom(camera.target);
  // Preserve follow smoothing in XZ; the raw vertical anchor keeps the eye at
  // the same safe height when the unrestricted pitch lifts the look target.
  this.base.x=camera.target.x;this.base.z=camera.target.z;
  // A four-metre user pan can put the requested pivot inside a narrow passage
  // wall. Clamp that pivot along the path from the actual player, rather than
  // lifting it onto the high terrain shoulder and looking into the next room.
  const actor=world.caveFog?.playerRoot?.position??(world.caveFog?.playerView?.w>0?world.caveFog.playerView:null);
  const minimumFocus=this.stable?STABLE_PLAYER_FOCUS_HEIGHT:1.55;
  if(actor){
   const anchorY=world.terrain.heightAt(actor.x,actor.z)+minimumFocus,eyeY=Math.max(anchorY,this.base.y),dx=this.base.x-actor.x,dz=this.base.z-actor.z,length=Math.hypot(dx,dz),count=Math.max(1,Math.ceil(length/.3));
   let lastX=actor.x,lastZ=actor.z;
   for(let i=1;i<=count;i++){const x=actor.x+dx*i/count,z=actor.z+dz*i/count;if(caveCameraBlocked(world.terrain,x,eyeY-.35,z)){this.base.x=lastX;this.base.z=lastZ;break;}lastX=x;lastZ=z;}
   this.base.y=eyeY;
  }
  // A roll lowers the head almost to the ground. Keep the physical eye anchor
  // above the walk surface, including a near-vertical upward view; otherwise
  // camera padding intersects the floor before any radius is tested.
  const floor=world.terrain.heightAt(actor?.x??this.base.x,actor?.z??this.base.z),roof=caveCameraCeilingHeight(this.base.x,this.base.z);
  this.base.y=Math.max(floor+minimumFocus,Math.min(roof-.65,this.base.y));
  const key=this.lastKey;
  if(this.lastTerrain!==world.terrain||this.base.x!==key[0]||this.base.y!==key[1]||this.base.z!==key[2]||camera.alpha!==key[3]||camera.beta!==key[4]||this.savedRadius!==key[5]){
   this.allowed=caveSafeCameraRadius(world.terrain,this.base,camera.alpha,camera.beta,this.savedRadius);key[0]=this.base.x;key[1]=this.base.y;key[2]=this.base.z;key[3]=camera.alpha;key[4]=camera.beta;key[5]=this.savedRadius;this.lastTerrain=world.terrain;
  }
  const allowed=this.allowed;
  const recovered=Number.isFinite(this.effectiveRadius)?this.effectiveRadius+(allowed-this.effectiveRadius)*(1-Math.exp(-this.dt*8)):allowed;
  this.effectiveRadius=Math.min(allowed,recovered);
  camera.radius=this.effectiveRadius;this.renderTarget.copyFrom(this.base);this.renderTarget.y+=upwardFocusLift(camera,true);camera.setTarget(this.renderTarget,false,false,true);
  camera.getViewMatrix(true);world.scene.updateTransformMatrix(true);this.applied=true;
  return true;
 }
 endFrame(){
  if(!this.applied)return;const camera=this.world.camera;
  camera.radius=this.savedRadius;camera.setTarget(this.savedTarget,false,false,true);this.applied=false;
  // Keep the rendered matrices/global position until the next beginFrame so
  // deferred HUD work sees the image that was drawn, never the requested eye.
 }
 inspect(){return {requestedRadius:this.savedRadius??this.world.camera.radius,effectiveRadius:this.effectiveRadius,applied:this.applied,fieldBytes:lookup.byteLength+profiles.byteLength};}
 dispose(){if(this.disposed)return;this.endFrame();this.disposed=true;this.world.scene.onDisposeObservable.remove(this.sceneDispose);}
}
