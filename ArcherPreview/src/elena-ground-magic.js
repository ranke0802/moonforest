import {Color3,Geometry,Mesh,StandardMaterial,VertexBuffer} from '@babylonjs/core';

export const ELENA_GROUND_PATTERNS=Object.freeze(['corridor','fan','ring','cross','cluster']);
export const ELENA_GROUND_MAX_RANGE=14;
export const ELENA_GROUND_FLASH_TIME=.22;
export const ELENA_GROUND_TOPOLOGY_LIMIT=7;
const TAU=Math.PI*2,EPS=1e-8,STEP=.7,RIM_WIDTH=.085;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const finite=(n,fallback)=>Number.isFinite(n)?n:fallback;
const point=(p,fallback={x:0,y:0,z:0})=>({x:finite(p?.x,fallback.x),y:finite(p?.y,fallback.y),z:finite(p?.z,fallback.z)});
const freeze=value=>{for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);};
function offset(center,direction,along,across=0){return {x:center.x+direction.x*along+direction.z*across,y:center.y,z:center.z+direction.z*along-direction.x*across};}
function limitPoint(origin,p,distance){const dx=p.x-origin.x,dz=p.z-origin.z,length=Math.hypot(dx,dz),s=Math.min(1,distance/Math.max(EPS,length));return {x:origin.x+dx*s,y:origin.y,z:origin.z+dz*s};}

/** Immutable world-space attack footprint. Timing, walls, and damage belong to the encounter. */
export function makeSpellPlan(pattern,origin,target,options={}){
  if(!ELENA_GROUND_PATTERNS.includes(pattern))throw new RangeError('Unknown Elena ground spell: '+pattern);
  origin=point(origin);target=point(target,origin);
  const range=clamp(finite(options.range,14),2,ELENA_GROUND_MAX_RANGE),dx=target.x-origin.x,dz=target.z-origin.z,length=Math.hypot(dx,dz);
  const direction=length>EPS?{x:dx/length,z:dz/length}:{x:0,z:1};
  const bossRadius=clamp(finite(options.bossRadius,.8),.1,Math.min(1.5,range*.3));
  target=limitPoint(origin,target,Math.min(9,range));
  const shapes=[];
  if(pattern==='corridor'){
    const halfWidth=clamp(finite(options.halfWidth,1.35),.35,range*.3),end=Math.sqrt(range*range-halfWidth*halfWidth);
    shapes.push({kind:'rect',center:offset(origin,direction,(bossRadius+end)/2),direction,halfLength:(end-bossRadius)/2,halfWidth});
  }else if(pattern==='fan'){
    shapes.push({kind:'sector',center:origin,direction,innerRadius:bossRadius,outerRadius:range,halfAngle:clamp(finite(options.halfAngle,Math.PI*.3),.25,Math.PI*.45)});
  }else if(pattern==='ring'){
    const outerRadius=clamp(finite(options.radius,8.2),Math.max(1,bossRadius+.5),range),innerRadius=clamp(finite(options.innerRadius,2.8),bossRadius,outerRadius-.25);
    shapes.push({kind:'ring',center:origin,innerRadius,outerRadius});
  }else if(pattern==='cross'){
    const halfLength=clamp(finite(options.radius,4.5),.7,range*.4),halfWidth=clamp(finite(options.halfWidth,1.15),.3,halfLength*.6);
    const center=limitPoint(origin,target,Math.max(0,range-Math.hypot(halfLength,halfWidth)));
    shapes.push({kind:'cross',center,direction,halfLength,halfWidth});
  }else{
    const radius=clamp(finite(options.radius,2.15),.4,range*.24),spread=Math.min(3.6,range*.3),center=limitPoint(origin,target,range-radius);
    for(const side of [0,-1,1])shapes.push({kind:'circle',center:limitPoint(origin,offset(center,direction,side?-.8:0,side*spread),range-radius),radius});
  }
  return freeze({pattern,origin,target,direction,range,bossRadius,shapes});
}

function rectangleDistanceSquared(x,z,halfWidth,halfLength){return Math.max(0,Math.abs(x)-halfWidth)**2+Math.max(0,Math.abs(z)-halfLength)**2;}
/** Disc/footprint overlap in XZ, including the player's body radius at visible edges. */
export function spellContains(plan,position,{radius=.3}={}){
  if(!plan||!Number.isFinite(position?.x)||!Number.isFinite(position?.z))return false;
  radius=Math.max(0,finite(radius,.3));
  for(const shape of plan.shapes){
    const dx=position.x-shape.center.x,dz=position.z-shape.center.z,d=Math.hypot(dx,dz);
    if(shape.kind==='circle'){if(d<=shape.radius+radius+EPS)return true;continue;}
    if(shape.kind==='ring'){if(d+radius+EPS>=shape.innerRadius&&d-radius<=shape.outerRadius+EPS)return true;continue;}
    const x=dx*shape.direction.z-dz*shape.direction.x,z=dx*shape.direction.x+dz*shape.direction.z;
    if(shape.kind==='rect'||shape.kind==='cross'){
      if(rectangleDistanceSquared(x,z,shape.halfWidth,shape.halfLength)<=radius*radius+EPS)return true;
      if(shape.kind==='cross'&&rectangleDistanceSquared(z,x,shape.halfWidth,shape.halfLength)<=radius*radius+EPS)return true;
    }else{
      const angle=Math.atan2(x,z),theta=clamp(angle,-shape.halfAngle,shape.halfAngle);
      if(Math.abs(angle)<=shape.halfAngle&&d>=shape.innerRadius&&d<=shape.outerRadius)return true;
      // The nearest point lies on an arc or radial edge of this annular sector.
      const sx=Math.sin(theta),sz=Math.cos(theta),r=clamp(x*sx+z*sz,shape.innerRadius,shape.outerRadius);
      if((x-sx*r)**2+(z-sz*r)**2<=radius*radius+EPS)return true;
    }
  }
  return false;
}

