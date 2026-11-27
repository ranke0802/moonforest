import test from 'node:test';
import assert from 'node:assert/strict';
import {trackRenderTargetHealth,inspectSceneRenderTarget} from '../src/render-target-diagnostics.js';

const observable=()=>{const list=[];return {add:fn=>{list.push(fn);return fn;},fire:()=>list.forEach(fn=>fn()),list};};
const fakeGl=({stencil=36161,depth=36161}={})=>{const calls=[];return {calls,FRAMEBUFFER:36160,DEPTH_ATTACHMENT:36096,STENCIL_ATTACHMENT:36128,FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE:36048,
 isContextLost:()=>false,getContextAttributes:()=>({depth:true,stencil:true,antialias:true}),
 bindFramebuffer:(target,fb)=>calls.push(fb),getFramebufferAttachmentParameter:(t,point)=>point===36128?stencil:depth,checkFramebufferStatus:()=>36053};};

test('context loss and restore are counted once per engine', () => {
  const lost=observable(),restored=observable(),engine={onContextLostObservable:lost,onContextRestoredObservable:restored,_gl:fakeGl(),isStencilEnable:true};
  trackRenderTargetHealth(engine);trackRenderTargetHealth(engine);
  assert.equal(lost.list.length,1);
  lost.fire();restored.fire();lost.fire();
  const report=inspectSceneRenderTarget(engine,null);
  assert.equal(report.context.lost,2);assert.equal(report.context.restored,1);
  assert.equal(report.sceneTarget,'canvas');assert.equal(report.context.stencil,true);
});

test('the first post-process input reports its depth/stencil attachments and restores the binding', () => {
  const gl=fakeGl({stencil:0}),engine={_gl:gl,_currentFramebuffer:'previous',isStencilEnable:true};
  const wrapper={width:1448,height:668,samples:4,_generateDepthBuffer:true,_generateStencilBuffer:true,_depthStencilBuffer:{},_MSAAFramebuffer:'msaa',_framebuffer:'resolve'};
  const report=inspectSceneRenderTarget(engine,{_postProcesses:[null,{name:'phone-sharpen',inputTexture:wrapper}]});
  assert.deepEqual(report.postProcesses,['phone-sharpen']);
  assert.equal(report.sceneTarget.samples,4);assert.equal(report.sceneTarget.generateStencil,true);
  assert.deepEqual(report.sceneTarget.drawAttachments,{depth:36161,stencil:0,status:36053});
  assert.deepEqual(gl.calls,['msaa','previous']);
});

test('a lost context is reported without touching GL', () => {
  const gl={...fakeGl(),isContextLost:()=>true,getContextAttributes:()=>{throw new Error('lost');},bindFramebuffer:()=>{throw new Error('must not bind');}};
  const report=inspectSceneRenderTarget({_gl:gl,isStencilEnable:true},{_postProcesses:[{name:'phone-sharpen',inputTexture:{_framebuffer:'fb'}}]});
  assert.equal(report.context.isLost,true);assert.equal(report.sceneTarget.drawAttachments,null);
});
