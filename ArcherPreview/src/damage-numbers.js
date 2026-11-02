import { Vector3 } from '@babylonjs/core';
export function createDamageNumbers(scene,host,{visibleAt=()=>true}={}){
  const records=[],pool=[],anchor=new Vector3();
  const release=record=>{record.element.remove();pool.push(record.element);};
  return {
    show(position,damage,heavy=false,kind='enemy',burstIndex=0,critical=false,owner=null){
      if(!visibleAt(position))return;
      if(records.length>=24)release(records.shift());
      const element=pool.pop()??document.createElement('span');element.className=`damage-number ${kind}${heavy?' heavy':''}${critical?' critical':''}`;
      element.style.left='0';element.style.top='0';
      element.style.transform='translate(-50%,-100%)';element.style.opacity='1';
      element.style.display='';element.textContent=critical?`Critical ${damage}`:String(damage);host.append(element);records.push({element,position:position.clone(),owner,brain:owner?.brain,age:0,offsetX:burstIndex?(burstIndex-2)*24:0});
    },
    update(dt,projection){
      if(!records.length)return;
      for(let i=records.length-1;i>=0;i--){
        const r=records[i];r.age+=dt;if(r.age>=1.1){release(r);records.splice(i,1);continue;}
        if(r.owner){
          if(!r.owner.active||r.owner.corpseGone||r.brain!==r.owner.brain){release(r);records.splice(i,1);continue;}
          r.position.copyFrom(r.owner.damageNumberPosition());
        }
        anchor.copyFrom(r.position);anchor.y+=r.age*.65;
        const p=projection.project(anchor);
        r.element.style.display=p.visible&&visibleAt(r.position)?'':'none';
        r.element.style.transform=`translate3d(${p.x+r.offsetX}px,${p.y}px,0) translate(-50%,-100%)`;
        r.element.style.opacity=String(Math.min(1,(1.1-r.age)/.4));
      }
    },
    inspect(){return {active:records.length,pooled:pool.length,created:records.length+pool.length};},
    dispose(){for(const r of records)r.element.remove();for(const element of pool)element.remove();records.length=pool.length=0;},
  };
}
