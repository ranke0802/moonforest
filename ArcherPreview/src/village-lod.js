// Screen area incorporates both distance and placement scale. Tiny rocks do not
// keep a 5K mesh merely because the camera happens to pass nearby.
import {sceneryDistanceScale as cinematicSceneryScale} from './scenery-distance-state.js';
import {MOONFOREST_WORLD_V4_ENTRY} from './release-route.js';
import mobileExterior from '../public/assets/v03-mobile-village-exterior.json' with {type:'json'};
// Share of the screen a placement's bounding sphere must cover to be drawn at
// the near tier (above mid) or the middle tier (above far). The tiers differ
// mostly in texture size (trees 2048/1024/512, rocks and shrubs 512/256) and
// only slightly in triangles, so the 0.4 world keeps the sharper tiers out to
// about 1.7x (near) and 2.4x (middle) the distance. Measured on the plains
// road at 760x350: +5% triangles per frame.
const COVERAGE_V3=Object.freeze({mid:.22,far:.035}),COVERAGE_V4=Object.freeze({mid:.08,far:.006});
export function lodCoverageFor(pathname){return String(pathname??'').endsWith(MOONFOREST_WORLD_V4_ENTRY)?COVERAGE_V4:COVERAGE_V3;}
export const VILLAGE_LOD_COVERAGE=lodCoverageFor(globalThis.location?.pathname);

export function projectedCoverage(camera,sphere,world){
  const distance=camera.mode===1?camera.minZ:Math.hypot(sphere.centerWorld.x-camera.globalPosition.x,sphere.centerWorld.y-camera.globalPosition.y,sphere.centerWorld.z-camera.globalPosition.z);
  const radius=sphere.radiusWorld*camera.minZ/Math.max(distance,.001);
  const coverage=Math.PI*radius*radius/camera.screenArea,scale=cinematicSceneryScale(world);
  return scale===1?coverage:coverage*scale*scale;
}
export function villageLodTier(coverage){
  return coverage>VILLAGE_LOD_COVERAGE.mid?0:coverage>VILLAGE_LOD_COVERAGE.far?1:2;
}
export function villageLodSources(config,touch,gameplayV03=false){
  if(!config.geometryLod)return config.lods.filter(l=>!touch||l.level>0);
  const levels=[touch?config.mobileNear:config.lods[0],config.lods[1],config.lods[2]];
  if(touch&&gameplayV03&&config.approvedVillageExterior?.assetId==='village-approach'){
    // Change both model dependencies and prefetch together, only for the reviewed shell.
    return levels.map(level=>level.model===mobileExterior.sourceModel?{...level,...mobileExterior.level}:level);
  }
  return levels;
}

// Some distant prefabs intentionally use the same content-addressed model at
// every tier. A tier change must not decode/instantiate that exact file again.
// Different model URLs (including texture-only variants) remain separate LODs.
export function hasVillageGeometry(asset,level){
  if(asset.tiers.has(level))return true;
  const model=asset.levels.find(l=>l.level===level)?.model;
  return !!model&&asset.levels.some(l=>l.model===model&&asset.tiers.has(l.level));
}
