// A single prewarmed, textureless draw for the blade, warning rim and impact.
// The impact mesh is purely visual. Hit selection uses the combat cast's centre and radius.
import {Mesh, ShaderMaterial, Vector3, VertexData} from '@babylonjs/core';
import {prepareModelShaders} from '../boss-shader-warmup.js';

const vertexSource = `
 precision highp float;
 attribute vec3 position;
 attribute vec2 uv;
 attribute vec4 color;
 uniform mat4 worldViewProjection;
 uniform vec3 grip, tip, center, slope;
 uniform float charge, age, windup, radius;
 uniform float rimHeights[17];
 varying vec4 tint;
 void main() {
   float kind=uv.x, seed=uv.y, alpha=color.a;
   vec3 p=position;
   if(kind<1.5) {
     float extent=kind<0.5?1.0:mix(0.08,1.0,1.0-pow(1.0-age,2.0));
     vec2 offset=p.xz*radius*extent;
     float segment=16.0*seed;
     int sector=int(min(15.0,floor(segment)));
     float edgeHeight=mix(rimHeights[sector],rimHeights[sector+1],segment-float(sector));
     p=center+vec3(offset.x,edgeHeight*length(p.xz)*extent+0.045,offset.y);
     alpha*=kind<0.5?mix((1.0-age)*0.95,0.24+charge*0.48,windup):(1.0-windup)*(1.0-age);
   } else if(kind<2.5) {
     vec3 ray=normalize(tip-grip+vec3(0.00001));
     vec3 side=normalize(cross(ray,abs(ray.y)<0.9?vec3(0.,1.,0.):vec3(1.,0.,0.)));
     vec3 edge=seed<0.5?side:cross(ray,side);
     p=mix(grip,tip,p.y)+edge*p.x*(0.012+0.045*charge);
     alpha*=windup*(0.38+0.62*charge);
   } else if(kind<3.5) {
     float t=fract(seed+charge*1.65);
     float theta=6.28318*seed*11.0+3.5*t;
     float reach=(1.0-t)*(0.85+charge);
     vec3 end=mix(grip,tip,fract(seed*7.7));
     vec3 dir=vec3(cos(theta),0.28+sin(seed*23.0)*0.48,sin(theta));
     p=end+dir*(reach+p.z*0.13)+vec3(p.x*0.055,p.y*0.055,0.);
     alpha*=windup*(0.2+0.8*charge)*sin(3.14159*t);
   } else if(kind>4.5) {
     float spread=min(1.0,age*4.0);
     vec2 offset=p.xz*radius*spread;
     p=center+vec3(offset.x,dot(offset,slope.xz)+0.04,offset.y);
     alpha*=(1.0-windup)*(1.0-age)*spread;
   } else {
     float a=seed*6.28318;
     vec2 dir=vec2(cos(a),sin(a));
     vec2 offset=dir*(radius*(0.12+(0.38+0.49*fract(seed*17.21))*age)+p.z)
                 +vec2(-dir.y,dir.x)*p.x;
     float height=4.0*age*(1.0-age)*(0.30+0.96*fract(seed*13.7));
     p=center+vec3(offset.x,dot(offset,slope.xz)+0.05+height+p.y,offset.y);
     alpha*=(1.0-windup)*(1.0-age);
   }
   tint=vec4(color.rgb,alpha);
   gl_Position=worldViewProjection*vec4(p,1.);
 }`;
const fragmentSource = `precision mediump float; varying vec4 tint;
 void main(){if(tint.a<0.01)discard;gl_FragColor=tint;}`;

function geometry() {
  const positions=[], colors=[], uvs=[], indices=[];
  const gold=[1,.69,.22], ivory=[1,.96,.74], blue=[.56,.8,1], rock=[.38,.27,.18];
  const vertex=(x,y,z,kind,seed,tone,alpha)=>{
    positions.push(x,y,z);uvs.push(kind,seed);colors.push(...tone,alpha);
    return positions.length/3-1;
  };
  for(const kind of [0,1]){
    let previous;
    for(let i=0;i<=64;i++){
      const angle=i*Math.PI/32, x=Math.cos(angle),z=Math.sin(angle);
      const start=vertex(x,0,z,kind,i/64,ivory,1);
      const inner=kind===0?.979:.83;
      vertex(inner*x,0,inner*z,kind,i/64,kind===0?gold:blue,kind===0?.62:0);
      if(i>0)indices.push(previous,previous+1,start, start,previous+1,start+1);
      previous=start;
    }
  }
  for(const seed of [0,1]){
    const start=vertex(-1,0,0,2,seed,gold,.78);
    vertex(1,0,0,2,seed,gold,.78);vertex(-1,1,0,2,seed,ivory,.96);vertex(1,1,0,2,seed,ivory,.96);
    indices.push(start,start+1,start+2,start+2,start+1,start+3);
  }
  for(let i=0;i<24;i++){
    const seed=(i*.61803398875)%1, tone=i%3?gold:blue;
    const start=vertex(0,0,1,3,seed,tone,0);
    vertex(-.5,0,0,3,seed,tone,.9);vertex(.5,1,0,3,seed,ivory,.98);vertex(0,0,-1,3,seed,ivory,.25);
    indices.push(start,start+1,start+2,start+1,start+3,start+2);
    const base=vertex(-.065,0,.025,4,seed,i%3?rock:tone,.92);
    vertex(.07,.04,0,4,seed,i%3?rock:ivory,.98);vertex(0,.16,-.17,4,seed,i%3?gold:ivory,.9);
    vertex(0,-.015,-.08,4,seed,rock,.9);
    indices.push(base,base+1,base+2,base+1,base+3,base+2,base+3,base,base+2);
  }
  // Uneven tapered splits open in the same footprint as the damage ring.
  for(let i=0;i<13;i++){
    const angle=i*Math.PI*2/13+.15*Math.sin(i*2.8);
    let previous;
    for(let j=0;j<5;j++){
      const bend=angle+.12*Math.sin(i*4.3+j*2.6), reach=(.10+j*.185)*(.77+.2*Math.sin(i*1.7));
      const x=Math.cos(bend)*reach,z=Math.sin(bend)*reach,width=(4-j)*.004;
      const start=vertex(x-Math.sin(bend)*width,0,z+Math.cos(bend)*width,5,0,rock,.97);
      vertex(x+Math.sin(bend)*width,0,z-Math.cos(bend)*width,5,0,gold,.8);
      if(j)indices.push(previous,previous+1,start,start,previous+1,start+1);
      previous=start;
    }
  }
  const data=new VertexData();
  Object.assign(data,{positions,colors,uvs,indices});return data;
}

