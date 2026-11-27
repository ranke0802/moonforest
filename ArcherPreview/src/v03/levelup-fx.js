import {Constants, Mesh, ShaderMaterial, Vector4, VertexData} from '@babylonjs/core';
import {prepareModelShaders} from '../boss-shader-warmup.js';
import {createStarfallAura} from './starfall-aura.js';

// Level-up light around the warrior (2026-11-27, user: "레벨업시 텍스트만 있음").
// One mesh, one material, one draw while it plays, none at rest:
//  - kind 0: a flat quad at the feet; the shader draws two gold rings spreading out
//    and a warm pool under the feet (anchored where the level was reached).
//  - kind 1: an open cylinder around the body; a pillar of light that rises,
//    streams upward and fades (follows the warrior).
//  - kind 2: MOTES camera-facing quads; light motes spiralling up (follow the warrior).
// Every position is computed in the vertex shader from two uniforms, so a frame costs
// two Vector4 writes. The body flash reuses the Starfall shells (starfall-aura.js) on a
// slowed clock: their release (.35 s) becomes about .9 s, nothing in that module changes.
// Lifetime: scene. The only outside object held is the player root, released on its disposal.
export const LEVELUP_FX_SECONDS=1.9;
export const LEVELUP_MOTES=40;
export const LEVELUP_FX_NAME='v03-levelup-fx';
export const RING_RADIUS=2.8, PILLAR_HEIGHT=3.1, PILLAR_SEGMENTS=28;
// The Starfall release is .35 s; at .4 of real time it lasts about .88 s.
export const BODY_FLASH_CLOCK=.4;

