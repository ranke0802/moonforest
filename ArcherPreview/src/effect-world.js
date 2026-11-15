import {Constants,Mesh,ShaderMaterial,Vector3,VertexData} from '@babylonjs/core';
import {CAVE_FOG_GLSL} from './cave-fog-cover.js';
import {bindCaveFogMaterial} from './cave-fog-binding.js';
import {prepareMapMaterials} from './map-shader-cache.js';
import {EffectBudget} from './effect-budget.js';

const CAPACITY=768;
const vertex=`precision highp float;
attribute vec3 position;attribute vec4 effectOrigin;attribute vec4 effectMotion;attribute vec4 effectTint;attribute vec4 effectShape;
uniform mat4 viewProjection;uniform vec3 effectRight;uniform vec3 effectUp;uniform float effectTime;
varying vec2 effectUV;varying vec4 effectColor;varying vec3 effectPoint;varying vec3 effectInfo;
void main(){float age=effectTime-effectOrigin.w;float t=clamp(age/max(.001,effectMotion.w),0.,1.);float alive=step(0.,age)*step(age,effectMotion.w)*step(.001,effectMotion.w);
float kind=effectShape.y;float scale=effectShape.x*(kind>1.5&&kind<2.5?mix(.25,2.6,t):mix(.8,1.4,t));
vec3 centre=effectOrigin.xyz+effectMotion.xyz*age;centre.y-=kind>.5&&kind<1.5?age*age*1.5:0.;
float c=cos(effectShape.z),s=sin(effectShape.z);vec2 q=vec2(c*position.x-s*position.y,s*position.x+c*position.y);
vec3 offset=kind>1.5&&kind<2.5?vec3(q.x,0.,q.y)*scale:(effectRight*q.x+effectUp*q.y)*scale;
effectPoint=centre+offset;effectUV=position.xy;effectColor=vec4(effectTint.rgb,effectTint.a*(1.-t)*(1.-t)*alive);effectInfo=vec3(kind,t,effectShape.w);
gl_Position=viewProjection*vec4(effectPoint,1.);if(alive<.5)gl_Position=vec4(2.,2.,2.,1.);
}`;
const fragment=`precision mediump float;varying vec2 effectUV;varying vec4 effectColor;varying vec3 effectPoint;varying vec3 effectInfo;
${CAVE_FOG_GLSL}
void main(){if(caveFogHidesInk(effectPoint))discard;vec2 p=effectUV;float kind=effectInfo.x,t=effectInfo.y,seed=effectInfo.z;float a=0.;vec3 color=effectColor.rgb;
if(kind<.5){float bend=sin(p.y*6.+t*9.+seed)*.13*(p.y+.9);vec2 q=vec2((p.x-bend)*1.25,p.y*.85);float core=max(0.,1.-length(q));a=core*core*(.7+.3*sin(p.y*12.+t*14.+seed));color=mix(color,vec3(1.,.93,.64),core*core);}
else if(kind<1.5){float core=max(0.,1.-abs(p.x)*2.-abs(p.y));a=core*core;color=mix(color,vec3(1.,.96,.76),core*.7);}
else if(kind<2.5){float r=length(p);a=(1.-smoothstep(.045,.16,abs(r-.72)))*(1.-smoothstep(.87,1.,r));color=mix(color,vec3(1.,.8,.38),.35);}
else{float r=length(p);float centre=max(0.,1.-r*1.6);float star=max(0.,1.-min(abs(p.x),abs(p.y))*16.)*max(0.,1.-r);a=max(centre*centre,star*.7);color=mix(color,vec3(1.,1.,.9),centre);}
gl_FragColor=vec4(color,effectColor.a*a);}`;

