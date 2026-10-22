/** Same camera-relative directions as movement; no input means character forward. */
export function dodgeDirection(input, cameraAlpha, facing) {
  const x=input?.x||0,y=input?.y||0;
  if(Math.hypot(x,y)<=.08)return {x:Math.sin(facing),z:Math.cos(facing)};
  const forward={x:-Math.cos(cameraAlpha),z:-Math.sin(cameraAlpha)};
  const dx=forward.x*y-forward.z*x,dz=forward.z*y+forward.x*x,length=Math.hypot(dx,dz);
  return {x:dx/length,z:dz/length};
}

/** The exported source root curve, sampled in seconds, prevents end-of-roll snapback. */
export function dodgeDistanceAt(time, motion) {
  const samples=motion?.forward;
  if(!samples?.length)return 0;
  const frame=Math.max(0,Math.min(samples.length-1,time*motion.fps)),i=Math.floor(frame);
  return samples[i]+(samples[Math.min(i+1,samples.length-1)]-samples[i])*(frame-i);
}
