// Screen area incorporates both distance and placement scale. Tiny rocks do not
// keep a 5K mesh merely because the camera happens to pass nearby.
export const VILLAGE_LOD_COVERAGE=Object.freeze({mid:.22,far:.035});

export function projectedCoverage(camera,sphere){
  const distance=camera.mode===1?camera.minZ:Math.hypot(sphere.centerWorld.x-camera.globalPosition.x,sphere.centerWorld.y-camera.globalPosition.y,sphere.centerWorld.z-camera.globalPosition.z);
  const radius=sphere.radiusWorld*camera.minZ/Math.max(distance,.001);
  return Math.PI*radius*radius/camera.screenArea;
}
export function villageLodTier(coverage){
  return coverage>VILLAGE_LOD_COVERAGE.mid?0:coverage>VILLAGE_LOD_COVERAGE.far?1:2;
}
export function villageLodSources(config,touch){
  if(!config.geometryLod)return config.lods.filter(l=>!touch||l.level>0);
  return [touch?config.mobileNear:config.lods[0],config.lods[1],config.lods[2]];
}
