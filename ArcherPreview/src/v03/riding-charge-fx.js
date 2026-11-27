import {BoundingInfo, Color4, Constants, Mesh, ShaderMaterial, Vector3, VertexData} from '@babylonjs/core';
import {prepareModelShaders} from '../boss-shader-warmup.js';
import {reducedMotion,onAccessibilityChange} from './accessibility.js';

// Mounted charge effects (2026-11-27). Created with the mounted horse and
// prepared while the rider climbs on, so the first charge draws at once.
// - a pool of PULSE_CAPACITY burst discs: the launch ring and flash, impact
//   bursts and the slowing dust. Idle discs are disabled (no draw).
// - a camera kick: an additive FOV offset on the existing camera, restored on dispose.
// - screen-edge speed lines: one DOM layer, opacity only (hidden at rest).
// Driven by the rider's frame (update); no timers, RAF or render targets.
export const PULSE_CAPACITY=5;
const RING=24,SPIKES=8;

const vertexSource=`
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 worldViewProjection;
  uniform float age;
  uniform vec4 tint;
  varying vec4 colour;
  void main(){
    float grow=1.0-pow(1.0-age,3.0);
    float spike=uv.y;
    vec3 p=position*mix(0.3+0.7*grow,0.15+0.85*grow,spike);
    float fade=pow(1.0-age,1.6);
    colour=vec4(tint.rgb,tint.a*fade*mix(0.55+0.45*uv.x,1.0-0.8*uv.x,spike));
    gl_Position=worldViewProjection*vec4(p,1.0);
  }`;
// The tint reaches the fragment stage as a varying: a uniform shared by both
// stages must have one precision (2026-11-27 headless WebGL review caught this).
const fragmentSource=`
  precision mediump float;
  varying vec4 colour;
  void main(){ gl_FragColor=colour; }`;

function burstGeometry(){
  const positions=[],uvs=[],indices=[];
  for(let i=0;i<RING;i++){
    const a=i/RING*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
    positions.push(c*.78,s*.78,0,c,s,0);uvs.push(0,0,1,0);
  }
  for(let i=0;i<RING;i++){
    const a=i*2,b=((i+1)%RING)*2;
    indices.push(a,a+1,b+1,a,b+1,b);
  }
  for(let i=0;i<SPIKES;i++){
    const a=(i+.5)/SPIKES*Math.PI*2,c=Math.cos(a),s=Math.sin(a),w=.12,start=positions.length/3;
    const reach=i%2?1.25:1.65;
    positions.push(c*.5-s*w,s*.5+c*w,0,c*.5+s*w,s*.5-c*w,0,c*reach,s*reach,0);
    uvs.push(0,1,0,1,1,1);
    indices.push(start,start+1,start+2);
  }
  const data=new VertexData();
  data.positions=positions;data.uvs=uvs;data.indices=indices;
  return data;
}

// Kinds: size (m), seconds, colour, blend, placement.
export const PULSE_KINDS=Object.freeze({
  launchRing:{size:2.3,seconds:.5,tint:[1,.78,.42,.6],add:true,ground:true},
  launchFlash:{size:1.0,seconds:.22,tint:[1,.95,.78,.9],add:true,ground:false},
  impact:{size:1.15,seconds:.32,tint:[1,.82,.45,1],add:true,ground:false},
  dust:{size:1.9,seconds:.7,tint:[.62,.5,.36,.42],add:false,ground:true},
});
const TINTS=Object.fromEntries(Object.entries(PULSE_KINDS).map(([k,v])=>[k,new Color4(...v.tint)]));
const KICK_NAMES=['launch','impact'];
const KICKS={launch:{amp:.09,rise:.1,fall:.45},impact:{amp:-.035,rise:.03,fall:.2}};

