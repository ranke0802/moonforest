const supported=new Set(['monster-forest','witch-cave','village']);

// Each import and its scene objects belong to exactly one visit. Starting a
// new game, returning to title or changing map invalidates outstanding work.
export function createChapterResidentVisits({world,battle,getPlayer,onDefeat,
  petsEnabled=new URLSearchParams(globalThis.location?.search).get('pets')!=='0',
  loadVillage=()=>import('./village-pets.js'),
  campsEnabled=new URLSearchParams(globalThis.location?.search).get('chapterCamps')!=='0',
  loadCamp=()=>Promise.all([import('./chapter-wildlife.js'),import('./chapter-enemy-encounter.js')]),
  loadBeasts=()=>import('./corrupted-beasts.js'),onError=console.warn}) {
  let map=null, generation=0, actors=null, preparing=null, disposed=false;
  function leave(){
    generation++;map=null;preparing=null;actors?.dispose();actors=null;
  }
  function enter(next){
    if(!supported.has(next)||disposed){if(map)leave();return;}
    if(map===next)return preparing;
    leave();map=next;
    const token=generation;
    const current=()=>!disposed&&generation===token&&world.mapId===next&&!world.scene.isDisposed;
    preparing=(async()=>{
      if(next==='village'){
        if(!petsEnabled)return;
        const {createVillagePets}=await loadVillage();
        if(current())actors=createVillagePets(world);
      }else{
        if(!campsEnabled)return;
        const [camp,enemies]=await loadCamp();
        if(!current())return;
        const beasts=next==='witch-cave'?await loadBeasts():null;
        if(current())actors=camp.createChapterWildlife({world,battle,getPlayer,onDefeat,makeEnemies:enemies.createChapterEnemyFactory,
          makeBeasts:beasts?.createCorruptedBeastFactory,onError});
      }
      const player=current()&&actors&&getPlayer();
      if(player)await actors.update(0,player.position);
    })().catch(error=>{if(current())onError('[MoonForest] residents of '+next,error);});
    return preparing;
  }
  return {enter,leave,update(dt,playing,paused=false){
    if(!playing){if(map)leave();return;}
    if(paused)return;
    if(world.mapId!==map){if(map||supported.has(world.mapId))enter(world.mapId);return;}
    if(actors){const player=getPlayer();if(player)actors.update(dt,player.position);}
  },dispose(){disposed=true;leave();}};
}
