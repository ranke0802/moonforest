import {Color3,Constants,Mesh,ShaderMaterial,Vector3,VertexBuffer,VertexData} from '@babylonjs/core';
import {CAVE_FOG_GLSL} from './cave-fog-cover.js';
import {bindCaveFogMaterial} from './cave-fog-binding.js';
import {prepareMapMaterials} from './map-shader-cache.js';
import {chestEffectProfile} from './chest-loot-motion.js';
import {lootRarity} from './loot-rarity.js';

const SPARKS=96,RIBBONS=256,CAPACITY=SPARKS+RIBBONS;
const palette=Array.from({length:5},(_,i)=>Color3.FromHexString(lootRarity(i+1).color)),axisRight=Vector3.Right(),axisUp=Vector3.Up();
const vertex=`precision highp float;attribute vec3 position;attribute vec4 color;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec4 tint;varying vec2 tex;varying vec3 point;void main(){tint=color;tex=uv;point=position;gl_Position=worldViewProjection*vec4(position,1.);}`;
const fragment=`precision mediump float;varying vec4 tint;varying vec2 tex;varying vec3 point;${CAVE_FOG_GLSL}
void main(){if(caveFogHidesInk(point))discard;float a;if(tex.x>1.5){a=pow(max(0.,1.-abs(tex.y*2.-1.)),1.5);}else{vec2 p=abs(tex);a=max(pow(max(0.,1.-p.x),10.)*(1.-p.y),pow(max(0.,1.-p.y),10.)*(1.-p.x));}gl_FragColor=vec4(tint.rgb,tint.a*a);}`;

// One fixed mesh, one shared shader and no textures, lights or render targets.
// Buffers upload only while the short opening/flight effects are alive.
export function createChestLootFx(scene,{cancelled=()=>false,onError=()=>{},prepare=prepareMapMaterials}={}){
 const mesh=new Mesh('chest-loot-fx',scene),positions=new Float32Array(CAPACITY*12),colors=new Float32Array(CAPACITY*16),uvs=new Float32Array(CAPACITY*8),indices=[];
 for(let i=0;i<CAPACITY;i++){const n=i*4;indices.push(n,n+1,n+2,n+1,n+3,n+2);uvs.set(i<SPARKS?[-1,-1,1,-1,-1,1,1,1]:[2,0,3,0,2,1,3,1],i*8);}
 const data=new VertexData();data.positions=positions;data.colors=colors;data.uvs=uvs;data.indices=indices;data.applyToMesh(mesh,true);
 const material=new ShaderMaterial('chest-loot-fx-material',scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position','color','uv'],uniforms:['worldViewProjection','caveFogRect','caveFogActive','caveFogOrigin'],samplers:['caveFogMap'],needAlphaBlending:true});
 material.backFaceCulling=false;material.disableDepthWrite=true;material.alphaMode=Constants.ALPHA_ADD;bindCaveFogMaterial(scene,material);material.onBindObservable.add(()=>bindCaveFogMaterial(scene,material,material._activeEffect));
 mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=false;mesh.alwaysSelectAsActiveMesh=true;mesh.hasVertexAlpha=true;mesh.freezeWorldMatrix();mesh.setEnabled(false);
 const slots=Array.from({length:CAPACITY},()=>({life:0,duration:0,p:new Vector3(),v:new Vector3(),a:new Vector3(),b:new Vector3(),color:new Color3(),size:0})),right=new Vector3(),up=new Vector3(),side=new Vector3(),direction=new Vector3(),view=new Vector3(),pending=[];
 let sparkCursor=0,ribbonCursor=SPARKS,ready=false,disposed=false,uploads=0,active=0,needsUpdate=false;
 const stopped=()=>disposed||scene.isDisposed||cancelled();
 const preparation=Promise.resolve().then(()=>prepare([mesh],{instances:false,cancelled:stopped})).then(()=>{if(!stopped())ready=true;},error=>{if(!stopped())onError(error);});
 function burst(position,tier){if(stopped())return;if(!ready){if(pending.length<4)pending.push({position:{...position},tier});return;}needsUpdate=true;const profile=chestEffectProfile(tier),color=palette[profile.tier-1];
  for(let i=0;i<profile.sparks;i++){const s=slots[sparkCursor];sparkCursor=(sparkCursor+1)%SPARKS;const angle=i*2.399963229728653,spread=.8+(i%5)*.27;s.duration=s.life=.6+(i%4)*.09;s.p.set(position.x,position.y+.6,position.z);s.v.set(Math.cos(angle)*spread,1.5+(i%3)*.55,Math.sin(angle)*spread);s.color.copyFrom(color);s.size=profile.size*(.75+(i%3)*.2);}
 }
 function trail(a,b,tier,size=.045){if(!ready||stopped()||Vector3.DistanceSquared(a,b)<.000001)return;needsUpdate=true;const s=slots[ribbonCursor];ribbonCursor=SPARKS+(ribbonCursor-SPARKS+1)%RIBBONS;s.duration=s.life=.24;s.a.copyFrom(a);s.b.copyFrom(b);s.color.copyFrom(palette[lootRarity(tier).tier-1]);s.size=size;}
 function update(dt){if(stopped()||!ready||!active&&!needsUpdate&&!pending.length)return;const camera=scene.activeCamera;if(!camera)return;for(const p of pending)burst(p.position,p.tier);pending.length=0;dt=Math.max(0,Math.min(.1,dt));active=0;needsUpdate=false;
  camera.getDirectionToRef(axisRight,right);camera.getDirectionToRef(axisUp,up);
  for(let i=0;i<CAPACITY;i++){const s=slots[i];s.life=Math.max(0,s.life-dt);if(!s.life){for(let j=0;j<4;j++)colors[i*16+j*4+3]=0;continue;}active++;const fade=s.life/s.duration;
   if(i<SPARKS){s.v.y-=dt*3;s.p.addInPlaceFromFloats(s.v.x*dt,s.v.y*dt,s.v.z*dt);for(let j=0;j<4;j++){const x=j%2?1:-1,y=j<2?-1:1,o=i*12+j*3;positions[o]=s.p.x+(right.x*x+up.x*y)*s.size;positions[o+1]=s.p.y+(right.y*x+up.y*y)*s.size;positions[o+2]=s.p.z+(right.z*x+up.z*y)*s.size;}}
   else{s.b.subtractToRef(s.a,direction);camera.globalPosition.subtractToRef(s.b,view);Vector3.CrossToRef(direction,view,side);if(side.lengthSquared()<1e-8)side.copyFrom(right);side.normalize().scaleInPlace(s.size*fade);for(let j=0;j<4;j++){const p=j%2?s.b:s.a,sign=j<2?-1:1,o=i*12+j*3;positions[o]=p.x+side.x*sign;positions[o+1]=p.y+side.y*sign;positions[o+2]=p.z+side.z*sign;}}
   for(let j=0;j<4;j++){const o=i*16+j*4;colors[o]=s.color.r;colors[o+1]=s.color.g;colors[o+2]=s.color.b;colors[o+3]=fade*fade*(i<SPARKS?.8:.42);}
  }
  if(active){mesh.updateVerticesData(VertexBuffer.PositionKind,positions,false);mesh.updateVerticesData(VertexBuffer.ColorKind,colors,false);uploads++;mesh.setEnabled(true);}else mesh.setEnabled(false);
 }
 function dispose(){if(disposed)return;disposed=true;pending.length=0;mesh.dispose();material.dispose();}
 return {burst,trail,update,dispose,preparation,mesh,inspect:()=>({ready,active,uploads,capacity:CAPACITY,triangles:CAPACITY*2,pending:pending.length})};
}