export function createRidingChargeFx({scene,camera=()=>scene?.activeCamera,root=null}={}){
  if(!scene)return {launch(){},impact(){},finish(){},update(){},reset(){},inspect:()=>({ready:false}),dispose(){}};
  const pulses=[],geometry=burstGeometry();
  for(let i=0;i<PULSE_CAPACITY;i++){
    const mesh=new Mesh('v03-riding-charge-burst-'+i,scene);
    geometry.applyToMesh(mesh);
    mesh.setBoundingInfo(new BoundingInfo(new Vector3(-1.7,-1.7,-.1),new Vector3(1.7,1.7,.1)));
    const material=new ShaderMaterial('v03-riding-charge-burst-'+i,scene,{vertexSource,fragmentSource},{
      attributes:['position','uv'],uniforms:['worldViewProjection','age','tint'],needAlphaBlending:true,
    });
    material.backFaceCulling=false;material.disableDepthWrite=true;material.alphaMode=Constants.ALPHA_ADD;
    mesh.material=material;mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=false;
    mesh.setEnabled(false);
    pulses.push({mesh,material,time:0,seconds:0,tint:null,busy:false});
  }
  let lines=null;
  if(root?.ownerDocument){
    lines=root.ownerDocument.createElement('div');
    lines.className='v03-gallop-lines';lines.setAttribute('aria-hidden','true');lines.hidden=true;
    const canvas=root.querySelector?.('#viewport');
    if(canvas?.parentNode===root)canvas.after(lines);else root.append(lines);
  }
  const kicks={launch:-1,impact:-1};
  let disposed=false,ready=false,preparation=null,reduced=reducedMotion(),fovApplied=0,shownLines=0,cursor=0,launched=0,impacts=0;
  preparation=prepareModelShaders({meshes:pulses.map(p=>p.mesh)},{includeInstanceVariants:false,keepPrograms:false})
    .then(()=>{ready=!disposed;})
    .catch(error=>{if(!disposed)console.warn('[MoonForest 0.3] charge effects unavailable',error);});
  const stopListening=onAccessibilityChange(()=>{reduced=reducedMotion();});
  function spawn(kind,x,y,z){
    if(!ready||disposed)return null;
    const spec=PULSE_KINDS[kind];
    // Reuse the oldest disc when all are busy: capacity is fixed.
    let slot=null;
    for(let i=0;i<PULSE_CAPACITY&&!slot;i++){const p=pulses[(cursor+i)%PULSE_CAPACITY];if(!p.busy)slot=p;}
    slot??=pulses[cursor];
    cursor=(pulses.indexOf(slot)+1)%PULSE_CAPACITY;
    const {mesh,material}=slot;
    mesh.position.set(x,y,z);
    mesh.scaling.setAll(spec.size*(reduced&&!spec.ground?.7:1));
    if(spec.ground){mesh.billboardMode=Mesh.BILLBOARDMODE_NONE;mesh.rotation.set(Math.PI/2,0,0);}
    else{mesh.billboardMode=Mesh.BILLBOARDMODE_ALL;mesh.rotation.set(0,0,0);}
    material.alphaMode=spec.add?Constants.ALPHA_ADD:Constants.ALPHA_COMBINE;
    slot.tint=spec.tint;slot.time=0;slot.seconds=spec.seconds;slot.busy=true;
    material.setFloat('age',0);material.setColor4('tint',TINTS[kind]);
    if(!mesh.isEnabled(false))mesh.setEnabled(true);
    return slot;
  }
  function envelope(kick,t){
    if(t<0)return 0;
    if(t<kick.rise)return kick.amp*(t/kick.rise);
    const k=(t-kick.rise)/kick.fall;
    return k>=1?0:kick.amp*(1-k)*(1-k);
  }
  function applyFov(offset){
    const cam=camera();
    if(!cam||!Number.isFinite(cam.fov)){fovApplied=0;return;}
    if(Math.abs(offset-fovApplied)<1e-5)return;
    cam.fov+=offset-fovApplied;fovApplied=offset;
  }
  function showLines(strength){
    if(!lines)return;
    // At most .7: the lines frame the charge without hiding the road ahead.
    const value=reduced?0:Math.round(Math.max(0,Math.min(1,strength))*7)/10;
    if(value===shownLines)return;
    if(value>0&&lines.hidden)lines.hidden=false;
    lines.style.opacity=String(value);
    if(!value)lines.hidden=true;
    shownLines=value;
  }
  return {
    // Gallop start, at the horse's feet (x,y,z) facing (fx,fz).
    launch(x,y,z,fx,fz){
      launched++;
      spawn('launchRing',x,y+.06,z);
      spawn('launchFlash',x+fx*1.2,y+1.1,z+fz*1.2);
      kicks.launch=0;
    },
    impact(x,y,z){
      impacts++;
      spawn('impact',x,y+.9,z);
      kicks.impact=0;
    },
    finish(x,y,z){spawn('dust',x,y+.05,z);},
    update(dt,lineStrength=0){
      if(disposed)return;
      const step=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
      for(let i=0;i<PULSE_CAPACITY;i++){
        const p=pulses[i];
        if(!p.busy)continue;
        p.time+=step;
        const age=p.time/p.seconds;
        if(age>=1){p.busy=false;p.mesh.setEnabled(false);continue;}
        p.material.setFloat('age',age);
      }
      let offset=0;
      for(let n=0;n<KICK_NAMES.length;n++){
        const name=KICK_NAMES[n];
        if(kicks[name]<0)continue;
        kicks[name]+=step;
        const kick=KICKS[name];
        if(kicks[name]>=kick.rise+kick.fall)kicks[name]=-1;
        else offset+=envelope(kick,kicks[name]);
      }
      applyFov(offset*(reduced?.25:1));
      showLines(lineStrength);
    },
    // Stop at once: discs hidden, camera restored, lines hidden (dismount, capture, travel).
    reset(){
      if(disposed)return;
      kicks.launch=kicks.impact=-1;
      for(const p of pulses)if(p.busy){p.busy=false;p.mesh.setEnabled(false);}
      applyFov(0);showLines(0);
    },
    inspect:()=>({ready,busy:pulses.filter(p=>p.busy).length,fovOffset:fovApplied,lines:shownLines,launched,impacts}),
    dispose(){
      if(disposed)return;
      disposed=true;stopListening();
      applyFov(0);
      for(const p of pulses){p.mesh.dispose();p.material.dispose();}
      pulses.length=0;
      lines?.remove();lines=null;preparation=null;
    },
  };
}
