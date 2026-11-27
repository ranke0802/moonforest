import { ArenaNavigation, linksOf, navigationWork, gridLinks, setLinks, GRID_DIRECTIONS } from './navigation.js';
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
    const nodes=this.fastRouteGrids&&this.fastRouteGridReady(radius,limit)?this.buildRouteGrid(radius,limit):super.grid(radius,limit);
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
  // 0.3 (2026-11-28): the plains build three ~80k-node route grids while the
  // map loads; ArenaNavigation.grid took about 0.54 s on PC there, mostly in
  // per-edge Sets, string cell keys and garbage. This makes the same decisions
  // with this class's own free/segmentClear rules: a numeric cell index, and an
  // enclosing-circle test (1e-6 margin) that only skips obstacles which cannot
  // touch the point or segment, before the exact clearance and sweep. Anything
  // else (overridden rules, unsafe legacy boxes, odd radii) uses the original.
  fastRouteGridReady(radius,limit){
    const own=VillageNavigation.prototype;
    return !this.grids.has(`${radius}:${limit}`)&&this.segmentCellPruningSafe&&Number.isFinite(radius)&&radius>=0&&Number.isFinite(limit)&&limit>0&&
      this.free===own.free&&this.segmentClear===own.segmentClear&&this.segmentObstacles===own.segmentObstacles&&this.nearby===own.nearby;
  }
  routeCellIndex(){
    if(this.routeCells)return this.routeCells;
    const obstacles=this.obstacles,index=new Map(obstacles.map((o,i)=>[o,i]));
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;const parsed=[];
    for(const [k,list] of this.cells){const at=k.indexOf(':'),x=+k.slice(0,at),z=+k.slice(at+1);parsed.push([x,z,list]);if(x<minX)minX=x;if(x>maxX)maxX=x;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;}
    const width=parsed.length?maxX-minX+1:0,depth=parsed.length?maxZ-minZ+1:0,start=new Int32Array(width*depth+1);
    for(const [x,z,list] of parsed)start[(z-minZ)*width+(x-minX)+1]=list.length;
    for(let i=1;i<start.length;i++)start[i]+=start[i-1];
    const items=new Int32Array(start[start.length-1]),fill=start.slice(0,-1);
    for(const [x,z,list] of parsed){const c=(z-minZ)*width+(x-minX);for(const o of list)items[fill[c]++]=index.get(o);}
    const ox=new Float64Array(obstacles.length),oz=new Float64Array(obstacles.length),bound=new Float64Array(obstacles.length);
    // Each obstacle's cell range, exactly as the constructor listed it.
    const cellX0=new Float64Array(obstacles.length),cellX1=new Float64Array(obstacles.length),cellZ0=new Float64Array(obstacles.length),cellZ1=new Float64Array(obstacles.length);
    obstacles.forEach((o,i)=>{
      ox[i]=o.x;oz[i]=o.z;bound[i]=o.shape==='box'?Math.hypot(o.halfWidth,o.halfDepth):o.radius;
      const extent=o.radius+1.5;cellX0[i]=Math.floor((o.x-extent)/CELL);cellX1[i]=Math.floor((o.x+extent)/CELL);cellZ0[i]=Math.floor((o.z-extent)/CELL);cellZ1[i]=Math.floor((o.z+extent)/CELL);
    });
    // Summed counts: an empty rectangle of cells answers 'clear' without visiting it.
    const sums=new Int32Array((width+1)*(depth+1));
    for(let z=0;z<depth;z++)for(let x=0;x<width;x++){const c=z*width+x;sums[(z+1)*(width+1)+x+1]=start[c+1]-start[c]+sums[z*(width+1)+x+1]+sums[(z+1)*(width+1)+x]-sums[z*(width+1)+x];}
    const count=(x0,x1,z0,z1)=>{
      x0=Math.max(x0,minX)-minX;z0=Math.max(z0,minZ)-minZ;x1=Math.min(x1,minX+width-1)-minX;z1=Math.min(z1,minZ+depth-1)-minZ;
      if(x0>x1||z0>z1)return 0;
      const w=width+1;return sums[(z1+1)*w+x1+1]-sums[z0*w+x1+1]-sums[(z1+1)*w+x0]+sums[z0*w+x0];
    };
    return this.routeCells={minX,minZ,width,depth,start,items,ox,oz,bound,count,cellX0,cellX1,cellZ0,cellZ1};
  }
  buildRouteGrid(radius,limit){
    const began=performance.now(),step=limit>12?.75:.5,n=Math.floor(limit*2/step)+1,nodes=[],links=gridLinks(n,step),mask=links.mask;
    const {minX,minZ,width,depth,start,items,ox,oz,bound,count,cellX0,cellX1,cellZ0,cellZ1}=this.routeCellIndex(),obstacles=this.obstacles;
    // Node test: free(p,radius+.035,limit). One cell below 1.5, the rectangle above.
    const R=radius+.035,need=R+EPS,single=R<=1.5;
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){
      const node={x:x*step-limit,z:z*step-limit,free:false};nodes.push(node);
      if(Math.hypot(node.x,node.z)>limit+1e-6||offEnemyTravelShape(node,limit))continue;
      const x0=Math.floor((single?node.x:node.x-R)/CELL),x1=single?x0:Math.floor((node.x+R)/CELL),z0=Math.floor((single?node.z:node.z-R)/CELL),z1=single?z0:Math.floor((node.z+R)/CELL);
      let free=true;
      for(let cz=z0;free&&cz<=z1;cz++){
        if(cz<minZ||cz>=minZ+depth)continue;
        for(let cx=x0;free&&cx<=x1;cx++){
          if(cx<minX||cx>=minX+width)continue;
          const c=(cz-minZ)*width+(cx-minX);
          for(let k=start[c];k<start[c+1];k++){
            const o=items[k],dx=node.x-ox[o],dz=node.z-oz[o],reach=bound[o]+need+1e-6;
            if(dx*dx+dz*dz>reach*reach)continue;
            if(!(obstacleClearance(node,obstacles[o])>=need)){free=false;break;}
          }
        }
      }
      node.free=free;
    }
    // Edge test: segmentClear(a,b,radius+.025), whose candidates are nearby()'s rectangle.
    const r=radius+.025,rr=r+EPS,delta={x:0,z:0},near=step*1.5,stamp=new Int32Array(obstacles.length),found=new Int32Array(obstacles.length);
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){
      const i=z*n+x,a=nodes[i];if(!a.free)continue;
      // Every neighbour lies within one step: gather once the obstacles of the
      // cells around that square which could reach any of the eight edges.
      const reach=step+r+1e-9,ux0=Math.floor((a.x-reach)/CELL),ux1=Math.floor((a.x+reach)/CELL),uz0=Math.floor((a.z-reach)/CELL),uz1=Math.floor((a.z+reach)/CELL);
      let candidates=0;
      if(count(ux0,ux1,uz0,uz1))for(let cz=Math.max(uz0,minZ);cz<=Math.min(uz1,minZ+depth-1);cz++)for(let cx=Math.max(ux0,minX);cx<=Math.min(ux1,minX+width-1);cx++){
        const c=(cz-minZ)*width+(cx-minX);
        for(let k=start[c];k<start[c+1];k++){
          const o=items[k];if(stamp[o]===i+1)continue;stamp[o]=i+1;
          const dx=ox[o]-a.x,dz=oz[o]-a.z,limitReach=bound[o]+rr+near+1e-6;
          if(!(dx*dx+dz*dz>limitReach*limitReach))found[candidates++]=o;
        }
      }
      for(let d=0;d<8;d++){
        const xx=x+GRID_DIRECTIONS[d][0],zz=z+GRID_DIRECTIONS[d][1],j=zz*n+xx;if(xx<0||xx>=n||zz<0||zz>=n||!nodes[j].free)continue;
        if(!candidates){mask[i]|=1<<d;continue;}
        const b=nodes[j],x0=Math.floor((Math.min(a.x,b.x)-r)/CELL),x1=Math.floor((Math.max(a.x,b.x)+r)/CELL),z0=Math.floor((Math.min(a.z,b.z)-r)/CELL),z1=Math.floor((Math.max(a.z,b.z)+r)/CELL);
        if((x1-x0+1)*(z1-z0+1)>16&&a.x!==b.x&&a.z!==b.z){if(this.segmentClear(a,b,r))mask[i]|=1<<d;continue;}
        const sx=b.x-a.x,sz=b.z-a.z,length=sx*sx+sz*sz;let clear=true;
        for(let k=0;k<candidates;k++){
          const o=found[k];
          // segmentClear only sees obstacles listed in a cell of this edge's rectangle.
          if(cellX1[o]<x0||cellX0[o]>x1||cellZ1[o]<z0||cellZ0[o]>z1)continue;
          const px=ox[o]-a.x,pz=oz[o]-a.z,t=length>0?Math.max(0,Math.min(1,(px*sx+pz*sz)/length)):0,ex=px-sx*t,ez=pz-sz*t,edgeReach=bound[o]+rr+1e-6;
          if(ex*ex+ez*ez>edgeReach*edgeReach)continue;
          const obstacle=obstacles[o];delta.x=sx;delta.z=sz;
          if(obstacleClearance(a,obstacle)<rr||obstacleClearance(b,obstacle)<rr||sweepObstacle(a,delta,obstacle,rr)){clear=false;break;}
        }
        if(clear)mask[i]|=1<<d;
      }
    }
    setLinks(nodes,links);this.grids.set(`${radius}:${limit}`,nodes);navigationWork.gridMs+=performance.now()-began;return nodes;
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
