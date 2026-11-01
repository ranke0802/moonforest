// A cast snapshots its supported floor once. Rendering and damage then read
// that same immutable surface; neither camera rotation nor later aim can move it.
export const ELENA_GROUND_SURFACE=Object.freeze({maxSlope:1,rayStep:.35,heightTolerance:.12,binSize:2});
const EPS=1e-8;
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z);
const key=(x,z)=>`${Math.round(x*1e6)}:${Math.round(z*1e6)}`;
const pointKey=p=>p.surfaceKey??(p.surfaceKey=key(p.x,p.z));
const trianglePoint=(part,i)=>({x:part.positions[i*3],y:part.positions[i*3+1]-.045,z:part.positions[i*3+2]});

function floorSampler(plan,terrain,navigation,stats){
  const fallback=plan.origin.y,read=(x,z)=>terrain?.heightAt?terrain.heightAt(x,z):fallback;
  const originY=read(plan.origin.x,plan.origin.z),points=new Map(),connections=new Map(),rays=new Map();
  function supported(p){
    const k=pointKey(p);if(points.has(k))return points.get(k);
    stats.floorSamples++;const y=read(p.x,p.z);
    let valid=Number.isFinite(y)&&Number.isFinite(originY);
    if(valid&&navigation?.free){stats.navigationPoints++;valid=navigation.free(p,0)!==false;}
    const sample={valid,y};points.set(k,sample);return sample;
  }
  function connected(p){
    const k=pointKey(p);if(connections.has(k))return connections.get(k);
    const sample=supported(p);let valid=sample.valid;
    // A high plateau beyond a cliff must not become a second valid layer just
    // because its own triangles happen to be flat. Cache only proven prefixes
    // of the SAME ray: polar ring/fan vertices otherwise recheck that prefix
    // for every concentric row. A blocked prefix can never become clear later.
    const dx=p.x-plan.origin.x,dz=p.z-plan.origin.z,distance=Math.hypot(dx,dz);
    const nx=distance?dx/distance:0,nz=distance?dz/distance:0,rk=`${Math.round(nx*1e9)}:${Math.round(nz*1e9)}`;
    let ray=rays.get(rk);if(!ray)rays.set(rk,ray={step:0,height:originY,blockedStep:Infinity,lineDistance:0,linePoint:plan.origin,blockedDistance:Infinity});
    if(valid&&distance>=ray.blockedDistance)valid=false;
    if(valid&&navigation?.segmentClear&&distance>ray.lineDistance+EPS){
      stats.sightSegments++;valid=navigation.segmentClear(ray.linePoint,p,0,true)!==false;
      if(valid){ray.lineDistance=distance;ray.linePoint=p;}else ray.blockedDistance=Math.min(ray.blockedDistance,distance);
    }
    const count=Math.floor((distance+EPS)/ELENA_GROUND_SURFACE.rayStep);
    while(valid&&ray.step<count){
      const next=ray.step+1,d=next*ELENA_GROUND_SURFACE.rayStep,h=read(plan.origin.x+nx*d,plan.origin.z+nz*d);stats.heightSamples++;
      if(!Number.isFinite(h)||Math.abs(h-ray.height)>ELENA_GROUND_SURFACE.maxSlope*ELENA_GROUND_SURFACE.rayStep+1e-5){ray.blockedStep=next;valid=false;break;}
      ray.step=next;ray.height=h;
    }
    if(count>=ray.blockedStep)valid=false;
    if(valid){
      // The target can be inside a previously checked prefix. Its neighboring
      // fixed sample, rather than the furthest cached height, is the reference.
      const d=count*ELENA_GROUND_SURFACE.rayStep,h=count===ray.step?ray.height:read(plan.origin.x+nx*d,plan.origin.z+nz*d);
      stats.heightSamples++;valid=Math.abs(sample.y-h)<=ELENA_GROUND_SURFACE.maxSlope*Math.max(0,distance-d)+1e-5;
    }
    connections.set(k,valid);return valid;
  }
  function edge(a,b){
    const distance=Math.hypot(a.x-b.x,a.z-b.z),height=read((a.x+b.x)/2,(a.z+b.z)/2);stats.heightSamples++;
    let valid=Number.isFinite(height)&&Math.abs(a.y-b.y)<=ELENA_GROUND_SURFACE.maxSlope*distance+1e-5&&Math.abs(height-(a.y+b.y)/2)<=ELENA_GROUND_SURFACE.heightTolerance;
    // free(center, enclosingRadius) below already proves the entire triangle
    // avoids static blockers. Do not repeat three expensive wall sweeps.
    if(valid&&!navigation?.free&&navigation?.segmentClear){stats.sightSegments++;valid=navigation.segmentClear(a,b,0,true)!==false;}
    return valid;
  }
  return (a,b,c)=>{
    if(!connected(a)||!connected(b)||!connected(c))return false;
    // A bound on the whole triangle (not only its corners) keeps a thin static
    // blocker from falling between sampled vertices. free() includes wall skin.
    const center={x:(a.x+b.x+c.x)/3,z:(a.z+b.z+c.z)/3},sample=supported(center);
    if(!sample.valid)return false;
    if(navigation?.free){
      const radius=Math.max(Math.hypot(a.x-center.x,a.z-center.z),Math.hypot(b.x-center.x,b.z-center.z),Math.hypot(c.x-center.x,c.z-center.z));
      stats.navigationPoints++;if(navigation.free(center,radius)===false)return false;
    }
    const area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
    if(Math.abs(area)<=EPS)return true; // Existing polar center duplicates.
    const gx=((b.y-a.y)*(c.z-a.z)-(c.y-a.y)*(b.z-a.z))/area;
    const gz=((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/area;
    return Math.hypot(gx,gz)<=ELENA_GROUND_SURFACE.maxSlope+1e-5&&Math.abs(sample.y-(a.y+b.y+c.y)/3)<=ELENA_GROUND_SURFACE.heightTolerance&&edge(a,b)&&edge(b,c)&&edge(c,a);
  };
}

function filter(part,valid,lift,stats,findCuts=false){
  const positions=[],normals=[],indices=[],remap=new Map(),edges=new Map();
  const vertices=Array.from({length:part.positions.length/3},(_,i)=>({x:part.positions[i*3],y:part.positions[i*3+1]-lift,z:part.positions[i*3+2]}));
  const copy=i=>{if(remap.has(i))return remap.get(i);const n=positions.length/3;positions.push(part.positions[i*3],part.positions[i*3+1],part.positions[i*3+2]);normals.push(0,1,0);remap.set(i,n);return n;};
  for(let i=0;i<part.indices.length;i+=3){
    const a=part.indices[i],b=part.indices[i+1],c=part.indices[i+2],keep=valid(vertices[a],vertices[b],vertices[c]);
    if(findCuts)for(const [u,v]of [[a,b],[b,c],[c,a]]){const ek=Math.min(u,v)*vertices.length+Math.max(u,v);let e=edges.get(ek);if(!e)edges.set(ek,e={a:u,b:v,kept:0,dropped:0});e[keep?'kept':'dropped']++;}
    if(keep)indices.push(copy(a),copy(b),copy(c));else stats.rejectedTriangles++;
  }
  return {part:{positions,normals,indices},cuts:[...edges.values()].filter(e=>e.kept&&e.dropped).map(e=>[e.a,e.b])};
}

function addCutRims(rim,fill,cuts){
  for(const [ia,ib]of cuts){
    const a=trianglePoint(fill,ia),b=trianglePoint(fill,ib),dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<=EPS)continue;
    const x=-dz/length*.035,z=dx/length*.035,base=rim.positions.length/3;
    for(const [p,s]of [[a,-1],[a,1],[b,-1],[b,1]]){rim.positions.push(p.x+x*s,p.y+.065,p.z+z*s);rim.normals.push(0,1,0);}
    rim.indices.push(base,base+2,base+1,base+1,base+2,base+3);
  }
}

/** Reject unsupported triangles; never project their vertices up a wall. */
export function clipGroundSpellSurface(plan,data,terrain,navigation){
  const stats={floorSamples:0,heightSamples:0,navigationPoints:0,sightSegments:0,rejectedTriangles:0,originalFillTriangles:data.fill.indices.length/3};
  if(!terrain?.heightAt&&!navigation)return {data,surface:null,stats};
  const valid=floorSampler(plan,terrain,navigation,stats),fill=filter(data.fill,valid,.045,stats,true),fillRejected=stats.rejectedTriangles;
  const rim=filter(data.rim,valid,.065,stats).part;
  addCutRims(rim,data.fill,fill.cuts);
  const result={fill:fill.part,rim};stats.fillTriangles=result.fill.indices.length/3;stats.rimTriangles=rim.indices.length/3;stats.rejectedFillTriangles=fillRejected;
  // Preserve the original analytic body-edge rule when no floor was clipped.
  // When clipping is necessary, actual rendered fill is the damage domain.
  if(!fillRejected)return {data:result,surface:null,stats};
  const bins={},size=ELENA_GROUND_SURFACE.binSize,{positions,indices}=result.fill;
  for(let i=0;i<indices.length;i+=3){
    const ids=indices.slice(i,i+3),xs=ids.map(j=>positions[j*3]),zs=ids.map(j=>positions[j*3+2]);
    for(let x=Math.floor(Math.min(...xs)/size);x<=Math.floor(Math.max(...xs)/size);x++)for(let z=Math.floor(Math.min(...zs)/size);z<=Math.floor(Math.max(...zs)/size);z++)(bins[`${x}:${z}`]??=[]).push(i);
  }
  return {data:result,surface:{positions,indices,bins,binSize:size},stats};
}

function segmentDistanceSquared(p,a,b){const x=b.x-a.x,z=b.z-a.z,d=x*x+z*z,t=d?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/d)):0;return (p.x-a.x-x*t)**2+(p.z-a.z-z*t)**2;}
function triangleDistanceSquared(p,a,b,c){
  const cross=(v,w)=>(w.x-v.x)*(p.z-v.z)-(w.z-v.z)*(p.x-v.x),area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x),s=[cross(a,b),cross(b,c),cross(c,a)];
  if(Math.abs(area)>EPS&&(s.every(v=>v>=-EPS)||s.every(v=>v<=EPS)))return 0;
  return Math.min(segmentDistanceSquared(p,a,b),segmentDistanceSquared(p,b,c),segmentDistanceSquared(p,c,a));
}

export function groundSurfaceContains(surface,position,radius=0){
  if(!surface)return true;if(!finite(position))return false;
  const {positions,indices,bins,binSize:size}=surface,visited=new Set();
  for(let x=Math.floor((position.x-radius)/size);x<=Math.floor((position.x+radius)/size);x++)for(let z=Math.floor((position.z-radius)/size);z<=Math.floor((position.z+radius)/size);z++)for(const i of bins[`${x}:${z}`]??[]){
    if(visited.has(i))continue;visited.add(i);
    const points=indices.slice(i,i+3).map(j=>({x:positions[j*3],z:positions[j*3+2]}));
    if(triangleDistanceSquared(position,...points)<=radius*radius+EPS)return true;
  }
  return false;
}
