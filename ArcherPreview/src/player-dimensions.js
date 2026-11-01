// Measured from the reviewed R6 runtime mesh, boots to hair top in its upright
// bind pose. Equipment/outline shells are excluded; animation can bend/jump.
export const WARRIOR_SOURCE_HEIGHT=.9793707037107424;
export const WARRIOR_LEGACY_SCALE=1.8146016164162133;
export const WARRIOR_HEIGHT=1.6;
export const WARRIOR_SCALE=WARRIOR_HEIGHT/WARRIOR_SOURCE_HEIGHT;
export const WARRIOR_SIZE_RATIO=WARRIOR_SCALE/WARRIOR_LEGACY_SCALE;

function dimensions(ratio,height){return Object.freeze({height,ratio,
  moveRadius:.32*ratio,spellRadius:.3*ratio,rollRadius:.25*ratio,
  standingClearance:.65*ratio,guardHeight:.95*ratio,bodyAimHeight:1.1*ratio,
  feedbackHeight:1.8*ratio,goldHeight:1.6*ratio,stableFocusHeight:1.05*ratio,
  headHeight:1.5*ratio,chestHeight:.85*ratio,
  chinHeight:1.46*ratio,eyeBelowChin:.35*ratio,markerLength:.7*ratio,
  bladeRadius:.055*ratio,shieldStrikeRadius:.06*ratio});}
export const LEGACY_PLAYER_DIMENSIONS=dimensions(1,WARRIOR_SOURCE_HEIGHT*WARRIOR_LEGACY_SCALE);
export const WARRIOR_DIMENSIONS=dimensions(WARRIOR_SIZE_RATIO,WARRIOR_HEIGHT);
export function playerDimensions(player){return player?.metadata?.playerDimensions??LEGACY_PLAYER_DIMENSIONS;}
export function configurePlayerSize(actor,config,{warrior=false}={}){
  const profile=warrior?WARRIOR_DIMENSIONS:LEGACY_PLAYER_DIMENSIONS;
  actor.metadata={...actor.metadata,playerDimensions:profile};
  actor.scaling.setAll(warrior?WARRIOR_SCALE:(config.scale||1));
  return profile;
}
