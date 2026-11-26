import {Color3, Mesh, ShaderMaterial, Vector3, VertexData} from '@babylonjs/core';
import {prepareModelShaders} from '../boss-shader-warmup.js';
import {CAVE_FOG_GLSL} from '../cave-fog-cover.js';
import {bindCaveFogMaterial} from '../cave-fog-binding.js';
import {createStarfallGlow} from './starfall-glow.js';
import {CRACK_LIP,CRACK_STATIONS,buildCrackField,crackReach,station} from './starfall-cracks.js';
import {vibrate} from './accessibility.js';

// Twelve marks cover five seconds even at the .45 s held-input threshold.
// All three batches are built once. Only occupied impact slots are drawn.
const IMPACT_CAPACITY=12;
const IMPACT_SECONDS=5;
// On-screen floor colour the crack and stone tones derive from: per-map constants,
// the median screen colour around the review landings (Great Plains clearing,
// Witch's Cave hall). A map can pass its own groundTone.
const PLAINS_GROUND=[.61,.55,.39],CAVE_GROUND=[.24,.255,.30];

const projectPoint=cave=>`
 ${cave?'varying highp vec3 fogPoint;':''}
 void projectStarfall(vec3 p){
   ${cave?'fogPoint=p;':''}
   gl_Position=worldViewProjection*vec4(p,1.0);
 }`;
const fogFragment=cave=>cave?`
 varying highp vec3 fogPoint;
 ${CAVE_FOG_GLSL}
`:'';
const hideInFog=cave=>cave?'if(caveFogHidesInk(fogPoint))discard;':'';

const vertexSource = cave=>`
 precision highp float;
 attribute vec3 position;
 attribute vec2 uv;
 attribute vec4 color;
 uniform mat4 worldViewProjection, view;
 uniform vec3 grip, tip;
 uniform float charge, clock, swing;
 varying vec4 tint;
 ${projectPoint(cave)}

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
   projectStarfall(p);
 }`;

