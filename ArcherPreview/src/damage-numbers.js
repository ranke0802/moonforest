import { Vector3 } from '@babylonjs/core';
export function createDamageNumbers(scene,host){
  const records=[],anchor=new Vector3();
  return {
    show(position,damage,heavy=false,kind='enemy',burstIndex=0,critical=false){
      const element=document.createElement('span');element.className=`damage-number ${kind}${heavy?' heavy':''}${critical?' critical':''}`;
      element.style.left='0';element.style.top='0';
      element.textContent=critical?`Critical ${damage}`:String(damage);host.append(element);records.push({element,position:position.clone(),age:0,offsetX:burstIndex?(burstIndex-2)*24:0});
      if(records.length>24)records.shift().element.remove();
    },
    update(dt,projection){
      if(!records.length)return;
      for(let i=records.length-1;i>=0;i--){
        const r=records[i];r.age+=dt;if(r.age>=1.1){r.element.remove();records.splice(i,1);continue;}
        anchor.copyFrom(r.position);anchor.y+=r.age*.65;
        const p=projection.project(anchor);
        r.element.style.display=p.visible?'':'none';
        r.element.style.transform=`translate3d(${p.x+r.offsetX}px,${p.y}px,0) translate(-50%,-100%)`;
        r.element.style.opacity=String(Math.min(1,(1.1-r.age)/.4));
      }
    },
  };
}
