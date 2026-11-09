import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {CreateLineSystem} from '@babylonjs/core/Meshes/Builders/linesBuilder.js';
import {obstacleClearance} from './village-collision.js';
import {villageTravelLimit,clampVillageExit} from './map-travel.js';
import {FOREST_RADIUS,CAVE_RADIUS} from './map-route.js';
import {PLAINS_RADIUS} from './great-plains-layout.js';

const axis=(box)=>{const c=Math.cos(box.yaw??0),s=Math.sin(box.yaw??0);return [{x:c,z:-s},{x:s,z:c}];};
function boxesOverlap(a,b){
 const aa=axis(a),bb=axis(b),delta={x:b.x-a.x,z:b.z-a.z},dot=(u,v)=>u.x*v.x+u.z*v.z;
 return [...aa,...bb].every(v=>Math.abs(dot(delta,v))<a.halfWidth*Math.abs(dot(aa[0],v))+a.halfDepth*Math.abs(dot(aa[1],v))+b.halfWidth*Math.abs(dot(bb[0],v))+b.halfDepth*Math.abs(dot(bb[1],v))+.01);
}
export function placementShapesOverlap(a,b){
 if(a.shape==='box'&&b.shape==='box')return boxesOverlap(a,b);
 if(a.shape==='box')return obstacleClearance(b,a)<(b.radius??0)+.01;
 if(b.shape==='box')return obstacleClearance(a,b)<(a.radius??0)+.01;
 return Math.hypot(a.x-b.x,a.z-b.z)<(a.radius??0)+(b.radius??0)+.01;
}
function shapeFor(record){
 if(record.obstacle)return record.obstacle;
 const {min,max}=record;return {shape:'box',x:(min.x+max.x)/2,z:(min.z+max.z)/2,halfWidth:Math.max(.01,(max.x-min.x)/2),halfDepth:Math.max(.01,(max.z-min.z)/2),yaw:0,radius:Math.hypot(max.x-min.x,max.z-min.z)/2};
}
const extent=shape=>shape.shape==='box'?Math.max(shape.radius??0,Math.hypot(shape.halfWidth??0,shape.halfDepth??0)):(shape.radius??0);
function mapLimit(world,p){return world.mapId==='village'?villageTravelLimit(p,48):world.mapId==='great-plains'?PLAINS_RADIUS:world.mapId==='monster-forest'?FOREST_RADIUS:CAVE_RADIUS;}
export function capturePlacementActors(actors){
 const result=[];for(const root of new Set(actors??[])){
  if(!root||root.isDisposed?.()||root.isEnabled?.()===false)continue;
  const bounds=root.getHierarchyBoundingVectors?.(true),min=bounds?.min,max=bounds?.max;
  if(!min||!max||![min.x,min.z,max.x,max.z].every(Number.isFinite))continue;
  const halfWidth=Math.max(.1,(max.x-min.x)/2),halfDepth=Math.max(.1,(max.z-min.z)/2);result.push({shape:'box',x:(min.x+max.x)/2,z:(min.z+max.z)/2,halfWidth,halfDepth,yaw:0,radius:Math.hypot(halfWidth,halfDepth)});
 }
 return result;
}
export function checkPlacement(world,record,player,actors=[]){
 if(!record?.min||!record?.max)return {valid:false,reason:'모양을 준비하고 있어요.'};
 const shape=shapeFor(record),min=record.min,max=record.max;
 for(const p of [{x:min.x,z:min.z},{x:min.x,z:max.z},{x:max.x,z:min.z},{x:max.x,z:max.z}]){
  if(Math.hypot(p.x,p.z)>mapLimit(world,p)||Number.isFinite(world.terrain?.half)&&(Math.abs(p.x)>world.terrain.half||Math.abs(p.z)>world.terrain.half))return {valid:false,reason:'맵의 이동 가능 범위를 벗어났어요.'};
  if(world.mapId==='village'){const bounded=clampVillageExit({...p},p);if(Math.hypot(bounded.x-p.x,bounded.z-p.z)>.01)return {valid:false,reason:'맵의 이동 가능 범위를 벗어났어요.'};}
 }
 if(player?.position&&obstacleClearance(player.position,shape)<(player.metadata?.playerDimensions?.moveRadius??.35)+.01)return {valid:false,reason:'플레이어와 겹쳐요.'};
 for(const actor of actors)if(placementShapesOverlap(shape,actor))return {valid:false,reason:'주민이나 몬스터와 겹쳐요.'};
 for(const other of world.navigation?.obstacles??[]){
  if(Math.hypot(shape.x-other.x,shape.z-other.z)>extent(shape)+extent(other)+.1)continue;
  if(placementShapesOverlap(shape,other))return {valid:false,reason:'다른 오브젝트와 겹쳐요.'};
 }
 if(world.cave&&world.navigation?.clearanceAt){
  const width=max.x-min.x,depth=max.z-min.z,nx=Math.max(1,Math.ceil(width/.75)),nz=Math.max(1,Math.ceil(depth/.75));
  if((nx+1)*(nz+1)>4096)return {valid:false,reason:'동굴에서 확인하기에는 범위가 너무 넓어요.'};
  for(let x=0;x<=nx;x++)for(let z=0;z<=nz;z++)if(world.navigation.clearanceAt(min.x+width*x/nx,min.z+depth*z/nz)<.1)return {valid:false,reason:'동굴 벽이나 지형과 겹쳐요.'};
 }
 return {valid:true,reason:'이곳에 놓을 수 있어요.'};
}