// Fractions of the authored flight vectors, shared with the terrain samples.
const AIR_ORIGIN=.36,AIR_ORIGIN_SPREAD=.16,AIR_REACH=1.0,AIR_CHARGE_REACH=.67;
const impactVertexSource = cave=>`
 precision highp float;
 attribute vec3 position;
 attribute vec2 uv, uv2, sampleY;
 attribute vec4 color;
 uniform mat4 worldViewProjection, view;
 uniform vec4 anchors[12], groundFrame[12];
 uniform float born[12], impactCharge[12], clearRadius[12], elapsed;
 uniform mediump vec3 groundTone;
 varying vec4 tint;
 varying highp vec4 rubbleSurface;
 varying mediump vec4 crackLook;
 ${projectPoint(cave)}
 mat3 tumble(vec3 angle){
   vec3 s=sin(angle),c=cos(angle);
   // Local roll, pitch and yaw rotate stone vertices and their flat face normals together.
   return mat3(c.y*c.z,s.x*s.y*c.z+c.x*s.z,-c.x*s.y*c.z+s.x*s.z,
              -c.y*s.z,-s.x*s.y*s.z+c.x*c.z,c.x*s.y*s.z+s.x*c.z,
               s.y,-s.x*c.y,c.x*c.y);
 }
 void main(){
   int slot=int(uv.x);
   float age=max(0.0,elapsed-born[slot]),seed=fract(uv.y);
   vec4 anchor=anchors[slot];
   vec2 rotation=groundFrame[slot].xy;
   mat2 turn=mat2(rotation.x,rotation.y,-rotation.y,rotation.x);
   vec2 offset;
   float height,alpha=color.a;
   vec3 tone=color.rgb;
   rubbleSurface=vec4(0.);crackLook=vec4(0.);
   if(uv.y>=1.0&&age>1.75){tint=vec4(0.);projectStarfall(anchor.xyz);return;}
   if(uv.y<1.0){
     // Impact web, built per landing in metres. It rips open from the centre in
     // 0.16 s, holds, then closes from the tips inward between 3.2 and 5 s.
     float across=uv2.x,side=abs(across),dist=position.y;
     float layer=floor(uv2.y*0.5),heat=uv2.y-2.*layer;
     float mode=floor(color.b*0.5),along=color.b-2.*mode;
     float opening=smoothstep(0.0,0.24,age/0.16-dist);
     // Full until 3.2 s; by 4.6 s the whole fault narrows to 35% while the tips
     // retreat by a quarter; the last 0.4 s closes the rest.
     float fade=clamp((age-3.2)/1.4,0.,1.),last=clamp((age-4.6)/0.4,0.,1.);
     float shut=smoothstep(0.,0.06,1.-0.25*fade-0.75*last-along);
     float width=opening*shut*mix(1.,0.35,smoothstep(0.,1.,fade))*(1.-last);
     offset=position.xz+color.rg*across*width;
     // Edge samples extrapolate to the lip; trenches sit above lips, primaries above forks.
     // A collapsed station keeps one height so the bridges between strips stay flat.
     float lift=dot(color.rg,color.rg)>0.?(side>1.01?0.008:0.016+0.003*layer):0.012;
     height=mix(sampleY.x,sampleY.y,side*width)+lift;
     vec2 normal=turn*color.rg;
     normal*=inversesqrt(max(dot(normal,normal),1e-8));
     float facing=dot(normal,normalize(vec2(view[0][2],view[2][2])+vec2(0.00001)));
     // Starlight strength: level and charge (heat), fading toward the tips.
     float hot=heat*opening*pow(max(0.,1.-0.9*dist),1.5);
     rubbleSurface=vec4(across,color.a,facing,-1.-hot);
     crackLook=vec4(fade,mode,dist,age-dist*0.16);
   }else{
     float family=floor(uv.y),power=impactCharge[slot];
     bool slab=family==1.,gravel=family==3.,spark=family==4.;
     float delay=slab?0.014*seed:(gravel?0.08+0.11*seed:0.025+0.065*seed);
     float duration=(slab?0.65+0.19*seed:(gravel?0.35+0.12*seed:0.48+0.18*seed))*(0.84+0.31*power);
     float t=age-delay,flight=clamp(t/duration,0.,1.);
     float rebound=clamp((t-duration)/0.23,0.,1.),skip=clamp((t-duration-0.23)/0.13,0.,1.);
     float arc=4.*flight*(1.-flight),hop=4.*rebound*(1.-rebound),lastHop=4.*skip*(1.-skip);
     vec2 dir=normalize(uv2);
     float vectorLength=length(uv2)*anchor.w;
     float margin=slab?0.66:(family==2.?0.39:0.30);
     float clearance=clearRadius[slot]>0.?clearRadius[slot]+0.20:anchor.w*0.35;
     float start=max(vectorLength*(${AIR_ORIGIN}+${AIR_ORIGIN_SPREAD}*seed),clearance+margin*(0.72+0.58*power));
     float end=max(vectorLength*(${AIR_REACH.toFixed(2)}+${AIR_CHARGE_REACH}*power),start+anchor.w*(0.28+0.54*power)*(gravel?1.35:0.85));
     float airborne=0.82*flight*(1.36-0.36*flight)+0.14*rebound+0.04*skip;
     float peak=slab?1.65+1.28*seed:(gravel?0.38+0.56*seed:(spark?1.68+1.10*seed:1.0+1.27*seed));
     float scale=0.72+0.58*power;
     vec3 spin=vec3(6.28318*flight,seed*5.+flight*(2.2+seed*4.0),6.28318*flight*(seed>.5?-1.:1.));
     spin.xz+=vec2(0.76,-0.45)*hop+vec2(-0.24,0.21)*lastHop;
     mat3 rot=tumble(spin);
     float reveal=smoothstep(-0.010,0.035,t);
     float shrink=spark?1.-smoothstep(0.25,0.58,t):1.-smoothstep(duration+0.35,duration+0.59,t);
     vec3 corner=rot*position*(scale*reveal*shrink);
     offset=dir*mix(start,end,airborne)+corner.xz;
     height=mix(sampleY.x,sampleY.y,airborne)+corner.y+0.035+
        (arc*peak+hop*(0.16+0.23*seed)+lastHop*0.09)*(0.70+0.57*power);
     vec3 face=rot*(color.rgb*2.-1.);
     face.xz=turn*face.xz;
     float sun=0.5+0.5*dot(face,vec3(-0.45,0.81,-0.37));
     // Stone takes the floor's hue: identical on the plains, blue-grey in caves.
     vec3 soil=groundTone/vec3(${PLAINS_GROUND.join(',')});
     vec3 crust=mix(vec3(0.15,0.12,0.11),vec3(0.57,0.49,0.39),sun*sun)*soil;
     vec3 fracture=mix(vec3(0.27,0.20,0.15),vec3(0.86,0.74,0.55),sun)*soil;
     float cut=color.a,heat=(1.-smoothstep(0.06,0.56,t))*(0.58+0.42*power);
     tone=mix(crust,fracture,cut);
     tone=mix(tone,mix(vec3(1.,0.54,0.15),vec3(1.,0.93,0.68),sun),heat*cut*(0.55+0.45*sun));
     if(spark){
       tone=mix(vec3(1.,0.59,0.18),seed>.66?vec3(0.78,0.90,1.):vec3(1.,0.98,0.78),sun);
     }else{
       rubbleSurface=vec4(position.x+0.29*position.z,position.y+0.42*position.z,seed,0.20+cut);
     }
   }
   offset=turn*offset;
   vec3 p=anchor.xyz+vec3(offset.x,height,offset.y);
   tint=vec4(tone,alpha);
   projectStarfall(p);
 }`;

