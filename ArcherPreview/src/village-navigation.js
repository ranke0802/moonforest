import { ArenaNavigation, linksOf, navigationWork } from './navigation.js';
import { ARENA_RADIUS, enemyLimitAt, offEnemyTravelShape } from './world-limits.js';
import { obstacleClearance, sweepObstacle } from './village-collision.js';
import {visitSegmentCells} from './navigation-segment-cells.js';
import {NavigationSearchWorkspace} from './navigation-search-workspace.js';

const CELL=4,EPS=.002;
const key=(x,z)=>`${Math.floor(x/CELL)}:${Math.floor(z/CELL)}`;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Match the existing stable-sort/pop tie rule: newest equal-cost entry first.
class RouteHeap {
  constructor(){this.items=[];this.order=0;}
  before(a,b){return a.f<b.f||(a.f===b.f&&a.order>b.order);}
  push(i,f){
    const value={i,f,order:this.order++},items=this.items;let at=items.length;
    items.push(value);
    while(at){const parent=(at-1)>>1;if(!this.before(value,items[parent]))break;items[at]=items[parent];at=parent;}
    items[at]=value;
  }
  pop(){
    const items=this.items,result=items[0],last=items.pop();
    if(items.length){
      let at=0;
      while(at*2+1<items.length){
        let child=at*2+1;
        if(child+1<items.length&&this.before(items[child+1],items[child]))child++;
        if(!this.before(items[child],last))break;
        items[at]=items[child];at=child;
      }
      items[at]=last;
    }
    return result;
  }
}