function geometry(){return {positions:[],normals:[],indices:[]};}
function vertex(data,p,terrain,fallback,lift){
  const index=data.positions.length/3,y=finite(terrain?.heightAt(p.x,p.z),fallback);
  data.positions.push(p.x,y+lift,p.z);data.normals.push(0,1,0);return index;
}
function grid(data,rows,columns,at,terrain,fallback,lift){
  const base=data.positions.length/3;
  for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++)vertex(data,at(row/rows,col/columns),terrain,fallback,lift);
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const a=base+row*(columns+1)+col,b=a+columns+1;data.indices.push(a,b,a+1,a+1,b,b+1);
  }
}
function rectangle(data,shape,terrain,lift){
  const {center,direction,halfLength:l,halfWidth:w}=shape;
  grid(data,Math.max(1,Math.ceil(2*l/STEP)),Math.max(1,Math.ceil(2*w/STEP)),(u,v)=>offset(center,direction,(u*2-1)*l,(v*2-1)*w),terrain,center.y,lift);
}
function polar(data,shape,inner,outer,start,end,terrain,lift){
  const direction=shape.direction??{x:0,z:1},sweep=end-start;
  grid(data,Math.max(1,Math.ceil((outer-inner)/STEP)),Math.max(8,Math.ceil(sweep*outer/STEP)),(u,v)=>{
    const r=inner+(outer-inner)*u,a=start+sweep*v;return offset(shape.center,direction,Math.cos(a)*r,Math.sin(a)*r);
  },terrain,shape.center.y,lift);
}
function outline(data,points,terrain,fallback,lift){
  // A narrow mitered ribbon preserves sharp, readable corners without line-width APIs.
  const edges=points.map((p,i)=>{const n=points[(i+1)%points.length],dx=n.x-p.x,dz=n.z-p.z,length=Math.hypot(dx,dz)||1;return {x:-dz/length,z:dx/length};});
  const offsets=points.map((p,i)=>{const a=edges[(i+edges.length-1)%edges.length],b=edges[i],x=a.x+b.x,z=a.z+b.z,s=RIM_WIDTH*.5/Math.max(.2,x*b.x+z*b.z);return {x:x*s,z:z*s};});
  for(let i=0;i<points.length;i++){
    const next=(i+1)%points.length,a=points[i],b=points[next],oa=offsets[i],ob=offsets[next],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/STEP));
    grid(data,steps,1,(u,v)=>({x:a.x+(b.x-a.x)*u+(oa.x+(ob.x-oa.x)*u)*(v*2-1),z:a.z+(b.z-a.z)*u+(oa.z+(ob.z-oa.z)*u)*(v*2-1)}),terrain,fallback,lift);
  }
}
function polygon(shape,coordinates){return coordinates.map(([x,z])=>offset(shape.center,shape.direction,z,x));}

/** Build only at aim time; both meshes derive from the same shapes used by spellContains. */
export function buildGroundSpellGeometry(plan,terrain){
  const fill=geometry(),rim=geometry();
  for(const shape of plan.shapes){
    if(shape.kind==='rect'||shape.kind==='cross'){
      const l=shape.halfLength,w=shape.halfWidth;
      rectangle(fill,shape,terrain,.045);
      let path=[[-w,-l],[w,-l],[w,l],[-w,l]];
      if(shape.kind==='cross'){
        // Disjoint arm strips avoid a darker transparent overlap in the center.
        for(const side of [-1,1])rectangle(fill,{...shape,center:offset(shape.center,shape.direction,0,side*(l+w)/2),halfLength:w,halfWidth:(l-w)/2},terrain,.045);
        path=[[-w,-l],[w,-l],[w,-w],[l,-w],[l,w],[w,w],[w,l],[-w,l],[-w,w],[-l,w],[-l,-w],[-w,-w]];
      }
      outline(rim,polygon(shape,path),terrain,shape.center.y,.065);
    }else{
      const inner=shape.kind==='circle'?0:shape.innerRadius,outer=shape.radius??shape.outerRadius,angle=shape.kind==='sector'?shape.halfAngle:Math.PI;
      polar(fill,shape,inner,outer,-angle,angle,terrain,.045);
      polar(rim,shape,outer-RIM_WIDTH*.5,outer+RIM_WIDTH*.5,-angle,angle,terrain,.065);
      if(inner>0)polar(rim,shape,Math.max(0,inner-RIM_WIDTH*.5),inner+RIM_WIDTH*.5,-angle,angle,terrain,.065);
      if(shape.kind==='sector')for(const side of [-1,1]){
        const theta=angle*side,mid=(inner+outer)/2,direction={x:shape.direction.x*Math.cos(theta)+shape.direction.z*Math.sin(theta),z:shape.direction.z*Math.cos(theta)-shape.direction.x*Math.sin(theta)};
        rectangle(rim,{center:offset(shape.center,direction,mid),direction,halfLength:(outer-inner)/2,halfWidth:RIM_WIDTH*.5},terrain,.065);
      }
    }
  }
  return {fill,rim};
}

