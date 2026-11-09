// Independent, data-only events share the game's existing cinematic player.
export function createStoryboardEvents({storage,getMap,canStart,getCinema,recordQuest=()=>{},onError=()=>{}}){
 let story=null,queue=[],active=null,generation=0,disposed=false;
 const key=(id)=>'moonforest-story-event-v1:'+story.id+':'+id;
 function done(event){try{return event.once&&storage?.getItem(key(event.id))==='1';}catch{return false;}}
 function configure(doc){generation++;queue=[];story=doc;}
 function emit(trigger,{mapId=getMap(),targetId=''}={}){
  if(disposed||!story)return 0;let added=0;
  for(const event of story.events??[]){if(event.trigger!==trigger||event.mapId!==mapId||event.targetId&&event.targetId!==targetId||done(event)||queue.some(x=>x.event.id===event.id)||active?.event.id===event.id)continue;
   if(!event.sceneId&&!event.questKey)continue;queue.push({event,story,mapId,generation});added++;
  }
  return added;
 }
 async function finish(item){
  if(item!==active)return;
  try{if(item.cinema)await item.cinema.execute({command:'stop'});if(item.generation!==generation||disposed)return;
   if(item.event.questKey&&recordQuest(item.event.questKey,item.event,item.story)===false)throw Error(item.event.title+': 퀘스트 진행을 기록하지 못했습니다.');
   if(item.event.once)storage?.setItem(key(item.event.id),'1');
  }catch(error){onError(error);}finally{if(active===item)active=null;}
 }
 async function start(item){
  active=item;
  try{
   if(!item.event.sceneId){await finish(item);return;}
   const scene=item.story.scenes.find(s=>s.cutsceneId===item.event.sceneId);if(!scene)throw Error(`${item.event.title}: 컷씬을 연결하세요.`);
   item.cinema=await getCinema();if(item.generation!==generation||disposed)return;
   await item.cinema.hide();if(item.generation!==generation||disposed)return;await item.cinema.load(scene);
   if(item.generation!==generation||disposed){await item.cinema.execute({command:'stop'});return;}
   await item.cinema.execute({command:'play'});item.playing=true;
  }catch(error){onError(error);if(active===item)active=null;}
  finally{if(item.generation!==generation&&active===item)active=null;}
 }
 function update(){
  if(disposed)return;
  if(active){if(active.playing&&active.cinema?.player?.state==='completed'&&!active.finishing){active.finishing=true;void finish(active);}else if(active.playing&&['error','cancelled'].includes(active.cinema?.player?.state)){onError(Error(active.event.title+': 컷씬이 중단되었습니다.'));active=null;}return;}
  if(!canStart())return;
  while(queue.length){const item=queue.shift();if(item.generation===generation&&item.mapId===getMap()&&!done(item.event)){void start(item);break;}}
 }
 return {configure,emit,update,leaveMap(){generation++;queue=[];if(active?.playing)active=null;},inspect:()=>({queued:queue.length,active:active?.event.id??null}),dispose(){disposed=true;generation++;queue=[];}};
}
