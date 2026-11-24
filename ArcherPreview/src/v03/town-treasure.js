import {CHAPTER_POINTS} from '../chapter-quest-points.js';
import {createQuestProps} from '../chapter-quest-props.js';
import {createItemDropView} from '../item-drop-view.js';
import {scatterChestLoot,lootSeed} from '../chest-loot-motion.js';
import {TOWN_ITEMS,monsterRewards,treasureRewards} from './town-items.js';

const modelFor=id=>TOWN_ITEMS[id].quick?'contaminated-vial':id==='moon-herb'?'moon-dew-herb':TOWN_ITEMS[id].slot==='sword'?'goblin-club':'clue-satchel';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function createTownTreasure({root,world,economy,canInteract,player,notify,sound}){
 const props=createQuestProps(world);let drops=null,map=null,points=[],nearest=null,nearDrops=[],stamp=-1,clock=0,nextScan=0,loaded=false,hadVisibleDrops=false;
 const doc=root.ownerDocument,button=doc.createElement('button');
 button.type='button';button.className='mf-treasure-prompt';button.hidden=true;root.append(button);
 const visual=()=>drops??=createItemDropView(world,{onError:e=>console.warn('[Town items]',e)});
 const clear=()=>{props.release();drops?.clear();map=null;points=[];nearest=null;nearDrops=[];clock=0;nextScan=0;stamp=-1;loaded=false;button.hidden=true;};
 const ground=(point)=>world.terrain?.heightAt?.(point.x,point.z)??0;
 const reach=(from,to)=>!world.navigation||world.navigation.segmentClear(from,to,.06,true);
 function scatter(id,position,rewards,tier){
  const entries=Object.entries(rewards);if(!entries.length)return false;
  // The existing monster drop is one pickup for the kill; chest prizes scatter separately.
  const piles=tier?entries.map(([item,count])=>({[item]:count})):[rewards];
  const poses=scatterChestLoot(world,position,piles.length,lootSeed(id));
  const rows=piles.map((prize,i)=>({id:(tier?'chest:':'foe:')+id+':'+i,mapId:world.mapId,model:modelFor(Object.keys(prize)[0]),...poses[i],
   rewards:prize,tier:tier||1,effectEnabled:!!tier}));
  const ok=economy.scatter(rows,tier?id:null);if(ok)nextScan=0;return ok;
 }
 function open(point){
  const pos=player();if(!point||!pos||!canInteract()||dist(pos,point)>3||!reach(pos,point)||economy.state.opened.includes(point.id))return false;
  if(!scatter(point.id,{x:point.x,z:point.z,y:ground(point)},treasureRewards(point.tier),point.tier))return false;
  if(point.authored)world.authoredPlacements?.openChest(point.authored);else props.openChest(point);
  visual().openChest?.({x:point.x,z:point.z,y:ground(point)},point.tier);
  sound('gold_pickup');nearest=null;button.hidden=true;return true;
 }
 const openAuthored=id=>{
  const record=world.authoredPlacements?.records?.get(id);
  if(record?.instance?.assetId!=='chest-common'||!record.chestOpening||record.root?.isEnabled()===false)return false;
  const p=record.root.getAbsolutePosition();
  return open({id:'placed:'+world.mapId+':'+id,authored:id,x:p.x,z:p.z,tier:record.instance.chest?.tier??1});
 };
 const authoredOpened=id=>economy.state.opened.includes('placed:'+world.mapId+':'+id);
 world.openAuthoredChest=openAuthored;world.isAuthoredChestOpened=authoredOpened;
 button.onclick=()=>open(nearest);
 function onKey(e){if(e.code==='KeyE'&&!e.repeat&&!e.defaultPrevented&&nearest&&!world.v03?.story?.near&&open(nearest)){e.preventDefault();e.stopImmediatePropagation();}}
 doc.defaultView.addEventListener('keydown',onKey,true);
 function enter(){
  clear();map=world.mapId;
  points=CHAPTER_POINTS.filter(p=>p.treasure&&p.map===map).map(p=>{
   const free=world.navigation?.findFree?.(p,.62,world.plains?105:world.cave?64:world.forest?55:48)??p;
   return {...p,x:free.x,z:free.z,opened:economy.state.opened.includes(p.id),wasLooted:economy.state.opened.includes(p.id)};
  });
 }
 return {clear,
  defeat(event){if(!world.v03?.playing||!event?.position)return;const rewards=monsterRewards(event.kind);
   scatter(globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+Math.random().toString(36).slice(2),event.position,rewards,0);
  },
  tick(dt){
   if(!world.v03?.playing){if(map)clear();return;}
   const me=player();if(!me)return;if(map!==world.mapId)enter();
   clock+=dt;
   if(clock>=nextScan){
    nextScan=clock+.22;
    const authored=world.authoredPlacements?.records;
    if(authored&&stamp!==(world.placementRevision??0)){
     stamp=world.placementRevision??0;
     for(const [id,r] of authored)if(r.chestOpening&&authoredOpened(id))world.authoredPlacements.openChest(id,{immediate:true});
    }
    if(!loaded&&points.some(p=>dist(me,p)<30)){
     loaded=true;void props.load(points).then(()=>{if(!world.scene.isDisposed)nextScan=0;}).catch(e=>console.warn('[Field chests]',e));
    }
    if(loaded)props.update(points,me,()=>true);
    nearest=canInteract()&&!world.v03?.story?.near?points.find(p=>!p.opened&&dist(me,p)<2.8&&props.isReady(p)&&reach(me,p)):null;
    button.hidden=!nearest;if(nearest){const label='Open · Tier '+nearest.tier;if(button.textContent!==label)button.textContent=label;}
    nearDrops=economy.state.drops.filter(d=>d.mapId===map&&dist(me,d.position)<24);
    const take=nearDrops.filter(d=>dist(me,d.position)<=1.3&&drops?.ready(d.id)&&reach(me,d.position)).map(d=>d.id);
    if(take.length){const gains=economy.collect(take);
     if(gains){nearDrops=nearDrops.filter(d=>!take.includes(d.id));sound('gold_pickup');notify(Object.entries(gains).map(([id,n])=>TOWN_ITEMS[id].name+' ×'+n).join(' · '));}
    }
   }
   if(loaded)props.animate(clock);
   if(nearDrops.length){visual().sync(nearDrops,dt);hadVisibleDrops=true;}else if(hadVisibleDrops){drops?.sync([],dt);hadVisibleDrops=false;}
  },
  dispose(){clear();props.dispose();drops?.dispose();button.remove();doc.defaultView.removeEventListener('keydown',onKey,true);
   if(world.openAuthoredChest===openAuthored)delete world.openAuthoredChest;if(world.isAuthoredChestOpened===authoredOpened)delete world.isAuthoredChestOpened;
  }};
}
