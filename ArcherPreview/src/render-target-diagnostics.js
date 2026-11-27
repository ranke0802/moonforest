// Diagnostic only (2026-11-28, iPhone black scenery): what the main scene renders
// into, read once when a frame record or diagnostic is exported, never per frame.
// Village ink (village-outlines.js) relies on the scene target's depth AND stencil;
// a target without them, or a lost/restored context, is otherwise invisible in a record.
const health=new WeakMap();
const now=()=>Math.round(globalThis.performance?.now?.()??0);

export function trackRenderTargetHealth(engine){
 if(!engine||health.has(engine))return;
 const state={lost:0,restored:0,lastLostAtMs:null,lastRestoredAtMs:null};
 health.set(engine,state);
 engine.onContextLostObservable?.add(()=>{state.lost++;state.lastLostAtMs=now();});
 engine.onContextRestoredObservable?.add(()=>{state.restored++;state.lastRestoredAtMs=now();});
}

// Attachment object types of one framebuffer (RENDERBUFFER 36161, TEXTURE 5890, NONE 0).
// Restores the engine's cached binding, so Babylon's framebuffer cache stays true.
function attachments(engine,gl,framebuffer){
 if(!framebuffer)return null;
 const previous=engine._currentFramebuffer??null;
 try{
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
  const type=point=>gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER,point,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE);
  return {depth:type(gl.DEPTH_ATTACHMENT),stencil:type(gl.STENCIL_ATTACHMENT),status:gl.checkFramebufferStatus(gl.FRAMEBUFFER)};
 }catch{return null;}
 finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous);}
}

export function inspectSceneRenderTarget(engine,camera){
 if(!engine)return null;
 const gl=engine._gl??null,lost=!!gl?.isContextLost?.(),context=lost?null:gl?.getContextAttributes?.()??null;
 const passes=(camera?._postProcesses??[]).filter(Boolean),first=passes[0]??null,wrapper=first?.inputTexture??null;
 const live=!!gl&&!lost&&typeof gl.bindFramebuffer==='function';
 return {
  context:{...(health.get(engine)??{lost:null,restored:null}),isLost:lost,wasLost:!!engine._contextWasLost,depth:context?.depth??null,stencil:context?.stencil??null,antialias:context?.antialias??null,stencilEnabled:!!engine.isStencilEnable},
  postProcesses:passes.map(pass=>pass.name),
  // With a post-process the world is drawn into the FIRST pass's input, not the canvas.
  sceneTarget:wrapper?{pass:first.name,width:wrapper.width??null,height:wrapper.height??null,samples:wrapper.samples??null,generateDepth:!!wrapper._generateDepthBuffer,generateStencil:!!wrapper._generateStencilBuffer,
   depthStencilBuffer:!!wrapper._depthStencilBuffer,depthStencilTexture:!!wrapper._depthStencilTexture,msaaFramebuffer:!!wrapper._MSAAFramebuffer,
   drawAttachments:live?attachments(engine,gl,wrapper._MSAAFramebuffer??wrapper._framebuffer):null}:'canvas',
 };
}
