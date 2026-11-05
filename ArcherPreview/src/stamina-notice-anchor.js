import {Vector3} from '@babylonjs/core';
import {playerDimensions} from './player-dimensions.js';

// The existing projected-HUD frame owns updates. This helper owns no clock,
// input listeners, DOM measurements, animation frame or warning cooldown.
export class StaminaNoticeAnchor{
  constructor(element,{gap=12}={}){
    this.element=element;this.gap=gap;this.point=new Vector3();
    this.offsetX=0;this.offsetY=0;this.active=false;this.pending=false;this.disposed=false;
    this.lastX=null;this.lastY=null;
  }
  setOffset(x=0,y=0){
    if(!Number.isFinite(x)||!Number.isFinite(y)){this.reset();return false;}
    this.offsetX=x;this.offsetY=y;return true;
  }
  show(){
    if(this.disposed)return false;
    this.clearPosition();this.active=true;this.pending=true;this.element.hidden=true;
    return true;
  }
  clearPosition(){
    this.element.style.removeProperty('--stamina-notice-x');this.element.style.removeProperty('--stamina-notice-y');
    this.lastX=null;this.lastY=null;
  }
  reset(){
    this.active=false;this.pending=false;this.element.hidden=true;this.clearPosition();
  }
  update(projection,actor,{visible=true}={}){
    if(!this.active||this.disposed)return false;
    // Replacing the warning with an ordinary toast must not hide that new text.
    if(!this.element.classList.contains('stamina-notice')){this.active=false;this.pending=false;this.clearPosition();return false;}
    const p=actor?.position;
    if(!visible||!p||actor.isDisposed?.()||(!this.pending&&this.element.hidden)||
      ![p.x,p.y,p.z].every(Number.isFinite)||!projection?.transform||
      ![projection.cssWidth,projection.cssHeight,projection.scaleX,projection.scaleY].every(value=>Number.isFinite(value)&&value>0)){
      this.reset();return false;
    }
    // Upright hair-top height remains stable through running/rolling/jumping.
    // No animated head bone refresh is needed to center the notice on the actor.
    this.point.copyFrom(p);this.point.y+=playerDimensions(actor).height;
    const projected=projection.project(this.point),viewport=projection.viewport;
    const left=viewport?viewport.x*projection.scaleX:0,top=viewport?viewport.y*projection.scaleY:0;
    const right=viewport?(viewport.x+viewport.width)*projection.scaleX:projection.cssWidth;
    const bottom=viewport?(viewport.y+viewport.height)*projection.scaleY:projection.cssHeight;
    if(!projected.visible||!Number.isFinite(projected.x)||!Number.isFinite(projected.y)||projected.x<left||projected.x>right||projected.y<top||projected.y>bottom){
      this.reset();return false;
    }
    // project() already returns canvas-local CSS pixels, including the camera
    // viewport and render scale. Safe-area padding must not shift this center.
    const x=`${projected.x+this.offsetX}px`,y=`${projected.y+this.offsetY-this.gap}px`;
    if(x!==this.lastX){this.element.style.setProperty('--stamina-notice-x',x);this.lastX=x;}
    if(y!==this.lastY){this.element.style.setProperty('--stamina-notice-y',y);this.lastY=y;}
    this.element.hidden=false;this.pending=false;return true;
  }
  dispose(){if(this.disposed)return;this.reset();this.disposed=true;}
}
