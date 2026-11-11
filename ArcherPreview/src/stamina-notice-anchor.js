// The warning is fixed at the center of the game viewport by CSS.
// Keep the existing lifecycle hooks, without projecting or following an actor.
export class StaminaNoticeAnchor{
  constructor(element){this.element=element;this.active=false;this.disposed=false;}
  setOffset(){return !this.disposed;}
  show(){if(this.disposed)return false;this.active=true;this.element.hidden=false;return true;}
  reset(){this.active=false;this.element.hidden=true;this.element.style.removeProperty('--stamina-notice-x');this.element.style.removeProperty('--stamina-notice-y');}
  update(_projection,_actor,{visible=true}={}){
    if(!this.active||this.disposed)return false;
    if(!this.element.classList.contains('stamina-notice')){this.active=false;return false;}
    if(!visible||this.element.hidden){this.reset();return false;}
    return true;
  }
  dispose(){if(this.disposed)return;this.reset();this.disposed=true;}
}
