import {CHAPTER_POINTS} from '../chapter-quest-points.js';
import {createQuestProps} from '../chapter-quest-props.js';
import {chestVanishCoverage} from '../chest-opening.js';
import {createItemDropView} from '../item-drop-view.js';
import {scatterChestLoot,lootSeed} from '../chest-loot-motion.js';
import {TOWN_ITEMS,monsterRewards,treasureRewards} from './town-items.js';
import {MAX_GROUND_DROPS} from './town-economy.js';
import {language,t} from './i18n.js';
import {createPickupNotice} from './pickup-notice.js';

const modelFor=id=>TOWN_ITEMS[id].quick?'contaminated-vial':id==='moon-herb'?'moon-dew-herb':TOWN_ITEMS[id].slot==='sword'?'goblin-club':'clue-satchel';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
// An opened chest disappears after this many seconds; a looted one never comes back
// (user, 2026-11-24). The record is economy.state.opened, saved per slot.
export const CHEST_VANISH_SECONDS=5;
export function createTownTreasure({root,world,economy,canInteract,player,sound,props=createQuestProps(world,{vanishOpenedAfter:CHEST_VANISH_SECONDS}),makeDrops=createItemDropView,fieldChestsEnabled=new URLSearchParams(globalThis.location?.search).get('fieldChests')!=='0'}){
 let drops=null,map=null,points=[],nearest=null,nearDrops=[],stamp=-1,clock=0,nextScan=0,loaded=false,hadVisibleDrops=false;
 let loading=false,retryAt=0,seenFailures=props.stats.modelFailures;
 let labelTier=0,labelLang='';
 const vanishingAuthored=new Map();
 let lastAuthoredRuntime=null;
 const doc=root.ownerDocument,button=doc.createElement('button'),pickup=createPickupNotice(root);
 button.type='button';button.className='mf-treasure-prompt';button.hidden=true;root.append(button);
 const visual=()=>drops??=makeDrops(world,{onError:e=>console.warn('[Town items]',e)});
 const clear=()=>{pickup.clear();props.release();drops?.clear();map=null;points=[];nearest=null;nearDrops=[];clock=0;nextScan=0;stamp=-1;loaded=false;loading=false;retryAt=0;seenFailures=props.stats.modelFailures;hadVisibleDrops=false;button.hidden=true;vanishingAuthored.clear();lastAuthoredRuntime=null;};
 const ground=(point)=>world.terrain?.heightAt?.(point.x,point.z)??0;
 const reach=(from,to)=>!world.navigation||world.navigation.segmentClear(from,to,.06,true);
 function scatter(id,position,rewards,tier,experience=0){
  const entries=Object.entries(rewards);if(!entries.length)return false;
  // The existing monster drop is one pickup for the kill; chest prizes scatter separately.
  const piles=tier?entries.map(([item,count])=>({[item]:count})):[rewards];
  const poses=scatterChestLoot(world,position,piles.length,lootSeed(id));
  const rows=piles.map((prize,i)=>({id:(tier?'chest:':'foe:')+id+':'+i,mapId:world.mapId,model:modelFor(Object.keys(prize)[0]),...poses[i],
   rewards:prize,tier:tier||1,effectEnabled:!!tier}));
  const ok=economy.scatter(rows,tier?id:null,experience);if(ok)nextScan=0;return ok;
 }
 function open(point){
  const pos=player();if(!point||!pos||!canInteract()||dist(pos,point)>3||economy.state.opened.includes(point.id))return false;
  const contact=point.authored?world.authoredPlacements?.chestInteractionPoint?.(point.authored,pos)??point:point;
  if(!reach(pos,contact))return false;
  if(!scatter(point.id,{x:point.x,z:point.z,y:ground(point)},treasureRewards(point.tier),point.tier))return false;
  if(point.authored){
   world.authoredPlacements?.openChest(point.authored);
   vanishingAuthored.set(point.authored,clock+CHEST_VANISH_SECONDS);
  }else props.openChest(point,{time:clock});
  visual().openChest?.({x:point.x,z:point.z,y:ground(point)},point.tier);
  sound('gold_pickup');nearest=null;button.hidden=true;return true;
 }
 const openAuthored=id=>{
  if(map!==world.mapId)enter();
  if(world.authoredPlacements!==lastAuthoredRuntime)syncAuthored();
  const record=world.authoredPlacements?.records?.get(id);
  if(record?.instance?.assetId!=='chest-common'||!record.chestOpening||record.root?.isEnabled()===false)return false;
  const p=record.root.getAbsolutePosition();
  return open({id:'placed:'+world.mapId+':'+id,authored:id,x:p.x,z:p.z,tier:record.instance.chest?.tier??1});
 };
 const authoredOpened=id=>economy.state.opened.includes('placed:'+world.mapId+':'+id);
 function syncAuthored(){
  const runtime=world.authoredPlacements;
  if(!runtime?.setLootedChests)return;
  const prefix='placed:'+world.mapId+':',hidden=[];
  for(const key of economy.state.opened){
   if(!key.startsWith(prefix))continue;
   const id=key.slice(prefix.length);
   if(!vanishingAuthored.has(id))hidden.push(id);
  }
  runtime.setLootedChests(hidden,{resetOpenState:lastAuthoredRuntime!==runtime});
  lastAuthoredRuntime=runtime;stamp=world.placementRevision??0;
 }
 world.openAuthoredChest=openAuthored;world.isAuthoredChestOpened=authoredOpened;
 button.onclick=()=>open(nearest);
 function onKey(e){if(e.code==='KeyE'&&!e.repeat&&!e.defaultPrevented&&nearest&&!world.v03?.story?.near&&open(nearest)){e.preventDefault();e.stopImmediatePropagation();}}
 doc.defaultView.addEventListener('keydown',onKey,true);
 function enter(){
  clear();map=world.mapId;
  if(!fieldChestsEnabled)return;
  points=CHAPTER_POINTS.filter(p=>p.treasure&&p.map===map&&!economy.state.opened.includes(p.id)).map(p=>{
   const free=world.navigation?.findFree?.(p,.62,world.plains?105:world.cave?64:world.forest?55:48)??p;
   return {...p,x:free.x,z:free.z,opened:false,wasLooted:false};
  });
 }
 return {clear,
  collectGold(amount){if(world.v03?.playing&&amount>0)pickup.show({gold:amount});},
  defeat(event,experience=0){if(!world.v03?.playing||!event?.position)return false;const rewards=monsterRewards(event.kind);
   // The field has a fixed pickup budget across maps. Preserve the guaranteed boss trophy
   // and its kill XP in one ledger write when every ground slot is occupied.
   if(rewards['alpha-wolf-fang']&&economy.state.drops.length>=MAX_GROUND_DROPS){
    const before=economy.state.bag['alpha-wolf-fang']??0;
    if(!economy.grant('alpha-wolf-fang',1,experience))return false;
    pickup.show({'alpha-wolf-fang':economy.state.bag['alpha-wolf-fang']-before});return true;
   }
   return scatter(globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+Math.random().toString(36).slice(2),event.position,rewards,0,experience);
  },
  tick(dt){
   if(!world.v03?.playing){if(map)clear();return;}
   const me=player();if(!me)return;if(map!==world.mapId)enter();
   clock+=dt;
   if(vanishingAuthored.size){
    let expired=false;
    for(const [id,at] of vanishingAuthored){
     const remaining=at-clock;
     world.authoredPlacements?.records?.get(id)?.chestOpening?.setCoverage?.(chestVanishCoverage(remaining));
     if(remaining<=0){vanishingAuthored.delete(id);expired=true;}
    }
    if(expired)syncAuthored();
   }
   if(clock>=nextScan){
    nextScan=clock+.22;
    if(world.authoredPlacements&&(world.authoredPlacements!==lastAuthoredRuntime||stamp!==(world.placementRevision??0)))syncAuthored();
    if(loaded&&props.stats.modelFailures!==seenFailures){
     seenFailures=props.stats.modelFailures;
     props.release();loaded=false;retryAt=clock+8;
    }
    if(!loaded&&!loading&&clock>=retryAt&&points.some(p=>dist(me,p)<30)){
     const visit=points;
     loading=true;
     void props.load(visit).then(ready=>{
      if(visit!==points)return;
      loaded=ready;
      if(ready)nextScan=0;
     }).catch(error=>{
      if(visit===points)console.warn('[Field chests]',error);
     }).finally(()=>{
      if(visit!==points)return;
      loading=false;if(!loaded)retryAt=clock+8;
     });
    }
    if(loaded)props.update(points,me,()=>true);
    let interactionAllowed;
    nearest=loaded&&!world.v03?.story?.near?points.find(p=>{
     if(p.opened||dist(me,p)>=2.8)return false;
     interactionAllowed??=canInteract();
     return interactionAllowed&&props.isReady(p)&&reach(me,p);
    })??null:null;
    button.hidden=!nearest;
    if(nearest&&(nearest.tier!==labelTier||language()!==labelLang)){
     labelTier=nearest.tier;labelLang=language();button.textContent=t('treasure.open',{tier:labelTier});
    }
    nearDrops=economy.state.drops.filter(d=>d.mapId===map&&dist(me,d.position)<24);
    const take=nearDrops.filter(d=>dist(me,d.position)<=1.3&&drops?.ready(d.id)&&reach(me,d.position)).map(d=>d.id);
    if(take.length){
     const before=economy.state.bag,gains=economy.collect(take);
     if(gains){
      nearDrops=nearDrops.filter(d=>!take.includes(d.id));sound('gold_pickup');
      // The bag caps each item stack. Report only what actually entered it.
      for(const id of Object.keys(gains))gains[id]=(economy.state.bag[id]??0)-(before[id]??0);
      pickup.show(gains);
     }
    }
   }
   if(loaded)props.animate(clock);
   if(nearDrops.length){visual().sync(nearDrops,dt);hadVisibleDrops=true;}else if(hadVisibleDrops){drops?.sync([],dt);hadVisibleDrops=false;}
  },
  dispose(){clear();pickup.dispose();props.dispose();drops?.dispose();button.remove();doc.defaultView.removeEventListener('keydown',onKey,true);
   if(world.openAuthoredChest===openAuthored)delete world.openAuthoredChest;if(world.isAuthoredChestOpened===authoredOpened)delete world.isAuthoredChestOpened;
  }};
}