// One reusable wireframe and one screen-space action panel, no extra engine or loop.
export function createPlacementPreviewView({root,world,onConfirm,onCancel}){
 const doc=root.ownerDocument,scene=world.scene,canvas=scene.getEngine().getRenderingCanvas?.()??root.querySelector('canvas'),ui=doc.createElement('div'),style=doc.createElement('style');
 ui.dataset.toolUi='';ui.dataset.ui='';ui.className='placement-preview-actions';ui.hidden=true;ui.innerHTML='<span role="status"></span><button data-preview-action="confirm">놓기</button><button data-preview-action="cancel">취소</button>';
 style.textContent='.placement-preview-actions{position:fixed;z-index:890;display:flex;align-items:center;gap:5px;padding:6px;border-radius:8px;background:#14261fec;border:1px solid #728a72;color:#fff;font:13px system-ui;transform:translate(-50%,-100%)}.placement-preview-actions[hidden]{display:none!important}.placement-preview-actions button{font:inherit;min-height:44px;padding:8px 12px;color:#fff;background:#30543c;border:1px solid #9eb99a;border-radius:5px}.placement-preview-actions button:disabled{opacity:.4}.placement-preview-actions[data-valid="false"]{border-color:#ee7777}';root.append(style,ui);
 const confirm=ui.querySelector('[data-preview-action=confirm]'),label=ui.querySelector('span');let mesh=null,record=null,valid=false,disposed=false;
 const click=event=>{event.stopPropagation();const action=event.target.closest?.('[data-preview-action]')?.dataset.previewAction;if(action==='confirm'&&!confirm.disabled)onConfirm();else if(action==='cancel')onCancel();};ui.addEventListener('click',click);ui.addEventListener('keydown',event=>{if(event.code==='Escape'){event.preventDefault();onCancel();}event.stopPropagation();});
 function lines(min,max){const pad=.04,a=new Vector3(min.x-pad,min.y-pad,min.z-pad),b=new Vector3(max.x+pad,max.y+pad,max.z+pad),p=[new Vector3(a.x,a.y,a.z),new Vector3(b.x,a.y,a.z),new Vector3(b.x,a.y,b.z),new Vector3(a.x,a.y,b.z),new Vector3(a.x,b.y,a.z),new Vector3(b.x,b.y,a.z),new Vector3(b.x,b.y,b.z),new Vector3(a.x,b.y,b.z)];return [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].map(([i,j])=>[p[i],p[j]]);}
 function reposition(){if(!record||!canvas||disposed)return;const engine=scene.getEngine(),rect=canvas.getBoundingClientRect?.(),width=engine.getRenderWidth(),height=engine.getRenderHeight();if(!rect?.width||!rect?.height||!width||!height||!scene.activeCamera)return;const p=Vector3.Project(new Vector3((record.min.x+record.max.x)/2,record.max.y,(record.min.z+record.max.z)/2),Matrix.Identity(),scene.getTransformMatrix(),scene.activeCamera.viewport.toGlobal(width,height));ui.hidden=!(p.z>=0&&p.z<=1&&p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height);if(!ui.hidden){ui.style.left=(rect.left+p.x/width*rect.width)+'px';ui.style.top=(rect.top+p.y/height*rect.height-8)+'px';}}
 const observer=scene.onBeforeRenderObservable.add(reposition);
 return {update(next,result){if(disposed||!next?.min||!next?.max)return;record=next;valid=result.valid;const segments=lines(next.min,next.max);mesh=CreateLineSystem('placement-preview-border',{lines:segments,updatable:true,...(mesh?{instance:mesh}:{})},scene);mesh.isPickable=false;mesh.color=valid?new Color3(.2,1,.3):new Color3(1,.15,.12);mesh.setEnabled(true);ui.dataset.valid=String(valid);label.textContent=valid?'배치 가능':'배치 불가';confirm.disabled=!valid;reposition();},inspect:()=>({valid,visible:!!record,color:mesh?.color?.asArray?.()??null}),dispose(){if(disposed)return;disposed=true;scene.onBeforeRenderObservable.remove(observer);mesh?.dispose();ui.remove();style.remove();}};
}