const GOLD='vec3(1.0,0.64,0.2)', IVORY='vec3(1.0,0.97,0.82)';
const vertexSource=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 view;
uniform mat4 viewProjection;
uniform vec4 lvRing;
uniform vec4 lvBody;
varying vec2 vLocal;
varying float vKind;
varying float vA;
float hash(float n){return fract(sin(n*12.9898)*43758.5453);}
void main(void){
  float age=lvRing.w;
  vKind=uv.x;
  vec3 p;
  vec3 right=vec3(view[0][0],view[1][0],view[2][0]);
  vec3 up=vec3(view[0][1],view[1][1],view[2][1]);
  if(uv.x<0.5){
    p=lvRing.xyz+vec3(position.x*${RING_RADIUS.toFixed(2)},0.05,position.z*${RING_RADIUS.toFixed(2)});
    vLocal=position.xz;vA=0.0;
  }else if(uv.x<1.5){
    float h=${PILLAR_HEIGHT.toFixed(2)}*(0.25+0.75*smoothstep(0.0,0.34,age));
    float r=mix(0.66,0.42,smoothstep(0.0,0.7,age));
    p=lvBody.xyz+vec3(position.x*r,position.y*h,position.z*r);
    vec3 eye=-(view[3].xyz*mat3(view));
    vec3 toEye=eye-p;toEye.y=0.0;
    vec3 n=vec3(position.x,0.0,position.z);
    vA=dot(toEye,toEye)>0.0001?abs(dot(n,normalize(toEye))):1.0;
    vLocal=vec2(uv.y*6.2831853,position.y);
  }else{
    float s=uv.y;
    float delay=hash(s)*0.6,life=0.85+hash(s+1.7)*0.5;
    float k=(age-0.1-delay)/life;
    float alive=step(0.0,k)*step(k,1.0);
    float ang=hash(s+3.1)*6.2831853+k*(1.5+hash(s+5.0)*1.6);
    float rad=(0.28+hash(s+7.3)*0.5)*(1.0-0.4*k);
    vec3 c=lvBody.xyz+vec3(cos(ang)*rad,0.08+k*(1.3+hash(s+9.1)*1.7),sin(ang)*rad);
    float size=(0.035+hash(s+11.0)*0.045)*alive;
    p=c+right*position.x*size+up*position.y*size;
    vLocal=position.xy;vA=clamp(k,0.0,1.0)*alive;
  }
  gl_Position=viewProjection*vec4(p,1.0);
}`;
const fragmentSource=`
precision highp float;
uniform vec4 lvRing;
uniform vec4 lvBody;
varying vec2 vLocal;
varying float vKind;
varying float vA;
void main(void){
  float age=lvRing.w;
  float a=0.0;
  float white=0.0;
  if(vKind<0.5){
    float d=length(vLocal);
    if(d>1.0)discard;
    float r=d*${RING_RADIUS.toFixed(2)};
    float e1=1.0-exp(-age*3.4);
    float x1=(r-(0.25+e1*2.3))/(0.07+0.1*e1);
    float band1=exp(-x1*x1)*(1.0-smoothstep(0.45,1.05,age));
    float late=max(age-0.2,0.0);
    float e2=1.0-exp(-late*2.6);
    float x2=(r-(0.2+e2*1.6))/0.05;
    float band2=exp(-x2*x2)*step(0.2,age)*(1.0-smoothstep(0.6,1.25,age));
    float pool=exp(-r*r*2.4)*smoothstep(0.0,0.12,age)*(1.0-smoothstep(0.9,1.8,age))*0.55;
    float c=0.5+0.5*cos(atan(vLocal.y,vLocal.x)*16.0);
    float ticks=0.65+0.35*c*c*c*c;
    a=band1*ticks*1.1+band2*0.6+pool;
    white=clamp(band1*0.8+pool*0.6,0.0,1.0);
  }else if(vKind<1.5){
    float v=vLocal.y;
    float shown=smoothstep(0.0,0.1,age)*(1.0-smoothstep(1.0,1.6,age));
    float edge=1.0-vA;
    // Brightest just inside the silhouette, soft at the very edge: a tube of light, not a pipe.
    float rim=0.3+0.7*smoothstep(0.0,0.8,edge)*(1.0-smoothstep(0.86,1.0,edge));
    float s=0.5+0.5*sin(vLocal.x*7.0+v*5.0-age*9.0);
    float streak=s*s*s;
    float fine=0.5+0.5*sin(vLocal.x*19.0-v*13.0+age*6.0);
    float fall=(1.0-v)*(1.0-v)*0.8+0.2*(1.0-v);
    float front=exp(-pow(max(v-smoothstep(0.0,0.4,age),0.0)*7.0,2.0));
    a=shown*rim*fall*(1.0-smoothstep(0.75,1.0,v))*(0.4+0.8*streak*(0.6+0.4*fine))*front;
    white=clamp(0.35*streak+0.45*(1.0-v),0.0,1.0);
  }else{
    if(vA<=0.0)discard;
    float d=length(vLocal);
    if(d>1.0)discard;
    float core=exp(-d*d*9.0);
    float glint=max(0.0,1.0-abs(vLocal.x)*7.0)*max(0.0,1.0-abs(vLocal.y))+max(0.0,1.0-abs(vLocal.y)*7.0)*max(0.0,1.0-abs(vLocal.x));
    a=(core+(1.0-d)*0.35+glint*0.5)*sin(3.14159*vA);
    white=core;
  }
  a*=lvBody.w;
  if(a<0.004)discard;
  gl_FragColor=vec4(mix(${GOLD},${IVORY},white),min(a,1.0));
}`;
export const LEVELUP_FX_SHADERS=Object.freeze({vertexSource,fragmentSource});

// position: local shape, uv: (kind, seed). Built once per scene.
export function levelUpGeometry(motes=LEVELUP_MOTES,segments=PILLAR_SEGMENTS){
  const positions=[],uvs=[],indices=[];
  const quad=(kind,seed,flat)=>{
    const base=positions.length/3;
    for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1]]){positions.push(x,flat?0:y,flat?y:0);uvs.push(kind,seed);}
    indices.push(base,base+1,base+2,base,base+2,base+3);
  };
  quad(0,0,true);
  const pillar=positions.length/3;
  for(let i=0;i<=segments;i++){
    const f=i/segments,a=f*Math.PI*2,x=Math.cos(a),z=Math.sin(a);
    positions.push(x,0,z,x,1,z);uvs.push(1,f,1,f);
  }
  for(let i=0;i<segments;i++){const a=pillar+i*2;indices.push(a,a+1,a+3,a,a+3,a+2);}
  for(let i=0;i<motes;i++)quad(2,i+.5,false);
  return {positions,uvs,indices};
}

const clamp01=x=>x<0?0:x>1?1:x;
export function createLevelUpFx({scene,now=()=>performance.now()}){
  const mesh=new Mesh(LEVELUP_FX_NAME,scene),data=new VertexData(),shape=levelUpGeometry();
  data.positions=shape.positions;data.uvs=shape.uvs;data.indices=shape.indices;data.applyToMesh(mesh);
  mesh.isPickable=false;mesh.checkCollisions=false;mesh.receiveShadows=false;mesh.renderOutline=false;
  mesh.alwaysSelectAsActiveMesh=true;mesh.doNotSyncBoundingInfo=true;mesh.metadata={moonforestRewardFx:true};
  mesh.freezeWorldMatrix();mesh.setEnabled(false);
  const material=new ShaderMaterial(LEVELUP_FX_NAME,scene,{vertexSource,fragmentSource},{
    attributes:['position','uv'],uniforms:['view','viewProjection','lvRing','lvBody'],needAlphaBlending:true,
  });
  material.alphaMode=Constants.ALPHA_ADD;material.disableDepthWrite=true;material.backFaceCulling=false;
  const ring=new Vector4(0,0,0,0),body=new Vector4(0,0,0,0);
  material.setVector4('lvRing',ring).setVector4('lvBody',body);
  mesh.material=material;
  // The body flash: its own Starfall shells (the skill's may be charging at the same time).
  // Cave fog is not bound: the warrior always stands in the lit part of a cave.
  const aura=createStarfallAura({scene,cave:false,now:()=>now()*BODY_FLASH_CLOCK,reward:true});
  let root=null,startedAt=-1,gain=1,flash=0,disposed=false,serial=0;
  const ready=prepareModelShaders({meshes:[mesh]},{includeInstanceVariants:false,keepPrograms:true})
    .catch(error=>{if(!disposed&&!scene.isDisposed)console.warn('[MoonForest 0.3] level-up light preparation',error);});
  // Called while loading and on each start; the same root costs one comparison.
  function bind(next){if(disposed)return null;root=next??null;return root?aura.bind(root):null;}
  function feet(){
    const at=root&&!root.isDisposed()?root.getAbsolutePosition():null;
    if(at)body.set(at.x,at.y,at.z,body.w);
    return at;
  }
  function play({reduced=false}={}){
    if(disposed||!root||root.isDisposed())return false;
    const at=feet();if(!at)return false;
    ring.set(at.x,at.y,at.z,0);
    gain=reduced?.55:1;body.w=gain;startedAt=now()/1000;
    mesh.setEnabled(true);
    // Reduced motion: no full-body flash; the rings, pillar and motes stay, dimmer.
    flash=reduced?0:1;
    if(flash)aura.update({actionId:'levelup:'+(++serial),level:1,charging:false,releaseCharge:1,phase:'windup'});
    tick();return true;
  }
  function stop(){startedAt=-1;mesh.setEnabled(false);if(aura.active)aura.reset();}
  function tick(){
    if(disposed||startedAt<0)return;
    const age=now()/1000-startedAt;
    if(age>=LEVELUP_FX_SECONDS||!root||root.isDisposed()){stop();return;}
    feet();ring.w=age;
    // The last .25 s fade the whole effect so nothing pops off.
    body.w=gain*(1-clamp01((age-(LEVELUP_FX_SECONDS-.25))/.25));
    material.setVector4('lvRing',ring).setVector4('lvBody',body);
    if(aura.active)aura.tick();
    // Hidden warrior (first person, story): the light follows the body's visibility.
    mesh.isVisible=root.isEnabled();
  }
  function dispose(){
    if(disposed)return;disposed=true;root=null;
    scene.onDisposeObservable.remove(sceneObserver);
    aura.dispose();mesh.dispose(true,false);material.dispose(true,false);
  }
  const sceneObserver=scene.onDisposeObservable.addOnce(dispose);
  return {scene,mesh,material,aura,ready,bind,play,tick,stop,dispose,
    get active(){return startedAt>=0;},
    get draws(){return (startedAt>=0&&mesh.isEnabled()?1:0)+aura.draws;},
    get root(){return root;},
    inspect(){return {active:startedAt>=0,draws:(startedAt>=0&&mesh.isEnabled()?1:0)+aura.draws,vertices:mesh.getTotalVertices(),motes:LEVELUP_MOTES,aura:aura.inspect()};}};
}
