import { Vector3 } from '@babylonjs/core';
// 0.3 spread: a hit on the same target within this many seconds of another one steps aside.
export const SPREAD_RECENT=.45;
// keepOut (0.3, v03/damage-keep-out.js): moves a number's screen spot {x,y} out of the HUD
// corners. Without it (0.2) numbers sit where their target is, as before.
// spread (0.3): a burst's numbers sit one number-width apart (ch = a digit of the number's own font, so
// no layout read), and a quick follow-up hit on the same target steps aside instead of landing on the
// number still rising. Off (0.2) keeps the old 24px burst offsets.
export function createDamageNumbers(scene,host,{visibleAt=()=>true,keepOut=null,spread=false}={}){
  const records=[],pool=[],anchor=new Vector3(),spot={x:0,y:0};
  const release=record=>{record.element.remove();pool.push(record.element);};
  return {
    show(position,damage,heavy=false,kind='enemy',burstIndex=0,critical=false,owner=null){
      if(!visibleAt(position))return;
      if(records.length>=24)release(records.shift());
      const element=pool.pop()??document.createElement('span');element.className=`damage-number ${kind}${heavy?' heavy':''}${critical?' critical':''}`;
      element.style.left='0';element.style.top='0';
      element.style.transform='translate(-50%,-100%)';element.style.opacity='1';
      element.style.display='';const text=critical?`Critical ${damage}`:String(damage);element.textContent=text;host.append(element);
      let offsetX=burstIndex?(burstIndex-2)*24:0,shift='';
      if(spread){
        let lane=0;offsetX=0;
        if(burstIndex)lane=burstIndex-2;
        else if(owner){let recent=0;for(let i=0;i<records.length;i++)if(records[i].owner===owner&&records[i].age<SPREAD_RECENT)recent++;lane=recent?(recent%2?1:-1)*Math.ceil(recent/2):0;}
        if(lane)shift=` translateX(${(lane*(text.length+.6)).toFixed(1)}ch)`;
      }
      records.push({element,position:position.clone(),owner,brain:owner?.brain,age:0,offsetX,shift});
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
        spot.x=p.x;spot.y=p.y;if(keepOut)keepOut.place(spot);
        r.element.style.transform=`translate3d(${spot.x+r.offsetX}px,${spot.y}px,0) translate(-50%,-100%)${r.shift}`;
        r.element.style.opacity=String(Math.min(1,(1.1-r.age)/.4));
      }
    },
    inspect(){return {active:records.length,pooled:pool.length,created:records.length+pool.length};},
    dispose(){for(const r of records)r.element.remove();for(const element of pool)element.remove();records.length=pool.length=0;},
  };
}
