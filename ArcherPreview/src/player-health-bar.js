import { Vector3 } from '@babylonjs/core';
import { projectBossHealth } from './boss-health-bar.js';

export class PlayerHealthBar {
  constructor(label) {
    this.element = document.createElement('section');
    this.element.id = 'player-hud';
    this.element.className = 'player-hud';
    this.element.setAttribute('aria-label', '플레이어 체력');
    this.element.hidden = true;
    this.progress = document.createElement('progress');
    this.progress.setAttribute('aria-label', '플레이어 HP');
    this.label = label;
    this.element.append(this.progress, label);
    document.querySelector('#app').append(this.element);
    this.anchor = new Vector3();
  }
  update(scene, { visible, actor, head, hp, maxHp }) {
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
    // Follow the animated head, including jumps, recoil and knockdowns.
    this.anchor.copyFrom(head ? head.getAbsolutePosition() : actor.position);
    this.anchor.y += head ? .32 : 2;
    const canvas = scene.getEngine().getRenderingCanvas();
    const p = projectBossHealth(scene, this.anchor, canvas.clientWidth, canvas.clientHeight);
    this.element.hidden = !p.visible;
    const transform = `translate3d(${p.x}px,${p.y}px,0) translate(-50%,-100%)`;
    if (this.element.style.transform !== transform) this.element.style.transform = transform;
  }
}
