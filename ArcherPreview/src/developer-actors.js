import {Vector3} from '@babylonjs/core';
import {ActorPopulation} from './actor-population.js';
import {ACTOR_DEFINITIONS,validateActorSpawn} from './actor-definitions.js';
import {createActorEncounterFactory} from './actor-encounter-adapter.js';

const mapChoices=[['warrior-v3','마을'],['warrior-plains','대평원'],['warrior-v4','마물의 숲'],['warrior-v5','마녀의 동굴']];
const styles=`.actor-lab{position:fixed;z-index:800;left:12px;bottom:96px;max-width:min(370px,calc(100vw - 24px));max-height:60vh;overflow:auto;padding:12px;border:1px solid #ac9364;border-radius:8px;background:#17211ff5;color:#f0e9d9;font:13px/1.5 system-ui;touch-action:auto;user-select:text}.actor-lab summary{cursor:pointer;font-weight:700}.actor-lab label{display:block;margin:8px 0}.actor-lab select,.actor-lab button{font:inherit;min-height:36px;max-width:100%;margin:3px;padding:5px 8px;color:#f0e9d9;background:#29372f;border:1px solid #77846d;border-radius:4px}.actor-lab output{display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px}.actor-lab p{margin:8px 0}.actor-lab [data-status]{color:#d4c79e}`;

export function actorScenarioIds(scenario,count){
 if(scenario==='npc')return ['village.guard'];
 if(scenario==='poses')return ['elena.mourning','elena.mourning'];
 if(![1,5,10,20].includes(count))throw new RangeError('개체 수는 1 / 5 / 10 / 20 중 선택하세요.');
 if(scenario==='mixed')return Array.from({length:count},(_,i)=>i%2?'guardian-bear.standard':'hooded-goblin.standard');
 if(scenario==='boss')return ['guardian-bear.standard',...Array.from({length:count-1},()=> 'hooded-goblin.standard')];
 if(scenario!=='monsters')throw new RangeError('알 수 없는 배우 시나리오입니다.');
 return Array(count).fill('hooded-goblin.standard');
}

