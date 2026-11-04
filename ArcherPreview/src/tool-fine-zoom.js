// Tool-only precise zoom. A full wheel notch changes distance by about 1.2%,
// with no carried coarse-wheel inertia or second native wheel application.
export function applyToolFineZoom(camera,pixels){
 if(!Number.isFinite(pixels)||!pixels||!Number.isFinite(camera?.radius)||camera.radius<=0)return false;
 const lower=Number.isFinite(camera.lowerRadiusLimit)?Math.max(.001,camera.lowerRadiusLimit):.01;
 const upper=Number.isFinite(camera.upperRadiusLimit)?Math.max(lower,camera.upperRadiusLimit):Number.MAX_VALUE;
 camera.movement?.resetZoomVelocity?.();camera.inertialRadiusOffset=0;
 camera.radius=Math.max(lower,Math.min(upper,camera.radius*Math.exp(Math.max(-120,Math.min(120,pixels))*.0001)));
 camera.getViewMatrix?.(true);return true;
}

export function attachToolFineZoom(canvas,camera,{isCurrent=()=>true}={}){
 let disposed=false;
 const wheel=event=>{
  if(disposed||!event.ctrlKey||!isCurrent())return;
  event.preventDefault();event.stopImmediatePropagation();
  // During playback or an object drag, the camera belongs to the timeline or
  // gesture. Still consume Ctrl-wheel so it never scales the entire page.
  if(camera.inputs?.attachedToElement===false)return;
  const unit=event.deltaMode===1?40:event.deltaMode===2?(canvas.clientHeight||canvas.getBoundingClientRect?.().height||800):1;
  applyToolFineZoom(camera,event.deltaY*unit);
 };
 canvas?.addEventListener('wheel',wheel,{capture:true,passive:false});
 return {dispose(){if(disposed)return;disposed=true;canvas?.removeEventListener('wheel',wheel,true);}};
}
