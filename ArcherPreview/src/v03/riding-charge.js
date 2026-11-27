import {applyHitFlash} from '../hit-feedback.js';

// Mounted charge ("쾌속 질주 · 들이받기", 2026-11-27 user review): while the
// gallop runs, foes in front of the horse take 30-50 damage once per gallop and
// are thrown along the horse's path. Boss-class foes (bear, alpha wolf, Elena)
// take the damage with a short flinch only; their brain state is not changed,
// so their attack patterns continue. Damage, numbers, hit sounds, defeat,
// rewards and quest counts go through the encounter's own callbacks, the same
// ones a sword hit uses. The weapon is not worn (no onBladeContact).
export const RAM_DAMAGE=Object.freeze({min:30,max:50});
// Horse-local metres (nose toward +Z): the chest reaches about 1.3 m ahead of
// the saddle; the zone reaches past it so a foe is met before the legs pass it.
export const RAM_ZONE=Object.freeze({back:.25,front:1.75,halfWidth:.55});
export const RAM_PUSH=Object.freeze({regular:11,boss:1.6,side:.55});

export function ramDamage(random=Math.random){
  const span=RAM_DAMAGE.max-RAM_DAMAGE.min+1;
  const roll=Math.floor(Math.max(0,Math.min(.999999,Number(random())||0))*span);
  return RAM_DAMAGE.min+roll;
}
export function isRamBoss(encounter){
  const kind=encounter?.kind;
  return kind==='bear'||kind==='elena'||(kind==='wolf'&&!encounter.summonKind);
}

// One ram per mount. `begin()` starts a new gallop; the hit list is a WeakSet so a
// departed map's foes are never retained by the scene-lifetime rider.
export function createRidingRam({random=Math.random}={}){
  let struck=new WeakSet(),serial=0;
  function eligible(e){
    return !!e&&e.active&&!e.corpseGone&&!e._far&&!e.storyNpcId&&e.brain&&e.brain.hp>0&&!e.grab?.active&&e.actor?.position;
  }
  function apply(e,player,fx,fz,damage){
    const boss=isRamBoss(e),brain=e.brain;
    // Regular foes: a heavy hit through their own brain (down / stagger rules of
    // the ordinary heavy strike). Bosses: damage only, no interrupt or stagger.
    const hit=boss?{id:'horse-ram',damage,heavy:false,stun:0,interruptsBoss:false}
      :{id:'horse-ram',damage,heavy:true,stun:0,interruptsBoss:true,ignoreDefense:true};
    if(!brain.hit(hit))return false;
    const p=e.actor.position,dx=p.x-player.x,dz=p.z-player.z;
    // Thrown along the path and away from the horse's centre line.
    const side=(dx*fz-dz*fx)>=0?1:-1;
    let ax=fx+side*fz*RAM_PUSH.side,az=fz-side*fx*RAM_PUSH.side;
    const length=Math.hypot(ax,az)||1;ax/=length;az/=length;
    const alive=brain.hp>0;
    if(boss){
      // A short flinch: a small slide when the boss is not mid-attack, and the
      // animator's own hit reaction. No brain stagger, so no pattern break.
      if(alive&&brain.mode!=='attack'&&!brain.unflinching)e.knockVelocity?.set(ax*RAM_PUSH.boss,0,az*RAM_PUSH.boss);
      if(alive)e.animator?.reactToHit?.();
    }else{
      e.knockVelocity?.set(ax*RAM_PUSH.regular,0,az*RAM_PUSH.regular);
      if(brain.mode==='down'){
        // Authored knockdown clips fall toward local -Z: face the horse.
        const target=Math.atan2(-ax,-az),start=e.actor.rotation?.y??0;
        e.knockTurn={start,delta:Math.atan2(Math.sin(target-start),Math.cos(target-start)),elapsed:0};
      }
      if(alive)e.animator?.reactToKnockback?.();
      e.heavyCount=(e.heavyCount??0)+1;
    }
    e.hitCount=(e.hitCount??0)+1;
    applyHitFlash(e.asset?.meshes,brain.flash,brain.flashDuration);
    e.lastHit=boss?'말 들이받기 · 보스 경직 없음':'말 들이받기 · 넉백';
    const at=e.damageNumberPosition?.()??p;
    e.onDamage?.(at,damage,true,'enemy',0,false,e);
    e.onChange?.(e);
    return true;
  }
  return {
    begin(){struck=new WeakSet();serial++;},
    get serial(){return serial;},
    // player: the horse/rider ground position {x,z}; (fx,fz): unit heading.
    // Returns the struck encounters' count and writes their positions to `out`.
    sweep(encounters,player,fx,fz,out){
      let count=0;
      if(!encounters)return 0;
      for(let i=0;i<encounters.length;i++){
        const e=encounters[i];
        if(struck.has(e)||!eligible(e))continue;
        const p=e.actor.position,dx=p.x-player.x,dz=p.z-player.z;
        const ahead=dx*fx+dz*fz,across=Math.abs(dx*fz-dz*fx),r=Number.isFinite(e.radius)?e.radius:.5;
        if(ahead<RAM_ZONE.back-r||ahead>RAM_ZONE.front+r||across>RAM_ZONE.halfWidth+r)continue;
        struck.add(e);
        if(!apply(e,player,fx,fz,ramDamage(random)))continue;
        if(out&&count<out.length){out[count].x=p.x;out[count].z=p.z;out[count].boss=isRamBoss(e);}
        count++;
      }
      return count;
    },
  };
}
