import { Vector3 } from '@babylonjs/core';
import {damageScreenSlot} from './combat-readability.js';
export function createDamageNumbers(scene,host,{visibleAt=()=>true}={}){
  const records=[],pool=[],placed=[],anchor=new Vector3(),viewport={},candidate={};
  const release=record=>{record.element.remove();pool.push(record.element);};
  return {
    show(position,damage,heavy=false,kind='enemy',burstIndex=0,critical=false){
      if(!visibleAt(position))return;
      if(records.length>=24)release(records.shift());
      const element=pool.pop()??document.createElement('span');element.className=`damage-number ${kind}${heavy?' heavy':''}${critical?' critical':''}`;
      element.style.left='0';element.style.top='0';
      element.style.display='';element.textContent=critical?`치명타 ${damage}`:String(damage);host.append(element);records.push({element,position:position.clone(),age:0,lane:0});
    },
    update(dt,projection){
      if(!records.length)return;
      placed.length=0;
      viewport.width=projection.cssWidth;viewport.height=projection.cssHeight;viewport.safeInsets=projection.safeInsets;
      for(let i=records.length-1;i>=0;i--){
        const r=records[i];r.age+=dt;if(r.age>=1.1){release(r);records.splice(i,1);continue;}
        anchor.copyFrom(r.position);anchor.y+=r.age*.65;
        const p=projection.project(anchor);
        let slot=null;
        if(p.visible&&visibleAt(r.position))for(let attempt=-1;attempt<24;attempt++){
          const lane=attempt<0?r.lane:attempt;if(attempt===r.lane)continue;
          const next=damageScreenSlot(p,lane,viewport,candidate);if(!next.visible)continue;
          const left=next.x-56,right=next.x+56,top=next.y-20,bottom=next.y;
          let collision=false;for(const box of placed)if(left<box.right&&right>box.left&&top<box.bottom&&bottom>box.top){collision=true;break;}if(collision)continue;
          r.left=left;r.right=right;r.top=top;r.bottom=bottom;r.lane=lane;placed.push(r);slot=next;break;
        }
        r.element.style.display=slot?'':'none';if(!slot)continue;
        r.element.style.transform=`translate3d(${slot.x}px,${slot.y}px,0) translate(-50%,-100%)`;
        r.element.style.opacity=String(Math.min(1,(1.1-r.age)/.4));
      }
    },
    inspect(){return {active:records.length,pooled:pool.length,created:records.length+pool.length};},
    dispose(){for(const r of records)r.element.remove();for(const element of pool)element.remove();records.length=pool.length=0;},
  };
}