export function createGreatAttackFx({scene,root,project,ground,now=()=>performance.now()}) {
  const mesh=new Mesh('v03-starfall',scene);
  geometry().applyToMesh(mesh);mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;
  mesh.setEnabled(false);
  const material=new ShaderMaterial('v03-starfall-light',scene,{vertexSource,fragmentSource},{
    attributes:['position','uv','color'],
    uniforms:['worldViewProjection','grip','tip','center','slope','charge','age','windup','radius','rimHeights'],needAlphaBlending:true,
  });
  mesh.material=material;material.disableDepthWrite=true;material.backFaceCulling=false;
  void prepareModelShaders({meshes:[mesh]},{includeInstanceVariants:false,keepPrograms:false})
    .catch(error=>{if(!scene.isDisposed)console.warn('[MoonForest] starfall preparation',error);});
  const gauge=root.ownerDocument.createElement('div'), fill=root.ownerDocument.createElement('div');
  gauge.className='mf-starfall-gauge';gauge.hidden=true;gauge.setAttribute('aria-hidden','true');gauge.append(fill);root.append(gauge);
  const grip=new Vector3(),tip=new Vector3(),center=new Vector3(),slope=new Vector3();
  const rimHeights=new Array(17).fill(0);
  let sampledX=Infinity,sampledZ=Infinity,action=null,impactAt=null,disposed=false;
  function sampleRim(radius){
    for(let i=0;i<16;i++){
      const angle=i*Math.PI/8;
      const h=ground?.(center.x+radius*Math.cos(angle),center.z+radius*Math.sin(angle));
      rimHeights[i]=Number.isFinite(h)?h-center.y:0;
    }
    rimHeights[16]=rimHeights[0];
    slope.set((rimHeights[0]-rimHeights[8])/(2*radius),0,(rimHeights[4]-rimHeights[12])/(2*radius));
    material.setFloats('rimHeights',rimHeights);
    sampledX=center.x;sampledZ=center.z;
  }
  function hide(){action=null;impactAt=null;mesh.setEnabled(false);gauge.hidden=true;}
  function update(cast,blade,player){
    if(disposed)return;
    if(!cast||!player){hide();return;}
    const {phase,radius}=cast, windup=phase==='windup', p=cast.center;
    if(action!==cast.actionId){impactAt=null;sampledX=Infinity;action=cast.actionId;}
    if(phase==='impact'&&impactAt===null)impactAt=now();
    const age=impactAt===null?0:Math.min(1,Math.max(0,(now()-impactAt)/550));
    if(age>=1){mesh.setEnabled(false);gauge.hidden=true;return;}
    if(!mesh.isEnabled())mesh.setEnabled(true);
    center.set(p.x,p.y,p.z);
    // Refit a moving preview only after a material displacement. Always fit the actual landing.
    if(radius>0&&(phase==='impact'||Math.abs(center.x-sampledX)+Math.abs(center.z-sampledZ)>.35))sampleRim(radius);
    if(blade?.[0]&&blade?.[1]){
      Vector3.FromArrayToRef(blade[0],0,grip);Vector3.FromArrayToRef(blade[1],0,tip);
    }else{
      grip.set(player.x+.28,player.y+.9,player.z);tip.set(grip.x,grip.y+.75,grip.z);
    }
    material.setVector3('grip',grip).setVector3('tip',tip).setVector3('center',center).setVector3('slope',slope);
    material.setFloat('charge',windup?cast.progress:1).setFloat('age',age).setFloat('windup',impactAt===null?1:0).setFloat('radius',radius);
    const pos=windup?project?.(player):null;
    gauge.hidden=!pos?.visible;
    if(!gauge.hidden){
      gauge.style.left=pos.x.toFixed(1)+'px';gauge.style.top=(pos.y+8).toFixed(1)+'px';
      fill.style.transform='scaleX('+cast.progress+')';
    }
  }
  function dispose(){
    if(disposed)return;disposed=true;
    scene.onDisposeObservable.remove(observer);gauge.remove();mesh.dispose();material.dispose();
  }
  const observer=scene.onDisposeObservable.addOnce(dispose);
  return {scene,update,hide,dispose};
}