// Physical fissures and rocks write depth; their geometry closes or shrinks.
const impactFragmentSource = cave=>`precision mediump float; varying vec4 tint;
 varying highp vec4 rubbleSurface;
 varying mediump vec4 crackLook;
 uniform mediump vec3 groundTone;
 ${fogFragment(cave)}
 void main(){
   ${hideInFog(cave)}
   vec3 lit=tint.rgb;
   if(rubbleSurface.w<0.){
     // V-shaped trench: dark floor toward the centre line, the wall that faces the
     // camera lit, a raised lip on the rims. Tones derive from the ground colour.
     float across=rubbleSurface.x,arc=rubbleSurface.y,facing=rubbleSurface.z,hot=-1.-rubbleSurface.w;
     float fade=crackLook.x,mode=crackLook.y,dist=crackLook.z;
     float side=abs(across);
     float chip=abs(fract(arc*5.3)-.5)+.6*abs(fract(arc*13.1+.37)-.5);
     float rim=0.93-0.16*chip;
     vec3 g=groundTone;
     if(side<rim){
       float t=side/rim,far=step(0.,across*facing);
       lit=g*mix(0.22,0.40,t*t);
       float wall=smoothstep(0.66,0.80,t);
       lit=mix(lit,g*mix(0.30,0.62,far),wall*(0.55+0.45*far));
       // Starlight in the fissure, in the flash and ring palette: cream-white to
       // 0.22 s after the fault opens, pale gold to 0.45 s, a dim amber line to 1.1 s.
       // Only a narrow core of the floor glows; both walls stay dark.
       float a=crackLook.w;
       vec3 star=mix(vec3(1.,0.94,0.74),vec3(1.,0.84,0.56),smoothstep(0.16,0.30,a));
       star=mix(star,vec3(1.,0.68,0.32),smoothstep(0.38,0.58,a));
       float life=step(0.,a)*(1.-0.40*smoothstep(0.18,0.32,a))*(1.-0.45*smoothstep(0.40,0.62,a))*(1.-smoothstep(0.70,1.10,a));
       float core=mix(0.35,0.16,smoothstep(0.20,0.60,a));
       lit=mix(lit,star,clamp(hot*life*1.3,0.,1.)*(1.-smoothstep(core*0.6,core,t)));
     }else{
       float u=(side-rim)/(${CRACK_LIP.toFixed(2)}-rim);
       float strength=(1.-0.55*dist)*(1.-fade);
       // Alternate plates: the lifted rim catches light, the dropped rim has no lip.
       float up=mode<0.5?0.6:(((mode<1.5)==(across>0.))?1.:0.);
       float broken=step(0.22,fract(arc*1.7+0.31*chip));
       if(u>up*strength*broken*(0.55+0.6*chip))discard;
       lit=g*(1.+0.18*strength*up);
     }
   }else if(rubbleSurface.w>0.){
     // A crooked mineral seam follows the stone as it turns; no texture samples.
     vec2 q=rubbleSurface.xy;float seed=rubbleSurface.z;
     float chip=abs(fract(q.x*6.3+seed*4.1)-0.5);
     float seam=abs(q.y+0.24*q.x+0.078*chip-0.23*seed);
     float grain=fract(q.x*17.7+q.y*23.1+chip*1.6);
     lit*=0.93+0.10*grain;
     lit=mix(lit,vec3(0.96,0.81,0.56),rubbleSurface.w*0.58*(1.-smoothstep(0.002,0.014,seam)));
   }
   gl_FragColor=vec4(lit,1.0);
 }`;
