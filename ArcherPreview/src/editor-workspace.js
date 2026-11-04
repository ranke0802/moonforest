import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {applyToolFineZoom} from './tool-fine-zoom.js';

export function editorWorkspaceRects(width,height,{collapsed=false}={}){
 width=Math.max(1,width);height=Math.max(1,height);const bar=100,gap=8;
 if(width>=760){const panelWidth=collapsed?160:Math.min(340,Math.max(260,width*.27));return {panel:{left:8,top:58,width:panelWidth,height:Math.max(70,height-66)},view:{left:panelWidth+16,top:bar,width:Math.max(1,width-panelWidth-16),height:Math.max(1,height-bar)}};}
 const panelHeight=collapsed?48:Math.min(285,Math.max(170,Math.round(height*.36)));
 return {panel:{left:8,top:Math.max(bar+70,height-panelHeight-8),width:Math.max(1,width-16),height:panelHeight},view:{left:0,top:bar,width,height:Math.max(70,height-bar-panelHeight-gap*2)}};
}

// Reserve an actual canvas region. A projected object can no longer sit behind
// the HTML controls at narrow widths; native pointer coordinates use this rect.
export function createEditorWorkspace({root,panel,world,getSelection=()=>null,getLease=()=>world.toolLease,isEditing=()=>true}){
 const doc=root.ownerDocument,win=doc.defaultView??globalThis.window,engine=world.scene.getEngine?.(),canvas=engine?.getRenderingCanvas?.()??root.querySelector('canvas');
 if(!canvas)return {focusSelection(){},attachCamera(){},dispose(){}};
 const oldCanvasStyle=canvas.getAttribute('style'),oldPanelStyle=panel.getAttribute('style'),style=doc.createElement('style'),bar=doc.createElement('div');let disposed=false;
 style.textContent='.editor-viewbar{position:fixed;z-index:875;display:flex;gap:5px;align-items:center;overflow-x:auto;white-space:nowrap;padding:4px 8px;background:#14271ff2;color:#f0eadc;font:13px/1.4 system-ui}.editor-viewbar button{min-height:38px;flex:0 0 auto;padding:6px 10px;border:1px solid #819473;border-radius:6px;background:#2b4533;color:inherit}.editor-viewbar button[aria-pressed=true]{background:#d9c48b;color:#19271d}.editor-viewbar small{padding:0 8px}.editor-workspace-panel{overflow:auto!important}';
 bar.className='editor-viewbar';bar.dataset.toolUi='';bar.dataset.ui='';bar.innerHTML='<button data-view="orbit" aria-pressed="true">화면 회전</button><button data-view="pan" aria-pressed="false">화면 이동</button><button data-view="focus">선택 소품 보기</button><button data-view="zoom-in" aria-label="가까이 보기">＋</button><button data-view="zoom-out" aria-label="멀리 보기">−</button><small>빈 곳 드래그 · 휠 확대/축소 · Ctrl + 휠: 미세 확대·축소</small>';
 root.append(style,bar);panel.classList.add('editor-workspace-panel');
 function resize(){if(disposed)return;const rect=root.getBoundingClientRect(),width=rect.width||root.clientWidth||win.innerWidth||800,height=Math.min(rect.height||root.clientHeight||win.innerHeight||600,win.innerHeight||Infinity),layout=editorWorkspaceRects(width,height,{collapsed:!panel.open}),view=layout.view,box=layout.panel;
  Object.assign(canvas.style,{left:view.left+'px',top:view.top+'px',right:'auto',bottom:'auto',width:view.width+'px',height:view.height+'px'});
  Object.assign(panel.style,{position:'fixed',left:(rect.left+box.left)+'px',top:(rect.top+box.top)+'px',right:'auto',bottom:'auto',width:box.width+'px',height:panel.open?box.height+'px':'auto',maxHeight:box.height+'px'});
  Object.assign(bar.style,{left:(rect.left+view.left)+'px',top:(rect.top+52)+'px',width:view.width+'px',height:'44px'});
  engine?.resize?.();world.camera.getProjectionMatrix?.(true);
 }
 function attachCamera(){const lease=getLease();if(lease?.attachCamera)lease.attachCamera();else if(isEditing())world.camera.attachControl(canvas,true);}
 function focusSelection(){const record=getSelection();if(!record)return false;const bounds=record.min&&record.max?{min:record.min,max:record.max}:record.root?.getHierarchyBoundingVectors?.();if(!bounds)return false;const camera=world.camera;camera.movement?.resetPanVelocity?.();camera.movement?.resetRotationVelocity?.();camera.movement?.resetZoomVelocity?.();const center=bounds.min.add(bounds.max).scale(.5),radius=Math.max(.4,Vector3.Distance(bounds.min,bounds.max)*.5),rect=canvas.getBoundingClientRect(),aspect=(rect.width||1)/(rect.height||1),halfAngle=Math.min(camera.fov*.5,Math.atan(Math.tan(camera.fov*.5)*aspect));camera.setTarget(center,false,false,true);camera.radius=Math.max(1,radius/Math.sin(Math.max(.1,halfAngle))*1.2);for(const key of ['inertialAlphaOffset','inertialBetaOffset','inertialRadiusOffset','inertialPanningX','inertialPanningY'])camera[key]=0;camera.getViewMatrix(true);canvas.focus?.({preventScroll:true});return true;}
 function action(event){const mode=event.target.closest?.('[data-view]')?.dataset.view;if(!mode||!isEditing())return;const lease=getLease();if(mode==='orbit'||mode==='pan'){lease?.setCameraMode?.(mode);for(const button of bar.querySelectorAll('[aria-pressed]'))button.setAttribute('aria-pressed',String(button.dataset.view===mode));}else if(mode==='focus')focusSelection();else if(event.ctrlKey)applyToolFineZoom(world.camera,mode==='zoom-in'?-120:120);else{world.camera.radius*=mode==='zoom-in'?.8:1.25;world.camera.radius=Math.max(.25,Math.min(world.camera.upperRadiusLimit??200,world.camera.radius));}canvas.focus?.({preventScroll:true});}
 bar.addEventListener('click',action);panel.addEventListener('toggle',resize);win.addEventListener('resize',resize);const observer=win.ResizeObserver?new win.ResizeObserver(resize):null;observer?.observe(root);resize();
 return {focusSelection,attachCamera,resize,dispose(){if(disposed)return;disposed=true;observer?.disconnect();bar.removeEventListener('click',action);panel.removeEventListener('toggle',resize);win.removeEventListener('resize',resize);bar.remove();style.remove();panel.classList.remove('editor-workspace-panel');if(oldCanvasStyle===null)canvas.removeAttribute('style');else canvas.setAttribute('style',oldCanvasStyle);if(oldPanelStyle===null)panel.removeAttribute('style');else panel.setAttribute('style',oldPanelStyle);engine?.resize?.();world.camera.getProjectionMatrix?.(true);}};
}
