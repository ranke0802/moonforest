import {VILLAGE_GROUND_ROUTES,sampleGroundCurve} from './village-ground-layout.js';
// One metre in the village is one metre in its plains vista. The portal anchors
// define a rigid rotation/translation; scenery, road paint and travel share it.
const villagePortal=Object.freeze({x:.35,z:76}),plainsPortal=Object.freeze({x:-94,z:-35});
export const VILLAGE_PLAINS_BOUNDARY=Object.freeze({
 villagePortal,plainsPortal,villageArrival:Object.freeze({x:.35,z:70}),plainsArrival:Object.freeze({x:-87,z:-32}),
 roadWidth:VILLAGE_GROUND_ROUTES[1].width,height:.12,yaw:Math.atan2(7,3),
 villageRoad:Object.freeze(VILLAGE_GROUND_ROUTES[1].points.map(p=>Object.freeze([...p]))),
 villageSamples:Object.freeze(sampleGroundCurve(VILLAGE_GROUND_ROUTES[1].points).filter(p=>p[1]>=40).map(Object.freeze)),
});
export function villageToPlains(p){const a=VILLAGE_PLAINS_BOUNDARY.yaw,c=Math.cos(a),s=Math.sin(a),x=p.x-villagePortal.x,z=p.z-villagePortal.z;return {x:plainsPortal.x+c*x+s*z,z:plainsPortal.z-s*x+c*z};}
export function plainsToVillage(p){const a=VILLAGE_PLAINS_BOUNDARY.yaw,c=Math.cos(a),s=Math.sin(a),x=p.x-plainsPortal.x,z=p.z-plainsPortal.z;return {x:villagePortal.x+c*x-s*z,z:villagePortal.z+s*x+c*z};}
export function boundaryExteriorPlacement(){return {...villageToPlains({x:0,z:0}),yaw:VILLAGE_PLAINS_BOUNDARY.yaw,elevation:.025};}
export function isVillageBoundaryTree(p){return p.kind==='tree'&&p.z>39&&Math.abs(p.x)<36&&Math.hypot(p.x-villagePortal.x,p.z-villagePortal.z)<60;}
