// Great Plains meadow (0.4): where grass is thick, thin or absent.
// Grass gathers in drifting patches, grows lush and tall along the stream,
// thins out beside the worn roads and keeps off the roads, the cleared
// camps and the water itself.
import {PLAINS_RADIUS,PLAINS_ROUTES,PLAINS_CLEARINGS,PLAINS_STREAM} from '../great-plains-layout.js';
import {valueNoise,smooth} from './meadow-scatter.js';

const FAR=99,MARGIN=15;
// Roads, camps and stream points near one cell: a tuft only measures those.
function sampler(centerX,centerZ,reach){
 const range=(reach+MARGIN)**2,roads=[],camps=[],water=[];
 for(const route of PLAINS_ROUTES){const half=route.width*.5;for(const [x,z] of route.samples)if((x-centerX)**2+(z-centerZ)**2<(reach+MARGIN+half)**2)roads.push(x,z,half);}
 for(const camp of PLAINS_CLEARINGS)if((camp.x-centerX)**2+(camp.z-centerZ)**2<(reach+MARGIN+camp.r)**2)camps.push(camp.x,camp.z,camp.r);
 for(const [x,z] of PLAINS_STREAM)if((x-centerX)**2+(z-centerZ)**2<range)water.push(x,z);
 const near=(list,stride,x,z)=>{let best=FAR;for(let i=0;i<list.length;i+=stride){const d=Math.sqrt((list[i]-x)**2+(list[i+1]-z)**2)-(stride===3?list[i+2]:0);if(d<best)best=d;}return best;};
 // out[0]: share of candidates kept (0…1) · out[1]: tall (0…1)
 return (x,z,out)=>{
  out[0]=out[1]=0;
  if(x*x+z*z>(PLAINS_RADIUS-3)**2)return out;
  const road=Math.min(near(roads,3,x,z),near(camps,3,x,z));if(road<.9)return out;
  const stream=near(water,2,x,z);if(stream<3.2)return out;
  const patch=valueNoise(x/13,z/13,11)*.65+valueNoise(x/4.5,z/4.5,29)*.35;
  const amount=(smooth((patch-.36)/.28)*.5+.22*(1-smooth((stream-3.2)/9)))*(.25+.75*smooth((road-.9)/2.8));
  out[0]=Math.min(.66,amount);
  const bank=1-smooth((stream-3.2)/6),drift=smooth((valueNoise(x/22,z/22,53)-.62)/.2);
  out[1]=Math.min(1,bank*.9+drift*.6)*smooth((road-2)/3);
  return out;
 };
}
export const plainsMeadow=Object.freeze({mapId:'great-plains',radius:PLAINS_RADIUS-3,sampler});
