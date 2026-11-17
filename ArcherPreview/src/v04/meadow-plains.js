// Great Plains meadow (0.4): where grass is thick, thin or absent.
// Grass gathers in drifting patches, grows lush and tall along the stream,
// thins out beside the worn roads and keeps off the roads, the cleared
// camps and the water itself.
import {PLAINS_RADIUS,plainsRoadDistance,plainsStreamDistance} from '../great-plains-layout.js';
import {valueNoise,smooth} from './meadow-scatter.js';

export const plainsMeadow=Object.freeze({
 mapId:'great-plains',radius:PLAINS_RADIUS-3,
 density(x,z){
  if(Math.hypot(x,z)>PLAINS_RADIUS-3)return 0;
  const road=plainsRoadDistance(x,z);if(road<.9)return 0;
  const stream=plainsStreamDistance(x,z);if(stream<3.2)return 0;
  const patch=valueNoise(x/13,z/13,11)*.65+valueNoise(x/4.5,z/4.5,29)*.35;
  let amount=smooth((patch-.36)/.28)*.5+.34*(1-smooth((stream-3.2)/9));
  amount*=.25+.75*smooth((road-.9)/2.8);
  return Math.min(.82,amount);
 },
 tall(x,z){
  const stream=plainsStreamDistance(x,z),bank=1-smooth((stream-3.2)/6),drift=smooth((valueNoise(x/22,z/22,53)-.62)/.2);
  return Math.min(1,bank*.9+drift*.6)*smooth((plainsRoadDistance(x,z)-2)/3);
 },
});
