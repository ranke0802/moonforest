import {Mesh, ShaderMaterial, Vector3, VertexData} from '@babylonjs/core';
import {prepareModelShaders} from '../boss-shader-warmup.js';

// Twelve marks cover five seconds even at the .45 s held-input threshold.
// Both batches are built once. Only occupied impact slots are drawn.
const IMPACT_CAPACITY=12;
const IMPACT_SECONDS=5;

const vertexSource = `
 precision highp float;
 attribute vec3 position;
 attribute vec2 uv;
 attribute vec4 color;
 uniform mat4 worldViewProjection, view;
 uniform vec3 grip, tip;
 uniform float charge, clock, swing;
 varying vec4 tint;

 // Fast at the mouth of the spiral, tightly wound as it enters the steel.
 vec3 stream(float seed,float t){
   float outer=1.0-t;
   float a=seed*94.2478+t*(1.2+1.4*fract(seed*13.73))+0.19*sin(clock*2.0+seed*39.0);
   float r=outer*(1.2+1.8*fract(seed*27.19))*(0.66+0.6*charge);
   float h=(fract(seed*19.37)-0.25)*2.4*outer+sin(t*3.14159)*0.5;
   return mix(grip,tip,0.2+0.78*fract(seed*41.93))+vec3(cos(a)*r,h,sin(a)*r);
 }
 void main(){
   float kind=uv.x, seed=uv.y, alpha=color.a;
   vec3 right=vec3(view[0][0],view[1][0],view[2][0]);
   vec3 up=vec3(view[0][1],view[1][1],view[2][1]);
   vec3 forward=cross(right,up);
   vec3 p;
   float travel=fract(seed*31.17+clock*(0.73+0.54*fract(seed*15.73)));
   float pulse=0.5+0.5*sin(clock*7.0);
   if(kind<0.5){
     vec3 axis=normalize(tip-grip+vec3(0.00001));
     vec3 side=cross(forward,axis);
     side=dot(side,side)>0.0001?normalize(side):right;
     float width=(0.031+0.205*charge*charge)*(0.95+0.09*pulse+0.20*swing);
     p=mix(grip,tip,position.y)+side*position.x*width*position.z;
     alpha*=0.30+0.70*charge;
   }else if(kind<1.5){
     float t=max(0.0,travel-(1.0-position.y)*0.40);
     p=stream(seed,t);
     vec3 tangent=stream(seed,min(t+0.012,1.0))-p;
     vec3 side=cross(forward,tangent);
     side*=inversesqrt(max(dot(side,side),0.000001));
     p+=side*position.x*(0.006+0.028*charge)*sin(position.y*3.14159);
     alpha*=smoothstep(0.0,0.12,t)*(1.0-smoothstep(0.94,1.0,travel))*(0.25+0.75*charge)*(1.0-swing);
   }else{
     float size=(0.034+0.070*fract(seed*57.17))*(0.50+0.70*charge);
     if(kind<2.5){
       p=stream(seed,travel);
       alpha*=smoothstep(0.0,0.14,travel)*(1.0-smoothstep(0.93,1.0,travel))*(0.35+0.65*charge)*(1.0-swing);
     }else{
       p=mix(grip,tip,0.06+0.94*travel);
       size*=1.4+charge;
       alpha*=charge*sin(travel*3.14159);
     }
     p+=(right*position.x+up*position.y)*size;
   }
   tint=vec4(color.rgb,alpha);
   gl_Position=worldViewProjection*vec4(p,1.0);
 }`;

