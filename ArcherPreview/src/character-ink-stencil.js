import {Constants} from '@babylonjs/core';

// Bit 1 is reserved for the approved Mourning Witch, bit 2 for other enemies.
// Scenery and Babylon's built-in outline helper use bit 4.
// Surfaces draw first; their depth-tested stencil rejects hulls inside skin.
export function configureCharacterExteriorStencil(surface,outline,bit=1){
  const common={enabled:true,funcRef:bit,funcMask:bit,opStencilFail:Constants.KEEP,backOpStencilFail:Constants.KEEP,opStencilDepthFail:Constants.KEEP,backOpStencilDepthFail:Constants.KEEP};
  if(surface)Object.assign(surface.stencil,common,{func:Constants.ALWAYS,backFunc:Constants.ALWAYS,mask:bit,opStencilDepthPass:Constants.REPLACE,backOpStencilDepthPass:Constants.REPLACE});
  if(outline)Object.assign(outline.stencil,common,{func:Constants.NOTEQUAL,backFunc:Constants.NOTEQUAL,mask:0,opStencilDepthPass:Constants.KEEP,backOpStencilDepthPass:Constants.KEEP});
}
