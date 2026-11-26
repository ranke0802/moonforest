import {Constants, Mesh, ShaderMaterial, VertexData} from '@babylonjs/core';
import {CAVE_FOG_GLSL} from '../cave-fog-cover.js';
import {bindCaveFogMaterial} from '../cave-fog-binding.js';

// The flash, hot edges, stars and low dust share a single additive draw.
const LIFETIME=1.5;
const vertexSource=cave=>`
 precision highp float;
 attribute vec3 position;
 attribute vec2 uv,uv2;
 attribute float sampleY;
 uniform mat4 worldViewProjection,view;
 uniform vec4 anchors[12],groundFrame[12];
 uniform float born[12],impactCharge[12],clearRadius[12],elapsed;
 varying highp vec4 layer;
 varying highp vec2 shape;
 ${cave?'varying highp vec3 fogPoint;':''}
 void main(){
   int slot=int(uv.x);
   vec4 center=anchors[slot];
   vec2 rot=groundFrame[slot].xy;
   float kind=floor(uv.y),seed=fract(uv.y),age=max(0.,elapsed-born[slot]),power=impactCharge[slot];
   vec2 offset=position.xz*center.w;
   float height=sampleY+.018;
   vec2 billboard=vec2(0.);
   if(kind==1.){
     offset*=.86+.14*power;
   }else if(kind>=2.){
     vec2 outward=normalize(position.xz);
     offset=outward*max(length(offset),clearRadius[slot]+.24);
     float time=max(0.,age-.055-.13*seed);
     if(kind==2.){
       offset+=outward*time*(.22+.65*power);
       height+=.10+sin(clamp(time/(.72+.32*seed),0.,1.)*3.14159)*(.35+.78*power+.5*seed);
       float size=(.038+.065*seed)*(.55+.95*power);
       billboard=uv2*size;
     }else{
       offset+=outward*time*(.19+.39*power);
       height+=.06+time*(.13+.18*seed);
       billboard=uv2*(.13+.28*time)*(.66+.47*power)*vec2(1.8,.68);
     }
   }
   vec2 turned=mat2(rot.x,rot.y,-rot.y,rot.x)*offset;
   vec3 p=center.xyz+vec3(turned.x,height,turned.y);
   p+=billboard.x*vec3(view[0][0],view[1][0],view[2][0])+billboard.y*vec3(view[0][1],view[1][1],view[2][1]);
   layer=vec4(kind,age,power,seed);
   shape=uv2;
   ${cave?'fogPoint=p;':''}
   gl_Position=worldViewProjection*vec4(p,1.);
 }`;
const fragmentSource=cave=>`
 precision highp float;
 varying highp vec4 layer;
 varying highp vec2 shape;
 ${cave?'varying highp vec3 fogPoint;\n'+CAVE_FOG_GLSL:''}
 void main(){
   ${cave?'if(caveFogHidesInk(fogPoint))discard;':''}
   float age=layer.y,power=layer.z,seed=layer.w,alpha;
   vec3 tone;
   if(layer.x<.5){
     float r=length(shape);
     float core=(1.-smoothstep(.04,.58,r))*(1.-smoothstep(0.,.12,age));
     float wave=smoothstep(0.,1.,age/.22);
     float ring=(1.-smoothstep(.012,.10,abs(r-(.11+.96*wave))))*(1.-wave);
     alpha=(.50*core+.92*ring)*(.37+.63*power);
     tone=mix(vec3(1.,.68,.32),vec3(1.,.94,.74),core);
   }else if(layer.x<1.5){
     float front=age-shape.y*.105;
     float opened=smoothstep(0.,.048,front)*(seed<.01?1.:smoothstep(seed-.08,seed+.08,power));
     float across=abs(shape.x);
     float seam=(1.-smoothstep(.05,.40,abs(across-.37)))*(.42+.58*smoothstep(.0,.14,across));
     float heat=1.-smoothstep(.06,1.24,front);
     alpha=seam*opened*heat*(.30+.70*power);
     tone=mix(vec3(.92,.37,.16),vec3(1.,.90,.62),heat*heat);
   }else{
     float t=age-.055-.13*seed;
     vec2 axes=abs(shape);
     if(layer.x<2.5){
       float star=exp(-13.*axes.x)*pow(max(0.,1.-axes.y),2.)+exp(-13.*axes.y)*pow(max(0.,1.-axes.x),2.);
       alpha=min(1.,star)*smoothstep(0.,.075,t)*(1.-smoothstep(.30,.91+.18*seed,t))*smoothstep(seed*.85-.14,seed*.85+.13,power);
       tone=mix(vec3(1.,.66,.37),vec3(.94,.94,1.),seed);
     }else{
       float soft=1.-smoothstep(.05,1.,dot(shape,shape));
       alpha=.22*soft*smoothstep(.05,.25,t)*(1.-smoothstep(.27,1.05,t))*(.4+.6*power);
       tone=vec3(.62,.54,.39);
     }
   }
   if(alpha<.003)discard;
   gl_FragColor=vec4(tone,alpha);
 }`;

