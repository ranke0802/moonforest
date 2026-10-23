// Swept planar contacts: rolling moves only the player, never a blocking enemy.
// Stop at the first obstacle rather than projecting through a crowd or a corner.
export function constrainDodge(position, from, navigation, encounters = [], limit = 11) {
  const dx=position.x-from.x,dz=position.z-from.z,length=Math.hypot(dx,dz);
  if(length<1e-8)return position;
  let fraction=1;
  const sweep=(center,radius)=>{
    const x=from.x-center.x,z=from.z-center.z,dot=x*dx+z*dz;
    if(dot>=0)return; // Allow rolling away from a pre-existing overlap.
    const c=x*x+z*z-radius*radius;
    if(c<=0){fraction=0;return;}
    const a=length*length,disc=dot*dot-a*c;
    if(disc<0)return;
    const t=(-dot-Math.sqrt(disc))/a;
    if(t>=0&&t<=fraction)fraction=Math.max(0,t-.003/length);
  };
  for(const obstacle of navigation.obstacles)sweep(obstacle,obstacle.radius+.32);
  for(const enemy of encounters){
    if(!enemy.active||enemy.brain.hp<=0)continue;
    // Match the existing standing character separation boundary, including
    // downed/recovering enemies; otherwise the next contact pass would push them.
    sweep(enemy.actor.position,enemy.radius+.65+.005);
  }
  if(Math.hypot(position.x,position.z)>limit){
    const a=length*length,b=from.x*dx+from.z*dz,c=from.x*from.x+from.z*from.z-limit*limit;
    fraction=Math.min(fraction,Math.max(0,(-b+Math.sqrt(Math.max(0,b*b-a*c)))/a));
  }
  position.x=from.x+dx*fraction;position.z=from.z+dz*fraction;
  return position;
}
