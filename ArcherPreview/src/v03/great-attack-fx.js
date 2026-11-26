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
 attribute vec2 uv, uv2, sampleY;
 attribute vec4 color;
 uniform mat4 worldViewProjection;
 uniform vec4 anchors[12], patch[12];
 uniform float born[12], elapsed;
 varying vec4 tint;
 void main(){
   int slot=int(uv.x);
   float age=max(0.0,elapsed-born[slot]),seed=fract(uv.y);
   vec4 anchor=anchors[slot];
   vec2 rotation=patch[slot].xy;
   mat2 turn=mat2(rotation.x,rotation.y,-rotation.y,rotation.x);
   vec2 offset;
   float height,alpha=color.a;
   vec3 tone=color.rgb;
   if(uv.y<1.0){
     offset=position.xz*anchor.w;
     height=sampleY.x+0.009;
     // Open at the point of impact and race along the fixed ground vertices.
     alpha*=smoothstep(-0.10,0.06,age*6.5-length(position.xz)*0.65);
     tone=mix(tone,tone*vec3(0.55,0.55,0.62),smoothstep(0.18,1.6,age)*uv.y);
     alpha*=1.0-smoothstep(4.0,5.0,age);
   }else{
     float delay=seed*0.055,flight=clamp((age-delay)/(0.54+0.38*seed),0.0,1.0);
     float bounce=clamp((age-delay-0.54-0.38*seed)/0.20,0.0,1.0);
     float arc=4.0*flight*(1.0-flight),hop=4.0*bounce*(1.0-bounce);
     float reach=0.08+0.86*flight+0.06*bounce;
     float spin=arc*(0.9+seed*3.1),c=cos(spin),s=sin(spin);
     offset=uv2*anchor.w*reach+mat2(c,s,-s,c)*position.xz;
     height=mix(sampleY.x,sampleY.y,(reach-0.08)/0.92)+position.y+0.012+
       arc*(0.55+1.78*seed)+hop*(0.055+0.15*seed);
     alpha*=smoothstep(-0.02,0.025,age-delay)*(1.0-smoothstep(1.18,1.55,age));
   }
   offset=turn*offset;
   vec3 p=anchor.xyz+vec3(offset.x,height,offset.y);
   tint=vec4(tone,alpha);
   gl_Position=worldViewProjection*vec4(p,1.0);
 }`;

// Coverage fading keeps rock and terrain in the depth-writing alpha-test pass.
// Opaque and masked bodies occlude them by depth. Fading bodies blend over them.
const impactFragmentSource = `precision mediump float; varying vec4 tint;
 float bayer2(vec2 p){return mod(2.0*p.x+3.0*p.y,4.0);}
 void main(){
   vec2 p=mod(floor(gl_FragCoord.xy),4.0);
   float threshold=(4.0*bayer2(mod(p,2.0))+bayer2(floor(p*0.5))+0.5)/16.0;
   if(tint.a<=threshold)discard;
   gl_FragColor=vec4(tint.rgb,1.0);
 }`;
const fragmentSource = `precision mediump float; varying vec4 tint;
 void main(){if(tint.a<0.01)discard;gl_FragColor=tint;}`;

const gold=[1,.66,.22], ivory=[1,.98,.84], frost=[.53,.84,1];
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

// Main faults run through the strike in different directions. Smaller fractures
// start on an existing fault or link two plates, leaving intact islands between.
const FAULTS=[
 [.073,[[0,0],[.13,.05],[.29,.02],[.40,.16],[.58,.12],[.68,.24],[.89,.24],[1.06,.35]]],
 [.063,[[.06,.01],[-.12,-.08],[-.28,-.04],[-.40,-.23],[-.58,-.20],[-.69,-.39],[-.86,-.43]]],
 [.058,[[-.07,.02],[-.18,.18],[-.14,.31],[-.28,.43],[-.24,.58],[-.41,.76],[-.40,.97]]],
 [.051,[[.03,-.05],[.12,-.20],[.07,-.32],[.22,-.46],[.18,-.58],[.34,-.75]]],
 [.037,[[-.18,.18],[-.30,.22],[-.43,.16],[-.58,.26],[-.80,.29]]],
 [.032,[[.29,.02],[.35,-.12],[.51,-.17],[.59,-.33],[.77,-.40]]],
 [.027,[[.40,.16],[.43,.30],[.36,.40],[.45,.58],[.40,.72]]],
 [.031,[[-.40,-.23],[-.36,-.37],[-.48,-.51],[-.46,-.67]]],
 [.023,[[-.14,.31],[.01,.32],[.12,.43],[.30,.40],[.36,.40]]],
 [.019,[[.07,-.32],[-.07,-.40],[-.22,-.36],[-.36,-.37]]],
 [.018,[[.68,.24],[.72,.39],[.83,.45],[.86,.59]]],
 [.023,[[-.28,-.04],[-.37,.02],[-.43,.16]]],
 [.014,[[-.28,.43],[-.42,.46],[-.48,.60],[-.60,.63]]],
 [.014,[[.22,-.46],[.40,-.49],[.49,-.63]]],
];
const cutFace=[.36,.28,.22],deepCut=[.065,.042,.047],sunlitEdge=[.62,.52,.36],hotSeam=[1,.60,.19];
function impactGeometry(){
  const {data,vertex,strip,indices}=makeGeometry(),travel=[];
  let endX=0,endZ=0;
  function point(x,y,z,kind,tone,alpha=1){
    travel.push(endX,endZ);return vertex(x,y,z,0,kind,tone,alpha);
  }
  // Recessed dark floors, a shaded wall, intermittent hot rock, a pale broken lip.
  // Split long segments so even a narrow ridge is traced by nearby vertices.
  for(const [width,path] of FAULTS){
    let previous;
    for(let i=0;i<path.length-1;i++){
      const [x,z]=path[i],[ex,ez]=path[i+1],dx=ex-x,dz=ez-z,len=Math.hypot(dx,dz);
      const steps=Math.ceil(len/.077);
      for(let j=0;j<=steps;j++){
        if(i&&j===0)continue;
        const t=j/steps,u=(i+t)/(path.length-1),chip=Math.sin(i*9.7+j*5.3+width*128);
        const bend=.009*chip*Math.sin(t*Math.PI);
        const cx=x+t*dx-dz/len*bend,cz=z+t*dz+dx/len*bend;
        const w=width*(1-.98*u)*(.88+.18*chip),nx=-dz/len*w,nz=dx/len*w;
        const start=point(cx-nx,0,cz-nz,.05,cutFace);
        point(cx-.62*nx,0,cz-.62*nz,.05,deepCut);
        point(cx+.22*nx,0,cz+.22*nz,.12,deepCut);
        point(cx+.48*nx,0,cz+.48*nz,.94,chip>.20?hotSeam:cutFace);
        point(cx+.76*nx,0,cz+.76*nz,.35,chip>-.12?sunlitEdge:stone);
        point(cx+nx,0,cz+nz,.10,cutFace);
        if(previous!==undefined)for(let edge=0;edge<5;edge++)strip(previous+edge,start+edge);
        previous=start;
      }
    }
  }
  // The blow shatters a central shelf into asymmetric flakes. Adjacent fragments
  // leave narrow gaps through which the underlying ground is still visible.
  for(let i=0;i<13;i++){
    const a=i*2.39996,r=.046+.23*((i*.618)%1),x=Math.cos(a)*r,z=Math.sin(a)*r;
    const w=.026+.045*((i*.732+.3)%1),l=w*(1.2+.6*((i*.473)%1));
    const dx=Math.cos(a)*l,dz=Math.sin(a)*l,nx=-Math.sin(a)*w,nz=Math.cos(a)*w;
    const base=point(x-dx,0,z-dz,.30,deepCut);
    point(x-.45*dx+nx,0,z-.45*dz+nz,.42,cutFace);
    point(x+.86*dx+.6*nx,0,z+.86*dz+.6*nz,.55,sunlitEdge);
    point(x+dx-.42*nx,0,z+dz-.42*nz,.30,cutFace);
    point(x-.55*nx,0,z-.55*nz,.18,stone);
    indices.push(base,base+1,base+4,base+1,base+2,base+4,base+2,base+3,base+4);
  }
  // Angular slabs tumble high; smaller gravel fans out farther and settles along the perimeter.
  for(let i=0;i<52;i++){
    const seed=((i+.73)*.61803398875)%1,a=i*2.39996+.29*Math.sin(i*5.2);
    const size=i<9?.15+.13*seed:i<24?.072+.082*seed:.028+.046*seed;
    const reach=.53+.72*((i*.73205+.31)%1)+(i>=24?.14:0);
    endX=Math.cos(a)*reach;endZ=Math.sin(a)*reach;
    const kind=1+seed,tone=i%5===0?sunlitEdge:stone;
    const base=point(-size,.04*size,-.66*size,kind,cutFace);
    point(.74*size,0,-.81*size,kind,deepCut);point(1.16*size,.25*size,.31*size,kind,cutFace);
    point(-.30*size,.09*size,size,kind,basalt);point(-.62*size,.71*size,-.28*size,kind,tone);
    point(.37*size,1.05*size,.20*size,kind,i%7===0?gold:sunlitEdge);
    indices.push(base,base+1,base+4,base+1,base+5,base+4,base+1,base+2,base+5,
      base+2,base+3,base+5,base+3,base+4,base+5,base+3,base,base+4,base,base+3,base+1,base+1,base+3,base+2);
  }
  // Every slot uses the same authored shape. Its location, turn and sampled ground
  // heights belong to the slot, so revisiting a map never retains the old terrain.
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
  return repeated;
}

function batch(scene,name,data,shader,uniforms,impact=false){
  const mesh=new Mesh(name,scene);
  data.applyToMesh(mesh);mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);
  const material=new ShaderMaterial(name+'-light',scene,{vertexSource:shader,fragmentSource:impact?impactFragmentSource:fragmentSource},{
    attributes:impact?['position','uv','uv2','sampleY','color']:['position','uv','color'],
    uniforms:['worldViewProjection',...uniforms],needAlphaBlending:!impact,needAlphaTesting:impact,
  });
  mesh.material=material;material.disableDepthWrite=!impact;material.backFaceCulling=false;
  return mesh;
}

export function createGreatAttackFx({scene,root,project,ground,now=()=>performance.now()}){
  const light=batch(scene,'v03-starfall',chargeGeometry(),vertexSource,['view','grip','tip','charge','clock','swing']);
  const shape=impactGeometry(),vertices=shape.positions.length/(3*IMPACT_CAPACITY);
  const scars=batch(scene,'v03-starfall-ground',shape,impactVertexSource,['anchors','patch','born','elapsed'],true);
  const draw=scars.subMeshes[0],indicesPerImpact=draw.indexCount/IMPACT_CAPACITY;
  // Babylon uses the mesh bounds for a full submesh, but asks the submesh itself
  // for its bounds as soon as we shorten the draw range to the occupied slots.
  const bounds=scars.getBoundingInfo(),minimum=new Vector3(),maximum=new Vector3();
  draw.setBoundingInfo(bounds);
  const anchors=new Float32Array(IMPACT_CAPACITY*4),patch=new Float32Array(IMPACT_CAPACITY*4),born=new Float32Array(IMPACT_CAPACITY);
  const heights=new Float32Array(IMPACT_CAPACITY*vertices*2);
  scars.setVerticesData('sampleY',heights,true,2);
  const heightBuffer=scars.getVertexBuffer('sampleY'),engine=scene.getEngine();
  function uploadHeights(first,end){
    const start=first*vertices*2,range=heights.subarray(start,end*vertices*2);
    // Keep the complete CPU array on the vertex buffer for context restoration,
    // and transfer only the inserted or shifted slots to the existing GPU buffer.
    engine.updateDynamicVertexBuffer(heightBuffer.getBuffer(),range,start*heights.BYTES_PER_ELEMENT);
  }
  scars.material.setArray4('anchors',anchors).setArray4('patch',patch).setFloats('born',born);
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
    // Includes the farthest gravel, its rotation and the apex of its flight.
    for(let slot=0;slot<count;slot++){
      const i=slot*4,x=anchors[i],y=anchors[i+1],z=anchors[i+2],r=1.40*anchors[i+3]+.40;
      minimum.minimizeInPlaceFromFloats(x-r,y+patch[i+2],z-r);
      maximum.maximizeInPlaceFromFloats(x+r,y+patch[i+3]+2.70,z+r);
    }
    bounds.reConstruct(minimum,maximum,scars.getWorldMatrix());
  }
  function removeOldest(n){
    count-=n;
    if(count){
      anchors.copyWithin(0,n*4);patch.copyWithin(0,n*4);born.copyWithin(0,n);
      heights.copyWithin(0,n*vertices*2,(n+count)*vertices*2);
      uploadHeights(0,count);
    }
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
    const {x,y,z}=cast.center,r=cast.radius*1.68,offset=count*4;
    anchors[offset]=x;anchors[offset+1]=y;anchors[offset+2]=z;anchors[offset+3]=r;
    born[count]=(stamp-epoch)/1000;
    const angle=(x*.235+z*.373+born[count]*.29)*2*Math.PI;
    const c=patch[offset]=Math.fround(Math.cos(angle)),s=patch[offset+1]=Math.fround(Math.sin(angle));
    let low=Infinity,high=-Infinity;
    function elevation(dx,dz){
      const h=ground?.(x+c*dx-s*dz,z+s*dx+c*dz);
      const relative=Number.isFinite(h)?h-y:0;
      low=Math.min(low,relative);high=Math.max(high,relative);return relative;
    }
    // Trace the actual strips, including both edges. A coarse bilinear patch
    // spanning a hillside can bridge straight across a depression above a prone target.
    for(let i=0;i<vertices;i++){
      const px=shape.positions[3*i],pz=shape.positions[3*i+2],at=(count*vertices+i)*2;
      if(shape.uvs[2*i+1]<1){
        heights[at]=heights[at+1]=elevation(px*r,pz*r);
      }else{
        const dx=shape.uvs2[2*i]*r,dz=shape.uvs2[2*i+1]*r;
        heights[at]=elevation(.08*dx+px,.08*dz+pz);
        heights[at+1]=elevation(dx+px,dz+pz);
      }
    }
    patch[offset+2]=low;patch[offset+3]=high;
    uploadHeights(count,count+1);
    scars.material.setFloat('elapsed',born[count]);
    count++;syncImpactDraw();
    const doc=root.ownerDocument,view=doc.defaultView;
    if(!doc.hidden&&view?.matchMedia?.('(pointer: coarse)')?.matches){
      try{view.navigator?.vibrate?.(55);}catch{/* The browser can disallow vibration. */}
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
    light.dispose(false,true);scars.dispose(false,true);
  }
  const observer=scene.onDisposeObservable.addOnce(dispose);
  return {scene,get active(){return count>0||action!==null;},update,tick,reset,dispose};
}
