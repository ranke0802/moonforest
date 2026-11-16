// The shipped skinned Block6 frame-0 guard pose is 1.6162835955619812 m
// tall before the encounter transform. Other authored poses may stand higher.
const sourceHeight=1.6162835955619812,originalScale=1.45;
function profile(height){const scale=height/sourceHeight,sizeScale=scale/originalScale;return Object.freeze({
  height,referencePose:'Block6',referenceTime:0,sourceHeight,originalScale,scale,sizeScale,
  radius:.7*sizeScale,stopDistance:1.65*sizeScale,separationRadius:.8*sizeScale,
  renderRangePadding:3*sizeScale,reviewFocusHeight:1.5*sizeScale,
  attackRangeScale:sizeScale,groundHitRange:2.4*sizeScale,
  approachGap:.04*scale,approachConfirmGap:.02*scale,grabGap:.006*scale,grabConfirmGap:.001*scale,
});}
// Keep the former reviewed profile as a historical reference, never an input
// that silently changes the current actor or the preserved 0.1 release.
export const BEAR_V02_4_5M_REFERENCE=profile(4.5);
export const BEAR_V02_SIZE=profile(3);
export function bearApproachDistances(size,playerRadius){
  const body=size.radius+playerRadius,normal=body+size.approachGap,grab=body+size.grabGap;
  return {normal,normalTrigger:normal+size.approachConfirmGap,grab,grabTrigger:grab+size.grabConfirmGap};
}
export const bearEncounterSize=world=>world?.release==='moonforest-0.2'?BEAR_V02_SIZE:null;
