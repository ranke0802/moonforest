// Metres. Branches follow eroded ledges around a flooded central cavern;
// they are deliberately not a rectangular dungeon grid.
export const CAVE_ENTRY={x:-42,z:43};
export const CAVE_BOSS={x:29,z:-30,r:14,height:6};
// Story dressing follows the existing playable shelves; the large arena and
// the connected water/route footprint are retained for the 5.7 m encounter.
export const CAVE_STORY_ZONES=Object.freeze({
  refuge:Object.freeze({x:-30,z:19,r:7,height:1}),
  laboratory:Object.freeze({x:-35,z:-18,r:9,height:3}),
  resurrection:Object.freeze({x:29,z:-39.5,height:6,altarScale:1.25}),
});
export const CAVE_ROOMS=[
  {x:-42,z:43,r:8,height:0},{x:-30,z:19,r:7,height:1},
  {x:-35,z:-18,r:9,height:3},{x:7,z:27,r:8,height:1.4},
  {x:35,z:9,r:9,height:3.2},CAVE_BOSS,
];
// x, z, elevation, half-width. Every crossing shares the same elevation.
export const CAVE_ROUTES=[
  [[-42,43,0,5],[-35,32,.4,3.4],[-30,19,1,4.7],[-35,3,1.8,2.8],[-35,-18,3,5],[-19,-26,4,3.1],[-4,-27,4.8,2.9],[12,-28,5.5,3.5],[29,-23,6,6]],
  [[-42,43,0,5],[-27,38,.5,2.8],[-11,32,1,3],[7,27,1.4,5],[24,23,2.2,3.3],[35,9,3.2,5.5],[42,-6,4.2,2.8],[39,-19,5.2,3.2],[29,-23,6,6]],
  [[-30,19,1,4.7],[-18,22,1.2,2.5],[-5,25,1.4,2.6],[7,27,1.4,5]],
  [[-35,3,1.8,2.8],[-26,-7,2.5,2.7],[-11,-11,3,3],[6,-7,3.2,2.8],[22,0,3.2,3],[35,9,3.2,5.5]],
];
export const CAVE_SEGMENTS=CAVE_ROUTES.flatMap(points=>points.slice(1).map((b,i)=>({a:points[i],b})));
export const CAVE_STATIONS=[[-35,10,.2],[-25,-24,1.3]].map(([x,z,yaw])=>{
  let frame;
  for(const {a,b}of CAVE_SEGMENTS){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length**2)),px=a[0]+dx*t,pz=a[1]+dz*t,d=Math.hypot(x-px,z-pz);
    if(!frame||d<frame.d)frame={d,x:px,z:pz,nx:-dz/length,nz:dx/length,r:a[3]+(b[3]-a[3])*t,height:a[2]+(b[2]-a[2])*t};
  }
  return {...frame,plateX:x,plateZ:z,yaw};
});
// Small natural shelves support mechanisms beside (never across) the route.
// They share its elevation and are included in the same continuous terrain.
for(const p of CAVE_STATIONS)for(const side of [-1,1])CAVE_ROOMS.push({x:p.x+p.nx*(p.r+1.2)*side,z:p.z+p.nz*(p.r+1.2)*side,r:2.7,height:p.height});
export const CAVE_RIM=[[-60,50],[-55,20],[-62,-5],[-51,-34],[-35,-52],[-12,-48],[11,-58],[43,-54],[58,-35],[55,-4],[63,20],[48,45],[25,53],[8,47],[-15,53],[-38,58]];
export const caveRoofHeight=(x,z)=>7+.4*Math.sqrt(Math.max(0,67*67-x*x-z*z));
export const CAVE_POOLS=[
  {x:-10,z:7,rx:22,rz:17,height:-2.8},
  {x:1,z:-17,rx:29,rz:9,height:-.8},
  {x:41,z:28,rx:17,rz:10,height:-4.1},
  {x:-9,z:46,rx:35,rz:8,height:-2.8},
];
export function caveWaterWeight(x,z){
  let water=0;
  for(const {x:cx,z:cz,rx,rz}of CAVE_POOLS){
    const d=Math.hypot((x-cx)/rx,(z-cz)/rz)+.04*Math.sin(x*.31+z*.17),t=Math.max(0,Math.min(1,(d-.8)/.3));
    water=Math.max(water,1-t*t*(3-2*t));
  }return water;
}
export function caveSurface(x,z){
  let distance=Infinity,height=0,weight=0;
  const candidates=[];
  for(const {a,b} of CAVE_SEGMENTS){
    const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    const d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)-(a[3]+(b[3]-a[3])*t);
    distance=Math.min(distance,d);candidates.push([d,a[2]+(b[2]-a[2])*t]);
  }
  for(const room of CAVE_ROOMS){const d=Math.hypot(x-room.x,z-room.z)-room.r;distance=Math.min(distance,d);candidates.push([d,room.height]);}
  // The nearest shelf used to switch height discontinuously where rooms and
  // routes overlap. Blend only nearby candidates, keeping distant floors apart.
  for(const [d,h]of candidates){const w=Math.exp(-Math.min(40,(d-distance)/1.25));height+=h*w;weight+=w;}
  height/=weight;
  distance+=.45*Math.sin(x*.57+Math.sin(z*.19))+.28*Math.cos(z*.73+x*.13);
  return {distance,height};
}
const ids=['eroded-wall','rock-ledge','great-column','natural-arch','stalagmites','stalactite-canopy','scree-ramp','timber-brace','iron-gate-leaf','hand-winch','sluice-shutter','lift-platform','votive-lantern','hidden-pressure-stone','resurrection-altar','soul-collector-arm','faded-sacred-emblem','alchemy-workbench','apothecary-shelf','modest-cot'];
export const CAVE_SUPPLEMENT_IDS=['cave-s01-solid-cliff-base','cave-s03-dry-spillway-rock'];
export const CAVE_ASSET_IDS=[...ids.map((id,i)=>`cave-${String(i+1).padStart(2,'0')}-${id}`),...CAVE_SUPPLEMENT_IDS];
// The irregular scanned ramps form the rocky shoulders. The continuous terrain
// beside them is the walking surface, so jagged scan samples never move feet.
export const CAVE_RAMPS=[{x:-41,z:28,scale:1.05,yaw:.35,elevation:-.3},{x:47,z:-13,scale:1.1,yaw:-.2,elevation:4.05}];
// A narrow channel follows the supplied rock's actual +X-offset groove, from
// local -Z to +Z. One continuous strip joins each upstream/downstream pool.
export const CAVE_SPILLWAY_PROFILE=[
  [-.55,1.78,-2.25,.3],[-.55,1.78,-1.2,.3],
  [.35,1.78,-.6,.7],[.45,1.78,-.2,.9],[.5,1.78,.25,.9],
  [.55,1.78,.58,.9],[.65,1.78,.94,.7],
  [.65,.36,1.02,.7],[.65,.36,1.4,.7],[.65,.36,2.5,.7],
];
export const CAVE_WATERFALLS=[
  {x:-21.91,z:-1.316,scale:1.4,elevation:-3.267,yaw:0,top:-.8,bottom:-2.8,sourcePool:1,targetPool:0,start:[-16,-.812,-15,1.4],end:[-21,-2.812,4,1.5]},
  {x:24.9829171431,z:40.2702005035,scale:1.2,elevation:-4.911,yaw:2.15,top:-2.8,bottom:-4.1,sourcePool:3,targetPool:2,start:[18,-2.812,44,1.1],end:[32,-4.112,33,1.5]},
];
export function caveSpillwayPoint(p,[x,y,z,width]){
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  return [p.x+(c*x+s*z)*p.scale,p.elevation-.025+y*p.scale,p.z+(-s*x+c*z)*p.scale,width*p.scale];
}
export const caveFlowRows=p=>[p.start,...CAVE_SPILLWAY_PROFILE.map((row,i)=>{
  const point=caveSpillwayPoint(p,row);
  if(i>=7)point[1]=p.bottom+.012; // share the receiving pool's level at any scale
  if(i===9&&(p.bottom-p.elevation+.025)/p.scale>.5)point[3]=2.6*p.scale;
  return point;
}),p.end];
function makePlacements(){
  const out=[];let seed=291005;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const add=(n,x,z,scale=1,yaw=0,extra={})=>out.push({id:`cavern-${out.length}`,asset:typeof n==='number'?CAVE_ASSET_IDS[n-1]:n,x,z,scale,yaw,kind:n<=7?'rock':'prop',...extra});
  // One buried, overlapping mass follows the outer cavern. The old two rows
  // exposed a seam of repeated small caps at unrelated heights and angles.
  for(let segment=0;segment<CAVE_RIM.length;segment++){
    const a=CAVE_RIM[segment],b=CAVE_RIM[(segment+1)%CAVE_RIM.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),count=Math.ceil(length/12),yaw=Math.atan2(-dz,dx);
    for(let i=0;i<count;i++){
      const t=(i+.5)/count,x=a[0]+dx*t,z=a[1]+dz*t;
      if(Math.hypot(x+47,z-48)<9)continue;
      const jitter=(random()-.5)*1.3,scale=2.05+random()*.45;
      add(1,x+dz/length*jitter,z-dx/length*jitter,scale,yaw+(random()-.5)*.24,{topElevation:14.5+1.1*Math.sin(segment*.77),length:8*scale*(.94+.06*Math.sin(segment*1.7+i)),outerMass:true});
      // A few hanging forms frame turns. They no longer ring the entire map.
      if(i===0&&segment%2===0){const xx=x-dz/length*3,zz=z+dx/length*3;add(6,xx,zz,1.5,yaw,{elevation:caveRoofHeight(xx,zz)-3,outerCanopy:true});}
    }
  }
  // Broad authored shoulders meet the continuous rock terrain in one course.
  // Deduplicate neighbouring branches instead of stacking another lower row.
  const shoulders=[];
  for(const {a,b} of CAVE_SEGMENTS){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),count=Math.ceil(length/10);
    for(let i=0;i<count;i++){
      const t=(i+.5)/count,x=a[0]+dx*t,z=a[1]+dz*t,r=a[3]+(b[3]-a[3])*t,h=a[2]+(b[2]-a[2])*t;
      for(const side of [-1,1]){
        const xx=x-dz/length*(r+1.4)*side,zz=z+dx/length*(r+1.4)*side;
        if(caveSurface(xx,zz).distance<-1.5)continue;
        const water=caveWaterWeight(xx,zz)>.45;
        const outward=water?1.5:4.4,scale=water?1:1.45+random()*.2,yaw=Math.atan2(-dz,dx)+(side<0?Math.PI:0)+(random()-.5)*.18;
        let px=xx-dz/length*side*outward,pz=zz+dx/length*side*outward;
        // A shoulder belonging to one branch must not protrude into another
        // branch at a bend/crossing. Check the entire conservative footprint.
        const safe=()=>[-1,0,1].every(u=>[-1,0,1].every(v=>caveSurface(px+Math.cos(yaw)*u*4*scale+Math.sin(yaw)*v*3.3*scale,pz-Math.sin(yaw)*u*4*scale+Math.cos(yaw)*v*3.3*scale).distance>.6));
        for(let attempt=0;attempt<10&&!safe();attempt++){px-=dz/length*side*.7;pz+=dx/length*side*.7;}
        if(!safe()||shoulders.some(p=>Math.hypot(px-p.x,pz-p.z)<(water?7.5:10)))continue;
        shoulders.push({x:px,z:pz});
        // Replace thin water-facing ledges, rather than stacking more detail.
        // Their caps sit below the continuous walking surface; the thick body
        // bridges the eroded shoulder down into the basin. Collision is baked.
        if(water){
          const pool=CAVE_POOLS.reduce((a,b)=>Math.hypot((xx-a.x)/a.rx,(zz-a.z)/a.rz)<Math.hypot((xx-b.x)/b.rx,(zz-b.z)/b.rz)?a:b);
          const supportScale=Math.max(1.45,(h-.24-pool.height+.5)/3.7728869915);
          add(CAVE_SUPPLEMENT_IDS[0],xx,zz,supportScale,yaw,{kind:'rock',topElevation:h-.24,foundation:true});
        }
        else add(1,px,pz,scale,yaw,{topElevation:h+10.4+Math.sin(x*.13+z*.09)*.5,length:(7.3+random()*.7)*scale,rockShoulder:true});
        if(water&&random()<.18)add(5,xx-dz/length*side*1.6,zz+dx/length*side*1.6,.6+random()*.25,yaw,{elevation:h-.5});
      }
    }
  }
  // Massive rock islands give the cave its silhouette and hide the next turn.
  add(3,-10,7,1.9,.2,{elevation:-3,colliderRadius:6});
  add(5,-4,8,1.6,1.7,{elevation:-2.8});
  add(2,-15,9,1.1,.6,{topElevation:1.2});
  add(3,-49,-14,1.1,2,{elevation:-2,colliderRadius:3.6});
  add(3,52,-22,1.3,4,{elevation:-2,colliderRadius:4.2});
  add(3,9,-48,1.1,1,{elevation:1,colliderRadius:3.8});
  add(4,-35,32,1.12,Math.atan2(12,-24),{elevation:.1});
  add('forest-06-witch-cave-mouth',-47,48,1.25,-.75,{kind:'landmark',elevation:0});
  add(4,-6,-27,1.25,Math.PI/2,{elevation:4.4});
  add(4,40.1,-1.9,1.3,Math.atan2(7,-15),{elevation:3.8});
  for(const p of CAVE_RAMPS)add(7,p.x,p.z,p.scale,p.yaw,{elevation:p.elevation});
  // Puzzle stations are beside the through route: unfinished mechanisms never
  // trap the player. Gate leaves are visibly opened, not invisible blockers.
  for(const p of CAVE_STATIONS){
    const {nx,nz,r,yaw}=p;
    add(8,p.x-nx*(r+1),p.z-nz*(r+1),1,yaw);
    add(9,p.x-nx*(r+1.5),p.z-nz*(r+1.5),1,yaw+Math.PI/2);
    add(10,p.x+nx*(r+1.2),p.z+nz*(r+1.2),1,yaw);
    add(14,p.plateX,p.plateZ+.5,1,yaw,{topElevation:caveSurface(p.plateX,p.plateZ+.5).height-.06});
  }
  add(11,-22,-3,1.2,.15,{elevation:-2});add(12,-39,-25,1,0,{elevation:2.5});
  add(8,-39,-25,1.4,0,{elevation:2.5});
  for(const [x,z]of [[-45,38],[-34,22],[-40,-14],[-30,-23],[-3,-31],[12,30],[35,15],[46,-8],[24,-39],[35,-39]])add(13,x,z,.9,0,{colliderRadius:.36});
  // A dry sleeping alcove retains the saint's ordinary life near the entrance.
  // Human-scale furniture sits at the room edge, away from its through route.
  add(20,-33.2,21.4,.58,1.45,{elevation:1,colliderRadius:.85,storyZone:'refuge'});
  add(8,-35,18.7,.65,Math.PI/2,{elevation:1,storyZone:'refuge'});
  add(17,-34.8,18.7,.29,Math.PI/2,{topElevation:3.12,storyZone:'refuge'});
  add('crate-barrel-cluster',-34.1,24.1,.7,.15,{elevation:1,colliderRadius:.55,storyZone:'refuge'});
  add('firewood',-34.7,22.8,.5,.1,{elevation:1,storyZone:'refuge'});
  // Bench and supplies form one working wall in the laboratory, with a clear
  // central approach and a smaller secondary table near the preserved body.
  add(18,-38.7,-17,.95,Math.PI/2,{elevation:3,colliderRadius:1.1,storyZone:'laboratory'});
  add(19,-39.4,-21.2,.92,Math.PI/2,{elevation:3,colliderRadius:1.25,storyZone:'laboratory'});
  add('crate-barrel-cluster',-39.5,-23.2,.8,.2,{elevation:3,colliderRadius:.65,storyZone:'laboratory'});
  add('handcart',-36.7,-23.6,.85,1.3,{elevation:3,colliderRadius:.8,storyZone:'laboratory'});
  add('firewood',-40.2,-14.8,.55,.1,{elevation:3,storyZone:'laboratory'});
  // Resurrection apparatus is concentrated at the rear. Removing the two
  // forward collector arms frees the arena silhouette and full-pose movement.
  const ritual=CAVE_STORY_ZONES.resurrection;
  add(15,ritual.x,ritual.z,ritual.altarScale,0,{elevation:6,colliderRadius:3.2,storyZone:'resurrection'});
  // The preserved body is an approved static copy of the existing Joachim.
  // Its lowest scarf point is buried 8 cm into the support; no rig runs here.
  add('joachim-resting',ritual.x,ritual.z,1,0,{elevation:6+1.7321051359*ritual.altarScale-.08,storyZone:'resurrection'});
  for(const [x,z,yaw]of [[24.7,-39.3,0],[33.3,-39.3,Math.PI]])add(16,x,z,1,yaw,{elevation:6,colliderRadius:.55,colliderOffsetX:-.74,storyZone:'resurrection'});
  add(8,29,-43.5,2.6,0,{elevation:6});
  add(17,29,-43.1,1,0,{topElevation:11.5});
  add(18,23.2,-38.1,.58,.3,{elevation:6,colliderRadius:.8,storyZone:'resurrection'});
  add('crate-barrel-cluster',23,-39.6,.5,.6,{elevation:6,colliderRadius:.4,storyZone:'resurrection'});
  add('crate-barrel-cluster',-44,40,.8,.3,{colliderRadius:.7});
  add('firewood',-46,43,.7,0);add('handcart',-37,45,.8,1.8,{colliderRadius:1});
  for(let i=0;i<18;i++){
    const a=random()*Math.PI*2,r=8+random()*36,x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(caveSurface(x,z).distance<3)continue;
    add(i%2?'rock-02-jagged-outcrop':'rock-01-mossy-boulder',x,z,.65+random(),random()*6.28,{elevation:-3});
    if(i%4===0)add(5,x+2,z,.85+random()*.4,random()*6.28,{elevation:-2.8});
  }
  // Broad support below the ritual chamber's exposed southern edge.
  for(const angle of [-.9,-.45,0,.45,.9])add(CAVE_SUPPLEMENT_IDS[0],CAVE_BOSS.x+Math.sin(angle)*15.3,CAVE_BOSS.z+Math.cos(angle)*15.3,1.9,-angle,{kind:'rock',topElevation:CAVE_BOSS.height-.24,foundation:true});
  for(const p of CAVE_WATERFALLS)add(CAVE_SUPPLEMENT_IDS[1],p.x,p.z,p.scale,p.yaw,{kind:'rock',elevation:p.elevation,spillway:true});
  return out;
}
export const CAVE_PLACEMENTS=makePlacements();
export function caveObstacles(){
  const obstacles=CAVE_PLACEMENTS.filter(p=>p.colliderRadius).map(p=>({id:p.id,x:p.x+Math.cos(p.yaw)*(p.colliderOffsetX??0)*p.scale,z:p.z-Math.sin(p.yaw)*(p.colliderOffsetX??0)*p.scale,radius:p.colliderRadius,height:p.asset.includes('column')?18:2}));
  for(const p of CAVE_PLACEMENTS){
    if(p.asset===CAVE_ASSET_IDS[3])for(const side of [-1,1]){
      const offset=side*3.25*p.scale;
      obstacles.push({id:p.id+'-post'+side,x:p.x+Math.cos(p.yaw)*offset,z:p.z-Math.sin(p.yaw)*offset,radius:.9*p.scale,height:7*p.scale});
    }
    if(p.asset===CAVE_ASSET_IDS[7])for(const side of [-1,1]){
      const offset=side*1.22*p.scale;
      obstacles.push({id:p.id+'-brace'+side,x:p.x+Math.cos(p.yaw)*offset,z:p.z-Math.sin(p.yaw)*offset,radius:.18*p.scale,height:2.46*p.scale});
    }
    if(p.asset===CAVE_ASSET_IDS[9])obstacles.push({id:p.id,x:p.x,z:p.z,radius:.65*p.scale,height:1.6*p.scale});
  }
  return obstacles;
}
