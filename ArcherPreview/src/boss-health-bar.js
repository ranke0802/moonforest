import { Matrix, Vector3 } from '@babylonjs/core';
import {primaryHealthBoss,encounterInCombat} from './combat-readability.js';
import {tr} from './v03/i18n.js';

// CSS coordinates, independent of render resolution / device pixel ratio.
export function projectBossHealth(scene,position,width,height){
  const engine=scene.getEngine(),renderWidth=engine.getRenderWidth(),renderHeight=engine.getRenderHeight();
  const p=Vector3.Project(position,Matrix.Identity(),scene.getTransformMatrix(),scene.activeCamera.viewport.toGlobal(renderWidth,renderHeight));
  return {x:p.x*width/renderWidth,y:p.y*height/renderHeight,visible:p.z>=0&&p.z<=1&&p.x>=0&&p.x<=renderWidth&&p.y>=0&&p.y<=renderHeight};
}

const PAWS=['fore.L.paw','fore.R.paw','hind.L.paw','hind.R.paw'];
const FEET=['Foot.L','Foot.R'];
const CHAPTER_GOBLIN_FEET=[...FEET,'Toe.L','Toe.R'];
const MIXAMO_FEET=['mixamorig:LeftFoot','mixamorig:RightFoot'];
const GOBLIN_FEET=[...MIXAMO_FEET,'mixamorig:LeftToeBase','mixamorig:RightToeBase','mixamorig:LeftToe_End','mixamorig:RightToe_End'];

function footJoints(encounter){
  if(encounter.model?.soleVertices)return CHAPTER_GOBLIN_FEET;
  if(encounter.nodes[PAWS[0]])return PAWS;
  if(encounter.nodes[FEET[0]])return FEET;
  return encounter.kind==='goblin'?GOBLIN_FEET:MIXAMO_FEET;
}

export function updateBossHealthPosition(scene,encounter,element,projection,{fixed=false,underFeet=false}={}){
  if(!encounter?.active||encounter.corpseGone||!encounterInCombat(encounter)||encounter.renderVisible===false||encounter.fogVisible===false){element.hidden=true;return;}
  if(element.dataset)element.dataset.hud=fixed?'fixed':'world';
  if(fixed){element.hidden=false;element.style.left='';element.style.top='';element.style.transform='translateX(-50%)';return;}
  element.style.left='0';element.style.top='0';
  const engine=projection?null:scene.getEngine(),canvas=engine?.getRenderingCanvas();
  const width=canvas?.clientWidth??engine?.getRenderWidth(),height=canvas?.clientHeight??engine?.getRenderHeight();
  const position=underFeet?encounter.actor.position:(encounter.healthBarPosition?.()??encounter.actor.position);
  const p=projection?projection.project(position):projectBossHealth(scene,position,width,height);
  let {x,y,visible}=p;
  // Prefer the skinned soles when available; other rigs use their rendered joints.
  if(underFeet&&encounter.nodes){
    const nodes=encounter.nodes,surface=encounter.healthFootprint?.();
    const feet=surface??footJoints(encounter);
    let left=Infinity,right=-Infinity,bottom=-Infinity;
    for(const foot of feet){
      const sole=surface?foot:nodes[foot]?.getAbsolutePosition();if(!sole)continue;
      const point=projection?projection.project(sole):projectBossHealth(scene,sole,width,height);
      if(!point.visible)continue;
      left=Math.min(left,point.x);right=Math.max(right,point.x);bottom=Math.max(bottom,point.y);
    }
    if(right>=left){x=(left+right)/2;y=bottom;visible=true;}
  }
  element.hidden=!visible;
  if(!visible)return;
  const transform=underFeet
    ?`translate3d(${x}px,${y+4}px,0) translateX(-50%) scale(var(--v03-ui,1))`
    :`translate3d(${x}px,${y+8}px,0) translateX(-50%)`;
  if(element.style.transform!==transform)element.style.transform=transform;
}

export class BossHealthBars {
  // showNumbers:false (0.3) hides the "hp / max" figures; the bar alone shows health.
  constructor(template,{showNumbers=true,underFeet=false}={}) { this.template = template; this.items = new Map(); this.showNumbers = showNumbers; this.underFeet=underFeet; }
  update(scene, encounters, projection, {playerPosition}={}) {
    const primary=primaryHealthBoss(encounters,playerPosition??scene.activeCamera?.target,this.primaryId);this.primaryId=primary?.id;
    const visible = new Set();
    for (const boss of encounters) {
      if (!boss.active||boss.corpseGone||!encounterInCombat(boss)) continue;
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
        const minor=boss.regularWolfId||(this.underFeet&&boss.minorEnemy&&boss.kind.startsWith('goblin-'));
        element.dataset.kind = minor?'monster':boss.kind;
        element.setAttribute('aria-label', `${tr(boss.displayName??(boss.kind==='goblin'?'고블린':'곰 보스'))} ${boss.number??boss.id} ${tr('체력')}`);
        item = { element, progress: element.querySelector('progress'), state: element.querySelector('.sr-only'), text: element.querySelector('span:last-child') };
        item.progress.setAttribute('aria-label', tr(minor?'일반 몬스터 체력':boss.kind === 'goblin' ? '고블린 체력' : '보스 체력'));
        this.items.set(boss.id, item);
      }
      const snapshot = `${boss.brain.hp}:${boss.brain.maxHp}:${boss.brain.label}:${boss.brain.mode}:${boss.brain.stagger > 0}:${encounters.length}`;
      if (item.snapshot !== snapshot) {
        item.snapshot = snapshot;
        item.progress.max = boss.brain.maxHp; item.progress.value = boss.brain.hp;
        item.text.textContent = `${boss.displayName?tr(boss.displayName)+' · ':encounters.length > 1 && boss.kind !== 'goblin' ? `${tr('곰')} ${boss.number??boss.id} · ` : ''}${boss.brain.hp<=0?tr(boss.kind==='elena'&&boss.phase===1?'광폭화':'격파')+' · ':''}${this.showNumbers?`${boss.brain.hp} / ${boss.brain.maxHp}`:''}`.replace(/ · $/,'');
        item.state.textContent = boss.brain.label;
        item.element.dataset.state = boss.brain.stagger > 0 ? 'stagger' : boss.brain.mode;
      }
      this.decorate?.(item.element,boss);
      updateBossHealthPosition(scene, boss, item.element, projection,{fixed:boss===primary,underFeet:this.underFeet});
    }
    for (const [id, item] of this.items) if (!visible.has(id)) {
      item.element.hidden = true;
      if(!encounters.some(boss=>boss.id===id)){if(item.element!==this.template)item.element.remove();this.items.delete(id);}
    }
    if (!visible.size) this.template.hidden = true;
  }
}
