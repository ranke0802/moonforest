// Chapter-one camps use the existing forest paths and cave clearings.
// Keep the arrival, the cave mouth and Elena's arena free for story staging.
const camp = (id, x, z, members) => members.map(([kind, dx, dz], i) =>
  Object.freeze({id:id+'-'+i,kind,x:x+dx,z:z+dz,yaw:Math.atan2(-dx,-dz),
    home:Object.freeze({x,z,radius:13,combatRadius:7.2,wanderRadius:2.1,returnRadius:1,reengageRadius:10})}));
export const CHAPTER_CAMPS = Object.freeze({
  'monster-forest': Object.freeze([
    ...camp('trail-scouts',3,27,[['goblin-warrior',-1,0],['goblin-archer',1.7,1]]),
    ...camp('camp-west',0,1,[['goblin-warrior',-2,-.3],['goblin-warrior',.7,.3],['goblin-archer',2,2.7]]),
    ...camp('camp-east',28,12,[['goblin-warrior',1,-1],['goblin-archer',-1.8,.6]]),
    ...camp('grove',-20,-27,[['goblin-shaman',0,0],['goblin-warrior',-1.5,1.5]]),
    ...camp('inner-guard',26,-32,[['hobgoblin-boss',-1,0],['goblin-shaman',2,1.7]]),
  ]),
  'witch-cave': Object.freeze([
    ...camp('drowned-road',-15,34,[['zombie',0,0]]),
    ...camp('black-wolf',-29,18,[['corrupted-wolf',0,0]]),
    ...camp('black-bear',17,26,[['corrupted-bear',0,0]]),
    ...camp('ghoul-patrol',31,10,[['ghoul-warrior',0,0]]),
  ]),
});
const goblins=new Set(['goblin-warrior','goblin-archer','goblin-shaman','hobgoblin-boss']);
export function chapterQuestFamily(kind){return goblins.has(kind)?'goblin':kind;}

// The caller owns one visit. Admissions run serially, proximity checks at 4 Hz;
// movement, animation and hits are handled once by the normal battle update.
export function createChapterWildlife({world,battle,getPlayer,makeEnemies,makeBeasts,onDefeat,onError=console.warn}) {
  let disposed=false, pending=false, age=0, next=0;
  const map=world.mapId, rows=CHAPTER_CAMPS[map]??[], live=new Map(), defeated=new Set(), retry=new Map();
  const current=()=>!disposed && world.mapId===map && !world.scene.isDisposed;
  function defeatedAt(event){
    if(!current()||defeated.has(event.id))return;
    defeated.add(event.id);
    onDefeat({...event,family:chapterQuestFamily(event.kind)});
  }
  let enemies, beasts;
  return {
    update(dt){
      if(!current())return;
      age+=dt;if(age<next)return;next=age+.25;
      const player=getPlayer();if(!player)return;
      const pos=player.position;
      for(const [id,handle] of live){
        const actor=handle.encounter;
        if(actor.corpseGone||(!actor.active&&defeated.has(id))||
          (!defeated.has(id)&&actor.actor&&Math.hypot(actor.actor.position.x-pos.x,actor.actor.position.z-pos.z)>39)){
          live.delete(id);handle.dispose();
        }
      }
      if(pending||live.size>=6)return;
      let chosen=null,closest=25*25;
      for(const row of rows){
        if(live.has(row.id)||defeated.has(row.id)||age<(retry.get(row.id)??0))continue;
        const dist=(row.x-pos.x)**2+(row.z-pos.z)**2;
        if(dist>=3*3&&dist<closest){chosen=row;closest=dist;}
      }
      if(!chosen)return;
      const beast=chosen.kind.startsWith('corrupted-');
      const factory=beast?(beasts??=makeBeasts({world,battle,onDefeat:defeatedAt})):(enemies??=makeEnemies({world,battle,onDefeat:defeatedAt}));
      pending=true;
      return Promise.resolve().then(()=>current()?factory.create({...chosen,player,isCurrent:current}):null)
        .then(handle=>{if(!handle)return;if(!current()){handle.dispose();return;}live.set(chosen.id,handle);handle.encounter.questFamily=chapterQuestFamily(chosen.kind);})
        .catch(error=>{if(current()){retry.set(chosen.id,age+15);onError('[MoonForest] '+chosen.id,error);}})
        .finally(()=>{pending=false;});
    },
    dispose(){if(disposed)return;disposed=true;for(const handle of live.values())handle.dispose();live.clear();enemies?.dispose();beasts?.dispose();}
  };
}
