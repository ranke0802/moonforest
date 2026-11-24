// Node (scripts, tests): an unprepared fixed layout is generated on demand from
// its source, exactly as the game did before the layouts were prebuilt.
// Browser builds resolve '#fixed-layout-fallback' to fixed-layout-fallback.browser.js
// (package.json "imports"), so the generators never enter the shipped game.
import {VILLAGE_PLACEMENTS} from './village-layout.js';
import {PLAINS_PLACEMENTS} from './great-plains-layout.js';
export function fallbackPlacements(id){
 if(id==='village')return VILLAGE_PLACEMENTS;
 if(id==='great-plains')return PLAINS_PLACEMENTS;
 throw new Error('Unknown fixed layout: '+id);
}
