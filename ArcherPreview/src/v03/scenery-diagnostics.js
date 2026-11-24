// These switches are read at map setup only. The shell forwards the query to the game iframe.
export function sceneryFeatureEnabled(world, feature, search = globalThis.location?.search) {
  return !world.gameplayV03 || new URLSearchParams(search).get(feature) !== '0';
}

// Change only the renderer's placement list. Navigation, portal triggers and
// the editor's base placement identities keep the authored layout.
export function vistaRenderPlacements(world, placements) {
  if ((world.mapId !== 'great-plains' && world.mapId !== 'village') || sceneryFeatureEnabled(world, 'vista')) return placements;
  if (world.mapId === 'village') return placements.filter(p => !p.villagePlainsOutskirts);
  return placements.filter(p => !(p.background && (p.id === 'village-exterior' || p.id.startsWith('vista-v03-gate-'))));
}
