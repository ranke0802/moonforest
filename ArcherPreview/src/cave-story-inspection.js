import {CAVE_PLACEMENTS} from './witch-cave-layout.js';
import {CAVE_FOG_VISIBLE} from './cave-fog-of-war.js';

const at=asset=>CAVE_PLACEMENTS.find(p=>p.asset===asset);
export const CAVE_STORY_INSPECTIONS=Object.freeze([
 {id:'refuge',placement:at('cave-20-modest-cot'),range:3.6,label:'거처 살펴보기',title:'성녀가 머물던 자리',
  paragraphs:['작은 침상과 빛바랜 성표. 다친 이들을 돌보던 엘레나의 생활 흔적이 남아 있다.','기도가 닿지 않게 된 뒤에도 그녀는 성표를 버리지 않았다. 안쪽 실험실에는 요아힘을 되살리려는 기록이 이어진다.']},
 {id:'laboratory',placement:at('cave-18-alchemy-workbench'),range:3.8,label:'실험대 살펴보기',title:'돌아오지 않는 영혼',
  paragraphs:['약병과 실험 도구가 한 작업대에 모여 있다. 엘레나는 숲의 동물과 마물에 약물을 시험하며 생명과 영혼을 붙잡는 방법을 찾고 있다.','이 실험의 목적은 하나다. 요아힘의 영혼을 그의 몸으로 돌려보내는 것. 더 깊은 곳의 제단이 마지막 실험을 기다린다.']},
 {id:'resurrection',placement:at('cave-15-resurrection-altar'),range:4.2,label:'제단 살펴보기',title:'미완성 부활 의식',
  paragraphs:['비어 있는 제단 주변에 영혼을 모으는 장치와 실험 도구가 놓여 있다.','이곳의 실험과 방어 장치는 모두 요아힘을 되살리려는 엘레나의 집착으로 이어진다.']},
].map(point=>Object.freeze({...point,paragraphs:Object.freeze(point.paragraphs)})));

export function nearestCaveInspection(world,state){
 const p=state?.position;
 if(!world?.cave||!p||state.loading||state.dead||state.combat||state.busy||!Number.isFinite(p.x)||!Number.isFinite(p.z))return null;
 const fog=world.caveFog?.fog,records=world.villageRenderRecords;
 if(!fog?.ready||!records)return null;
 let nearest=null,distance=Infinity;
 for(const point of CAVE_STORY_INSPECTIONS){
  const placement=point.placement,d=Math.hypot(p.x-placement.x,p.z-placement.z);
  if(d>point.range||d>=distance||fog.stateAt(placement.x,placement.z)!==CAVE_FOG_VISIBLE)continue;
  const record=records.find(r=>r.placement.id===placement.id);
  if(!record?.root.isEnabled()||!record.meshes.some(m=>m.isVisible&&m.isEnabled()&&m.metadata?.caveFogVisible!==false))continue;
  nearest=point;distance=d;
 }
 return nearest;
}

// Reuse the existing help modal: the same pause/audio/fullscreen ownership
// applies, and no additional overlay or per-frame layout query is needed.
export function setupCaveStoryInspection({world,getState,onOpen=()=>{},document:doc=globalThis.document,now=()=>performance.now()}={}){
 const root=doc.getElementById('app'),dialog=doc.getElementById('help-dialog');
 root.__caveStoryInspection?.dispose();
 const button=doc.createElement('button');button.id='cave-inspect';button.type='button';button.dataset.ui='';button.hidden=true;button.setAttribute('aria-haspopup','dialog');root.append(button);
 const label=doc.createElement('span'),shortcut=doc.createElement('kbd');shortcut.textContent='Q';button.append(label,shortcut);
 const content=doc.createElement('section');content.className='cave-story-content';content.hidden=true;
 const title=doc.createElement('h2'),first=doc.createElement('p'),second=doc.createElement('p');content.append(title,first,second);dialog.append(content);
 let disposed=false,next=0,current=null,map=null;
 const restore=()=>{delete dialog.dataset.caveStory;content.hidden=true;};
 const open=()=>{
  const point=nearestCaveInspection(world,getState());
  if(disposed||!point||doc.querySelector('dialog[open]'))return;
  title.textContent=point.title;first.textContent=point.paragraphs[0];second.textContent=point.paragraphs[1];
  dialog.dataset.caveStory=point.id;content.hidden=false;onOpen();dialog.showModal();button.hidden=true;
 };
 const key=event=>{if(event.code==='KeyQ'&&!event.repeat&&!button.hidden&&!doc.querySelector('dialog[open]')&&!/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName??'')){event.preventDefault();open();}};
 const update=()=>{
  if(disposed)return;
  if(map!==world.mapId){map=world.mapId;root.classList.toggle('cave-map',!!world.cave);next=0;if(dialog.dataset.caveStory){dialog.close();restore();}}
  const time=now();if(time<next)return;next=time+150;
  const point=doc.querySelector('dialog[open]')?null:nearestCaveInspection(world,getState());
  if(point!==current){current=point;if(point)label.textContent=point.label;}
  button.hidden=!point;
 };
 button.addEventListener('click',open);doc.addEventListener('keydown',key);dialog.addEventListener('close',restore);
 const guide=doc.getElementById('help-toggle');guide?.addEventListener('click',restore,true);
 const frameObserver=world.scene.onBeforeRenderObservable.add(update),disposeObserver=world.scene.onDisposeObservable.addOnce(()=>api.dispose());
 const api={update,dispose(){
  if(disposed)return;disposed=true;world.scene.onBeforeRenderObservable.remove(frameObserver);world.scene.onDisposeObservable.remove(disposeObserver);
  doc.removeEventListener('keydown',key);dialog.removeEventListener('close',restore);guide?.removeEventListener('click',restore,true);button.removeEventListener('click',open);
  if(dialog.dataset.caveStory){dialog.close();restore();}button.remove();content.remove();root.classList.remove('cave-map');
  if(root.__caveStoryInspection===api)delete root.__caveStoryInspection;
 }};
 root.__caveStoryInspection=api;update();return api;
}
