import {MAP_PORTALS,PLAINS_FOREST_PORTAL,portalHeadingTurn} from './map-route.js';

// The unchanged forest and the plains use one metre per metre. Align their
// existing road portals and the same heading used by the camera handoff.
const forestPortal=Object.freeze({x:MAP_PORTALS['monster-forest'].x,z:MAP_PORTALS['monster-forest'].z});
const plainsPortal=Object.freeze({x:PLAINS_FOREST_PORTAL.x,z:PLAINS_FOREST_PORTAL.z});
export const FOREST_PLAINS_BOUNDARY=Object.freeze({forestPortal,plainsPortal,yaw:portalHeadingTurn('warrior-v4','warrior-plains')});

export function forestToPlains(p){
 const {yaw,forestPortal:a,plainsPortal:b}=FOREST_PLAINS_BOUNDARY,c=Math.cos(yaw),s=Math.sin(yaw),x=p.x-a.x,z=p.z-a.z;
 return {x:b.x+c*x+s*z,z:b.z-s*x+c*z};
}
export function plainsToForest(p){
 const {yaw,forestPortal:a,plainsPortal:b}=FOREST_PLAINS_BOUNDARY,c=Math.cos(yaw),s=Math.sin(yaw),x=p.x-b.x,z=p.z-b.z;
 return {x:a.x+c*x-s*z,z:a.z+s*x+c*z};
}
