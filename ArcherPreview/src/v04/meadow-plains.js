// Great Plains meadow (0.4): where grass is thick, thin or absent.
// Grass gathers in drifting patches, grows lush and tall along the stream,
// thins out beside the worn roads and keeps off the roads, the cleared
// camps and the water itself.
import {PLAINS_RADIUS,PLAINS_ROUTES,PLAINS_CLEARINGS,PLAINS_STREAM} from '../great-plains-layout.js';
import {valueNoise,smooth} from './meadow-scatter.js';

const FAR=99,MARGIN=15;
// Roads, camps and stream points near one cell: a plant only measures those.
function surroundings(centerX,centerZ,reach){
 const range=(reach+MARGIN)**2,roads=[],water=[];
 for(const route of PLAINS_ROUTES){const half=route.width*.5;for(const [x,z] of route.samples)if((x-centerX)**2+(z-centerZ)**2<(reach+MARGIN+half)**2)roads.push(x,z,half);}
 for(const camp of PLAINS_CLEARINGS)if((camp.x-centerX)**2+(camp.z-centerZ)**2<(reach+MARGIN+camp.r)**2)roads.push(camp.x,camp.z,camp.r);
 for(const [x,z] of PLAINS_STREAM)if((x-centerX)**2+(z-centerZ)**2<range)water.push(x,z);
 const near=(list,stride,x,z)=>{let best=FAR;for(let i=0;i<list.length;i+=stride){const d=Math.sqrt((list[i]-x)**2+(list[i+1]-z)**2)-(stride===3?list[i+2]:0);if(d<best)best=d;}return best;};
 return {road:(x,z)=>near(roads,3,x,z),stream:(x,z)=>near(water,2,x,z)};
}
const inside=(x,z)=>x*x+z*z<=(PLAINS_RADIUS-3)**2;

// Grass: out[0] share of candidates kept (0…1) · out[1] tall (0…1).
function grassSampler(centerX,centerZ,reach){
 const local=surroundings(centerX,centerZ,reach);
 return (x,z,out)=>{
  out[0]=out[1]=0;
  if(!inside(x,z))return out;
  const road=local.road(x,z);if(road<.9)return out;
  const stream=local.stream(x,z);if(stream<3.2)return out;
  const patch=valueNoise(x/13,z/13,11)*.65+valueNoise(x/4.5,z/4.5,29)*.35;
  const amount=(smooth((patch-.36)/.28)*.5+.22*(1-smooth((stream-3.2)/9)))*(.25+.75*smooth((road-.9)/2.8));
  out[0]=Math.min(.66,amount);
  const bank=1-smooth((stream-3.2)/6),drift=smooth((valueNoise(x/22,z/22,53)-.62)/.2);
  out[1]=Math.min(1,bank*.9+drift*.6)*smooth((road-2)/3);
  return out;
 };
}
export const plainsMeadow=Object.freeze({mapId:'great-plains',radius:PLAINS_RADIUS-3,sampler:grassSampler});

// Undergrowth: shrubs gather at the drip line of tree crowns (where light
// reaches the ground) and along the stream, never on roads or in camps.
// trees: [{x,z,r}] with r the crown radius in metres.
export function plainsThicket(trees){
 const sampler=(centerX,centerZ,reach)=>{
  const local=surroundings(centerX,centerZ,reach),crowns=trees.filter(tree=>(tree.x-centerX)**2+(tree.z-centerZ)**2<(reach+tree.r*1.5+1)**2);
  return (x,z,out)=>{
   out[0]=out[1]=0;
   if(!inside(x,z))return out;
   const road=local.road(x,z);if(road<1.6)return out;
   const stream=local.stream(x,z);if(stream<3.6)return out;
   let ring=0;
   for(const tree of crowns){
    const d=Math.sqrt((tree.x-x)**2+(tree.z-z)**2)/tree.r,w=smooth((d-.5)/.3)*(1-smooth((d-1.05)/.4));
    // About two trees in three carry undergrowth.
    if(w>ring&&valueNoise(tree.x*.37,tree.z*.37,71)>.34)ring=w;
   }
   const bank=(1-smooth((stream-3.6)/5))*smooth((valueNoise(x/9,z/9,83)-.45)/.2);
   out[0]=Math.min(.6,ring*.55+bank*.3)*smooth((road-1.6)/2);
   out[1]=smooth((valueNoise(x/6,z/6,97)-.5)/.3);
   return out;
  };
 };
 return Object.freeze({mapId:'great-plains',radius:PLAINS_RADIUS-3,sampler,
  shape:Object.freeze({width:.2,widthRange:.16,widthTall:.1,stretch:.85,stretchRange:.3,stretchTall:.2}),
  // Near cells draw the bush model itself: a decimated bush reads as a blob up close.
  layer:Object.freeze({spacing:1.7,seed:9,nearTriangles:Infinity,farTriangles:120,nearRange:30,thinRange:120,farShare:1,thinShare:.7,sink:.05,clearance:.2})});
}
