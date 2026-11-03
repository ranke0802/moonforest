// Low vegetation is visual dressing, not a solid. Keep placement radii for
// spacing/LOD bounds; exclude it only when building movement obstacles.
const softKinds=new Set(['shrub','grass','ground-detail']);
const softAssets=new Set(['bush','grass-tuft','forest-05-thorn-bramble','forest-04-poison-fungi']);
export function isSoftVegetation(placement){
  return softKinds.has(placement.kind)||softAssets.has(placement.asset);
}
