import {applyHitFlash} from './hit-feedback.js';

export const STAMINA_NOTICE_COOLDOWN_MS=650;
export const STAMINA_FLASH_SECONDS=.2;

// This visual timer is separate from hit stun, recoil, damage and invulnerability.
export class StaminaFailureFeedback {
 constructor({now=()=>performance.now()}={}){this.now=now;this.controller=null;this.serial=0;this.lastNotice=-Infinity;this.remaining=0;}
 reset(controller=null){this.controller=controller;this.serial=controller?.staminaRejectSerial??0;this.lastNotice=-Infinity;this.remaining=0;}
 observe(controller){
  if(controller!==this.controller){this.controller=controller;this.serial=0;this.lastNotice=-Infinity;this.remaining=0;}
  const serial=controller?.staminaRejectSerial??0;
  if(serial===this.serial)return false;
  this.serial=serial;if(serial<=0)return false;
  const now=this.now();if(now-this.lastNotice<STAMINA_NOTICE_COOLDOWN_MS)return false;
  this.lastNotice=now;this.remaining=STAMINA_FLASH_SECONDS;return true;
 }
 advance(dt){this.remaining=Math.max(0,this.remaining-(Number.isFinite(dt)?Math.max(0,dt):0));}
}

export function applyPlayerFlash(meshes,reaction,feedback){
 const hitRemaining=reaction?.flashRemaining??0,hitDuration=reaction?.flashDuration??.2;
 if(!feedback?.remaining){applyHitFlash(meshes,hitRemaining,hitDuration);return;}
 const hit=hitDuration>0?Math.max(0,Math.min(1,hitRemaining/hitDuration)):0;
 applyHitFlash(meshes,Math.max(hit,feedback.remaining/STAMINA_FLASH_SECONDS),1);
}
