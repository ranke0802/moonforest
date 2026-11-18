// One scheduler per map, driven by the existing game tick. The host owns actors.
export function createMonsterGroupScheduler({spawn,commit=()=>{},canCommit=()=>true,canLaunch=()=>true,releaseAdmission=()=>{},remove=()=>{},isAlive=()=>true,onPermanentDeath=()=>{},onError=()=>{},random=Math.random,preparationGroups=Infinity,now=()=>performance.now(),focus=null}){
 let generation=0,groups=new Map(),disposed=false,paused=true,loadedAt=0;const preparationLimit=Number.isFinite(preparationGroups)?Math.max(1,Math.floor(preparationGroups)):Infinity;
 const safeRemove=handle=>{try{remove(handle);}catch(error){onError(error);}};
 const release=group=>{if(!group.admitted)return;group.admitted=false;try{releaseAdmission(group.members);}catch(error){onError(error);}};
 function leave(){generation++;paused=true;for(const group of groups.values()){for(const handle of group.handles.values())safeRemove(handle);release(group);}groups=new Map();}
 function load(rows,{permanentlyDead=[]}={}){leave();loadedAt=now();const dead=new Set(permanentlyDead);for(const row of rows){if(dead.has(row.id))continue;let group=groups.get(row.groupId);if(!group){const delay=row.spawnMode==='start'?0:row.delaySeconds*(.5+random());group={id:row.groupId,members:[],handles:new Map(),dead:new Set(),state:'waiting',remaining:delay,initialDelaySeconds:delay,pending:false,preparedCount:0,startedAt:null,readyAt:null,firstShownAt:null};groups.set(row.groupId,group);}group.members.push(row);}}
 async function launch(group){
  const epoch=generation;group.pending=true;group.state='preparing';group.startedAt=now();group.readyAt=null;group.firstShownAt=null;group.preparedCount=0;const prepared=[];
  // Each member appears as soon as it is ready (the leader is listed first),
  // instead of the whole pack waiting for its last model. The group still
  // respawns and completes as one.
  const shown=new Set();
  try{for(const row of group.members){const handle=await spawn(row,{isCurrent:()=>!disposed&&generation===epoch});if(disposed||generation!==epoch){safeRemove(handle);for(const [,old] of prepared)safeRemove(old);return;}prepared.push([row.id,handle]);group.preparedCount=prepared.length;
    if(canCommit()){commit([handle]);shown.add(handle);group.firstShownAt??=now();}}
   if(disposed||generation!==epoch)return;group.handles=new Map(prepared);group.dead.clear();group.state='prepared';group.readyAt=now();
   const rest=[...group.handles.values()].filter(handle=>!shown.has(handle));if(!rest.length||canCommit()){if(rest.length)commit(rest);group.state='active';}
  }catch(error){for(const [,handle] of prepared)safeRemove(handle);group.handles.clear();release(group);if(generation===epoch&&!disposed){group.state='waiting';group.remaining=2;onError(error);}}
  finally{if(generation===epoch){group.pending=false;startReady();}}
 }
 // focus() → {x,z} | null: groups still waiting are prepared nearest that
 // point first (the quest spot, else the player), so the pack the player is
 // walking to is not queued behind the rest of the map.
 function byFocus(){
  const list=[...groups.values()],point=focus?.();
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z))return list;
  const gap=group=>{let best=Infinity;for(const row of group.members){const d=(row.x-point.x)**2+(row.z-point.z)**2;if(d<best)best=d;}return best;};
  return list.map(group=>[gap(group),group]).sort((a,b)=>a[0]-b[0]).map(entry=>entry[1]);
 }
 function startReady(){
  if(disposed||paused||!canCommit())return;let preparing=[...groups.values()].filter(group=>group.pending).length;
  for(const group of byFocus())if(['waiting','capacity-wait','prepare-wait'].includes(group.state)&&group.remaining===0){
   if(preparing>=preparationLimit){group.state='prepare-wait';continue;}
   const admission=canLaunch(group.members);if(admission!==true){group.state='capacity-wait';group.capacityReason=typeof admission==='string'?admission:'capacity';continue;}
   group.admitted=true;group.capacityReason=null;preparing++;void launch(group);
  }
 }
 function update(dt,{paused:isPaused=false}={}){paused=isPaused;if(disposed||paused)return;dt=Math.max(0,Number.isFinite(dt)?dt:0);for(const group of groups.values()){
  if(group.pending)continue;
  if(group.state==='prepared'){if(!canCommit())continue;try{commit([...group.handles.values()]);group.state='active';}catch(error){for(const handle of group.handles.values())safeRemove(handle);group.handles.clear();release(group);group.state='waiting';group.remaining=2;onError(error);}}
  else if(group.state==='active'){
   for(const [id,handle] of group.handles)if(!group.dead.has(id)&&!isAlive(handle)){group.dead.add(id);if(!group.members[0].respawn)onPermanentDeath(id);}
   if(group.dead.size===group.members.length){for(const handle of group.handles.values())safeRemove(handle);group.handles.clear();release(group);if(group.members[0].respawn){group.state='waiting';group.remaining=group.members[0].delaySeconds;}else group.state='complete';}
  }
  else if(['waiting','capacity-wait','prepare-wait'].includes(group.state))group.remaining=Math.max(0,group.remaining-dt);
 }startReady();}
 return {load,leave,update,inspect:()=>[...groups.values()].map(g=>({id:g.id,state:g.state,remaining:g.remaining,initialDelaySeconds:g.initialDelaySeconds,count:g.members.length,preparedCount:g.preparedCount,dead:g.dead.size,capacityReason:g.capacityReason??null,admitted:!!g.admitted,prepareQueueMs:g.startedAt===null?null:Math.max(0,g.startedAt-loadedAt),preparationWallMs:g.readyAt===null||g.startedAt===null?null:Math.max(0,g.readyAt-g.startedAt),readyElapsedMs:g.readyAt===null?null:Math.max(0,g.readyAt-loadedAt),firstShownMs:g.firstShownAt==null?null:Math.max(0,g.firstShownAt-loadedAt)})),dispose(){if(disposed)return;leave();disposed=true;}};
}
