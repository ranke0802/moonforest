import {caveLaboratoryClearance} from './cave-laboratory-collision.js';
import {CAVE_LABORATORY_GEOMETRY} from './cave-laboratory-geometry.js';

// Offline placement builder. Runtime imports only its baked data module.
// Physical bounds of existing shipped sources, after their authored height
// normalization. The caller supplies the cave field to avoid a layout cycle.
export const CAVE_DRESSING_PROFILES=Object.freeze({
 'cave-02-rock-ledge':Object.freeze({width:8,depth:6.40816068649292,height:2.9993390042800456}),
 'cave-05-stalagmites':Object.freeze({width:3.9312515258789062,depth:3.1193411350250244,height:3.4000000953674316}),
 'rock-01-mossy-boulder':Object.freeze({width:1.5569519996643066*2.2,depth:1.6407029628753662*2.2,height:2.2}),
 'rock-02-jagged-outcrop':Object.freeze({width:4.221744060516357*1.125,depth:3.0721168518066406*1.125,height:4.5}),
 'cave-s01-solid-cliff-base':Object.freeze({width:8,depth:4.870861053466797,height:3.7728869915008545,centerZ:.0034427642822265625}),
});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const noise=(x,z)=>{const value=Math.sin(x*12.9898+z*78.233)*43758.5453;return value-Math.floor(value);};

export function caveDressingFootprint(placement,spacing=.45){
 const profile=CAVE_DRESSING_PROFILES[placement.asset];if(!profile)return [];
 const width=placement.length??profile.width*placement.scale,depth=placement.depth??profile.depth*placement.scale,nx=Math.max(1,Math.ceil(width/spacing)),nz=Math.max(1,Math.ceil(depth/spacing)),c=Math.cos(placement.yaw),s=Math.sin(placement.yaw),points=[];
 for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
  const px=(x/nx-.5)*width,pz=(z/nz-.5)*depth+(profile.centerZ??0)*depth/profile.depth;
  points.push({x:placement.x+c*px+s*pz,z:placement.z-s*px+c*pz});
 }
 return points;
}

const LAB_WALLS=Object.freeze([
 [-45,-8,1.3,Math.PI/2-.08],[-45,-21,1.2,Math.PI/2+.12],
 [-45.4,-26,1.7,Math.PI/2-.12],[-40,-29.5,1.35,.10],
 [-37.5,-29.5,1.5,-.10],[-42.5,-7.5,1.3,.12],
].map(Object.freeze));
// Broad solid faces cover the native flat planes, leaving a gap around the
// west wall light. Thin depth affects horizontal reach, never source height.
const LAB_PANELS=Object.freeze([
 [-43.9,-9.2,1.95,6,1.6,Math.PI/2-.02],
 [-43.9,-18,2.1,6,1.7,Math.PI/2+.015],
 [-43.9,-25.4,1.8,6.3,1.9,Math.PI/2-.025],
 [-41,-8.3,1.9,7.5,1.5,.02],
 [-37.6,-27.8,2.05,8.5,1.8,-.025],
 [-25.7,-13.8,1.85,6,1.3,Math.PI/2+.015],
].map(Object.freeze));
const routeDistance=(q,a,b)=>{
 const x=b[0]-a[0],z=b[1]-a[1],t=clamp(((q.x-a[0])*x+(q.z-a[1])*z)/(x*x+z*z),0,1);
 return Math.hypot(q.x-a[0]-x*t,q.z-a[1]-z*t);
};

