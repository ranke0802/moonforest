import { Matrix, Vector3 } from '@babylonjs/core';
export function createDamageNumbers(scene,host){
  const records=[];
  return {
    show(position,damage,heavy=false,kind='enemy',burstIndex=0,critical=false){
      const element=document.createElement('span');element.className=`damage-number ${kind}${heavy?' heavy':''}${critical?' critical':''}`;
      element.textContent=critical?`Critical ${damage}`:String(damage);host.append(element);records.push({element,position:position.clone(),age:0,offsetX:burstIndex?(burstIndex-2)*24:0});
      if(records.length>24)records.shift().element.remove();
    },
    update(dt){
      const engine=scene.getEngine(),width=engine.getRenderWidth(),height=engine.getRenderHeight(),canvas=engine.getRenderingCanvas();
      const viewport=scene.activeCamera.viewport.toGlobal(width,height);
      for(let i=records.length-1;i>=0;i--){
        const r=records[i];r.age+=dt;if(r.age>=1.1){r.element.remove();records.splice(i,1);continue;}
        const p=Vector3.Project(r.position.add(new Vector3(0,r.age*.65,0)),Matrix.Identity(),scene.getTransformMatrix(),viewport);
        r.element.style.display=p.z<0||p.z>1?'none':'';
        r.element.style.left=`${p.x*canvas.clientWidth/width+r.offsetX}px`;r.element.style.top=`${p.y*canvas.clientHeight/height}px`;
        r.element.style.opacity=String(Math.min(1,(1.1-r.age)/.4));
      }
    },
  };
}
