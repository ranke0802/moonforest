const ZERO=Object.freeze({x:0,y:0,z:0});
const same=(a,b)=>a.x===b.x&&a.y===b.y&&a.z===b.z;

export function normalizeCameraMovement(value){
  const movement=Object.fromEntries(['x','y','z'].map(axis=>[axis,Number.isFinite(value[axis])?Math.max(-1,Math.min(1,value[axis])):0]));
  const length=Math.hypot(movement.x,movement.y,movement.z);
  if(length>1)for(const axis of ['x','y','z'])movement[axis]/=length;
  return movement;
}

// Parent UI only: no canvas, scene, frame loop, timer or document data belongs
// here. onMove is invoked immediately; an asynchronous ACK never replays input.
export function mountCinematicCameraControls(root,{window:win=root.ownerDocument.defaultView,getState=()=>({ready:false}),onMove=()=>{},onError=()=>{}}={}){
  const doc=root.ownerDocument,workspace=root.querySelector('[data-view="preview-workspace"]')??root.querySelector('.preview-workspace'),toolbar=root.querySelector('.preview-toolbar');
  if(!workspace||!toolbar)throw new Error('Camera controls need the existing preview workspace and toolbar.');
  const controls=doc.createElement('section');controls.className='cinematic-camera-controls';controls.dataset.view='camera-controls';controls.setAttribute('aria-label','편집 시점 이동');controls.hidden=true;
  controls.innerHTML='<div class="camera-stick" data-camera-stick role="group" tabindex="0" aria-label="여기를 누른 채 끌어 시점 이동"><span class="camera-stick-label">시점 이동<br><small>누른 채 끌기</small></span><span class="camera-stick-ring" data-camera-stick-ring hidden aria-hidden="true"><span class="camera-stick-knob" data-camera-stick-knob></span></span></div><div class="camera-height-controls" role="group" aria-label="시점 높이"><button type="button" data-camera-height="1" aria-label="시점 높이 올리기">높이 ＋</button><button type="button" data-camera-height="-1" aria-label="시점 높이 내리기">높이 −</button></div>';
  const toggle=doc.createElement('button');toggle.type='button';toggle.dataset.cameraControlsToggle='';toggle.hidden=true;toggle.setAttribute('aria-pressed','true');toggle.textContent='이동 스틱 숨기기';toolbar.append(toggle);workspace.append(controls);
  const pad=controls.querySelector('[data-camera-stick]'),ring=controls.querySelector('[data-camera-stick-ring]'),knob=controls.querySelector('[data-camera-stick-knob]'),heightButtons=[...controls.querySelectorAll('[data-camera-height]')],listeners=[];
  let disposed=false,hiddenByUser=false,allowed=false,identity,latestIdentity=null,gestureIdentity=null,stick=null,movement={...ZERO},horizontal={x:0,z:0},generation=0;const heights=new Map();
  const context=state=>({cameraControlId:state.cameraControlId,cutsceneId:state.cutsceneId,mapId:state.mapId});
  const contextKey=value=>JSON.stringify([value?.cameraControlId,value?.cutsceneId,value?.mapId]);
  const listen=(node,type,handler)=>{node?.addEventListener?.(type,handler);listeners.push(()=>node?.removeEventListener?.(type,handler));};
  function emit(value,heldIdentity=gestureIdentity){
    const next=normalizeCameraMovement(value);if(same(next,movement))return;movement=next;const token=++generation;
    try{const result=onMove({...next},{...heldIdentity});Promise.resolve(result).catch(error=>{if(!disposed&&token===generation)onError(error);});}catch(error){if(!disposed)onError(error);}
  }
  function apply(){emit({...horizontal,y:Math.max(-1,Math.min(1,[...heights.values()].reduce((sum,row)=>sum+row.direction,0)))});if(!stick&&!heights.size)gestureIdentity=null;}
  function release(node,pointerId){try{if(node.hasPointerCapture?.(pointerId))node.releasePointerCapture(pointerId);}catch{/* A removed pointer already released its capture. */}}
  function reset(){
    const oldStick=stick,oldHeights=[...heights],heldIdentity=gestureIdentity;stick=null;heights.clear();horizontal={x:0,z:0};ring.hidden=true;pad.classList.remove('active');for(const button of heightButtons)button.classList.remove('active');
    if(oldStick)release(pad,oldStick.pointerId);for(const [pointerId,row]of oldHeights)release(row.button,pointerId);emit(ZERO,heldIdentity);gestureIdentity=null;
  }
  function refresh(){
    if(disposed)return;const state=getState(),nextIdentity=context(state),key=contextKey(nextIdentity),validIdentity=Number.isSafeInteger(nextIdentity.cameraControlId)&&nextIdentity.cameraControlId>0&&typeof nextIdentity.cutsceneId==='string'&&typeof nextIdentity.mapId==='string',nextAllowed=state.ready===true&&validIdentity&&root.dataset.studioMode==='mobile'&&root.dataset.previewFullscreen!=='true'&&!doc.hidden;
    if(identity!==key||!nextAllowed||hiddenByUser)reset();identity=key;latestIdentity=nextIdentity;allowed=nextAllowed;controls.hidden=!allowed||hiddenByUser;toggle.hidden=!allowed;toggle.setAttribute('aria-pressed',String(!hiddenByUser));toggle.textContent=hiddenByUser?'이동 스틱 보기':'이동 스틱 숨기기';
  }
  const suppress=event=>{event.preventDefault();event.stopPropagation();};
  const capture=(node,pointerId)=>{try{node.setPointerCapture?.(pointerId);}catch{/* Pointer identity still controls release without native capture. */}};
  function stickDown(event){
    refresh();if(!allowed||hiddenByUser||stick||event.button!==undefined&&event.button!==0||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return;
    suppress(event);gestureIdentity??={...latestIdentity};const rect=pad.getBoundingClientRect();stick={pointerId:event.pointerId,x:event.clientX,y:event.clientY};horizontal={x:0,z:0};ring.style.left=(event.clientX-rect.left)+'px';ring.style.top=(event.clientY-rect.top)+'px';knob.style.transform='translate(-50%,-50%)';ring.hidden=false;pad.classList.add('active');capture(pad,event.pointerId);apply();
  }
  function stickMove(event){
    refresh();if(!stick||event.pointerId!==stick.pointerId)return;suppress(event);if(!allowed||controls.hidden){reset();return;}
    const dx=event.clientX-stick.x,dy=event.clientY-stick.y;if(!Number.isFinite(dx)||!Number.isFinite(dy))return;const length=Math.hypot(dx,dy),radius=30,deadzone=5,amount=Math.max(0,Math.min(1,(length-deadzone)/(radius-deadzone)));
    horizontal=length?{x:dx/length*amount,z:-dy/length*amount}:{x:0,z:0};const clamped=Math.min(radius,length),x=length?dx/length*clamped:0,y=length?dy/length*clamped:0;knob.style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;apply();
  }
  function stickEnd(event){refresh();if(!stick||event.pointerId!==stick.pointerId)return;suppress(event);const pointerId=stick.pointerId;stick=null;horizontal={x:0,z:0};ring.hidden=true;pad.classList.remove('active');release(pad,pointerId);apply();}
  function heightDown(event){
    refresh();if(!allowed||hiddenByUser||event.button!==undefined&&event.button!==0||heights.has(event.pointerId)||stick?.pointerId===event.pointerId)return;suppress(event);gestureIdentity??={...latestIdentity};const button=event.currentTarget;heights.set(event.pointerId,{button,direction:Number(button.dataset.cameraHeight)});button.classList.add('active');capture(button,event.pointerId);apply();
  }
  function heightEnd(event,button=event.currentTarget){refresh();const row=heights.get(event.pointerId);if(!row||row.button!==button)return;suppress(event);heights.delete(event.pointerId);if(![...heights.values()].some(value=>value.button===row.button))row.button.classList.remove('active');release(row.button,event.pointerId);apply();}
  listen(pad,'pointerdown',stickDown);listen(pad,'pointermove',stickMove);for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(pad,type,stickEnd);
  for(const button of heightButtons){listen(button,'pointerdown',heightDown);for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(button,type,heightEnd);}
  for(const type of ['pointerup','pointercancel'])listen(win,type,event=>{if(stick?.pointerId===event.pointerId)stickEnd(event);const row=heights.get(event.pointerId);if(row)heightEnd(event,row.button);});
  listen(toggle,'click',()=>{hiddenByUser=!hiddenByUser;reset();refresh();});
  const layout=()=>{reset();refresh();};for(const type of ['resize','orientationchange','pagehide'])listen(win,type,layout);listen(win,'blur',()=>{if(doc.hasFocus?.()!==true)layout();});listen(doc,'visibilitychange',layout);for(const type of ['resize','scroll'])listen(win.visualViewport,type,layout);
  const Observer=win.MutationObserver??doc.defaultView?.MutationObserver??globalThis.MutationObserver,observer=Observer?new Observer(layout):null;observer?.observe(root,{attributes:true,attributeFilter:['data-studio-mode','data-preview-fullscreen','data-mobile-panel']});
  refresh();
  return {refresh,reset,inspect:()=>({visible:!controls.hidden,hiddenByUser,movement:{...movement},stickPointerId:stick?.pointerId??null,heightPointers:[...heights.keys()],disposed}),destroy(){if(disposed)return;reset();disposed=true;generation++;observer?.disconnect();for(const remove of listeners)remove();controls.remove();toggle.remove();}};
}
