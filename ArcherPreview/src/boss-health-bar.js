import { Matrix, Vector3 } from '@babylonjs/core';
import {primaryHealthBoss} from './combat-readability.js';

// CSS coordinates, independent of render resolution / device pixel ratio.
export function projectBossHealth(scene,position,width,height){
  const engine=scene.getEngine(),renderWidth=engine.getRenderWidth(),renderHeight=engine.getRenderHeight();
  const p=Vector3.Project(position,Matrix.Identity(),scene.getTransformMatrix(),scene.activeCamera.viewport.toGlobal(renderWidth,renderHeight));
  return {x:p.x*width/renderWidth,y:p.y*height/renderHeight,visible:p.z>=0&&p.z<=1&&p.x>=0&&p.x<=renderWidth&&p.y>=0&&p.y<=renderHeight};
}

export function updateBossHealthPosition(scene,encounter,element,projection,{fixed=false}={}){
  if(!encounter?.active||encounter.corpseGone||encounter.renderVisible===false||encounter.fogVisible===false){element.hidden=true;return;}
  if(element.dataset)element.dataset.hud=fixed?'fixed':'world';
  if(fixed){element.hidden=false;element.style.left='';element.style.top='';element.style.transform='translateX(-50%)';return;}
  element.style.left='0';element.style.top='0';
  const canvas=projection?null:scene.getEngine().getRenderingCanvas();
  const position=encounter.healthBarPosition?.()??encounter.actor.position;
  const p=projection?projection.project(position):projectBossHealth(scene,position,canvas.clientWidth,canvas.clientHeight);
  element.hidden=!p.visible;
  const transform=`translate3d(${p.x}px,${p.y+8}px,0) translateX(-50%)`;
  if(element.style.transform!==transform)element.style.transform=transform;
}

export class BossHealthBars {
  constructor(template) { this.template = template; this.items = new Map(); }
  update(scene, encounters, projection, {playerPosition}={}) {
    const primary=primaryHealthBoss(encounters,playerPosition??scene.activeCamera?.target,this.primaryId);this.primaryId=primary?.id;
    const visible = new Set();
    for (const boss of encounters) {
      if (!boss.active||boss.corpseGone) continue;
      visible.add(boss.id);
      let item = this.items.get(boss.id);
      if (!item) {
        const element = boss.id === 1 ? this.template : this.template.cloneNode(true);
        if (boss.id !== 1) {
          element.id = `boss-hud-${boss.id}`;
          for (const child of element.querySelectorAll('[id]')) child.id += `-${boss.id}`;
          this.template.parentElement.append(element);
        }
        element.style.left='0';element.style.top='0';
        element.dataset.bossId = String(boss.id);
        element.dataset.kind = boss.regularWolfId?'monster':boss.kind;
        element.setAttribute('aria-label', `${boss.displayName??(boss.kind==='goblin'?'고블린':'곰 보스')} ${boss.number??boss.id} 체력`);
        item = { element, progress: element.querySelector('progress'), state: element.querySelector('.sr-only'), text: element.querySelector('span:last-child') };
        item.progress.setAttribute('aria-label', boss.regularWolfId?'일반 몬스터 체력':boss.kind === 'goblin' ? '고블린 체력' : '보스 체력');
        this.items.set(boss.id, item);
      }
      const snapshot = `${boss.brain.hp}:${boss.brain.maxHp}:${boss.brain.label}:${boss.brain.mode}:${boss.brain.stagger > 0}:${encounters.length}`;
      if (item.snapshot !== snapshot) {
        item.snapshot = snapshot;
        item.progress.max = boss.brain.maxHp; item.progress.value = boss.brain.hp;
        item.text.textContent = `${boss.displayName?boss.displayName+' · ':encounters.length > 1 && boss.kind !== 'goblin' ? `곰 ${boss.number??boss.id} · ` : ''}${boss.brain.hp<=0?(boss.kind==='elena'&&boss.phase===1?'광폭화 · ':'격파 · '):''}${boss.brain.hp} / ${boss.brain.maxHp}`;
        item.state.textContent = boss.brain.label;
        item.element.dataset.state = boss.brain.stagger > 0 ? 'stagger' : boss.brain.mode;
      }
      updateBossHealthPosition(scene, boss, item.element, projection,{fixed:boss===primary});
    }
    for (const [id, item] of this.items) if (!visible.has(id)) {
      item.element.hidden = true;
      if(!encounters.some(boss=>boss.id===id)){if(item.element!==this.template)item.element.remove();this.items.delete(id);}
    }
    if (!visible.size) this.template.hidden = true;
  }
}
