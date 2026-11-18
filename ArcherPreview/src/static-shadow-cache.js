import { EffectRenderer, EffectWrapper, ShadowGenerator, Vector3 } from '@babylonjs/core';

// Static shadow cache (2026-11-18).
// Trees, rocks and buildings were redrawn into the shadow map every frame and
// made up ~3/4 of the shadow pass on the plains. They now go into a second
// depth map that is redrawn only when something it depends on changes (light
// focus/direction, the caster set, a fade step, an effect still compiling).
// Each frame the live map starts as a copy of that depth (one full-screen
// draw) and only actors are drawn on top, so the result is the same map as
// before: same light matrix, bias, filter and resolution.
export const staticShadowCasters=new WeakSet();
export function markStaticShadowCaster(mesh){if(mesh)staticShadowCasters.add(mesh);}

const COPY_DEPTH=`precision highp float;
varying vec2 vUV;
uniform sampler2D staticDepth;
void main(void){gl_FragDepth=texture2D(staticDepth,vUV).r;gl_FragColor=vec4(1.0);}`;
const ALWAYS=519;
// Checked live on plains + village 2026-11-18 (identical frames); ?shadowcache=0 turns it off.
export const STATIC_SHADOW_CACHE_OPT_IN=false;

export function staticShadowCacheAllowed(engine){
  const forced=new URLSearchParams(globalThis.location?.search??'').get('shadowcache');
  if(forced==='0')return false;
  if(STATIC_SHADOW_CACHE_OPT_IN&&forced!=='1')return false;
  return !engine.isWebGPU&&engine.webGLVersion>=2&&!!engine._features?.supportDepthStencilTexture;
}

export function installStaticShadowCache(lighting,{decorate}={}){
  const scene=lighting.scene,engine=scene.getEngine(),main=lighting.shadows,mainMap=main.getShadowMap();
  if(!staticShadowCacheAllowed(engine)||main.filter!==ShadowGenerator.FILTER_PCF)return null;
  const light=lighting.key,size=mainMap.getSize().width,key={};
  // A camera key keeps the light's own (null) slot pointing at the live map;
  // dropping the entry afterwards keeps Babylon from rendering it by itself.
  const cache=new ShadowGenerator(size,light,undefined,key);
  light._shadowGenerators?.delete(key);cache._camera=null;
  cache.usePercentageCloserFiltering=true;cache.filteringQuality=main.filteringQuality;
  cache.bias=main.bias;cache.normalBias=main.normalBias;cache.depthScale=main.depthScale;
  decorate?.(cache);
  const map=cache.getShadowMap();
  // Plain (non-comparison) depth so it can be read back by the copy pass.
  map.createDepthStencilTexture(0,false,false,1,14,'MoonForestStaticShadowDepth');
  map.renderList=mainMap.renderList;
  const state={active:true,dirty:true,renders:0,copies:0,statics:[],last:[],position:new Vector3(NaN,0,0),direction:new Vector3(NaN,0,0),missing:false};
  map.getCustomRenderList=()=>state.statics;
  const isReady=cache.isReady.bind(cache);
  cache.isReady=(...args)=>{const ready=isReady(...args);if(!ready)state.missing=true;return ready;};

  const renderer=new EffectRenderer(engine);
  const copy=new EffectWrapper({engine,name:'moonforest-static-shadow-copy',fragmentShader:COPY_DEPTH,samplerNames:['staticDepth'],uniformNames:[]});
  copy.onApplyObservable.add(()=>copy.effect.setDepthStencilTexture('staticDepth',map));

  const sameList=(a,b)=>{if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
  const before=scene.onBeforeRenderTargetsRenderObservable.add(()=>{
    if(!state.active||!scene.shadowsEnabled||!lighting.shadowsActive||!light.isEnabled())return;
    const lists=lighting.shadowCasterLists?.();if(!lists)return;
    state.statics=lists.statics;
    if(!sameList(state.statics,state.last)){state.dirty=true;state.last=state.statics.slice();}
    if(!light.position.equals(state.position)||!light.direction.equals(state.direction)){state.dirty=true;state.position.copyFrom(light.position);state.direction.copyFrom(light.direction);}
    if(!state.dirty)return;
    state.missing=false;
    map.render(false);state.renders++;
    state.dirty=state.missing;
  });
  // The live map's own clear (depth = 1) runs first; then the cached depth
  // replaces it wholesale. Color writes are already off for PCF.
  const clear=mainMap.onClearObservable.add(()=>{
    if(!state.active||!copy.effect?.isReady()||!map.depthStencilTexture)return;
    const depth=engine.depthCullingState,depthFunction=depth.depthFunc,depthWrite=depth.depthMask;
    renderer.saveStates();renderer.setViewport();renderer.applyEffectWrapper(copy,true);
    depth.depthFunc=ALWAYS;depth.depthMask=true;
    renderer.draw();
    depth.depthFunc=depthFunction??515;depth.depthMask=depthWrite;
    renderer.restoreStates();state.copies++;
  });
  state.invalidate=()=>{state.dirty=true;};
  state.dispose=()=>{
    scene.onBeforeRenderTargetsRenderObservable.remove(before);mainMap.onClearObservable.remove(clear);
    copy.dispose();renderer.dispose();cache.dispose();state.active=false;
  };
  scene.onDisposeObservable.addOnce(()=>state.dispose());
  return state;
}