const impactVertexSource = `
 precision highp float;
 attribute vec3 position;
 attribute vec2 uv;
 attribute vec4 color;
 uniform mat4 worldViewProjection;
 uniform vec4 anchors[12], heights[48];
 uniform float born[12], elapsed;
 varying vec4 tint;

 float groundY(int slot,vec2 offset){
   vec2 grid=clamp((offset+1.0)*1.5,vec2(0.0),vec2(3.0));
   float rowIndex=min(floor(grid.y),2.0);
   int row=slot*4+int(rowIndex);
   vec4 h=mix(heights[row],heights[row+1],grid.y-rowIndex);
   vec4 weights=max(vec4(1.0)-abs(vec4(0.0,1.0,2.0,3.0)-grid.x),vec4(0.0));
   return dot(h,weights);
 }
 void main(){
   int slot=int(uv.x);
   float age=max(0.0,elapsed-born[slot]);
   float seed=fract(uv.y),alpha=color.a;
   vec4 anchor=anchors[slot];
   vec3 tone=color.rgb;
   vec2 offset;
   float lift=0.0;
   if(uv.y<1.0){
     // Dark chipped lips surround the hot seam. It cools before the scar fades.
     offset=position.xz*(0.25+0.75*smoothstep(0.0,0.14,age));
     tone=mix(tone,tone*vec3(0.28,0.24,0.22),smoothstep(0.30,2.0,age));
     alpha*=1.0-smoothstep(4.0,5.0,age);
   }else{
     float flight=clamp(age/0.57,0.0,1.0),a=seed*6.28318;
     vec2 dir=vec2(cos(a),sin(a));
     offset=dir*(0.06+(0.35+0.52*fract(seed*23.9))*flight+position.z)+vec2(-dir.y,dir.x)*position.x;
     lift=4.0*flight*(1.0-flight)*(0.34+0.98*fract(seed*19.7))+position.y;
     alpha*=1.0-smoothstep(0.48,0.59,age);
   }
   float angle=fract(dot(anchor.xz,vec2(0.235,0.373))+born[slot]*0.29)*6.28318;
   offset=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*offset;
   vec3 p=anchor.xyz+vec3(offset.x*anchor.w,groundY(slot,offset)+0.032+lift,offset.y*anchor.w);
   tint=vec4(tone,alpha);
   gl_Position=worldViewProjection*vec4(p,1.0);
 }`;
const fragmentSource = `precision mediump float; varying vec4 tint;
 void main(){if(tint.a<0.01)discard;gl_FragColor=tint;}`;

const gold=[1,.66,.22], ivory=[1,.98,.84], frost=[.53,.84,1], amber=[.98,.47,.12];
const basalt=[.15,.105,.085], stone=[.42,.33,.28];

function makeGeometry(){
  const data=new VertexData(),positions=[],colors=[],uvs=[],indices=[];
  Object.assign(data,{positions,colors,uvs,indices});
  function vertex(x,y,z,kind,seed,tone,alpha){
    positions.push(x,y,z);uvs.push(kind,seed);colors.push(...tone,alpha);
    return positions.length/3-1;
  }
  function strip(a,b){indices.push(a,a+1,b,b,a+1,b+1);}
  return {data,vertex,strip,indices};
}

function chargeGeometry(){
  const {data,vertex,strip,indices}=makeGeometry();
  // Soft amber shoulders and a white-hot spine taper past the tip of the blade.
  let previous;
  for(const [length,width] of [[-.045,0],[.10,.74],[.71,1],[.95,.58],[1.11,0]]){
    const start=vertex(-1,length,width,0,0,gold,0);
    vertex(-.39,length,width,0,0,gold,.65);vertex(-.12,length,width,0,0,ivory,1);
    vertex(.12,length,width,0,0,ivory,1);vertex(.39,length,width,0,0,gold,.65);vertex(1,length,width,0,0,gold,0);
    if(previous!==undefined)for(let i=0;i<5;i++)strip(previous+i,start+i);
    previous=start;
  }
  for(let i=0;i<18;i++){
    const seed=(i*.61803398875)%1,tone=i%3===0?frost:gold;
    for(let j=0;j<=8;j++){
      const start=vertex(-1,j/8,0,1,seed,tone,0);
      vertex(0,j/8,0,1,seed,j>5?ivory:tone,.86);vertex(1,j/8,0,1,seed,tone,0);
      if(j>0){strip(previous,start);strip(previous+1,start+1);}
      previous=start;
    }
  }
  // The centers and four tapered arms face the camera at every sword angle.
  for(let i=0;i<150;i++){
    const kind=i<144?2:3,seed=((i+.5)*.61803398875)%1,tone=i%3===0?frost:gold;
    const start=vertex(0,0,0,kind,seed,ivory,1);
    for(const [x,y] of [[0,1.3],[.15,.15],[1,0],[.15,-.15],[0,-1.3],[-.15,-.15],[-1,0],[-.15,.15]]){
      vertex(x,y,0,kind,seed,tone,Math.abs(x)+Math.abs(y)>.8?0:.95);
    }
    for(let j=0;j<8;j++)indices.push(start,start+1+j,start+1+(j+1)%8);
  }
  return data;
}

