// One scheduler per map, driven by the existing game tick. The host owns actors.
export function createMonsterGroupScheduler({spawn,commit=()=>{},canCommit=()=>true,canLaunch=()=>true,releaseAdmission=()=>{},remove=()=>{},isAlive=()=>true,onPermanentDeath=()=>{},onError=()=>{},random=Math.random,preparationGroups=Infinity,now=()=>performance.now(),focus=null}){
 let generation=0,groups=new Map(),disposed=false,paused=true,loadedAt=0,warming=false,warmSet=null;const preparationLimit=Number.isFinite(preparationGroups)?Math.max(1,Math.floor(preparationGroups)):Infinity;
 const safeRemove=handle=>{try{remove(handle);}catch(error){onError(error);}};
 const release=group=>{if(!group.admitted)return;group.admitted=false;try{releaseAdmission(group.members);}catch(error){onError(error);}};
 const FAILED_RETRY_SECONDS=6;
 const cancel=prepared=>{for(const [,old] of prepared)safeRemove(old);};
 function leave(){generation++;paused=true;for(const group of groups.values()){for(const handle of group.handles.values())safeRemove(handle);release(group);}groups=new Map();}
 function load(rows,{permanentlyDead=[]}={}){leave();loadedAt=now();const dead=new Set(permanentlyDead);for(const row of rows){if(dead.has(row.id))continue;let group=groups.get(row.groupId);if(!group){const delay=row.spawnMode==='start'?0:row.delaySeconds*(.5+random());group={id:row.groupId,members:[],handles:new Map(),dead:new Set(),state:'waiting',remaining:delay,initialDelaySeconds:delay,pending:false,preparedCount:0,startedAt:null,readyAt:null,firstShownAt:null};groups.set(row.groupId,group);}group.members.push(row);}}
 async function launch(group){
  const epoch=generation;group.pending=true;group.state='preparing';group.startedAt=now();group.readyAt=null;group.firstShownAt=null;group.preparedCount=0;const prepared=[],failed=[];
  // Each member appears as soon as it is ready (the leader is listed first),
  // instead of the whole pack waiting for its last model. A member that fails
  // to load sits this cycle out: it never takes already-shown packmates (the
  // one the player may be fighting) down with it.
  const shown=group.shown=new Set();const current=()=>!disposed&&generation===epoch;
  try{
   for(const row of group.members){
    let handle;
    try{handle=await spawn(row,{isCurrent:current});}
    catch(error){if(!current())return cancel(prepared);failed.push(row.id);onError(error);continue;}
    if(!current()){safeRemove(handle);return cancel(prepared);}
    prepared.push([row.id,handle]);group.preparedCount=prepared.length;
    if(canCommit()){commit([handle]);shown.add(handle);group.firstShownAt??=now();}
   }
   if(!prepared.length){release(group);group.state='waiting';group.remaining=FAILED_RETRY_SECONDS;return;}
   group.handles=new Map(prepared);group.dead=new Set(failed);group.state='prepared';group.readyAt=now();
   const rest=[...group.handles.values()].filter(handle=>!shown.has(handle));if(!rest.length||canCommit()){if(rest.length){commit(rest);for(const handle of rest)shown.add(handle);}group.state='active';}
  }catch(error){for(const [,handle] of prepared)safeRemove(handle);group.handles.clear();release(group);if(current()){group.state='waiting';group.remaining=FAILED_RETRY_SECONDS;onError(error);}}
  finally{if(generation===epoch){group.pending=false;startReady();}}
 }
 // focus() → {x,z} | {player,spot} | null. Packs the player can already see
 // (within NEAR_FOCUS of them) come first, nearest first; the rest are
 // prepared nearest the quest spot (else the player).
 const NEAR_FOCUS=45;
 function byFocus(){
  const list=[...groups.values()],value=focus?.(),valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
  const player=valid(value?.player)?value.player:valid(value)?value:null,spot=valid(value?.spot)?value.spot:null;
  if(!player&&!spot)return list;
  const gap=(group,point)=>{let best=Infinity;for(const row of group.members){const d=(row.x-point.x)**2+(row.z-point.z)**2;if(d<best)best=d;}return Math.sqrt(best);};
  const key=group=>{const near=player?gap(group,player):Infinity;return near<=NEAR_FOCUS?[0,near]:[1,spot?gap(group,spot):near];};
  return list.map(group=>[key(group),group]).sort((a,b)=>a[0][0]-b[0][0]||a[0][1]-b[0][1]).map(entry=>entry[1]);
 }
 // Packs worth preparing behind the loading screen: those the player can see
 // on arrival (within NEAR_FOCUS). Far packs are prepared one at a time in
 // play instead (phone record 2026-11-19 10:04: warming every pack made the
 // plains load 32 s and three packs still arrived late).
 const WARM_FALLBACK=2;
 function nearPlayer(){
  const value=focus?.(),valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
  const player=valid(value?.player)?value.player:valid(value)?value:null;
  const ordered=byFocus();
  if(!player)return new Set(ordered.slice(0,WARM_FALLBACK));
  const near=new Set();for(const group of ordered){let best=Infinity;for(const row of group.members){const d=(row.x-player.x)**2+(row.z-player.z)**2;if(d<best)best=d;}if(Math.sqrt(best)<=NEAR_FOCUS)near.add(group);}
  return near;
 }
 function startReady(){
  if(disposed||!warming&&(paused||!canCommit()))return;let preparing=[...groups.values()].filter(group=>group.pending).length;
  for(const group of byFocus())if(['waiting','capacity-wait','prepare-wait'].includes(group.state)&&group.remaining===0){
   if(warming&&warmSet&&!warmSet.has(group))continue;
   if(preparing>=preparationLimit){group.state='prepare-wait';continue;}
   const admission=canLaunch(group.members);if(admission!==true){group.state='capacity-wait';group.capacityReason=typeof admission==='string'?admission:'capacity';continue;}
   group.admitted=true;group.capacityReason=null;preparing++;void launch(group);
  }
 }
 function update(dt,{paused:isPaused=false}={}){paused=isPaused;if(disposed||paused)return;dt=Math.max(0,Number.isFinite(dt)?dt:0);for(const group of groups.values()){
  if(group.pending)continue;
  if(group.state==='prepared'){if(!canCommit())continue;const rest=[...group.handles.values()].filter(handle=>!group.shown?.has(handle));try{if(rest.length)commit(rest);group.state='active';}catch(error){for(const handle of group.handles.values())safeRemove(handle);group.handles.clear();release(group);group.state='waiting';group.remaining=2;onError(error);}}
  else if(group.state==='active'){
   for(const [id,handle] of group.handles)if(!group.dead.has(id)&&!isAlive(handle)){group.dead.add(id);if(!group.members[0].respawn)onPermanentDeath(id);}
   if(group.dead.size===group.members.length){for(const handle of group.handles.values())safeRemove(handle);group.handles.clear();release(group);if(group.members[0].respawn){group.state='waiting';group.remaining=group.members[0].delaySeconds;}else group.state='complete';}
  }
  else if(['waiting','capacity-wait','prepare-wait'].includes(group.state))group.remaining=Math.max(0,group.remaining-dt);
 }startReady();}
 // Behind the loading screen: prepare the packs near the player that are due now (clone,
 // shaders, outlines) while the game is not running, leaving them hidden. The
 // next update reveals them, so arriving costs no model work in play
 // (phone record 2026-11-19: ~13 s at 15-35 fps after entering the plains).
 async function prewarm({deadlineMs=20000}={}){
  if(disposed)return;const epoch=generation,until=now()+deadlineMs;warmSet=nearPlayer();warming=true;
  try{
   startReady();
   const busy=()=>[...warmSet].some(group=>group.pending||group.remaining===0&&group.state==='prepare-wait');
   while(!disposed&&generation===epoch&&busy()&&now()<until)await new Promise(resolve=>setTimeout(resolve,50));
  }finally{warming=false;warmSet=null;}
 }
 return {load,leave,update,prewarm,inspect:()=>[...groups.values()].map(g=>({id:g.id,state:g.state,remaining:g.remaining,initialDelaySeconds:g.initialDelaySeconds,count:g.members.length,preparedCount:g.preparedCount,dead:g.dead.size,capacityReason:g.capacityReason??null,admitted:!!g.admitted,prepareQueueMs:g.startedAt===null?null:Math.max(0,g.startedAt-loadedAt),preparationWallMs:g.readyAt===null||g.startedAt===null?null:Math.max(0,g.readyAt-g.startedAt),readyElapsedMs:g.readyAt===null?null:Math.max(0,g.readyAt-loadedAt),firstShownMs:g.firstShownAt==null?null:Math.max(0,g.firstShownAt-loadedAt)})),dispose(){if(disposed)return;leave();disposed=true;}};
}
