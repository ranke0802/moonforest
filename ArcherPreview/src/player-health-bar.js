import { Vector3 } from '@babylonjs/core';
import { projectBossHealth } from './boss-health-bar.js';
import {markerScreenAngle} from './combat-readability.js';

export class PlayerHealthBar {
  constructor(label) {
    this.element = document.createElement('section');
    this.element.id = 'player-hud';
    this.element.className = 'player-hud';
    this.element.dataset.hud='fixed';
    this.element.setAttribute('aria-label', '플레이어 체력');
    this.element.hidden = true;
    this.progress = document.createElement('progress');
    this.progress.setAttribute('aria-label', '플레이어 HP');
    this.label = label;
    this.element.append(this.progress, label);
    document.querySelector('#app').append(this.element);
    this.anchor = new Vector3();
    this.foot=new Vector3();this.forward=new Vector3(0,0,1);this.direction=new Vector3();this.tip=new Vector3();
    this.marker=document.createElement('div');this.marker.className='player-ground-marker';this.marker.hidden=true;this.marker.setAttribute('aria-hidden','true');
    this.arrow=document.createElement('i');this.marker.append(this.arrow);this.element.parentElement.append(this.marker);
  }
  update(scene, { visible, actor, head, hp, maxHp, marker }, projection) {
    this.marker.hidden=true;
    if (!visible || !actor) { this.element.hidden = true; return; }
    const value = Math.max(0, Math.min(maxHp, hp));
    const snapshot = `${value}/${maxHp}`;
    if (snapshot !== this.snapshot) {
      this.snapshot = snapshot;
      this.progress.max = maxHp;
      this.progress.value = value;
      this.label.textContent = `HP ${value} / ${maxHp}`;
      this.element.dataset.low = String(value / maxHp <= .3);
    }
    this.element.hidden=false;
    // A marker is opt-in only with a positive structure line-of-sight check.
    // A missing callback/result never turns this into a through-wall locator.
    if(!marker?.enabled||marker.clearToPlayer!==true||value<=0)return;
    this.foot.copyFrom(actor.position);if(Number.isFinite(marker.groundY))this.foot.y=marker.groundY;this.foot.y+=.06;
    const canvas=projection?null:scene.getEngine().getRenderingCanvas(),project=point=>projection?projection.project(point):projectBossHealth(scene,point,canvas.clientWidth,canvas.clientHeight);
    const point=project(this.foot);if(!point.visible)return;const foot={x:point.x,y:point.y};
    actor.getDirectionToRef(this.forward,this.direction);this.direction.normalize();
    this.tip.copyFrom(this.foot).addInPlaceFromFloats(this.direction.x*.7,this.direction.y*.7,this.direction.z*.7);
    const tip=project(this.tip);if(!tip.visible)return;const angle=markerScreenAngle(foot,tip);if(angle===null)return;
    const transform=`translate3d(${foot.x}px,${foot.y}px,0) translate(-50%,-50%)`;
    if(this.marker.style.transform!==transform)this.marker.style.transform=transform;
    const rotate=`rotate(${angle}rad)`;if(this.arrow.style.transform!==rotate)this.arrow.style.transform=rotate;this.marker.hidden=false;
  }
  dispose(){this.marker.remove();this.element.remove();}
}