function impactGeometry(){
  const {data,vertex,strip,indices}=makeGeometry();
  for(let slot=0;slot<IMPACT_CAPACITY;slot++){
    // Jagged primary fissures split into smaller side branches. Each cross-section
    // has a stone lip and a narrow amber inner wall that stays visible in sunlight.
    for(let i=0;i<12;i++){
      const angle=i*Math.PI/6+.12*Math.sin(i*4.7),reach=.63+.27*Math.sin(i*7.3+.8);
      function fissure(branch,n){
        let previous;
        for(let j=0;j<=n;j++){
          const t=j/n,step=branch ? .42+t*.43 : t;
          const bend=angle+.10*Math.sin(i*3.1+step*12)+branch*.42*t;
          const x=Math.cos(bend)*reach*step,z=Math.sin(bend)*reach*step;
          const width=(branch ? .017 : .037)*(1-t*.98);
          const dx=-Math.sin(bend)*width,dz=Math.cos(bend)*width;
          const start=vertex(x-dx,0,z-dz,slot,0,stone,.86);
          vertex(x-dx*.50,0,z-dz*.50,slot,0,basalt,.98);
          vertex(x+dx*.24,0,z+dz*.24,slot,0,amber,.98);
          vertex(x+dx,0,z+dz,slot,0,basalt,.95);
          if(j)for(let edge=0;edge<3;edge++)strip(previous+edge,start+edge);
          previous=start;
        }
      }
      fissure(0,6);if(i%2===0)fissure(i%4===0?-1:1,3);
    }
    for(let i=0;i<32;i++){
      const seed=((i+.5)*.61803398875)%1,tone=i%3===0?ivory:stone;
      const base=vertex(-.034,0,.022,slot,1+seed,tone,.96);
      vertex(.039,.035,0,slot,1+seed,tone,.96);vertex(0,.10,-.105,slot,1+seed,i%3===0?gold:basalt,.94);
      vertex(.013,-.014,-.035,slot,1+seed,basalt,.96);
      indices.push(base,base+1,base+2,base+1,base+3,base+2,base+3,base,base+2);
    }
  }
  return data;
}

function batch(scene,name,data,shader,uniforms){
  const mesh=new Mesh(name,scene);
  data.applyToMesh(mesh);mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);
  const material=new ShaderMaterial(name+'-light',scene,{vertexSource:shader,fragmentSource},{
    attributes:['position','uv','color'],uniforms:['worldViewProjection',...uniforms],needAlphaBlending:true,
  });
  mesh.material=material;material.disableDepthWrite=true;material.backFaceCulling=false;
  return mesh;
}

