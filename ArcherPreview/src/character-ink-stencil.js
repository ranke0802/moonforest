import {Constants} from '@babylonjs/core';

// Bit 1 is reserved for the approved Mourning Witch exterior. Scenery uses 4.
// Surfaces draw first; their depth-tested stencil rejects hulls inside skin.
export function configureCharacterExteriorStencil(surface,outline){
  const common={enabled:true,funcRef:1,funcMask:1,opStencilFail:Constants.KEEP,backOpStencilFail:Constants.KEEP,opStencilDepthFail:Constants.KEEP,backOpStencilDepthFail:Constants.KEEP};
  if(surface)Object.assign(surface.stencil,common,{func:Constants.ALWAYS,backFunc:Constants.ALWAYS,mask:1,opStencilDepthPass:Constants.REPLACE,backOpStencilDepthPass:Constants.REPLACE});
  if(outline)Object.assign(outline.stencil,common,{func:Constants.NOTEQUAL,backFunc:Constants.NOTEQUAL,mask:0,opStencilDepthPass:Constants.KEEP,backOpStencilDepthPass:Constants.KEEP});
}
