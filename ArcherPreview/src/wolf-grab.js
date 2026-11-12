// The authored preview's proxy coordinates never move the real player. A
// successful paw contact briefly locks input; shared escape/reset owns release.
export class WolfGrab{
 constructor(onControl,onImpact){this.onControl=onControl;this.onImpact=onImpact;this.phase=null;}
 get active(){return this.phase!==null;}get holding(){return this.active;}get canEscape(){return this.active&&this.time<=1;}get label(){return this.active?'늑대 제압 · 회피로 탈출':'';}
 start(player,nodes,serial){if(this.active)return false;this.player=player;this.serial=serial;this.phase='holding';this.time=0;this.impacted=false;this.onControl(true);return true;}
 update(dt,{interrupted,state,serial,clipTime}){if(!this.active)return;this.time+=Math.max(0,dt);if(interrupted||serial!==this.serial||state!=='Pin_Throat_Bite_R5'){this.reset();return;}if(!this.impacted&&clipTime>=1.85){this.impacted=true;this.onImpact();}if(clipTime>=3.35)this.reset();}
 escape(){if(!this.canEscape)return false;this.reset();return true;}
 reset(){if(!this.active)return;this.phase=null;this.player=null;this.onControl(false);}
}