export function createGreatAttackFx({scene,root,project,ground,now=()=>performance.now()}){
  const light=batch(scene,'v03-starfall',chargeGeometry(),vertexSource,['view','grip','tip','charge','clock','swing']);
  const scars=batch(scene,'v03-starfall-ground',impactGeometry(),impactVertexSource,['anchors','heights','born','elapsed']);
  const draw=scars.subMeshes[0],indicesPerImpact=draw.indexCount/IMPACT_CAPACITY;
  // Babylon uses the mesh bounds for a full submesh, but asks the submesh itself
  // for its bounds as soon as we shorten the draw range to the occupied slots.
  const bounds=scars.getBoundingInfo(),minimum=new Vector3(),maximum=new Vector3();
  draw.setBoundingInfo(bounds);
  const anchors=new Float32Array(IMPACT_CAPACITY*4),heights=new Float32Array(IMPACT_CAPACITY*16),born=new Float32Array(IMPACT_CAPACITY);
  scars.material.setArray4('anchors',anchors).setArray4('heights',heights).setFloats('born',born);
  let disposed=false;
  void prepareModelShaders({meshes:[light,scars]},{includeInstanceVariants:false,keepPrograms:false})
    .catch(error=>{if(!disposed&&!scene.isDisposed)console.warn('[MoonForest] starfall preparation',error);});
  const gauge=root.ownerDocument.createElement('div'),fill=root.ownerDocument.createElement('div');
  gauge.className='mf-starfall-gauge';gauge.hidden=true;gauge.setAttribute('aria-hidden','true');gauge.append(fill);root.append(gauge);
  const grip=new Vector3(),tip=new Vector3();
  let count=0,epoch=0,action=null,chargeAt=0,lastCharge=0,lastImpact=null;

  function syncImpactDraw(){
    draw.indexCount=count*indicesPerImpact;scars.setEnabled(count>0);
    if(!count)return;
    minimum.set(Infinity,Infinity,Infinity);maximum.set(-Infinity,-Infinity,-Infinity);
    // Positions are placed in world space by the shader. Refit for transparent
    // sorting only when slots change, using the terrain already sampled on impact.
    for(let slot=0;slot<count;slot++){
      const i=slot*4,x=anchors[i],y=anchors[i+1],z=anchors[i+2],r=anchors[i+3];
      let low=Infinity,high=-Infinity;
      for(let j=slot*16;j<(slot+1)*16;j++){low=Math.min(low,heights[j]);high=Math.max(high,heights[j]);}
      minimum.minimizeInPlaceFromFloats(x-r,y+low,z-r);
      maximum.maximizeInPlaceFromFloats(x+r,y+high+1.5,z+r);
    }
    bounds.reConstruct(minimum,maximum,scars.getWorldMatrix());
  }
  function removeOldest(n){
    count-=n;
    if(count){anchors.copyWithin(0,n*4);heights.copyWithin(0,n*16);born.copyWithin(0,n);}
  }
  function tick(){
    if(disposed||!count)return;
    const elapsed=(now()-epoch)/1000;
    let expired=0;
    while(expired<count&&elapsed-born[expired]>=IMPACT_SECONDS)expired++;
    if(expired){removeOldest(expired);syncImpactDraw();}
    if(count)scars.material.setFloat('elapsed',elapsed);
  }
  function impact(cast){
    tick();
    const stamp=now();
    if(!count)epoch=stamp;
    if(count===IMPACT_CAPACITY)removeOldest(1);
    const {x,y,z}=cast.center,r=cast.radius,offset=count*4;
    anchors[offset]=x;anchors[offset+1]=y;anchors[offset+2]=z;anchors[offset+3]=r;
    born[count]=(stamp-epoch)/1000;
    for(let iz=0;iz<4;iz++)for(let ix=0;ix<4;ix++){
      const h=ground?.(x+r*(ix*2/3-1),z+r*(iz*2/3-1));
      heights[count*16+iz*4+ix]=Number.isFinite(h)?h-y:0;
    }
    scars.material.setFloat('elapsed',born[count]);
    count++;syncImpactDraw();
  }
  function hideBlade(){action=null;light.setEnabled(false);gauge.hidden=true;}
  function reset(){
    hideBlade();lastImpact=null;
    if(count){count=0;syncImpactDraw();}
  }
  function update(cast,blade,player){
    if(disposed)return;
    if(!cast||!player){hideBlade();return;}
    if(cast.phase==='impact'||cast.phase==='recovery'){
      hideBlade();
      if(cast.phase==='impact'&&cast.actionId!==lastImpact){lastImpact=cast.actionId;impact(cast);}
      return;
    }
    const stamp=now();
    if(action!==cast.actionId){action=cast.actionId;chargeAt=stamp;lastCharge=0;}
    if(blade?.[0]&&blade?.[1]){
      Vector3.FromArrayToRef(blade[0],0,grip);Vector3.FromArrayToRef(blade[1],0,tip);
    }else{
      grip.set(player.x+.28,player.y+.9,player.z);tip.set(grip.x,grip.y+.75,grip.z);
    }
    const windup=cast.charging, swing=windup?0:cast.progress;
    if(windup)lastCharge=cast.progress;
    light.material.setVector3('grip',grip).setVector3('tip',tip).setFloat('charge',windup?lastCharge:Math.max(.5,lastCharge))
      .setFloat('clock',(stamp-chargeAt)/1000).setFloat('swing',swing);
    light.setEnabled(true);
    const pos=windup?project?.(player):null;
    gauge.hidden=!pos?.visible;
    if(!gauge.hidden){
      gauge.style.left=pos.x.toFixed(1)+'px';gauge.style.top=(pos.y+8).toFixed(1)+'px';
      fill.style.transform='scaleX('+cast.progress+')';
    }
  }
  function dispose(){
    if(disposed)return;disposed=true;
    scene.onDisposeObservable.remove(observer);gauge.remove();
    light.dispose(false,true);scars.dispose(false,true);
  }
  const observer=scene.onDisposeObservable.addOnce(dispose);
  return {scene,get active(){return count>0||action!==null;},update,tick,reset,dispose};
}
