// Which scenery files a map asks for at an arrival point, worked out before
// that map exists (2026-11-28, user: no loading wait at a region road).
//
// The real start plan (prepareVillageStart -> villageDemand) needs the loaded
// world: terrain heights, the placed roots, the arrival camera. This one needs
// only data, so it can run on the map being left. It keeps the same rules for
// range and LOD level and drops the two inputs it cannot know:
//   - the view direction: every direction is taken (the camera turns freely
//     within a second of arriving, and streaming asks for those files then);
//   - the camera position: each placement is measured from the nearest and the
//     farthest point the camera arm allows, and every level between is taken.
// So the list covers the real plan and adds to it; a file it misses is simply
// downloaded on arrival as before. tests/v03-next-map-prefetch.test.js holds it
// against the real plan on the shipped maps.
import {placementBounds} from '../village-demand.js';
import {villageLodTier,VILLAGE_LOD_COVERAGE} from '../village-lod.js';

// placementBounds reads ground height for the centre only. Reach and radius do
// not depend on it, and height differences on these maps are far inside the
// +12 m margin the demand rule itself keeps.
const FLAT=Object.freeze({terrain:Object.freeze({heightAt:()=>0})});
export const ARRIVAL_PLAN_SLICE=96;
// The camera also sits above its target; a few metres cover the steepest pitch.
const CAMERA_RISE=6;

// A level the device does not ship (touch has no level 0 for plain assets)
// falls to the next coarser one it has, as the streaming code does.
function levelFor(levels,wanted){
  let best=null;
  for(const level of levels){
    if(level.level===wanted)return level;
    if(level.level>wanted&&(!best||level.level<best.level))best=level;
  }
  if(best)return best;
  for(const level of levels)if(!best||level.level>best.level)best=level;
  return best;
}

// Generator: yields between slices so the caller can spread ~1,400 plains
// placements over several tasks. Returns [{id,level,priority,resources}],
// most wanted first.
export function* arrivalSceneryPlan({assets,placements,arrival,view,range,cave=false,slice=ARRIVAL_PLAN_SLICE}){
  const wanted=new Map(),reach=Math.max(0,view.reach??0),scale=(view.scale??1)**2,known=Number.isFinite(view.screenArea)&&view.screenArea>0&&view.minZ>0;
  const coverageAt=(radius,distance)=>{if(!known)return 0;const projected=radius*view.minZ/distance;return Math.PI*projected*projected/view.screenArea*scale;};
  let count=0;
  for(const placement of placements){
    if(++count%slice===0)yield count;
    const asset=assets.get(placement.asset);if(!asset)continue;
    const {radius}=placementBounds(FLAT,placement,asset.config);
    const flat=Math.hypot(placement.x-arrival.x,placement.z-arrival.z);
    if(flat-reach-radius>range+12)continue;
    // Nearest and farthest the arrival camera can stand from this placement.
    const near=Math.max(flat-reach,.001),far=flat+reach+CAMERA_RISE;
    const coverage=coverageAt(radius,near),least=coverageAt(radius,far);
    const finest=villageLodTier(coverage),coarsest=asset.config.essentialStructural===true&&cave?2:villageLodTier(least);
    const request=level=>{
      const source=levelFor(asset.levels,level);if(!source)return;
      const key=placement.asset+':'+source.level,priority=coverage*100-near;
      const previous=wanted.get(key);
      if(!previous||previous.priority<priority)wanted.set(key,{id:placement.asset,level:source.level,priority,resources:source.resources});
    };
    for(let level=finest;level<=coarsest;level++)request(level);
    // The demand rule fetches the next finer level just before its threshold.
    if(finest===1&&coverage>VILLAGE_LOD_COVERAGE.mid*.72)request(0);
    if(finest===2&&coverage>VILLAGE_LOD_COVERAGE.far*.72)request(1);
  }
  return [...wanted.values()].sort((a,b)=>b.priority-a.priority||a.level-b.level);
}

export function planResources(plan){
  const seen=new Set();
  for(const entry of plan)for(const path of entry.resources)seen.add(path);
  return [...seen];
}
