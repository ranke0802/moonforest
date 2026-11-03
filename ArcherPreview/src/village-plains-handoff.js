import {villageToPlains,plainsToVillage} from './village-plains-boundary.js';
import {forestToPlains,plainsToForest} from './plains-forest-boundary.js';

// Only a physical road portal calls this. Menu and direct map selections keep
// their existing spawn behavior. Snapshot before teardown so retries never
// transform an already-transformed position or rotate the camera twice.
export function captureRoadHandoff(from,to,actor,camera,pan){
 const transform=from==='warrior-v3'&&to==='warrior-plains'?villageToPlains:from==='warrior-plains'&&to==='warrior-v3'?plainsToVillage:from==='warrior-v4'&&to==='warrior-plains'?forestToPlains:from==='warrior-plains'&&to==='warrior-v4'?plainsToForest:null;
 if(!transform||![actor?.position?.x,actor?.position?.z,actor?.rotation?.y,camera?.alpha].every(Number.isFinite))return null;
 const position=transform(actor.position);
 return {from,to,position,yaw:actor.rotation.y,alpha:camera.alpha,pan:pan?{x:pan.x,y:pan.y,z:pan.z}:null};
}
// Preserve existing callers while both connected roads use the same logic.
export const captureVillagePlainsHandoff=captureRoadHandoff;
