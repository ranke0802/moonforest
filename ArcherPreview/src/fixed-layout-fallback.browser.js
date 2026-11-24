// Browser builds ship no layout generator (see fixed-layouts.js). Reaching this
// means a map read its placements before its load awaited prepareFixedLayouts().
export function fallbackPlacements(id){
 throw new Error(`Fixed layout "${id}" was read before it was prepared`);
}
