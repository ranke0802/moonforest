import {VILLAGE_HOMES,homeRoadEnd} from './village-layout.js';

export function sampleGroundCurve(points,{closed=false,step=.22}={}){
  const result=[],n=points.length,get=i=>points[closed?(i+n)%n:Math.max(0,Math.min(n-1,i))];
  for(let i=0;i<n-(closed?0:1);i++){
    const [a,b,c,d]=[get(i-1),get(i),get(i+1),get(i+2)],steps=Math.max(2,Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/step));
    for(let k=0;k<steps;k++){
      const t=k/steps;result.push([0,1].map(axis=>.5*((2*b[axis])+(-a[axis]+c[axis])*t+(2*a[axis]-5*b[axis]+4*c[axis]-d[axis])*t*t+(-a[axis]+3*b[axis]-3*c[axis]+d[axis])*t*t*t)));
    }
  }
  result.push(closed?points[0]:points.at(-1));return result;
}

// Worn routes follow the existing open corridors, without changing navigation,
// foundations or placed objects. Control points gently bend and widen the lanes.
export const VILLAGE_GROUND_ROUTES=[
  {width:3.7,points:[[-38,0],[-28,-.7],[-17,.9],[-7,-.5],[0,0],[11,.8],[23,-.8],[38,0]]},
  {width:3.9,points:[[0,-41],[-.8,-30],[.7,-17],[-.6,-7],[0,0],[.8,14],[-.8,27],[0,40],[.8,49],[-1.8,63],[1,80]]},
  {width:3.2,closed:true,points:[[-13,-23.8],[1,-22.5],[15,-23],[20,-16],[19,-2],[21,12],[15,23],[2,24],[-13,22.8],[-20.5,16],[-19.2,1],[-21,-13]]},
  ...VILLAGE_HOMES.map((home,i)=>{
    const a=[home.x,home.z],b=homeRoadEnd(home),dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1,bend=(i%2?1:-1)*.65;
    return {width:1.8,points:[a,[(a[0]+b[0])*.5-dz/length*bend,(a[1]+b[1])*.5+dx/length*bend],b]};
  }),
];

export function groundLayout(){return VILLAGE_GROUND_ROUTES.map(route=>({...route,samples:sampleGroundCurve(route.points,route)}));}
