import {lootRarity,itemRarity} from './loot-rarity.js';
import {ITEM_DROP_MODELS} from './item-drop-data.js';

export const LOOT_FLIGHT_SECONDS=1.28;
export const LOOT_LANDING_SECONDS=.32;
export const chestEffectProfile=tier=>({tier:lootRarity(tier).tier,color:lootRarity(tier).color,sparks:8+lootRarity(tier).tier*4,size:.07+lootRarity(tier).tier*.012});
export function lootSeed(id){let value=2166136261;for(const c of id)value=Math.imul(value^c.charCodeAt(0),16777619);return (value>>>0)/4294967296;}
export function dropItemTier(drop){
 const items=Object.keys(drop.rewards??{}).filter(id=>id!=='gold'),matching=items.filter(id=>ITEM_DROP_MODELS[id]===drop.model);
 return matching.length?Math.max(...matching.map(id=>itemRarity(id).tier)):items.length?Math.max(...items.map(id=>itemRarity(id).tier)):drop.rewards?.gold?5:1;
}
export function scatterChestLoot(world,position,count,seed=0){
 const ground=world.terrain?.heightAt?.(position.x,position.z)??0,origin={x:position.x,y:(Number.isFinite(position.y)?position.y:ground)+.55,z:position.z},placed=[];
 for(let i=0;i<count;i++){
  const angle=seed*Math.PI*2+i*2.399963229728653,radius=count===1?1.65:1.55+Math.sqrt((i+.5)/count)*1.35;let landing=null;
  for(const distance of [radius,radius*.8,radius*.55,1,.6,.3,0]){
   for(const turn of [0,.32,-.32,.7,-.7,1.2,-1.2]){
    const p={x:position.x+Math.cos(angle+turn)*distance,z:position.z+Math.sin(angle+turn)*distance};
    if(world.navigation?.free&&!world.navigation.free(p,.18))continue;
    if(world.navigation?.segmentClear&&!world.navigation.segmentClear(position,p,.12))continue;
    const y=world.terrain?.heightAt?.(p.x,p.z)??0;if(Math.abs(y-ground)>1.2)continue;
    if(distance>.3&&placed.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<.36))continue;
    landing={...p,y:y+.04};break;
   }
   if(landing)break;
  }
  landing??={x:position.x,y:ground+.04,z:position.z};placed.push(landing);
 }
 return placed.map(position=>({origin:{...origin},position}));
}

// A ballistic arc, then two diminishing ground bounces. The rest orientation
// returns to upright; no physics simulation or terrain work runs per frame.
export function sampleChestFlight(drop,age,seed=lootSeed(drop.id)){
 const duration=LOOT_FLIGHT_SECONDS+seed*.16,t=Math.min(1,age/duration),u=Math.max(0,Math.min(1,(age-duration)/LOOT_LANDING_SECONDS));
 const height=1.65+seed*.55,bounce=t<1?4*t*(1-t)*height:Math.sin(u*Math.PI*2)*Math.sin(u*Math.PI*2)*.16*(1-u);
 return {x:drop.origin.x+(drop.position.x-drop.origin.x)*t,y:drop.origin.y+(drop.position.y-drop.origin.y)*t+bounce,z:drop.origin.z+(drop.position.z-drop.origin.z)*t,tilt:t<1?Math.sin(Math.PI*t)*.65:Math.sin(Math.PI*u)*.13*(1-u),turn:(1-t)*(2.5+seed*3),settled:age>=duration+LOOT_LANDING_SECONDS};
}