const fragmentSource = cave=>`precision mediump float; varying vec4 tint;
 ${fogFragment(cave)}
 void main(){if(tint.a<0.01)discard;${hideInFog(cave)}gl_FragColor=tint;}`;

const gold=[1,.66,.22], ivory=[1,.98,.84], frost=[.53,.84,1];
const stone=[.42,.33,.28];

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

// The ground cut is a fixed block of crack stations per slot (four vertices each:
// lip, trench edge, trench edge, lip) followed by the authored debris. Stations are
// filled for each landing; their quads are static and collapse when unused.
const CRACK_VERTICES=CRACK_STATIONS*4;
function impactGeometry(){
  const {data,vertex,indices}=makeGeometry(),travel=[];
  let endX=0,endZ=0;
  function point(x,y,z,kind,tone,alpha=1){
    travel.push(endX,endZ);return vertex(x,y,z,0,kind,tone,alpha);
  }
  const lip=[-CRACK_LIP,-1,1,CRACK_LIP],blank=[0,0,0];
  for(let i=0;i<CRACK_STATIONS;i++){
    for(const across of lip){endX=across;endZ=0;point(0,0,0,.1,blank,0);}
    if(i)for(let c=0;c<3;c++){
      const a=4*(i-1)+c,b=4*i+c;indices.push(a,a+1,b,b,a+1,b+1);
    }
  }
  // Flat normals occupy RGB on solid pieces; alpha distinguishes crust and fresh cuts.
  // Each side has its own vertices while the two triangles of a face share corners.
  function face(corners,kind,cut){
    const [a,b,c]=corners,ab=Vector3.FromArray(b).subtractInPlace(Vector3.FromArray(a));
    const ac=Vector3.FromArray(c).subtractInPlace(Vector3.FromArray(a));
    const n=Vector3.Cross(ab,ac).normalize();
    const packed=[.5+.5*n.x,.5+.5*n.y,.5+.5*n.z];
    const start=point(...a,kind,packed,cut);
    for(let j=1;j<corners.length;j++)point(...corners[j],kind,packed,cut);
    for(let j=1;j<corners.length-1;j++)indices.push(start,start+j,start+j+1);
  }
  for(let i=0;i<46;i++){
    const family=i<6?1:i<16?2:i<34?3:4;
    const seed=((i+.73)*.61803398875)%1,a=i*2.39996+.29*Math.sin(i*5.2);
    const reach=(family===3?.90:.68)+.50*((i*.73205+.31)%1);
    endX=Math.cos(a)*reach;endZ=Math.sin(a)*reach;
    const kind=family+seed;
    if(family<=2){
      // Keep the largest foreground stones clear of the target silhouette.
      const w=family===1?.8*(.32+.22*seed):.14+.14*seed;
      const depth=w*(.56+.24*((i*.43)%1)),thick=w*(.51+.42*((i*.29)%1));
      const outline=family===1?[[-1,-.35],[-.32,-1],[.87,-.71],[.99,.36],[.15,.94],[-.80,.66]]:
        [[-1,-.42],[.62,-.83],[.91,.45],[-.45,.93]];
      const rim=[],top=[],bottom=[];
      // A sheared corner and an inclined cleavage plane separate each silhouette.
      for(let j=0;j<outline.length;j++){
        const [x,z]=outline[j],jag=.86+.18*Math.sin(i*7.3+j*4.1);
        rim.push([x*w*jag,thick*(.25+.09*z),z*depth*jag]);
        const bevel=.74+.18*Math.sin(j*5.1+i*1.72);
        top.push([(x*bevel+.08)*w*jag,thick*(.81+.28*x-.13*z),z*bevel*depth*jag]);
        bottom.push([(x*.79-.04)*w*jag,.025*thick,(z*.79+.04)*depth*jag]);
      }
      face([...top].reverse(),kind,i%3===0?.88:.13);face(bottom,kind,.17);
      for(let j=0;j<rim.length;j++){
        const k=(j+1)%rim.length;
        face([rim[j],top[j],top[k],rim[k]],kind,j===i%rim.length||j===(i+1)%rim.length?.95:.34);
        face([bottom[j],rim[j],rim[k],bottom[k]],kind,j===(i+3)%rim.length?.58:.06);
      }
    }else{
      const spark=family===4,w=spark?.022+.018*seed:.049+.07*seed;
      const length=spark?w*(4.4+2.2*seed):w*(1.2+seed);
      const a=[-length,.10*w,.25*w],b=[.54*length,0,-w],c=[.9*length,.28*w,.62*w],d=[.18*length,1.24*w,.09*w];
      face([a,b,c],kind,.10);face([a,d,b],kind,.39);face([b,d,c],kind,.89);face([c,d,a],kind,.22);
    }
  }
  // Every slot starts from the same block. Crack stations, sampled ground heights,
  // location and turn belong to the slot, so revisiting a map never retains old terrain.
  const template={positions:data.positions,colors:data.colors,uvs:data.uvs,uvs2:travel};
  const repeated=new VertexData(),vertices=data.positions.length/3;
  for(const [key,source] of [['positions',data.positions],['colors',data.colors],['uvs',data.uvs],['uvs2',travel]]){
    const array=new Float32Array(source.length*IMPACT_CAPACITY);
    for(let slot=0;slot<IMPACT_CAPACITY;slot++)array.set(source,slot*source.length);
    repeated[key]=array;
  }
  repeated.indices=new Uint16Array(indices.length*IMPACT_CAPACITY);
  for(let slot=0;slot<IMPACT_CAPACITY;slot++){
    for(let i=0;i<vertices;i++)repeated.uvs[(slot*vertices+i)*2]=slot;
    for(let j=0;j<indices.length;j++)repeated.indices[slot*indices.length+j]=indices[j]+slot*vertices;
  }
  return {repeated,template,vertices};
}