// A single template is repeated in the buffer. Only occupied, luminous slots are submitted.
function buildTemplate(faults,branchCharge){
  const positions=[],kinds=[],coords=[],indices=[];
  function point(x,z,kind,u,v){
    positions.push(x,0,z);kinds.push(kind);coords.push(u,v);return kinds.length-1;
  }
  function quad(a,b,c,d){indices.push(a,b,c,a,c,d);}
  const hub=point(0,0,0,0,0),segments=24;
  for(let ring=1;ring<=4;ring++){
    const r=1.16*ring/4;
    for(let step=0;step<segments;step++){
      const angle=step*2*Math.PI/segments,x=r*Math.cos(angle),z=r*Math.sin(angle);
      point(x,z,0,x,z);
    }
    for(let step=0;step<segments;step++){
      const a=1+(ring-1)*segments+step,b=1+(ring-1)*segments+(step+1)%segments;
      if(ring===1)indices.push(hub,a,b);else quad(a-segments,a,b,b-segments);
    }
  }
  for(const [index,[width,path]] of faults.entries()){
    let previous;
    for(let i=0;i<path.length;i++){
      const [x,z]=path[i],from=path[Math.max(i-1,0)],to=path[Math.min(i+1,path.length-1)];
      const dx=to[0]-from[0],dz=to[1]-from[1],len=Math.hypot(dx,dz);
      const w=width*2.1*(1-.47*i/(path.length-1))*(i+1===path.length?.10:1);
      const kind=1+branchCharge(index),r=Math.hypot(x,z);
      const a=point(x-w*dz/len,z+w*dx/len,kind,-1,r);
      point(x+w*dz/len,z-w*dx/len,kind,1,r);
      if(i)quad(previous,a,a+1,previous+1);
      previous=a;
    }
  }
  for(let i=0;i<28;i++){
    const dust=i>=18,seed=(i*.618033989+.17)%1,angle=i*2.39996323,r=.41+.65*seed;
    const x=Math.cos(angle)*r,z=Math.sin(angle)*r,kind=(dust?3:2)+seed;
    const a=point(x,z,kind,-1,-1);
    point(x,z,kind,1,-1);point(x,z,kind,1,1);point(x,z,kind,-1,1);quad(a,a+1,a+2,a+3);
  }
  return {positions,kinds,coords,indices};
}

export function createStarfallGlow(scene,{cave,anchors,groundFrame,born,impactCharge,clearRadius,faults,branchCharge}){
  const capacity=born.length,template=buildTemplate(faults,branchCharge),vertices=template.kinds.length;
  const stride=template.indices.length,data=new VertexData();
  data.positions=new Float32Array(capacity*vertices*3);data.uvs=new Float32Array(capacity*vertices*2);
  data.uvs2=new Float32Array(capacity*vertices*2);data.indices=new Uint16Array(capacity*stride);
  for(let slot=0;slot<capacity;slot++){
    data.positions.set(template.positions,slot*vertices*3);data.uvs2.set(template.coords,slot*vertices*2);
    for(let i=0;i<vertices;i++){
      const offset=2*(slot*vertices+i);data.uvs[offset]=slot;data.uvs[offset+1]=template.kinds[i];
    }
    for(let i=0;i<stride;i++)data.indices[slot*stride+i]=slot*vertices+template.indices[i];
  }
  const mesh=new Mesh('v03-starfall-glow',scene);
  data.applyToMesh(mesh);mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);
  const material=new ShaderMaterial(mesh.name,scene,{vertexSource:vertexSource(cave),fragmentSource:fragmentSource(cave)},{
    attributes:['position','uv','uv2','sampleY'],
    uniforms:['worldViewProjection','view','anchors','groundFrame','born','impactCharge','clearRadius','elapsed',...(cave?['caveFogRect','caveFogActive','caveFogOrigin']:[])],
    samplers:cave?['caveFogMap']:[],needAlphaBlending:true
  });
  mesh.material=material;mesh.alphaIndex=-10000;
  material.alphaMode=Constants.ALPHA_ADD;material.disableDepthWrite=true;material.backFaceCulling=false;
  material.setArray4('anchors',anchors).setArray4('groundFrame',groundFrame).setFloats('born',born).setFloats('impactCharge',impactCharge).setFloats('clearRadius',clearRadius);
  if(cave){
    bindCaveFogMaterial(scene,material);
    material.onBindObservable.add(()=>bindCaveFogMaterial(scene,material,material._activeEffect));
  }
  const heights=new Float32Array(capacity*vertices);
  mesh.setVerticesData('sampleY',heights,true,1);
  const buffer=mesh.getVertexBuffer('sampleY'),engine=scene.getEngine(),draw=mesh.subMeshes[0];
  let count=0;
  function upload(first,end){
    const at=first*vertices;
    engine.updateDynamicVertexBuffer(buffer.getBuffer(),heights.subarray(at,end*vertices),at*heights.BYTES_PER_ELEMENT);
  }
  function add(slot,elevation){
    const r=anchors[4*slot+3],edgeScale=r*(.86+.14*impactCharge[slot]);
    let lastX=NaN,lastZ=NaN,y=0;
    for(let i=0;i<vertices;i++){
      const x=template.positions[3*i],z=template.positions[3*i+2],kind=Math.floor(template.kinds[i]);
      const scale=kind===1?edgeScale:kind>=2?Math.max(r,(clearRadius[slot]+.24)/Math.hypot(x,z)):r;
      const dx=x*scale,dz=z*scale;
      if(dx!==lastX||dz!==lastZ){y=elevation(dx,dz);lastX=dx;lastZ=dz;}
      heights[slot*vertices+i]=y;
    }
    upload(slot,slot+1);
  }
  function shift(n,remaining){
    if(remaining){heights.copyWithin(0,n*vertices,(n+remaining)*vertices);upload(0,remaining);}
  }
  function sync(occupied,bounds){
    count=occupied;mesh.setBoundingInfo(bounds);draw.setBoundingInfo(bounds);
    if(!count){draw.indexCount=0;mesh.setEnabled(false);}
  }
  function tick(elapsed){
    let first=0;
    while(first<count&&elapsed-born[first]>=LIFETIME)first++;
    draw.indexStart=first*stride;draw.indexCount=(count-first)*stride;
    mesh.setEnabled(first<count);
    if(first<count)material.setFloat('elapsed',elapsed);
  }
  return {mesh,add,shift,sync,tick};
}
