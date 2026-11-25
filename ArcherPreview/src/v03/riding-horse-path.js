import {villageTravelLimit} from '../map-travel.js';
import {ARENA_RADIUS} from '../world-limits.js';

// The horse faces local +Z. Local +X is the rider's left stirrup on this rig.
// The packed gallop sweeps the tail to -1.78 m. Idle (with the mane) is
// the broadest clip at 0.44 m from centre. The capsule covers both poses.
const FLANK=.94, SEAT_Z=-.09, RIDER_RADIUS=.32, HORSE_RADIUS=.64, BODY_RADIUS=.47;
const TAIL=1.44, NOSE=.91;
const distance=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const along=(p,heading,forward,left=0)=>({
  x:p.x+Math.sin(heading)*forward+Math.cos(heading)*left,
  z:p.z+Math.cos(heading)*forward-Math.sin(heading)*left,
});
const floor=(world,p)=>world.terrain?.heightAt?world.terrain.heightAt(p.x,p.z):0;

function free(world,p,radius){
  const limit=world.mapId==='village'?villageTravelLimit(p,ARENA_RADIUS):ARENA_RADIUS;
  return Math.hypot(p.x,p.z)<=limit&&world.navigation?.free?.(p,radius,limit)!==false;
}
function walkable(world,a,b,radius){
  if(world.navigation?.segmentClear?.(a,b,radius)===false)return false;
  const length=distance(a,b),steps=Math.max(1,Math.ceil(length/.55));
  let previous=floor(world,a);
  for(let i=0;i<=steps;i++){
    const t=i/steps,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},y=floor(world,p);
    if(!free(world,p,radius)||!Number.isFinite(y)||Math.abs(y-previous)>.07+.78*length/steps)return false;
    previous=y;
  }
  return true;
}