// Imported only by the explicit release actorLab route. It owns no RAF/timer;
// normal game ticks call its two hooks around the existing battle update.
export function setupDeveloperActors({root,world,battle,getPlayer,getState,interactNpc,travel,resetInput=()=>{},notify=()=>{},createFactory=createActorEncounterFactory,Population=ActorPopulation}){
 const doc=root.ownerDocument,style=doc.createElement('style'),panel=doc.createElement('details');
 style.textContent=styles;panel.className='actor-lab';panel.dataset.ui='';panel.open=true;
 panel.innerHTML='<summary>MoonForest 0.1 · 배우 실험</summary><p>요청한 수를 그대로 준비합니다. 개발 상한 20체이며 실기기 FPS 한도는 미확인입니다. 보상·의뢰 처치는 지급하지 않습니다.</p><label>시나리오 <select data-scenario><option value="monsters">일반 몬스터</option><option value="mixed">두 종류 혼합</option><option value="boss">보스 1 + 일반 적</option><option value="npc">NPC 상호작용 · 1체</option><option value="poses">49,982삼각형 · 독립 모션 2체</option></select></label><label>개체 수 <select data-count><option>1</option><option>5</option><option>10</option><option>20</option></select><span data-fixed></span></label><button data-command="spawn">등장</button><button data-command="warm">숨긴 채 준비</button><button data-command="defeat">사망 → 리스폰</button><button data-command="interact">가까운 NPC 대화</button><button data-command="clear">회수</button><label>지역 <select data-map></select><button data-command="travel">이동</button></label><button data-command="export">진단 JSON 저장</button><output data-status aria-live="polite">시나리오를 선택하세요.</output><output data-stats></output>';
 panel.querySelector('[data-map]').innerHTML=mapChoices.map(([id,label])=>`<option value="${id}">${label}</option>`).join('');
 root.append(style,panel);
 let disposed=false,serial=0,busy=false,lastStatus='',lastStats='',nextStats=0,clock=0;
 const factory=createFactory({world,battle,getPlayer,interactNpc,rewardsEnabled:false});
 const population=new Population({definitions:ACTOR_DEFINITIONS,createAdapter:factory,validateSpawn:(definition,context)=>validateActorSpawn(definition,world,context),limits:{total:20,active:20,estimatedMemoryBytes:512*1024*1024,concurrentPreparations:1,idleSeconds:30},onError:error=>status(error.message)});
 const priorLifecycle=battle.developmentLifecycle;
 const resetLifecycle=()=>{priorLifecycle?.();population.clear({dispose:false});};
 battle.developmentLifecycle=resetLifecycle;
 function status(value){if(value!==lastStatus){lastStatus=value;panel.querySelector('[data-status]').textContent=value;}}
 function ready(){const state=getState();return !disposed&&state.ready&&!state.dead&&!state.paused&&!!getPlayer();}
 function snapshot(){return {release:'MoonForest 0.1 ver',map:world.mapId,population:population.diagnostics(),resources:factory.inspect?.(),devicePerformance:'unverified',pixels:'unverified',browserAutomation:false};}
 function refresh(force=false){
  if(disposed||(!force&&clock<nextStats))return;nextStats=clock+.5;
  const data=population.diagnostics(),text=`지역 ${world.mapId}\n풀 ${data.entries} / ${data.limits.total} · 준비 ${data.pending} · 상태 ${JSON.stringify(data.states)}\n추정 메모리 ${(data.estimatedBytes/1048576).toFixed(1)} MiB\n생성 ${data.stats.created} · 재사용 ${data.stats.reused} · 리스폰 ${data.stats.respawns}\n${data.memoryMeaning}`;
  if(text!==lastStats){lastStats=text;panel.querySelector('[data-stats]').textContent=text;}
  for(const button of panel.querySelectorAll('button'))button.disabled=busy&&!['clear','export','travel'].includes(button.dataset.command);
 }
 function occupied(){
  const found=new Map();
  for(const enemy of battle.encounters)if(enemy.active&&enemy.brain.hp>0)found.set(enemy,{position:enemy.actor.position,radius:enemy.radius});
  for(const entry of population.entries){const state=entry.adapter?.snapshot();if(state?.active)found.set(entry.adapter.encounter,{position:state.position,radius:entry.definition.collider.radius});}
  return [...found.values()];
 }
 function spawnContext(id,index,count){
  const definition=ACTOR_DEFINITIONS[id],player=getPlayer(),used=occupied(),npc=definition.category==='npc';
  for(let attempt=0;attempt<96;attempt++){
   const angle=player.rotation.y+(index/count)*Math.PI*2+attempt*2.39996;
   const distance=npc?2+(.2*(attempt%4)):6+(index%3)*2+Math.floor(attempt/12)*1.5;
   const point=new Vector3(player.position.x+Math.sin(angle)*distance,0,player.position.z+Math.cos(angle)*distance);
   const safe=world.navigation?.findFree?.(point,definition.collider.radius)??point;point.x=safe.x;point.z=safe.z;
   point.y=world.terrain.heightAt(point.x,point.z);
   if(npc&&(Math.hypot(point.x-player.position.x,point.z-player.position.z)>3||!world.navigation.segmentClear(player.position,point,.05)))continue;
   const context={player,position:point,rotationY:Math.atan2(player.position.x-point.x,player.position.z-point.z),mapId:world.mapId,spawnGroup:'development-actor-lab',occupied:used};
   if(validateActorSpawn(definition,world,context).valid)return context;
  }
  throw new Error(`${definition.label}: 현재 지역에 안전한 등장 위치가 없습니다.`);
 }
 function selection(){return actorScenarioIds(panel.querySelector('[data-scenario]').value,Number(panel.querySelector('[data-count]').value));}
 async function prepare(activate){
  if(busy||!ready()){status('로딩·전투 불능·메뉴 상태가 끝난 뒤 실행하세요.');return;}
  const request=++serial,ids=selection();busy=true;resetInput();population.clear({dispose:false});refresh(true);
  try{
   for(let i=0;i<ids.length;i++){
    if(disposed||request!==serial||!ready())throw Object.assign(new Error('지역 또는 작업이 변경되었습니다.'),{name:'AbortError'});
    const context=spawnContext(ids[i],i,ids.length);
    const record=activate?await population.spawn(ids[i],context):(await population.prewarm(ids[i],ids.slice(0,i+1).filter(id=>id===ids[i]).length,context)).at(-1);
    // Separate sampled motion clocks, while each actor retains its own rig.
    if(activate&&panel.querySelector('[data-scenario]').value==='poses')record.adapter.encounter.brain.time+=i*.37;
    status(`${activate?'등장':'준비'} ${i+1} / ${ids.length}`);refresh(true);
   }
  }catch(error){status(`${error.name==='AbortError'?'취소':'중단'}: ${error.message} (요청 ${ids.length}체)`);}
  finally{if(request===serial)busy=false;refresh(true);}
 }
 function save(){
  const blob=new Blob([JSON.stringify(snapshot(),null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=doc.createElement('a');
  link.href=url;link.download='moonforest-0.1-actors.json';link.click();URL.revokeObjectURL(url);
 }
 const click=async event=>{
  const command=event.target.closest?.('[data-command]')?.dataset.command;if(!command)return;
  try{
   if(command==='spawn'||command==='warm')await prepare(command==='spawn');
   else if(command==='clear'){serial++;busy=false;population.clear({dispose:false});status('개체를 회수했습니다. 준비 자원은 상한·유휴 정책에 따라 유지합니다.');refresh(true);}
   else if(command==='defeat'){if(!ready())return;let count=0;for(const record of population.entries)if(record.adapter?.defeat?.())count++;status(`기존 사망 경로 ${count}체 요청 · 퇴장 후 데이터의 대기 시간으로 리스폰합니다.`);}
   else if(command==='interact'){
    if(!ready())return;
    const player=getPlayer(),record=population.entries.filter(entry=>entry.category==='npc'&&entry.adapter?.snapshot().active).sort((a,b)=>Vector3.DistanceSquared(a.adapter.encounter.actor.position,player.position)-Vector3.DistanceSquared(b.adapter.encounter.actor.position,player.position))[0];
    status(record?.adapter.interact()?'기존 대화·퀘스트 경로에 연결했습니다.':'가까이에서 대화할 수 있는 NPC가 없습니다.');
   }else if(command==='travel'){if(travel)await travel(panel.querySelector('[data-map]').value);}
   else if(command==='export')save();
  }catch(error){status(error.message);notify(error.message);}
 };
 const change=()=>{const mode=panel.querySelector('[data-scenario]').value,fixed=mode==='npc'?1:mode==='poses'?2:null;panel.querySelector('[data-count]').disabled=fixed!==null;panel.querySelector('[data-count]').hidden=fixed!==null;panel.querySelector('[data-fixed]').textContent=fixed?` ${fixed}체 고정`:'';};
 panel.addEventListener('click',click);panel.querySelector('[data-scenario]').addEventListener('change',change);
 const observer=world.scene.onDisposeObservable.addOnce(()=>api.dispose());
 const api={population,inspect:snapshot,
  beforeBattle(dt,player){const state=getState();population.setPaused(!state.ready||state.dead||state.paused);population.update(dt,{player,mapId:world.mapId});clock+=Math.max(0,dt);refresh();},
  afterBattle(player){population.observe({player,mapId:world.mapId});},
  leaveMap(){serial++;busy=false;population.leaveMap();status('지역 세대가 변경되어 이전 준비·리스폰을 취소했습니다.');refresh(true);},
  dispose(){if(disposed)return;disposed=true;serial++;population.dispose();factory.dispose?.();if(battle.developmentLifecycle===resetLifecycle)battle.developmentLifecycle=priorLifecycle;world.scene.onDisposeObservable.remove(observer);panel.removeEventListener('click',click);panel.querySelector('[data-scenario]').removeEventListener('change',change);panel.remove();style.remove();},
 };
 refresh(true);return api;
}
