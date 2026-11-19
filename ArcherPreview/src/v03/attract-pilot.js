// Title-screen autopilot. It drives the real player controller through the
// same movement vector and action calls as the input device: no scripted
// animation, no special combat path. One reusable movement object, no
// per-frame allocation.
// HIT: swing only this close (edge to edge) so the blows land; farther in the
// ring it circles, then steps in. Fewer swings at air (user, 2026-11-19).
const ENGAGE=3.1,TOO_CLOSE=.45,THREAT=5.2,HIT=1.15;
export function createAttractPilot({random=Math.random}={}){
 const movement={x:0,y:0,run:false};
 let attackWait=.9,commit=0,defendWait=0,escapeWait=0,strafe=1,strafeWait=1.8,moving=false,combo=0;
 function steer(wx,wz,alpha){
  // Inverse of main.js: world = forward*y + right*x, forward=(-cos a,-sin a), right=(sin a,-cos a).
  const cos=Math.cos(alpha),sin=Math.sin(alpha);
  movement.y=-(wx*cos+wz*sin);movement.x=wx*sin-wz*cos;
 }
 function stop(){movement.x=0;movement.y=0;movement.run=false;}
 return {
  movement,
  reset(){stop();attackWait=.9;commit=0;defendWait=0;escapeWait=0;strafeWait=1.8;moving=false;combo=0;},
  // player/target: {x,z}. Returns nothing; issues actions as side effects.
  update(dt,{player,target,targetRadius=1,targetAttacking=false,cameraAlpha=0,captured=false,busy=false,actions}){
   dt=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
   attackWait-=dt;commit-=dt;defendWait-=dt;escapeWait-=dt;strafeWait-=dt;
   if(captured){stop();moving=false;if(escapeWait<=0){escapeWait=.16;actions.dodge();}return;}
   if(!target||!player){stop();moving=false;return;}
   const dx=target.x-player.x,dz=target.z-player.z,gap=Math.hypot(dx,dz)||1e-6,nx=dx/gap,nz=dz/gap,reach=gap-targetRadius;
   if(strafeWait<=0){strafe=random()<.5?-1:1;strafeWait=1.4+random()*1.8;}
   // Read the enemy first: sidestep or shield-push as its attack begins.
   if(targetAttacking&&reach<THREAT&&defendWait<=0&&!busy){
    defendWait=1.15+random()*.5;commit=0;
    if(random()<.68){steer(-nz*strafe,nx*strafe,cameraAlpha);actions.dodge();}
    else{stop();actions.guard();}
    return;
   }
   if(commit>0){stop();moving=false;return;}
   if(reach>ENGAGE){steer(nx,nz,cameraAlpha);movement.run=reach>9;}
   else if(reach<TOO_CLOSE&&!targetAttacking){steer(-nx*.7-nz*strafe*.5,-nz*.7+nx*strafe*.5,cameraAlpha);movement.run=false;}
   else{
    movement.run=false;
    if(attackWait<=0&&!busy&&reach<=HIT){
     // Stand still for the swing so the game's own melee aim faces the target.
     stop();combo=(combo+1)%3;commit=.42;attackWait=combo===0?1.1+random()*.7:.38+random()*.2;actions.attack();
    }else if(attackWait<=0&&!busy){steer(nx,nz,cameraAlpha);combo=0;}// ready: close in, then swing
    else steer(-nz*strafe*.8+nx*.25,nx*strafe*.8+nz*.25,cameraAlpha);
   }
   const now=movement.x!==0||movement.y!==0;
   if(now&&!moving)actions.move();
   moving=now;
  },
 };
}