function clearsRider(a,b,rider){
  if(!rider)return true;
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((rider.x-a.x)*dx+(rider.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(a.x+t*dx-rider.x,a.z+t*dz-rider.z)>=BODY_RADIUS+RIDER_RADIUS;
}
function canTravel(world,a,b,heading,rider){
  // Sweep the ridden collision radius and the longer nose-to-croup envelope.
  const tail=along(a,heading,-TAIL),nose=along(b,heading,NOSE);
  return clearsRider(tail,nose,rider)&&walkable(world,a,b,HORSE_RADIUS)&&walkable(world,tail,nose,BODY_RADIUS);
}
function headingTo(a,b){return Math.atan2(b.x-a.x,b.z-a.z);}
const angleBetween=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const smooth=v=>v*v*(3-2*v);
const TURN_LENGTH=.75;

export function findHorseDismount(world,position,heading){
  for(const offset of [0,-.14,.14]){
    const p=along(position,heading,SEAT_Z+offset,FLANK);
    const y=floor(world,p);
    if(Math.abs(y-floor(world,position))<=.4&&walkable(world,position,p,RIDER_RADIUS))return {...p,y};
  }
  return null;
}
function checkedRoute(world,points,heading,rider){
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],yaw=headingTo(a,b);
    if(!canTravel(world,a,b,yaw,rider))return null;
    if(i===points.length-1)continue;
    const angle=angleBetween(yaw,headingTo(b,points[i+1]));
    if(Math.abs(angle)>Math.PI*.58)return null;
    const turnLength=Math.min(TURN_LENGTH,distance(a,b));
    for(const t of [.25,.5,.75,1]){
      const p=along(b,yaw,-turnLength*(1-t));
      if(!canTravel(world,p,p,yaw+smooth(t)*angle,rider))return null;
    }
  }
  return {start:points[0],end:points.at(-1),heading,yaw:heading,points};
}
function cameraFade(world,plan){
  // In a high orbit the horse is still below the screen for several metres
  // after passing the camera. Start the fade as its body enters the picture.
  const camera=world.camera;
  if(!camera?.getTransformationMatrix)return plan;
  camera.getProjectionMatrix();
  const m=camera.getTransformationMatrix().m;
  let walked=0;
  for(let i=1;i<plan.points.length;i++){
    const a=plan.points[i-1],b=plan.points[i],length=distance(a,b),steps=Math.ceil(length/.35);
    for(let j=0;j<=steps;j++){
      const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      const y=floor(world,{x,z})+1.1,w=x*m[3]+y*m[7]+z*m[11]+m[15];
      if(w>camera.minZ&&Math.abs(x*m[0]+y*m[4]+z*m[8]+m[12])<=w&&Math.abs(x*m[1]+y*m[5]+z*m[9]+m[13])<=w){
        plan.fadeStart=Math.max(0,walked+length*t-.55);
        return plan;
      }
    }
    walked+=length;
  }
  return plan;
}
export function planHorseApproach(world,actor,heading){
  const foot=actor.position??actor,end=along(foot,heading,-SEAT_Z,-FLANK);
  if(!walkable(world,end,foot,RIDER_RADIUS)||Math.abs(floor(world,end)-floor(world,foot))>.4)return null;
  let stage=along(end,heading,-1.8);
  if(!canTravel(world,stage,end,heading,foot)){
    stage=along(end,heading,-.85);
    if(!canTravel(world,stage,end,heading,foot))return null;
  }

  const camera=world.camera;
  camera?.getViewMatrix?.();
  const eye=camera?.globalPosition??camera?.position??foot,target=camera?.getTarget?.()??foot;
  const behind=distance(eye,target)>.02?headingTo(target,eye):
    Number.isFinite(camera?.alpha)?Math.atan2(Math.cos(camera.alpha),Math.sin(camera.alpha)):heading+Math.PI;
  const first=Math.max(2,7.5-distance(eye,foot));
  // A bounded local detour at the right flank avoids running through the
  // caller, including when the camera is looking straight at their face.
  for(const rear of [first,Math.max(.9,first*.55),first+2.8])for(const side of [0,2.4,-2.4,5.3,-5.3]){
    const start=along(eye,behind,rear,side);
    if(distance(start,end)<3||!free(world,start,HORSE_RADIUS))continue;
    const direct=checkedRoute(world,[start,stage,end],heading,foot);
    if(direct)return cameraFade(world,direct);
    for(const outward of [2.3,3.8])for(const forward of [-.5,-2.6,1.4]){
      const corner=along(end,heading,forward,-outward);
      const detour=checkedRoute(world,[start,corner,stage,end],heading,foot);
      if(detour)return cameraFade(world,detour);
    }
    // When called from a front view the horse passes the player on the right
    // and loops round the back to face forward, without pivoting in place.
    for(const radius of [1.45,2.25]){
      const arc=[];
      for(let i=4;i>=0;i--){
        const angle=i*Math.PI/4;
        arc.push(along(stage,heading,-radius*Math.sin(angle),radius*(Math.cos(angle)-1)));
      }
      for(const lead of [[],[along(arc[0],heading,3)]]){
        const loop=checkedRoute(world,[start,...lead,...arc,end],heading,foot);
        if(loop)return cameraFade(world,loop);
      }
    }
  }
  return null;
}
export function planHorseDeparture(world,position,heading){
  const start={x:position.x,z:position.z},rider=findHorseDismount(world,start,heading);
  if(!rider)return null;
  const lead=along(start,heading,1.45);
  if(canTravel(world,start,lead,heading,rider)){
    for(const turn of [0,.35,-.35,.65,-.65])for(const run of [7.5,4.5,2.2]){
      const end=along(lead,heading+turn,run);
      const plan=checkedRoute(world,[start,lead,end],heading+turn,rider);
      if(plan)return plan;
    }
  }
  // A rider can still get off beside a wall. Leave along the nearest clear
  // forward arc; if even the horse's nose cannot turn, dissolve at rest.
  for(const turn of [0,-.32,.32,-.65,.65,-.98,.98]){
    const yaw=heading+turn;
    const canTurn=[0,.25,.5,.75,1].every(t=>{
      const p=along(start,yaw,t*TURN_LENGTH);
      return canTravel(world,p,p,heading+turn*smooth(t),rider);
    });
    if(!canTurn)continue;
    for(const distance of [3.5,1.8,.9]){
      const end=along(start,yaw,distance);
      const plan=checkedRoute(world,[start,end],yaw,rider);
      if(plan)return {...plan,initialHeading:heading};
    }
  }
  return {start,end:start,heading,yaw:heading,points:[start],stationary:true};
}

