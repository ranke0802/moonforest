// One scheduler per map, driven by the existing game tick. The host owns actors.
export function createMonsterGroupScheduler({spawn,commit=()=>{},canCommit=()=>true,remove=()=>{},isAlive=()=>true,onPermanentDeath=()=>{},onError=()=>{},random=Math.random}){
 let generation=0,groups=new Map(),disposed=false;
 const safeRemove=handle=>{try{remove(handle);}catch(error){onError(error);}};
 function leave(){generation++;for(const group of groups.values())for(const handle of group.handles.values())safeRemove(handle);groups=new Map();}
 function load(rows,{permanentlyDead=[]}={}){leave();const dead=new Set(permanentlyDead);for(const row of rows){if(dead.has(row.id))continue;let group=groups.get(row.groupId);if(!group){group={id:row.groupId,members:[],handles:new Map(),dead:new Set(),state:'waiting',remaining:row.spawnMode==='start'?0:row.delaySeconds*(.5+random()),pending:false};groups.set(row.groupId,group);}group.members.push(row);}}
 async function launch(group){
  const epoch=generation;group.pending=true;group.state='preparing';const prepared=[];
  try{for(const row of group.members){const handle=await spawn(row,{isCurrent:()=>!disposed&&generation===epoch});if(disposed||generation!==epoch){safeRemove(handle);for(const [,old] of prepared)safeRemove(old);return;}prepared.push([row.id,handle]);}
   if(disposed||generation!==epoch)return;group.handles=new Map(prepared);group.dead.clear();group.state='prepared';if(canCommit()){commit([...group.handles.values()]);group.state='active';}
  }catch(error){for(const [,handle] of prepared)safeRemove(handle);group.handles.clear();if(generation===epoch&&!disposed){group.state='waiting';group.remaining=2;onError(error);}}
  finally{if(generation===epoch)group.pending=false;}
 }
 function update(dt,{paused=false}={}){if(disposed||paused)return;dt=Math.max(0,Number.isFinite(dt)?dt:0);for(const group of groups.values()){
  if(group.pending)continue;
  if(group.state==='prepared'){if(!canCommit())continue;try{commit([...group.handles.values()]);group.state='active';}catch(error){for(const handle of group.handles.values())safeRemove(handle);group.handles.clear();group.state='waiting';group.remaining=2;onError(error);}}
  else if(group.state==='active'){
   for(const [id,handle] of group.handles)if(!group.dead.has(id)&&!isAlive(handle)){group.dead.add(id);if(!group.members[0].respawn)onPermanentDeath(id);}
   if(group.dead.size===group.members.length){for(const handle of group.handles.values())safeRemove(handle);group.handles.clear();if(group.members[0].respawn){group.state='waiting';group.remaining=group.members[0].delaySeconds;}else group.state='complete';}
  }
  else if(group.state==='waiting'){group.remaining=Math.max(0,group.remaining-dt);if(group.remaining===0)void launch(group);}
 }}
 return {load,leave,update,inspect:()=>[...groups.values()].map(g=>({id:g.id,state:g.state,remaining:g.remaining,count:g.members.length,dead:g.dead.size})),dispose(){if(disposed)return;leave();disposed=true;}};
}