function material(scene,name,color){
  const m=new StandardMaterial(name,scene);m.disableLighting=true;m.emissiveColor=color;m.diffuseColor=Color3.Black();m.specularColor=Color3.Black();m.disableDepthWrite=true;m.backFaceCulling=false;return m;
}
function matches(geometry,data){return geometry.getTotalVertices()*3===data.positions.length&&geometry.getIndices().length===data.indices.length&&geometry.getIndices().every((index,i)=>index===data.indices[i]);}
function makeGeometry(mesh,data){
  const geometry=new Geometry(mesh.name+'-'+mesh.getScene().getUniqueId(),mesh.getScene());
  geometry.setVerticesData(VertexBuffer.PositionKind,data.positions,true);
  geometry.setVerticesData(VertexBuffer.NormalKind,data.normals,false);geometry.setIndices(data.indices);
  return geometry;
}
function bindGeometry(mesh,geometry,positions){
  if(mesh.geometry!==geometry){
    // A smaller previous pattern must not leave a partial submesh draw range.
    mesh.releaseSubMeshes();geometry.applyToMesh(mesh);
  }
  mesh.updateVerticesData(VertexBuffer.PositionKind,positions,true);
}

/** Reuses two ground meshes for every cast. The caller owns fired and applies damage once. */
export class GroundSpellTelegraph {
  constructor(world){
    this.world=world;this.mesh=new Mesh('elena-ground-magic-fill',world.scene);this.rim=new Mesh('elena-ground-magic-rim',world.scene);
    this.material=material(world.scene,'elena-ground-warning',new Color3(1,.015,.035));this.rimMaterial=material(world.scene,'elena-ground-edge',new Color3(1,.12,.16));
    this.mesh.material=this.material;this.rim.material=this.rimMaterial;
    for(const mesh of [this.mesh,this.rim]){mesh.isPickable=false;mesh.receiveShadows=false;mesh.setEnabled(false);}
    this.serial=null;this.plan=null;this.fired=false;this.disposed=false;
    this.topologies=[];this.cacheHits=0;this.cacheMisses=0;
  }
  aim(serial,pattern,origin,target,options={}){
    if(this.disposed)return null;
    if(this.plan&&this.serial===serial)return this.plan;
    const plan=makeSpellPlan(pattern,origin,target,options),data=buildGroundSpellGeometry(plan,this.world.terrain);
    let entry=this.topologies.find(e=>matches(e.fill,data.fill)&&matches(e.rim,data.rim));
    if(entry){this.cacheHits++;this.topologies.splice(this.topologies.indexOf(entry),1);}
    else{this.cacheMisses++;entry={fill:makeGeometry(this.mesh,data.fill),rim:makeGeometry(this.rim,data.rim)};}
    this.topologies.push(entry);
    bindGeometry(this.mesh,entry.fill,data.fill.positions);bindGeometry(this.rim,entry.rim,data.rim.positions);
    while(this.topologies.length>ELENA_GROUND_TOPOLOGY_LIMIT){const old=this.topologies.shift();old.fill.dispose();old.rim.dispose();}
    this.serial=serial;this.plan=plan;this.fired=false;this.mesh.setEnabled(false);this.rim.setEnabled(false);return plan;
  }
  show(elapsed,impactTime,{flash=false}={}){
    if(this.disposed)return;
    const visible=!!this.plan&&Number.isFinite(elapsed)&&Number.isFinite(impactTime)&&elapsed>=0&&(flash||elapsed<=impactTime+ELENA_GROUND_FLASH_TIME);
    this.mesh.setEnabled(visible);this.rim.setEnabled(visible);if(!visible)return;
    const active=flash||elapsed>=impactTime,progress=clamp(elapsed/Math.max(.001,impactTime),0,1);
    this.material.alpha=active?.48:.11+.15*progress;this.rimMaterial.alpha=active?1:.65+.3*progress;
  }
  reset(){this.serial=null;this.plan=null;this.fired=false;if(!this.disposed){this.mesh.setEnabled(false);this.rim.setEnabled(false);}}
  dispose(){if(this.disposed)return;this.reset();this.mesh.dispose();this.rim.dispose();for(const entry of this.topologies){entry.fill.dispose();entry.rim.dispose();}this.topologies=[];this.material.dispose();this.rimMaterial.dispose();this.disposed=true;}
}
