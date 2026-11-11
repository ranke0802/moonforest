import {Constants,Mesh,ShaderMaterial,VertexBuffer,VertexData} from '@babylonjs/core';
import {CAVE_FOG_GLSL} from './cave-fog-cover.js';
import {bindCaveFogMaterial} from './cave-fog-binding.js';

export const SWORD_TRAIL_KEY='moonforest-sword-trail-v1';
// These colors follow the existing selectable sword palettes, not the shield.
export const SWORD_TRAIL_COLORS=Object.freeze({
  original:Object.freeze([.72,.74,.76]),
  'violet-silver':Object.freeze([.72,.68,.79]),
  'teal-bronze':Object.freeze([.53,.72,.76]),
});
export function setupSwordTrailSettings({host,storage,onChange=()=>{}}){
 const doc=host.ownerDocument,label=doc.createElement('label'),input=doc.createElement('input'),note=doc.createElement('small');
 input.type='checkbox';input.id='sword-trail-toggle';label.append(input,' 검격 잔상');note.textContent='검의 색에 맞는 잔상입니다. 끄면 화면에 표시하지 않습니다.';host.append(label,note);
 let enabled=true;try{const value=storage?.getItem(SWORD_TRAIL_KEY);if(value==='0'||value==='1')enabled=value==='1';}catch{}input.checked=enabled;
 const change=()=>{enabled=input.checked;try{storage?.setItem(SWORD_TRAIL_KEY,enabled?'1':'0');}catch{}onChange(enabled);};input.addEventListener('change',change);
 return {get enabled(){return enabled;},dispose(){input.removeEventListener('change',change);label.remove();note.remove();}};
}

const vertex=`
  precision highp float;
  attribute vec3 position;
  attribute vec4 color;
  uniform mat4 world;
  uniform mat4 worldViewProjection;
  varying mediump vec4 trailColor;
  varying vec3 trailWorldPosition;
  void main(void){trailColor=color;trailWorldPosition=(world*vec4(position,1.0)).xyz;gl_Position=worldViewProjection*vec4(position,1.0);}
`;
const fragment=`
  precision mediump float;
  varying mediump vec4 trailColor;
  varying vec3 trailWorldPosition;
  ${CAVE_FOG_GLSL}
  void main(void){if(caveFogHidesInk(trailWorldPosition))discard;gl_FragColor=trailColor;}
`;
const SEGMENTS=12, LIFE=.18, EPSILON=1e-8;

// One bounded, reusable ribbon. It reads strike samples but never changes them,
// performs collision checks, creates lights, or allocates an effect per swing.
export function createSwordTrail(scene,{enabled=true,prepare=true,onError=()=>{},compile=(material,mesh)=>material.forceCompilationAsync(mesh)}={}){
 const mesh=new Mesh('player-sword-trail',scene),positions=new Float32Array(SEGMENTS*12),colors=new Float32Array(SEGMENTS*16),indices=[];
 for(let i=0;i<SEGMENTS;i++){const n=i*4;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
 const data=new VertexData();data.positions=positions;data.colors=colors;data.indices=indices;data.applyToMesh(mesh,true);
 const material=new ShaderMaterial('player-sword-trail-material',scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position','color'],uniforms:['world','worldViewProjection','caveFogRect','caveFogActive','caveFogOrigin'],samplers:['caveFogMap'],needAlphaBlending:true});
 material.backFaceCulling=false;material.disableDepthWrite=true;material.alphaMode=Constants.ALPHA_COMBINE;
 bindCaveFogMaterial(scene,material);material.onBindObservable.add(()=>bindCaveFogMaterial(scene,material,material._activeEffect));
 mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=false;mesh.alwaysSelectAsActiveMesh=true;mesh.hasVertexAlpha=true;mesh.setEnabled(false);
 const segments=Array.from({length:SEGMENTS},()=>({points:new Float32Array(12),born:0,active:false}));let cursor=0,active=0,lastTime=null,disposed=false,prepared=!prepare,preparing=null,failed=false;
 const safeError=error=>{try{onError(error);}catch{}};
 function warm(){if(prepared||preparing||disposed||failed)return;preparing=Promise.resolve().then(()=>disposed?null:compile(material,mesh)).then(()=>{if(!disposed)prepared=true;},error=>{failed=true;safeError(error);}).finally(()=>{preparing=null;});}
 if(enabled)warm();
 function clear(){if(!active&&lastTime===null)return;for(const segment of segments)segment.active=false;cursor=0;active=0;lastTime=null;mesh.setEnabled(false);}
 function add(contact,time){
  const a=contact?.previous,b=contact?.blade;if(!a||!b||a.length!==2||b.length!==2)return;
  let distance=0;for(let j=0;j<2;j++)for(let k=0;k<3;k++){if(!Number.isFinite(a[j]?.[k])||!Number.isFinite(b[j]?.[k]))return;distance+=(a[j][k]-b[j][k])**2;}
  if(distance<EPSILON)return;
  const segment=segments[cursor];if(!segment.active)active++;segment.active=true;segment.born=time;let n=0;
  for(let j=0;j<4;j++){const point=j<2?a[j]:b[j-2];for(let i=0;i<3;i++)segment.points[n++]=point[i];}
  cursor=(cursor+1)%SEGMENTS;
 }
 function update(sample,state,time,style='original'){
  if(disposed||!enabled||!prepared)return;if(!Number.isFinite(time))return;
  const swordState=state==='slash'||state==='attack'||state==='judgment';
  if(!active&&(!swordState||!sample?.contacts?.length)){lastTime=null;return;}
  if(lastTime!==null&&(time<lastTime||time-lastTime>.5))clear();lastTime=time;
  if(swordState&&sample?.contacts)for(const contact of sample.contacts)add(contact,time);
  const color=SWORD_TRAIL_COLORS[style]??SWORD_TRAIL_COLORS.original;let count=0;
  for(let i=0;i<SEGMENTS;i++){
   const segment=segments[i],age=time-segment.born;
   if(segment.active&&age>=LIFE){segment.active=false;active--;}
   if(!segment.active){for(let j=0;j<4;j++)colors[i*16+j*4+3]=0;continue;}
   count++;positions.set(segment.points,i*12);const fade=Math.max(0,1-age/LIFE),opacity=.38*fade*fade;
   for(let j=0;j<4;j++){const p=i*16+j*4;colors[p]=color[0];colors[p+1]=color[1];colors[p+2]=color[2];colors[p+3]=opacity*(j%2===0?.06:1)*(j<2?.7:1);}
  }
  if(count){mesh.updateVerticesData(VertexBuffer.PositionKind,positions,false);mesh.updateVerticesData(VertexBuffer.ColorKind,colors,false);mesh.setEnabled(true);}else if(mesh.isEnabled(false))mesh.setEnabled(false);
 }
 const observer=scene.onDisposeObservable.addOnce(()=>dispose());
 function dispose(){if(disposed)return;disposed=true;clear();scene.onDisposeObservable.remove(observer);mesh.dispose();material.dispose();}
 return {update,clear,setEnabled(value){enabled=!!value;if(!enabled)clear();else{if(failed)failed=false;warm();}},inspect:()=>({enabled,prepared,failed,activeSegments:active,capacity:SEGMENTS,visible:mesh.isEnabled(false)}),dispose,mesh};
}
