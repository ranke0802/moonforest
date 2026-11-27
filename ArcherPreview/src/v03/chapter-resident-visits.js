import {createWaveRaid} from './defense-waves.js';

const supported=new Set(['monster-forest','witch-cave','village']);
const RETRIES=3,RETRY_SECONDS=5;

// Each import and its scene objects belong to exactly one visit. Starting a
// new game, returning to title or changing map invalidates outstanding work.
export function createChapterResidentVisits({world,battle,getPlayer,onDefeat,
  petsEnabled=new URLSearchParams(globalThis.location?.search).get('pets')!=='0',
  loadVillage=()=>import('./village-pets.js'),
  campsEnabled=new URLSearchParams(globalThis.location?.search).get('chapterCamps')!=='0',
  loadCamp=()=>Promise.all([import('./chapter-wildlife.js'),import('./chapter-enemy-encounter.js')]),
  loadBeasts=()=>import('./corrupted-beasts.js'),onError=console.warn}) {
  let map=null, generation=0, actors=null, preparing=null, disposed=false, raid=null;
  // A visit whose residents failed to load (a module or model that did not arrive) tries
  // again a few times instead of staying empty for the rest of the visit (2026-11-27).
  let loading=false, failedAt=-1, failures=0, clock=0, lastError=null;
  function leave(){
    generation++;map=null;preparing=null;loading=false;failedAt=-1;actors?.dispose();actors=null;raid?.dispose();raid=null;
  }
  function enter(next,again=false){
    if(!supported.has(next)||disposed){if(map)leave();return;}
    if(map===next)return preparing;
    leave();map=next;if(!again)failures=0;
    const token=generation;loading=true;
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
      if(current()&&actors?.prepare)await actors.prepare();
      const player=current()&&actors&&getPlayer();
      if(player)await actors.update(0,player.position);
    })().catch(error=>{if(current()){failures++;failedAt=clock;lastError=String(error?.message??error).slice(0,160);onError('[MoonForest] residents of '+next,error);}})
      .finally(()=>{if(generation===token)loading=false;});
    return preparing;
  }
  // Jeffrey's defense errand (defense-waves.js): this village visit's raid, made on first use.
  function raidFor(){
    if(disposed||map!=='village'||world.mapId!=='village')return null;
    return raid??=createWaveRaid({world,battle,getPlayer,onDefeat,onError,loadEnemies:()=>loadCamp().then(([,enemies])=>enemies)});
  }
  // Diagnostics for the frame recording (main.js probe): what this visit's residents are doing.
  function inspect(){return map?{map,loading,ready:!!actors,failures,lastError,...(actors?.inspect?.()??{})}:null;}
  return {enter,leave,inspect,raid:raidFor,update(dt,playing,paused=false){
    if(!playing){if(map)leave();return;}
    if(paused)return;
    clock+=dt;
    if(world.mapId!==map){if(map||supported.has(world.mapId))enter(world.mapId);return;}
    if(!actors&&!loading&&failedAt>=0&&failures<=RETRIES&&clock-failedAt>=RETRY_SECONDS){const next=map;leave();enter(next,true);return;}
    if(actors){const player=getPlayer();if(player)actors.update(dt,player.position);}
    raid?.update(dt);
  },dispose(){disposed=true;leave();}};
}
