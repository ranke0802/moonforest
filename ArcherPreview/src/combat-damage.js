// Rear 120-degree arc, measured in the ground plane at contact.
export function rearDamage(base,attacker,target,yaw=0){
  const x=attacker.x-target.x,z=attacker.z-target.z,d=Math.hypot(x,z);
  const critical=d>1e-5&&(x*Math.sin(yaw)+z*Math.cos(yaw))/d<-.5;
  return {damage:Math.round(base*(critical?1.3:1)),critical};
}

// Shoulder positions include the authored torso's turns, including spin attacks.
export function facingYaw(nodes,fallback=0){
  const right=nodes?.['mixamorig:RightArm'],left=nodes?.['mixamorig:LeftArm'];
  if(!right||!left)return fallback;
  right.computeWorldMatrix(true);left.computeWorldMatrix(true);
  const r=right.getAbsolutePosition(),l=left.getAbsolutePosition(),x=r.z-l.z,z=l.x-r.x;
  return Math.hypot(x,z)>.05?Math.atan2(x,z):fallback;
}