export function createCaveNaturalDressing({surface,waterWeight,existingPlacements=[],routes=[],limit=54}={}){
 if(typeof surface!=='function'||typeof waterWeight!=='function')throw new TypeError('Cave dressing needs the existing surface and water fields');
 limit=clamp(Number.isFinite(limit)?Math.floor(limit):54,0,54);
 const output=[],groups=[],protectedProps=existingPlacements.filter(p=>p.kind!=='rock'&&!p.background),candidates=[];
 // Sample a boundary band, then move the complete oriented source outwards.
 // A hash ordering and variable spacing prevent regular rows of repeated caps.
 for(let z=-46;z<=50;z+=3.4)for(let x=-58;x<=58;x+=3.4){
  const field=surface(x,z);if(!Number.isFinite(field?.distance)||!Number.isFinite(field.height)||field.distance<-.1||field.distance>2.2||waterWeight(x,z)>.12)continue;
  const dx=surface(x+.2,z).distance-surface(x-.2,z).distance,dz=surface(x,z+.2).distance-surface(x,z-.2).distance,length=Math.hypot(dx,dz);if(length<.1)continue;
  candidates.push({x,z,height:field.height,nx:dx/length,nz:dz/length,rank:noise(x,z)});
 }
 candidates.sort((a,b)=>a.rank-b.rank);
 const valid=p=>{
  if(Math.hypot(p.x,p.z)>66)return false;
  // Sample the ENTIRE real bounding rectangle, not just the centre or corners.
  // The .8m reserve protects both the walking union and intervals between samples.
  const footprint=caveDressingFootprint(p);
  if(!footprint.every(q=>surface(q.x,q.z).distance>.8&&waterWeight(q.x,q.z)<.16))return false;
  return !protectedProps.some(q=>footprint.some(p=>Math.hypot(p.x-q.x,p.z-q.z)<1.2));
 };
 for(const edge of candidates){
  if(output.length>=Math.min(limit,40)||groups.length>=Math.ceil(Math.min(limit,40)/2))break;
  if(groups.some(p=>Math.hypot(p.x-edge.x,p.z-edge.z)<7.5+noise(edge.z,edge.x)*1.5))continue;
  const pick=Math.floor(noise(edge.x+7,edge.z-3)*10),asset=pick<4?'cave-02-rock-ledge':pick<7?'rock-01-mossy-boulder':pick<9?'rock-02-jagged-outcrop':'cave-05-stalagmites';
  const scale=1.2+noise(edge.x-11,edge.z+17)*.5,profile=CAVE_DRESSING_PROFILES[asset],yaw=Math.atan2(edge.nx,edge.nz),offset=profile.depth*scale*.5+1.1;
  const primary={id:'cave-natural-wall-'+groups.length,asset,x:edge.x+edge.nx*offset,z:edge.z+edge.nz*offset,scale,yaw,kind:'rock',elevation:edge.height-.3,naturalDressing:true,dressingRole:'shoulder'};
  if(!valid(primary))continue;
  const group=groups.length;groups.push(edge);output.push(primary);
  if(output.length>=limit)break;
  // Smaller feet overlap the buried broad rock, entirely behind the legal
  // walking contour. They are ground-supported, never hovering canopy pieces.
  const smallAsset=group%3===0?'cave-05-stalagmites':group%3===1?'rock-01-mossy-boulder':'rock-02-jagged-outcrop',smallScale=.40+noise(edge.x+19,edge.z+3)*.28,smallProfile=CAVE_DRESSING_PROFILES[smallAsset];
  for(const side of [group%2?1:-1,group%2?-1:1]){
   const tangent=profile.width*scale*.32*side,normal=smallProfile.depth*smallScale*.5+1.25;
   const detail={id:'cave-natural-foot-'+group,asset:smallAsset,x:edge.x+edge.nx*normal+edge.nz*tangent,z:edge.z+edge.nz*normal-edge.nx*tangent,scale:smallScale,yaw:yaw+side*.23,kind:'rock',elevation:edge.height-.3,naturalDressing:true,dressingRole:'foot'};
   if(valid(detail)){output.push(detail);break;}
  }
 }
 // The native laboratory walls sit INSIDE the analytic shelf union. Grounded
 // cladding may occupy peripheral free cells, but never the 1.7m route corridor
 // or a furniture/lantern approach. Its full source rectangle is checked here;
 // the actual source triangles then enter the normal collision/visibility bake.
 const labSafe=(footprint)=>!footprint.some(q=>routes.some(route=>route.slice(1).some((b,i)=>routeDistance(q,route[i],b)<1.7))||protectedProps.some(prop=>Math.hypot(q.x-prop.x,q.z-prop.z)<1.2+(prop.colliderRadius??0)));
 if(routes.length)for(const [index,[x,z,scale,yaw]]of LAB_WALLS.entries()){
  if(output.length>=limit)break;
  const p={id:'cave-natural-lab-wall-'+index,asset:'rock-02-jagged-outcrop',x,z,scale,yaw,kind:'rock',elevation:2.7,naturalDressing:true,dressingRole:'laboratory-wall'},footprint=caveDressingFootprint(p,.15);
  if(footprint.some(q=>waterWeight(q.x,q.z)>=.20)||!labSafe(footprint))continue;
  if(footprint.filter(q=>caveLaboratoryClearance(q.x,q.z)<.30).length<footprint.length*.15)continue;
  output.push(p);
 }
 if(routes.length)for(const [index,[x,z,scale,length,depth,yaw]]of LAB_PANELS.entries()){
  if(output.length>=limit)break;
  const p={id:'cave-natural-lab-panel-'+index,asset:'cave-s01-solid-cliff-base',x,z,scale,length,depth,yaw,kind:'rock',elevation:2.7,naturalDressing:true,dressingRole:'laboratory-panel'},footprint=caveDressingFootprint(p,.15),b=CAVE_LABORATORY_GEOMETRY.bounds;
  if(!labSafe(footprint)||footprint.some(q=>q.x<b.minX||q.x>b.maxX||q.z<b.minZ-1||q.z>b.maxZ+1))continue;
  if(footprint.filter(q=>caveLaboratoryClearance(q.x,q.z)<.30).length<footprint.length*.10)continue;
  // Native east wall/floor owns these cells even where the analytic pool field
  // extends beneath the enclosure. Never apply this exception to outer rocks.
  output.push(p);
 }
 return output;
}
