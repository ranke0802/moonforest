const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const EPS=.002;
function hitTime(a,delta,c,radius){
  const x=a.x-c.x,z=a.z-c.z,aa=delta.x*delta.x+delta.z*delta.z;
  if(aa<1e-14)return null;
  const bb=x*delta.x+z*delta.z,cc=x*x+z*z-radius*radius,disc=bb*bb-aa*cc;
  if(bb>=0||disc<0)return null;
  const t=(-bb-Math.sqrt(disc))/aa;
  return t>=-1e-7&&t<=1?Math.max(0,t):null;
}

/** Analytic swept circles for locomotion; a cached grid is only used to find detours. */
export class ArenaNavigation {
  constructor(obstacles){this.obstacles=obstacles;this.grids=new Map();this.pathsBuilt=0;}
  free(p,radius,limit=11){return Math.hypot(p.x,p.z)<=limit+1e-6&&this.obstacles.every(o=>distance(p,o)>=radius+o.radius+EPS);}
  findFree(p,radius,limit=11,occupied=[]){
    const center={x:p.x,z:p.z},d=Math.hypot(p.x,p.z);
    if(d>limit){center.x*=limit/d;center.z*=limit/d;}
    const available=q=>this.free(q,radius,limit)&&occupied.every(o=>distance(q,o)>=radius+(o.radius??radius)+.12);
    if(available(center))return center;
    for(let ring=.1;ring<23;ring+=.15)for(let i=0;i<48;i++){
      const a=i*Math.PI/24,q={x:center.x+Math.cos(a)*ring,z:center.z+Math.sin(a)*ring};
      if(available(q))return q;
    }
    throw new Error('훈련장에 안전한 배치 공간이 없습니다.');
  }
  segmentClear(a,b,radius=0,combat=false){
    const delta={x:b.x-a.x,z:b.z-a.z};
    return this.obstacles.every(o=>{
      if(combat&&(o.height<1||o.id.startsWith('dummy-')))return true;
      const r=o.radius+radius+EPS;
      return distance(a,o)>=r&&distance(b,o)>=r&&hitTime(a,delta,o,r)===null;
    });
  }
  move(from,to,radius,limit=11){
    let p=this.findFree(from,radius,limit),remaining={x:to.x-from.x,z:to.z-from.z};
    for(let step=0;step<6&&Math.hypot(remaining.x,remaining.z)>1e-6;step++){
      let nearest=1,normal=null;
      for(const o of this.obstacles){
        const t=hitTime(p,remaining,o,radius+o.radius+EPS);
        if(t!==null&&t<nearest){nearest=t;const point={x:p.x+remaining.x*t,z:p.z+remaining.z*t},d=distance(point,o);normal={x:(point.x-o.x)/d,z:(point.z-o.z)/d};}
      }
      const end={x:p.x+remaining.x,z:p.z+remaining.z};
      if(Math.hypot(end.x,end.z)>limit){
        const a=remaining.x**2+remaining.z**2,b=p.x*remaining.x+p.z*remaining.z,c=p.x**2+p.z**2-limit**2;
        const t=(-b+Math.sqrt(Math.max(0,b*b-a*c)))/a;
        if(t>=0&&t<nearest){nearest=t;const q={x:p.x+remaining.x*t,z:p.z+remaining.z*t},d=Math.hypot(q.x,q.z);normal={x:-q.x/d,z:-q.z/d};}
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
  constrain(position,from,radius,limit=11){const p=from?this.move(from,position,radius,limit):this.findFree(position,radius,limit);position.x=p.x;position.z=p.z;return position;}
  grid(radius,limit){
    const key=`${radius}:${limit}`;if(this.grids.has(key))return this.grids.get(key);
    const step=.5,n=Math.floor(limit*2/step)+1,nodes=[];
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){const p={x:x*step-limit,z:z*step-limit};nodes.push({...p,free:this.free(p,radius+.035,limit),edges:[]});}
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){
      const i=z*n+x;if(!nodes[i].free)continue;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const xx=x+dx,zz=z+dz,j=zz*n+xx;if(xx<0||xx>=n||zz<0||zz>=n||!nodes[j].free)continue;
        if(this.segmentClear(nodes[i],nodes[j],radius+.025))nodes[i].edges.push([j,step*Math.hypot(dx,dz)]);
      }
    }
    this.grids.set(key,nodes);return nodes;
  }
  path(from,goal,radius,limit=10.5){
    this.pathsBuilt++;const start=this.findFree(from,radius,limit),target=this.findFree(goal,radius,limit);
    if(this.segmentClear(start,target,radius+.025))return [target];
    const nodes=this.grid(radius,limit);
    const nearest=p=>{let best=-1,cost=Infinity;for(let i=0;i<nodes.length;i++)if(nodes[i].free){const d=distance(p,nodes[i]);if(d<cost&&this.segmentClear(p,nodes[i],radius)){best=i;cost=d;}}return best;};
    const s=nearest(start),g=nearest(target);if(s<0||g<0)return [];
    const scores=new Float64Array(nodes.length);scores.fill(Infinity);scores[s]=0;
    const parents=new Int32Array(nodes.length);parents.fill(-1);const closed=new Uint8Array(nodes.length),open=[{i:s,f:distance(start,target)}];
    while(open.length){
      open.sort((a,b)=>b.f-a.f);const {i}=open.pop();if(closed[i])continue;closed[i]=1;
      if(i===g){const route=[target];for(let j=g;j>=0;j=parents[j])route.unshift(nodes[j]);return route;}
      for(const [j,cost] of nodes[i].edges){const next=scores[i]+cost;if(next>=scores[j])continue;scores[j]=next;parents[j]=i;open.push({i:j,f:next+distance(nodes[j],target)});}
    }
    return [];
  }
  steer(from,goal,radius,cache,dt,limit=10.5){
    if(this.segmentClear(from,goal,radius+.03)){cache.route=null;return goal;}
    cache.age=(cache.age??0)+dt;
    if(!cache.route||cache.age>.65||distance(goal,cache.goal)>.8){cache.route=this.path(from,goal,radius,limit);cache.goal={x:goal.x,z:goal.z};cache.age=0;}
    const route=cache.route;
    while(route.length>1&&(distance(from,route[0])<.25||this.segmentClear(from,route[1],radius+.02)))route.shift();
    return route[0]??from;
  }
  inspect(){return {obstacles:this.obstacles,pathsBuilt:this.pathsBuilt};}
}
