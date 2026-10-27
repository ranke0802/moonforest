import { ArenaNavigation } from './navigation.js';
import { ARENA_RADIUS, ENEMY_ARENA_RADIUS } from './world-limits.js';
import { obstacleClearance, sweepObstacle } from './village-collision.js';

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
export class VillageNavigation extends ArenaNavigation {
  constructor(obstacles){
    super(obstacles);this.cells=new Map();this.gridMetadata=new WeakMap();
    for(const o of obstacles){
      const extent=o.radius+1.5;
      for(let x=Math.floor((o.x-extent)/CELL);x<=Math.floor((o.x+extent)/CELL);x++)for(let z=Math.floor((o.z-extent)/CELL);z<=Math.floor((o.z+extent)/CELL);z++){
        const k=`${x}:${z}`;if(!this.cells.has(k))this.cells.set(k,[]);this.cells.get(k).push(o);
      }
    }
  }
  grid(radius,limit){
    const nodes=super.grid(radius,limit);
    if(!this.gridMetadata.has(nodes)){
      const component=new Int32Array(nodes.length);component.fill(-1);
      let count=0;
      for(let i=0;i<nodes.length;i++){
        if(!nodes[i].free||component[i]>=0)continue;
        const pending=[i];component[i]=count;
        while(pending.length){
          const at=pending.pop();
          for(const [next]of nodes[at].edges)if(component[next]<0){component[next]=count;pending.push(next);}
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
  path(from,goal,radius,limit=ENEMY_ARENA_RADIUS){
    this.pathsBuilt++;
    const start=this.findFree(from,radius,limit),target=this.findFree(goal,radius,limit);
    if(this.segmentClear(start,target,radius+.025))return [target];
    const nodes=this.grid(radius,limit),s=this.nearestNode(start,nodes,radius),g=this.nearestNode(target,nodes,radius);
    if(s<0||g<0)return [];
    const {component}=this.gridMetadata.get(nodes);
    if(component[s]!==component[g])return [];
    const scores=new Float64Array(nodes.length);scores.fill(Infinity);scores[s]=0;
    const parents=new Int32Array(nodes.length);parents.fill(-1);
    const closed=new Uint8Array(nodes.length),open=new RouteHeap();open.push(s,distance(start,target));
    while(open.items.length){
      const {i}=open.pop();if(closed[i])continue;closed[i]=1;
      if(i===g){
        const route=[];for(let j=g;j>=0;j=parents[j])route.push(nodes[j]);
        route.reverse();route.push(target);return route;
      }
      for(const [j,cost]of nodes[i].edges){
        const next=scores[i]+cost;if(next>=scores[j])continue;
        scores[j]=next;parents[j]=i;open.push(j,next+distance(nodes[j],target));
      }
    }
    return [];
  }
  free(p,radius,limit=ARENA_RADIUS){
    if(Math.hypot(p.x,p.z)>limit+1e-6)return false;
    const near=radius<=1.5?(this.cells.get(key(p.x,p.z))??[]):this.obstacles;
    return near.every(o=>obstacleClearance(p,o)>=radius+EPS);
  }
  nearby(a,b,radius=0){
    const near=new Set();
    for(let x=Math.floor((Math.min(a.x,b.x)-radius)/CELL);x<=Math.floor((Math.max(a.x,b.x)+radius)/CELL);x++)for(let z=Math.floor((Math.min(a.z,b.z)-radius)/CELL);z<=Math.floor((Math.max(a.z,b.z)+radius)/CELL);z++)for(const o of this.cells.get(`${x}:${z}`)??[])near.add(o);
    return near;
  }
  segmentClear(a,b,radius=0,combat=false){
    const delta={x:b.x-a.x,z:b.z-a.z},r=radius+EPS;
    for(const o of this.nearby(a,b,radius)){
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
