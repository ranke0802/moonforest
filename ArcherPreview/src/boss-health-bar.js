import { Matrix, Vector3 } from '@babylonjs/core';

// CSS coordinates, independent of render resolution / device pixel ratio.
export function projectBossHealth(scene,position,width,height){
  const engine=scene.getEngine(),renderWidth=engine.getRenderWidth(),renderHeight=engine.getRenderHeight();
  const p=Vector3.Project(position,Matrix.Identity(),scene.getTransformMatrix(),scene.activeCamera.viewport.toGlobal(renderWidth,renderHeight));
  return {x:p.x*width/renderWidth,y:p.y*height/renderHeight,visible:p.z>=0&&p.z<=1&&p.x>=0&&p.x<=renderWidth&&p.y>=0&&p.y<=renderHeight};
}

export function updateBossHealthPosition(scene,encounter,element){
  if(!encounter?.active){element.hidden=true;return;}
  const canvas=scene.getEngine().getRenderingCanvas();
  const p=projectBossHealth(scene,encounter.actor.position,canvas.clientWidth,canvas.clientHeight);
  element.hidden=!p.visible;
  element.style.left='0';element.style.top='0';
  const transform=`translate3d(${p.x}px,${p.y+8}px,0) translateX(-50%)`;
  if(element.style.transform!==transform)element.style.transform=transform;
}

export class BossHealthBars {
  constructor(template) { this.template = template; this.items = new Map(); }
  update(scene, encounters) {
    const visible = new Set();
    for (const boss of encounters) {
      if (!boss.active) continue;
      visible.add(boss.id);
      let item = this.items.get(boss.id);
      if (!item) {
        const element = boss.id === 1 ? this.template : this.template.cloneNode(true);
        if (boss.id !== 1) {
          element.id = `boss-hud-${boss.id}`;
          for (const child of element.querySelectorAll('[id]')) child.id += `-${boss.id}`;
          this.template.parentElement.append(element);
        }
        element.dataset.bossId = String(boss.id);
        element.setAttribute('aria-label', `곰 보스 ${boss.id} 체력`);
        item = { element, progress: element.querySelector('progress'), state: element.querySelector('.sr-only'), text: element.querySelector('span:last-child') };
        this.items.set(boss.id, item);
      }
      const snapshot = `${boss.brain.hp}:${boss.brain.maxHp}:${boss.brain.label}:${boss.brain.mode}:${boss.brain.stagger > 0}:${encounters.length}`;
      if (item.snapshot !== snapshot) {
        item.snapshot = snapshot;
        item.progress.max = boss.brain.maxHp; item.progress.value = boss.brain.hp;
        item.text.textContent = `${encounters.length > 1 ? `곰 ${boss.id} · ` : ''}${boss.brain.hp} / ${boss.brain.maxHp}`;
        item.state.textContent = boss.brain.label;
        item.element.dataset.state = boss.brain.stagger > 0 ? 'stagger' : boss.brain.mode;
      }
      updateBossHealthPosition(scene, boss, item.element);
    }
    for (const [id, item] of this.items) if (!visible.has(id)) item.element.hidden = true;
    if (!visible.size) this.template.hidden = true;
  }
}