export function startHorseTravel(horse,plan,{departing=false,saddle=null}={}){
  let opacity;
  function show(value){
    if(value===opacity)return;
    opacity=value;horse.setOpacity?.(value);if(saddle)saddle.visibility=value;
  }
  if(plan.stationary){
    let elapsed=0;
    horse.play('Horse_Idle');horse.place(plan.start.x,plan.start.z,plan.heading);show(1);
    return {get speed(){return 0;},get progress(){return elapsed/.6;},update(dt){
      if(dt>0&&Number.isFinite(dt))elapsed=Math.min(.6,elapsed+dt);
      show(1-smooth(elapsed/.6));return elapsed>=.6;
    }};
  }
  const points=plan.points,legs=points.slice(1).map((to,i)=>{
    const from=points[i];
    return {from,to,length:distance(from,to),heading:headingTo(from,to)};
  });
  const length=legs.reduce((sum,leg)=>sum+leg.length,0);
  const fadeStart=Math.min(plan.fadeStart??0,Math.max(0,length-1.7));
  const fadeInDistance=Math.min(2.6,length*.65,length-fadeStart);
  let progress=0,legIndex=0,legStart=0,done=false,walk=false;
  horse.play('Horse_Gallop');
  horse.place(plan.start.x,plan.start.z,plan.initialHeading??legs[0].heading);
  show(departing?1:0);
  return {get speed(){return done?0:walk?2.15:5.8;},get progress(){return progress/length;},update(dt){
    if(done)return true;
    if(!(dt>0)||!Number.isFinite(dt))return false;
    // Cover the final approach at a walk. Integrate both rates if a frame
    // crosses the gait change, so a long frame still reaches the same pose.
    const run=Math.max(0,(departing?length:length-1.35)-progress),runSpeed=5.8;
    const runTime=Math.min(dt,run/runSpeed);
    progress=Math.min(length,progress+runTime*runSpeed+(dt-runTime)*2.15);
    if(!departing&&!walk&&length-progress<=1.35){walk=true;horse.play('Horse_Walk');}
    while(legIndex+1<legs.length&&progress>=legStart+legs[legIndex].length){legStart+=legs[legIndex].length;legIndex++;}
    const leg=legs[legIndex],t=Math.min(1,(progress-legStart)/(leg.length||1));
    let yaw=leg.heading;
    if(legIndex===0&&plan.initialHeading!==undefined){
      yaw=plan.initialHeading+angleBetween(plan.initialHeading,yaw)*smooth(Math.min(1,progress/TURN_LENGTH));
    }
    // Sweep the visual turn through the waypoint, keeping the translation on
    // its checked segments. The last stretch of the approach faces the rider.
    const next=legs[legIndex+1];
    if(next){
      const turn=smooth(Math.max(0,1-(1-t)*leg.length/Math.min(TURN_LENGTH,leg.length)));
      yaw+=angleBetween(yaw,next.heading)*turn;
    }
    done=progress>=length;
    horse.place(done?plan.end.x:leg.from.x+(leg.to.x-leg.from.x)*t,done?plan.end.z:leg.from.z+(leg.to.z-leg.from.z)*t,done?plan.heading:yaw);
    const fade=departing?(length-progress)/Math.min(3.3,length*.65):(progress-fadeStart)/fadeInDistance;
    show(smooth(Math.max(0,Math.min(1,fade))));
    if(done&&!departing)horse.play('Horse_Idle');
    return done;
  }};
}
