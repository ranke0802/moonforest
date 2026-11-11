// Camera movement belongs only to an explicitly opened tool. Gameplay keybinds
// stay suspended; text fields and buttons never move the view.
export function createToolCameraInput(canvas){
 let camera;const keys=new Set(),listeners=[],doc=canvas.ownerDocument,win=doc.defaultView??globalThis.window,movement={x:0,y:0,z:0};
 const clearMovement=()=>{movement.x=movement.y=movement.z=0;};
 const allowed=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','ShiftLeft','ShiftRight']);
 const input={get camera(){return camera;},set camera(value){camera=value;},getClassName:()=> 'MoonforestToolKeyboardInput',getSimpleName:()=> 'moonforestToolKeyboard',
  setMovement(value){
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3||!['x','y','z'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key])&&Math.abs(value[key])<=1))return false;
   const length=Math.max(1,Math.hypot(value.x,value.y,value.z));movement.x=value.x/length;movement.y=value.y/length;movement.z=value.z/length;return true;
  },
  clearMovement,
  attachControl(){input.detachControl();const on=(target,type,listener)=>{target.addEventListener(type,listener);listeners.push({target,type,listener});};
   on(win,'keydown',event=>{if(doc.activeElement!==canvas||!allowed.has(event.code))return;event.preventDefault();keys.add(event.code);});
   on(win,'keyup',event=>keys.delete(event.code));on(win,'blur',()=>{keys.clear();clearMovement();});on(doc,'visibilitychange',()=>{keys.clear();clearMovement();});
  },
  detachControl(){for(const {target,type,listener}of listeners)target.removeEventListener(type,listener);listeners.length=0;keys.clear();clearMovement();},
  checkInputs(){
   if(!camera){keys.clear();clearMovement();return;}
   if(doc.activeElement!==canvas)keys.clear();
   const dt=Math.min(.05,Math.max(0,camera.getEngine().getDeltaTime()/1000)),speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?18:6)*dt;
   if(!dt||(!keys.size&&!movement.x&&!movement.y&&!movement.z))return;
   const target=camera.getTarget();let dx=target.x-camera.position.x,dz=target.z-camera.position.z,length=Math.hypot(dx,dz);
   if(length<1e-8){dx=-Math.cos(camera.alpha??0);dz=-Math.sin(camera.alpha??0);length=1;}
   let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),right=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),up=Number(keys.has('KeyE'))-Number(keys.has('KeyQ'));
   if(!forward&&!right&&!up){forward=movement.z;right=movement.x;up=movement.y;}
   // RH game's screen-right on a horizontal view is (-forward.z,forward.x).
   const point=target.clone();point.x+=(forward*dx-right*dz)/length*speed;point.z+=(forward*dz+right*dx)/length*speed;point.y+=up*speed;if(forward||right||up)camera.setTarget(point,false,false,true);
   camera.inertialAlphaOffset+=(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*dt*.7;camera.inertialBetaOffset+=(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*dt*.5;
  },
 };
 return input;
}