// Same analytic circles and sweep rule as the original navigator, with a static
// spatial index for the larger village. AI/path rules and movement stay intact.
export const ROUTE_GRID_RADII=Object.freeze([.34,.7,1.7]);
export const routeGridRadius=radius=>ROUTE_GRID_RADII.find(size=>radius<=size+1e-9)??radius;
export class VillageNavigation extends ArenaNavigation {
  constructor(obstacles){
    super(obstacles);this.cells=new Map();this.gridMetadata=new WeakMap();this.obstacleCells=new WeakMap();this.segmentCellPruningSafe=true;
    let order=0;
    for(const o of obstacles){
      const extent=o.radius+1.5;
      // Legacy callers may supply an OBB whose index radius understates its
      // solid. Keep the original rectangle search for that entire navigator.
      if(o.shape==='box'&&!(Math.hypot(o.halfWidth,o.halfDepth)+EPS<=extent))this.segmentCellPruningSafe=false;
      if(!this.obstacleCells.has(o))this.obstacleCells.set(o,{x:Math.floor((o.x-extent)/CELL),z:Math.floor((o.z-extent)/CELL),order});order++;
      for(let x=Math.floor((o.x-extent)/CELL);x<=Math.floor((o.x+extent)/CELL);x++)for(let z=Math.floor((o.z-extent)/CELL);z<=Math.floor((o.z+extent)/CELL);z++){
        const k=`${x}:${z}`;if(!this.cells.has(k))this.cells.set(k,[]);this.cells.get(k).push(o);
      }
    }
  }
  // Route grids are built per radius over the whole map (tens of thousands
  // of cells): building one for each actor size froze the game for up to
  // 0.9 s mid-fight on phones. Open-air maps therefore share three sizes; a
  // smaller actor routes on the next larger grid (exact collision is
  // unchanged — only the waypoint search is a little more conservative).
  grid(radius,limit){
    if(this.sharedRouteGrids!==false)radius=routeGridRadius(radius);
    const nodes=super.grid(radius,limit);
    if(!this.gridMetadata.has(nodes)){
      const component=new Int32Array(nodes.length),{mask,offsets}=linksOf(nodes);component.fill(-1);
      let count=0;
      for(let i=0;i<nodes.length;i++){
        if(!nodes[i].free||component[i]>=0)continue;
        const pending=[i];component[i]=count;
        while(pending.length){
          const at=pending.pop();
          for(let bits=mask[at],d=0;d<8;d++)if(bits&(1<<d)){const next=at+offsets[d];if(component[next]<0){component[next]=count;pending.push(next);}}
        }
        count++;
      }
      this.gridMetadata.set(nodes,{component,n:Math.sqrt(nodes.length),step:nodes[1].x-nodes[0].x});
    }
    return nodes;
  }
  nearestNode(p,nodes,radius){
    const {n,step}=this.gridMetadata.get(nodes),origin=nodes[0];
    const cx=Math.max(0,Math.min(n-1,Math.round((p.x-origin.x)/step)));
    const cz=Math.max(0,Math.min(n-1,Math.round((p.z-origin.z)/step)));
    let best=-1,cost=Infinity;
    const visit=(x,z)=>{
      const i=z*n+x,node=nodes[i];if(!node.free)return;
      const d=distance(p,node);
      if((d<cost||(d===cost&&(best<0||i<best)))&&this.segmentClear(p,node,radius)){best=i;cost=d;}
    };
    // Scan square rings instead of repeatedly testing thousands of far-away
    // segments in row order. The bound proves that every unvisited node is
    // farther than the winner; this still finds the exact nearest visible node.
    for(let ring=0;ring<n;ring++){
      if(!ring)visit(cx,cz);
      else{
        const left=cx-ring,right=cx+ring,top=cz-ring,bottom=cz+ring;
        for(let x=Math.max(0,left);x<=Math.min(n-1,right);x++){
          if(top>=0)visit(x,top);
          if(bottom<n)visit(x,bottom);
        }
        for(let z=Math.max(0,top+1);z<=Math.min(n-1,bottom-1);z++){
          if(left>=0)visit(left,z);
          if(right<n)visit(right,z);
        }
      }
      let unseen=Infinity;
      if(cx-ring>0)unseen=Math.min(unseen,Math.abs(p.x-(origin.x+(cx-ring-1)*step)));
      if(cx+ring<n-1)unseen=Math.min(unseen,Math.abs(p.x-(origin.x+(cx+ring+1)*step)));
      if(cz-ring>0)unseen=Math.min(unseen,Math.abs(p.z-(origin.z+(cz-ring-1)*step)));
      if(cz+ring<n-1)unseen=Math.min(unseen,Math.abs(p.z-(origin.z+(cz+ring+1)*step)));
      if(cost<unseen||unseen===Infinity)break;
    }
    return best;
  }
  path(from,goal,radius,limit=enemyLimitAt(from)){
    const began=performance.now();try{return this.route(from,goal,radius,limit);}finally{navigationWork.pathMs+=performance.now()-began;}
  }
  route(from,goal,radius,limit){
    this.pathsBuilt++;
    const start=this.findFree(from,radius,limit),target=this.findFree(goal,radius,limit);
    if(this.segmentClear(start,target,radius+.025))return [target];
    const nodes=this.grid(radius,limit),s=this.nearestNode(start,nodes,radius),g=this.nearestNode(target,nodes,radius);
    if(s<0||g<0)return [];
    const {component}=this.gridMetadata.get(nodes),{mask,offsets,costs}=linksOf(nodes);
    if(component[s]!==component[g])return [];
    // Searches are synchronous; share scratch capacity across all grid radii.
    // A custom reentrant navigation callback receives an independent lease.
    const workspace=this.searchWorkspace?.busy?new NavigationSearchWorkspace():(this.searchWorkspace??=new NavigationSearchWorkspace());
    const {scores,parents,scoreEpoch,closed,epoch}=workspace.begin(nodes.length);
    try{
    scores[s]=0;parents[s]=-1;scoreEpoch[s]=epoch;
    const open=new RouteHeap();open.push(s,distance(start,target));
    while(open.items.length){
      const {i}=open.pop();if(closed[i]===epoch)continue;closed[i]=epoch;
      if(i===g){
        const route=[];for(let j=g;j>=0;j=parents[j])route.push(nodes[j]);
        route.reverse();route.push(target);return route;
      }
      for(let bits=mask[i],d=0;d<8;d++){
        if(!(bits&(1<<d)))continue;
        const j=i+offsets[d],next=scores[i]+costs[d];if(scoreEpoch[j]===epoch&&next>=scores[j])continue;
        scores[j]=next;parents[j]=i;scoreEpoch[j]=epoch;open.push(j,next+distance(nodes[j],target));
      }
    }
    return [];
    }finally{workspace.end();}
  }
  free(p,radius,limit=ARENA_RADIUS){
    if(Math.hypot(p.x,p.z)>limit+1e-6||offEnemyTravelShape(p,limit))return false;
    // Wider actors used to test every solid at every grid node. Query the
    // same conservative spatial index; malformed legacy bounds retain fallback.
    const near=radius<=1.5?(this.cells.get(key(p.x,p.z))??[]):Number.isFinite(radius)&&this.segmentCellPruningSafe?this.nearby(p,p,radius):this.obstacles;
    for(const obstacle of near)if(!(obstacleClearance(p,obstacle)>=radius+EPS))return false;
    return true;
  }
  nearby(a,b,radius=0){
    const near=new Set();
    for(let x=Math.floor((Math.min(a.x,b.x)-radius)/CELL);x<=Math.floor((Math.max(a.x,b.x)+radius)/CELL);x++)for(let z=Math.floor((Math.min(a.z,b.z)-radius)/CELL);z<=Math.floor((Math.max(a.z,b.z)+radius)/CELL);z++)for(const o of this.cells.get(`${x}:${z}`)??[])near.add(o);
    return near;
  }
  segmentObstacles(a,b,radius=0){
    const minX=Math.floor((Math.min(a.x,b.x)-radius)/CELL),maxX=Math.floor((Math.max(a.x,b.x)+radius)/CELL);
    const minZ=Math.floor((Math.min(a.z,b.z)-radius)/CELL),maxZ=Math.floor((Math.max(a.z,b.z)+radius)/CELL);
    // Adjacent path-grid edges and axis-aligned queries already have a narrow
    // rectangle. Preserve that cheap path, as well as legacy invalid radii.
    if(!this.segmentCellPruningSafe||radius<0||!Number.isFinite(radius)||!Number.isFinite(minX+maxX+minZ+maxZ)||(maxX-minX+1)*(maxZ-minZ+1)<=16||a.x===b.x||a.z===b.z)return this.nearby(a,b,radius);
    const near=new Set();
    visitSegmentCells(a,b,radius,CELL,(x,z)=>{for(const o of this.cells.get(`${x}:${z}`)??[])near.add(o);});
    // Keep the old rectangle's first-appearance order for retained obstacles.
    // An obstacle covers a rectangle of index cells; its first old cell is the
    // lower-left intersection, with original insertion order breaking ties.
    const ordered=[...near].map(o=>{const at=this.obstacleCells.get(o);return {o,x:Math.max(minX,at.x),z:Math.max(minZ,at.z),order:at.order};});
    ordered.sort((a,b)=>a.x-b.x||a.z-b.z||a.order-b.order);
    return ordered.map(entry=>entry.o);
  }
  segmentClear(a,b,radius=0,combat=false){
    const delta={x:b.x-a.x,z:b.z-a.z},r=radius+EPS;
    for(const o of this.segmentObstacles(a,b,radius)){
      if(combat&&(o.height<1||o.id.startsWith('dummy-')))continue;
      if(obstacleClearance(a,o)<r||obstacleClearance(b,o)<r||sweepObstacle(a,delta,o,r))return false;
    }
    return true;
  }
  // Shared by regular travel, thrown-player landing and v3 dodge contacts.
  // radius on a box is only its broad-phase bound, never its collision shape.
  obstacleContact(from,delta,radius){
    const to={x:from.x+delta.x,z:from.z+delta.z};let closest=null;
    for(const o of this.nearby(from,to,radius)){
      const hit=sweepObstacle(from,delta,o,radius);
      if(hit&&(!closest||hit.time<closest.time))closest={...hit,enemy:false};
    }
    return closest;
  }
  move(from,to,radius,limit=ARENA_RADIUS){
    let p=this.findFree(from,radius,limit),remaining={x:to.x-from.x,z:to.z-from.z};
    for(let step=0;step<6&&Math.hypot(remaining.x,remaining.z)>1e-6;step++){
      const hit=this.obstacleContact(p,remaining,radius+EPS);
      let nearest=hit?.time??1,normal=hit?{x:hit.nx,z:hit.nz}:null;
      const end={x:p.x+remaining.x,z:p.z+remaining.z};
      if(Math.hypot(end.x,end.z)>limit){
        const a=remaining.x**2+remaining.z**2,b=p.x*remaining.x+p.z*remaining.z,c=p.x**2+p.z**2-limit**2;
        const time=(-b+Math.sqrt(Math.max(0,b*b-a*c)))/a;
        if(time>=0&&time<nearest){nearest=time;const x=p.x+remaining.x*time,z=p.z+remaining.z*time,d=Math.hypot(x,z);normal={x:-x/d,z:-z/d};}
      }
      const length=Math.hypot(remaining.x,remaining.z),advance=Math.max(0,nearest-EPS/length);
      p.x+=remaining.x*(normal?advance:1);p.z+=remaining.z*(normal?advance:1);
      if(!normal)break;
      remaining.x*=1-nearest;remaining.z*=1-nearest;
      const inward=remaining.x*normal.x+remaining.z*normal.z;
      if(inward<0){remaining.x-=normal.x*inward;remaining.z-=normal.z*inward;}
    }
    return this.free(p,radius,limit)?p:this.findFree(p,radius,limit);
  }
}
