import {ShaderStore} from '@babylonjs/core';
import {shadowMapVertexShader} from '@babylonjs/core/Shaders/shadowMap.vertex.js';
import {shadowMapPixelShader} from '@babylonjs/core/Shaders/shadowMap.fragment.js';

export const shadowFadeAttribute='villageShadowFade';
export function prepareShadowFade(mesh){
  const source=mesh.sourceMesh??mesh;
  if(source.instancedBuffers?.[shadowFadeAttribute]!==undefined)return;
  source.registerInstancedBuffer(shadowFadeAttribute,1);source.instancedBuffers[shadowFadeAttribute]=1;
  for(const instance of source.instances??[])instance.instancedBuffers[shadowFadeAttribute]=1;
}

// Depth-only ordered coverage, filtered by the existing PCF shadow map. The
// light-space pattern is fixed (no temporal noise), and the color pass stays
// opaque. No extra shadow map, draw pass, material clone or LOD is introduced.
export function installVillageShadowFade(shadows){
  const name='moonforestShadowFade';
  ShaderStore.ShadersStore[name+'VertexShader']=shadowMapVertexShader.shader
    .replace('#define CUSTOM_VERTEX_DEFINITIONS',`varying float vVillageShadowFade;
uniform float villageShadowUniform;
#ifdef INSTANCES
attribute float villageShadowFade;
#endif`)
    .replace('{vec3 positionUpdated=position;',`{
vVillageShadowFade=villageShadowUniform;
#ifdef INSTANCES
vVillageShadowFade=villageShadowFade;
#endif
vec3 positionUpdated=position;`);
  ShaderStore.ShadersStore[name+'PixelShader']=shadowMapPixelShader.shader
    .replace('#define CUSTOM_FRAGMENT_DEFINITIONS',`varying float vVillageShadowFade;
float villageBayer2(vec2 p) { return 2.0*mod(p.x+p.y,2.0)+mod(p.y,2.0); }`)
    .replace('#include<clipPlaneFragment>',`#include<clipPlaneFragment>
if (vVillageShadowFade < 0.999) {
  vec2 p=mod(floor(gl_FragCoord.xy),4.0);
  float threshold=(4.0*villageBayer2(mod(p,2.0))+villageBayer2(floor(p/2.0))+0.5)/16.0;
  if (vVillageShadowFade < threshold) discard;
}`);
  shadows.customShaderOptions={shaderName:name,attributes:[shadowFadeAttribute],uniforms:['villageShadowUniform']};
  let mesh;
  shadows.onBeforeShadowMapRenderMeshObservable.add(value=>{mesh=value;});
  shadows.onBeforeShadowMapRenderObservable.add(effect=>effect.setFloat('villageShadowUniform',mesh?.instancedBuffers?.[shadowFadeAttribute]??1));
}

// Fade outgoing records to zero before reusing their slots. Even at a full
// budget, transitions cannot double the number of shadow casters.
export class ShadowFadeBudget {
  constructor(limit,duration=.7){this.limit=limit;this.duration=duration;this.active=new Map();this.desired=new Set();this.initial=true;}
  select(records){this.desired=new Set(records.slice(0,this.limit));if(this.initial){for(const r of this.desired)this.active.set(r,1);this.initial=false;}}
  update(dt){
    const step=Math.max(0,Math.min(dt,.1))/this.duration;
    for(const [r,value] of this.active){
      if(r.root.isDisposed?.()){this.active.delete(r);continue;}
      const next=this.desired.has(r)?Math.min(1,value+step):Math.max(0,value-step);
      if(next===0&&!this.desired.has(r))this.active.delete(r);else this.active.set(r,next);
    }
    for(const r of this.desired)if(this.active.size<this.limit&&!this.active.has(r)&&!r.root.isDisposed?.())this.active.set(r,0);
    return this.active;
  }
  clear(){this.active.clear();this.desired.clear();}
}
