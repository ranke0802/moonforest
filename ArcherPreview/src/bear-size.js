// The shipped skinned Block6 frame-0 guard pose is 1.6162835955619812 m
// tall before the encounter transform. Other authored poses may stand higher.
const sourceHeight=1.6162835955619812,originalScale=1.45;
const scale=3/sourceHeight,sizeScale=scale/originalScale;
export const BEAR_V02_SIZE=Object.freeze({
  height:3,referencePose:'Block6',referenceTime:0,sourceHeight,originalScale,scale,sizeScale,
  radius:.7*sizeScale,stopDistance:1.65*sizeScale,separationRadius:.8*sizeScale,
  renderRangePadding:3*sizeScale,reviewFocusHeight:1.5*sizeScale,
  attackRangeScale:sizeScale,groundHitRange:2.4*sizeScale,
});
export const bearEncounterSize=world=>world?.release==='moonforest-0.2'?BEAR_V02_SIZE:null;