function batch(scene,name,data,shader,uniforms,cave,impact=false){
  const mesh=new Mesh(name,scene);
  data.applyToMesh(mesh);mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);
  const material=new ShaderMaterial(name+'-light',scene,{vertexSource:shader(cave),fragmentSource:(impact?impactFragmentSource:fragmentSource)(cave)},{
    attributes:impact?['position','uv','uv2','sampleY','color']:['position','uv','color'],
    uniforms:['worldViewProjection','view',...uniforms,...(cave?['caveFogRect','caveFogActive','caveFogOrigin']:[])],
    samplers:cave?['caveFogMap']:[],
    needAlphaBlending:!impact,needAlphaTesting:impact,
  });
  mesh.material=material;material.disableDepthWrite=!impact;material.backFaceCulling=false;
  if(cave){
    bindCaveFogMaterial(scene,material);
    material.onBindObservable.add(()=>bindCaveFogMaterial(scene,material,material._activeEffect));
  }
  return mesh;
}

export function createGreatAttackFx({scene,root,project,ground,now=()=>performance.now(),cave=!!scene.metadata?.caveFogRuntime,groundTone=cave?CAVE_GROUND:PLAINS_GROUND}){
  const light=batch(scene,'v03-starfall',chargeGeometry(),vertexSource,['grip','tip','charge','clock','swing'],cave);
  const {repeated:shape,template,vertices}=impactGeometry();
  const scars=batch(scene,'v03-starfall-ground',shape,impactVertexSource,['anchors','groundFrame','born','impactCharge','clearRadius','elapsed','groundTone'],cave,true);
  const draw=scars.subMeshes[0],indicesPerImpact=draw.indexCount/IMPACT_CAPACITY;
  const engine=scene.getEngine();
  // The crack block of every slot is rewritten per landing; the debris after it
  // repeats the template, so shifting whole slots keeps both correct.
  const heights=new Float32Array(IMPACT_CAPACITY*vertices*2);
  const dynamic=[['position',shape.positions,3],['color',shape.colors,4],['uv2',shape.uvs2,2],['sampleY',heights,2]];
  for(const [kind,array,stride] of dynamic)scars.setVerticesData(kind,array,true,stride);
  const buffers=dynamic.map(([kind])=>scars.getVertexBuffer(kind));
  // Babylon uses the mesh bounds for a full submesh, but asks the submesh itself
  // for its bounds as soon as we shorten the draw range to the occupied slots.
  const bounds=scars.getBoundingInfo(),minimum=new Vector3(),maximum=new Vector3();
  draw.setBoundingInfo(bounds);
  const anchors=new Float32Array(IMPACT_CAPACITY*4),groundFrame=new Float32Array(IMPACT_CAPACITY*4),born=new Float32Array(IMPACT_CAPACITY);
  const impactCharge=new Float32Array(IMPACT_CAPACITY),clearRadius=new Float32Array(IMPACT_CAPACITY),reach=new Float32Array(IMPACT_CAPACITY);
  function upload(first,end){
    // Keep the complete CPU arrays on the vertex buffers for context restoration,
    // and transfer only the inserted or shifted slots to the existing GPU buffers.
    for(let k=0;k<dynamic.length;k++){
      const array=dynamic[k][1],stride=dynamic[k][2],start=first*vertices*stride;
      engine.updateDynamicVertexBuffer(buffers[k].getBuffer(),array.subarray(start,end*vertices*stride),start*array.BYTES_PER_ELEMENT);
    }
  }
  scars.material.setArray4('anchors',anchors).setArray4('groundFrame',groundFrame).setFloats('born',born).setFloats('impactCharge',impactCharge).setFloats('clearRadius',clearRadius);
  scars.material.setColor3('groundTone',Color3.FromArray(groundTone));
  const glow=createStarfallGlow(scene,{cave,anchors,groundFrame,born,impactCharge,clearRadius,faults:[],branchCharge:()=>0});
  let disposed=false;
  void prepareModelShaders({meshes:[light,scars,glow.mesh]},{includeInstanceVariants:false,keepPrograms:false})
    .catch(error=>{if(!disposed&&!scene.isDisposed)console.warn('[MoonForest] starfall preparation',error);});
  const gauge=root.ownerDocument.createElement('div'),fill=root.ownerDocument.createElement('div');
  gauge.className='mf-starfall-gauge';gauge.hidden=true;gauge.setAttribute('aria-hidden','true');gauge.append(fill);root.append(gauge);
  const grip=new Vector3(),tip=new Vector3();
  let count=0,epoch=0,action=null,chargeAt=0,lastCharge=0,lastImpact=null;

  function syncImpactDraw(){
    draw.indexCount=count*indicesPerImpact;scars.setEnabled(count>0);glow.sync(count,bounds);
    if(!count)return;
    minimum.set(Infinity,Infinity,Infinity);maximum.set(-Infinity,-Infinity,-Infinity);
    // Includes the crack web, the farthest gravel and the width and drift of the dust fans.
    for(let slot=0;slot<count;slot++){
      const i=slot*4,x=anchors[i],y=anchors[i+1],z=anchors[i+2],span=anchors[i+3];
      const power=impactCharge[slot],clear=clearRadius[slot];
      const origin=Math.max(span*.73,clear?clear+.20:span*.35)+.66*(.72+.58*power);
      const r=Math.max(span*1.8,1.4*span*(AIR_REACH+AIR_CHARGE_REACH*power),origin+span*(.28+.54*power)*1.35,reach[slot]+.3)+1.05;
      minimum.minimizeInPlaceFromFloats(x-r,y+groundFrame[i+2]-.8,z-r);
      maximum.maximizeInPlaceFromFloats(x+r,y+groundFrame[i+3]+2.85+2.0*power,z+r);
    }
    bounds.reConstruct(minimum,maximum,scars.getWorldMatrix());
  }
  function removeOldest(n){
    count-=n;glow.shift(n,count);
    if(count){
      anchors.copyWithin(0,n*4);groundFrame.copyWithin(0,n*4);born.copyWithin(0,n);impactCharge.copyWithin(0,n);clearRadius.copyWithin(0,n);reach.copyWithin(0,n);
      for(const [,array,stride] of dynamic)array.copyWithin(0,n*vertices*stride,(n+count)*vertices*stride);
      upload(0,count);
    }
  }
  function tick(){
    if(disposed||!count)return;
    const elapsed=(now()-epoch)/1000;
    let expired=0;
    while(expired<count&&elapsed-born[expired]>=IMPACT_SECONDS)expired++;
    if(expired){removeOldest(expired);syncImpactDraw();}
    if(count){scars.material.setFloat('elapsed',elapsed);glow.tick(elapsed);}
  }
  function impact(cast){
    tick();
    const stamp=now();
    if(!count)epoch=stamp;
    if(count===IMPACT_CAPACITY)removeOldest(1);
    const {x,y,z}=cast.center,r=cast.radius,offset=count*4;
    anchors[offset]=x;anchors[offset+1]=y;anchors[offset+2]=z;anchors[offset+3]=r;
    // Legacy/direct impact events have no release sample and used full-strength art.
    const power=impactCharge[count]=Math.max(0,Math.min(1,cast.releaseCharge??1));
    const bodyRadius=clearRadius[count]=Math.max(0,cast.clearRadius??0);
    const clearance=bodyRadius?bodyRadius+.20:r*.35,level=cast.level??3;
    reach[count]=crackReach(r,level,power,bodyRadius);
    born[count]=(stamp-epoch)/1000;
    const angle=(x*.235+z*.373+born[count]*.29)*2*Math.PI;
    const c=groundFrame[offset]=Math.fround(Math.cos(angle)),s=groundFrame[offset+1]=Math.fround(Math.sin(angle));
    let low=Infinity,high=-Infinity;
    function elevation(dx,dz){
      const h=ground?.(x+c*dx-s*dz,z+s*dx+c*dz);
      const relative=Number.isFinite(h)?h-y:0;
      low=Math.min(low,relative);high=Math.max(high,relative);return relative;
    }
    // The web is seeded by the landing, so two strikes never share a pattern.
    const seed=(Math.round(x*97)*73856093^Math.round(z*89)*19349663^Math.round(stamp*7)*83492791)|0;
    const used=buildCrackField(seed,r,level,power,bodyRadius),centre=elevation(0,0);
    const base=count*vertices;
    // Trace both trench edges at every station; lips extrapolate from them.
    for(let i=0;i<CRACK_STATIONS;i++){
      const sx=station.x[i],sz=station.z[i],nx=station.nx[i],nz=station.nz[i];
      let left,right;
      if(i>=used)left=right=centre;
      else if(nx===0&&nz===0){left=right=elevation(sx,sz);}
      else{left=elevation(sx-nx,sz-nz);right=elevation(sx+nx,sz+nz);}
      const middle=(left+right)*.5,meta=station.meta[i],arc=station.arc[i];
      const uv2=(station.layer[i]*2)+Math.min(.999,station.heat[i]);
      for(let k=0;k<4;k++){
        const v=base+4*i+k;
        shape.positions[3*v]=sx;shape.positions[3*v+1]=station.dist[i];shape.positions[3*v+2]=sz;
        shape.colors[4*v]=nx;shape.colors[4*v+1]=nz;shape.colors[4*v+2]=meta;shape.colors[4*v+3]=arc;
        shape.uvs2[2*v+1]=uv2;
        heights[2*v]=middle;heights[2*v+1]=k<2?left:right;
      }
    }
    let lastX=NaN,lastZ=NaN,sourceY=0,landingY=0;
    for(let i=CRACK_VERTICES;i<vertices;i++){
      const at=(base+i)*2,kind=template.uvs[2*i+1];
      const dx=template.uvs2[2*i],dz=template.uvs2[2*i+1];
      if(lastX!==dx||lastZ!==dz){
        const family=Math.floor(kind),len=Math.hypot(dx,dz);
        const margin=family===1?.66:family===2?.39:.30;
        const start=Math.max(len*r*(AIR_ORIGIN+AIR_ORIGIN_SPREAD*(kind%1)),clearance+margin*(.72+.58*power))/len;
        const end=Math.max(len*r*(AIR_REACH+AIR_CHARGE_REACH*power),start*len+r*(.28+.54*power)*(family===3?1.35:.85))/len;
        sourceY=elevation(dx*start,dz*start);landingY=elevation(dx*end,dz*end);
        lastX=dx;lastZ=dz;
      }
      heights[at]=sourceY;heights[at+1]=landingY;
    }
    glow.add(count,elevation);
    groundFrame[offset+2]=low;groundFrame[offset+3]=high;
    upload(count,count+1);
    scars.material.setFloat('elapsed',born[count]);
    count++;syncImpactDraw();glow.tick(born[count-1]);
    const doc=root.ownerDocument,view=doc.defaultView;
    if(!doc.hidden&&view?.matchMedia?.('(pointer: coarse)')?.matches){
      vibrate(55,view.navigator); // honours the 진동 switch (accessibility.js)
    }
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
    // Shader vertices surround the live sword by up to 3.78 m plus the star
    // billboards. CPU bounds drive cave sight and transparent draw sorting.
    minimum.set(Math.min(grip.x,tip.x)-4.2,Math.min(grip.y,tip.y)-1,Math.min(grip.z,tip.z)-4.2);
    maximum.set(Math.max(grip.x,tip.x)+4.2,Math.max(grip.y,tip.y)+2.8,Math.max(grip.z,tip.z)+4.2);
    light.getBoundingInfo().reConstruct(minimum,maximum,light.getWorldMatrix());
    const windup=cast.charging, swing=windup?0:cast.progress;
    if(Number.isFinite(cast.chargeProgress))lastCharge=cast.chargeProgress;
    else if(windup)lastCharge=cast.progress;
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
    // The cave mask belongs to the map and is shared by other materials.
    for(const mesh of [light,scars,glow.mesh]){const material=mesh.material;mesh.dispose();material.dispose();}
  }
  const observer=scene.onDisposeObservable.addOnce(dispose);
  return {scene,cave,get active(){return count>0||action!==null;},update,tick,reset,dispose};
}
