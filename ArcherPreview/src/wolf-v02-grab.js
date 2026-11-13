import {WolfGrab} from './wolf-grab.js';
import {WOLF_CLIPS} from './wolf-spec.js';

export const WOLF_MAUL_NO_CONTACT_SECONDS=1.5;
export const WOLF_MAUL_ESCAPE_RECOVERY_SECONDS=.75;

// Capture follows the accelerated source action, not repeated pose-pass dt.
// The player keeps its real position and can escape until the authored bite.
export class WolfV02Grab extends WolfGrab{
  constructor(encounter,original){super(original.onControl,original.onImpact);this.encounter=encounter;this.maulHolding=false;this.contactPass=false;this.tapTimes=new Float64Array(5);this.maulHits=0;this.tapCount=0;}
  get active(){return super.active&&!this.contactPass;}
  get holding(){return this.maulHolding||super.holding;}
  get canEscape(){return this.maulHolding||this.active&&!this.impacted;}
  get escapePrompt(){return this.maulHolding?'회피를 눌러 탈출하세요':'';}
  get escapeProgress(){return this.maulHolding?Math.min(1,this.tapCount/5):0;}
  start(...args){const e=this.encounter;if(e.combat.grabOwner&&e.combat.grabOwner!==e||!(e.combat.canStartWolfRam?.(e,args[0])??true))return false;const started=super.start(...args);if(started)this.captureClock=e.brain.actionElapsed;return started;}
  startMaul(player){
    const e=this.encounter,b=e.brain;
    if(this.phase||e.combat.grabOwner||!(e.combat.canStartWolfRam?.(e,player)??true)||!e.v02Ram.authorized||!e.v02Ram.proneValid||!b.ramPawBraced||!e.playerAlive)return false;
    this.maulHolding=true;this.maulHits=0;this.tapCount=0;this.lastTapClock=-Infinity;this.escapeQueued=false;
    this.holdBrain=b;this.holdScene=e.world.scene;this.holdMap=e.world.mapId;this.lastMaulContactClock=b.combatClock;this.lastReleaseReason=null;b.ramMaulHold=true;
    if(super.start(player,e.playerNodes,b.serial))return true;
    this.maulHolding=false;b.ramMaulHold=false;return false;
  }
  releaseEscaped(reason='maul-escape'){const e=this.encounter,b=e.brain;e.combat.releaseWolfRam?.(e,WOLF_MAUL_ESCAPE_RECOVERY_SECONDS);this.lastReleaseReason=reason;this.reset();b.lastOutcome='miss';b.requestRetreat('escape');e.v02Ram.cancel(reason);}
  escape(){
    if(this.maulHolding){
      const now=this.encounter.brain.combatClock;if(now===this.lastTapClock)return false;this.lastTapClock=now;
      let count=0;for(let i=0;i<this.tapCount;i++)if(now-this.tapTimes[i]<=1.5)this.tapTimes[count++]=this.tapTimes[i];
      if(count<5)this.tapTimes[count++]=now;this.tapCount=count;
      if(count>=5)this.escapeQueued=true;
      if(this.escapeQueued&&this.maulHits>=2){this.releaseEscaped();return true;}return false;
    }
    const escaped=super.escape();if(escaped){this.encounter.brain.lastOutcome='miss';this.encounter.brain.requestRetreat('escape');}return escaped;
  }
  noteMaulHit(){if(!this.maulHolding)return;this.lastMaulContactClock=this.encounter.brain.combatClock;this.maulHits++;if(!this.encounter.playerAlive)this.reset();else if(this.maulHits>=2&&this.escapeQueued)this.releaseEscaped();}
  reset(){
    if(!this.phase)return;
    const e=this.encounter,owned=e.combat.grabOwner===e,orphan=!e.combat.grabOwner;
    if(this.holdBrain)this.holdBrain.ramMaulHold=false;
    this.phase=null;this.player=null;this.maulHolding=false;this.tapCount=0;this.escapeQueued=false;this.holdBrain=null;this.holdScene=null;this.holdMap=null;
    if(e.brain)e.brain.ramMaulHold=false;e.combat.releaseWolfRam?.(e);
    // A stale attack may clean its own state, never another owner's control.
    if(owned||orphan)this.onControl(false);
  }
  update(dt,{interrupted,state,serial,clipTime}){
    if(this.maulHolding){const e=this.encounter,b=e.brain;if(interrupted||!e.active||!e.playerAlive||serial!==this.serial||b!==this.holdBrain||this.player!==e.player||this.holdScene!==e.world.scene||this.holdMap!==e.world.mapId||e.combat.grabOwner!==e||b.mode!=='attack'||!b.action?.momentumRam)this.reset();else if(b.combatClock-this.lastMaulContactClock>=WOLF_MAUL_NO_CONTACT_SECONDS)this.releaseEscaped('maul-contact-lost');return;}
    if(!this.active)return;
    const brain=this.encounter.brain;
    if(interrupted||serial!==this.serial||state!==WOLF_CLIPS.pin){this.reset();return;}
    this.time=Math.max(this.time,(brain.actionElapsed-this.captureClock)/Math.max(.5,brain.castSpeed??1));
    if(!this.impacted&&clipTime>=1.85){this.impacted=true;this.onImpact();}
    if(this.active&&clipTime>=3.35)this.reset();
  }
}