/** One additive batch, shared buffers, one game clock; no lights, RTTs or RAF. */
export function createEffectWorld(scene,{mode='standard',prepare=prepareMapMaterials}={}){
 const mesh=new Mesh('moonforest-review-effects',scene),positions=new Float32Array(CAPACITY*12),indices=new Uint16Array(CAPACITY*6),origin=new Float32Array(CAPACITY*16),motion=new Float32Array(CAPACITY*16),tint=new Float32Array(CAPACITY*16),shape=new Float32Array(CAPACITY*16);
 for(let i=0;i<CAPACITY;i++){const v=i*4;positions.set([-1,-1,0,1,-1,0,-1,1,0,1,1,0],i*12);indices.set([v,v+1,v+2,v+1,v+3,v+2],i*6);origin[i*16+3]=-100;}
 const data=new VertexData();data.positions=positions;data.indices=indices;data.applyToMesh(mesh);
 for(const [name,values]of [['effectOrigin',origin],['effectMotion',motion],['effectTint',tint],['effectShape',shape]])mesh.setVerticesData(name,values,true,4);
 const material=new ShaderMaterial('moonforest-review-effects-material',scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position','effectOrigin','effectMotion','effectTint','effectShape'],uniforms:['viewProjection','effectRight','effectUp','effectTime','caveFogRect','caveFogActive','caveFogOrigin'],samplers:['caveFogMap'],needAlphaBlending:true});
 material.alphaMode=Constants.ALPHA_ADD;material.disableDepthWrite=true;material.backFaceCulling=false;
 mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=false;mesh.alwaysSelectAsActiveMesh=true;mesh.freezeWorldMatrix();mesh.setEnabled(false);
 const right=new Vector3(1,0,0),up=new Vector3(0,1,0),axisX=new Vector3(1,0,0),axisY=new Vector3(0,1,0),budget=new EffectBudget(mode);
 let time=0,cursor=0,disposed=false,ready=false,warming=null,lastEnd=0,uploads=0,uploadBytes=0;
 material.setVector3('effectRight',right);material.setVector3('effectUp',up);material.setFloat('effectTime',time);
 const bind=material.onBindObservable.add(()=>{const camera=scene.activeCamera;if(camera){camera.getDirectionToRef(axisX,right);camera.getDirectionToRef(axisY,up);}const effect=material.getEffect();if(effect?.isReady()){effect.setVector3('effectRight',right);effect.setVector3('effectUp',up);effect.setFloat('effectTime',time);}bindCaveFogMaterial(scene,material,effect);});
 function warm(){if(disposed)return Promise.resolve(false);if(ready)return Promise.resolve(true);if(warming)return warming;
  warming=Promise.resolve().then(()=>prepare([mesh],{instances:false,cancelled:()=>disposed||scene.isDisposed})).then(()=>{if(!disposed&&!scene.isDisposed)ready=true;return ready;}).finally(()=>{warming=null;});return warming;
 }
 function particle(p,v,size,kind,rotation,life,color,alpha,seed){
  const slot=cursor;cursor=(cursor+1)%CAPACITY;const start=slot*16;
  for(let j=0;j<4;j++){const at=start+j*4;origin.set([p.x,p.y,p.z,time],at);motion.set([v[0],v[1],v[2],life],at);tint.set([color[0],color[1],color[2],alpha],at);shape.set([size,kind,rotation,seed],at);}
  for(const [name,array]of [['effectOrigin',origin],['effectMotion',motion],['effectTint',tint],['effectShape',shape]])mesh.geometry.updateVerticesDataDirectly(name,array.subarray(start,start+16),start);
  uploads+=4;uploadBytes+=4*16*4;lastEnd=Math.max(lastEnd,time+life);
 }
 function burst(position,{coverage}={}){
  if(disposed||!ready||![position?.x,position?.y,position?.z].every(Number.isFinite))return false;
  if(!Number.isFinite(coverage)){const camera=scene.activeCamera,distance=camera?Vector3.Distance(camera.globalPosition??camera.position,position):10;coverage=Math.min(4,20/Math.max(1,distance*distance));}
  const plan=budget.acquire(time,{coverage,duration:1.05});if(!plan)return false;
  const p={x:position.x,y:position.y+.55,z:position.z};particle(p,[0,.7,0],1.45,0,0,.65,[1,.24,.035],1.1,plan.id);
  particle(p,[0,0,0],2.1,3,.22,.32,[1,.75,.3],1.1,plan.id);
  particle({x:p.x,y:position.y+.045,z:p.z},[0,0,0],1.05,2,0,.72,[1,.33,.08],.8,plan.id);
  particle(p,[0,1,0],.8,0,.8,.85,[.75,.08,.03],.7,plan.id+1);
  for(let i=0;i<plan.decorations;i++){const a=i*2.3999632297,speed=1.1+(i%5)*.25;particle(p,[Math.cos(a)*speed,1.1+(i%4)*.5,Math.sin(a)*speed],.07+(i%3)*.025,1,a,.55+(i%4)*.12,[1,.45+(i%3)*.12,.09],.95,i);}
  mesh.setEnabled(true);return true;
 }
 function update(dt){if(disposed||!mesh.isEnabled())return;time+=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));budget.releaseExpired(time);if(time>=lastEnd){mesh.setEnabled(false);budget.clear();}}
 function clear(){if(disposed)return;mesh.setEnabled(false);budget.clear();motion.fill(0);mesh.geometry.updateVerticesDataDirectly('effectMotion',motion,0);uploads++;uploadBytes+=motion.byteLength;lastEnd=time;cursor=0;}
 function dispose(){if(disposed)return;disposed=true;budget.clear();material.onBindObservable.remove(bind);mesh.dispose();material.dispose();}
 return {mesh,material,warm,burst,update,clear,setMode:value=>budget.setMode(value),inspect:()=>({...budget.inspect(),ready,active:mesh.isEnabled(),capacity:CAPACITY,uploads,uploadBytes,clock:time,extraLights:0,extraRenderTargets:0,scope:'cosmetic fire-impact preview; gameplay unchanged'}),dispose};
}
