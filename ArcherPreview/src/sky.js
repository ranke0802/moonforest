import { Color3, Mesh, MeshBuilder, RawTexture, ShaderMaterial, Texture, Vector2, Vector3, Vector4 } from '@babylonjs/core';
import {MapLoadLifetime,mapLoadAbortError} from './map-load-lifetime.js';
import {releaseMapTexture} from './map-texture-lifetime.js';

export const SKY_HORIZON = new Color3(.61, .71, .77);
export const SKY_LOAD_TIMEOUT_MS=8000;

const vertexSource = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 skyDirection;
void main() {
  skyDirection = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
  gl_Position.z = gl_Position.w * .999999;
}`;
const fragmentSource = `
precision mediump float;
varying vec3 skyDirection;
uniform sampler2D cloudMap;
uniform vec2 drift;
uniform vec3 horizon;
uniform vec2 imageProcessing;
uniform float weatherCloud;
// 0.4 time of day. All zero in earlier editions: the picture is unchanged.
uniform vec4 skyNight;
uniform vec3 skyGlow;
uniform vec3 moonDirection;
void main() {
  vec3 direction = normalize(skyDirection);
  // A flat cloud layer above the viewer; no longitude seam or polar pinching.
  vec2 uv = direction.xz / (max(direction.y, 0.0) + .35) * .28 + drift;
  // Two differently scaled layers of the existing image drift at different
  // speeds. No extra texture, geometry, render target or animation loop.
  vec3 layerA = texture2D(cloudMap, uv).rgb;
  vec2 layerUV = (uv-drift)*1.47 + vec2(.31,.67) + drift*.43;
  vec3 layerB = texture2D(cloudMap, layerUV).rgb;
  vec3 clouds = mix(layerA,layerB,.22);
  float gray=dot(clouds,vec3(.299,.587,.114));
  clouds=mix(clouds,vec3(gray*.76),weatherCloud);
  vec3 color = mix(horizon, clouds, smoothstep(0.0, .32, direction.y));
  // Warm band at the horizon (dawn, sunset).
  float band = 1.0 - smoothstep(0.0, .5, abs(direction.y));
  color += skyGlow * band * band;
  if (skyNight.x > 0.0) {
    color = mix(color, color * vec3(.50, .58, .86), skyNight.x * .7);
    // Stars on a coarse grid of the same flat projection as the clouds.
#ifdef GL_FRAGMENT_PRECISION_HIGH
    highp vec2 cell = floor(direction.xz / (max(direction.y, 0.0) + .6) * 70.0);
    highp float seed = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
#else
    vec2 cell = floor(direction.xz / (max(direction.y, 0.0) + .6) * 40.0);
    float seed = fract(sin(dot(cell, vec2(1.29898, 7.8233))) * 437.585);
#endif
    float star = step(.994, seed) * smoothstep(.06, .32, direction.y) * (1.0 - weatherCloud);
    color += vec3(star) * skyNight.x * (.65 + .35 * sin(skyNight.y + seed * 40.0));
    float moon = dot(direction, moonDirection);
    color += vec3(.98, .95, .84) * smoothstep(.9982, .9990, moon) * skyNight.x * (1.0 - weatherCloud * .8);
    color += vec3(.30, .36, .52) * smoothstep(.93, 1.0, moon) * skyNight.x * .5;
  }
  // Match the scene's gamma-space exposure/contrast without per-pixel pow().
  color = clamp(color * imageProcessing.x, 0.0, 1.0);
  color = mix(color, color * color * (3.0 - 2.0 * color), imageProcessing.y);
  gl_FragColor = vec4(color, 1.0);
}`;

export class MovingSky {
  constructor(scene) {
    this.scene = scene;
    this.mesh = MeshBuilder.CreateSphere('painted-sky', { diameter: 2, segments: 12, sideOrientation: Mesh.BACKSIDE }, scene);
    this.mesh.infiniteDistance = true;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.isPickable = false;
    this.mesh.applyFog = false;
    // Draw after opaque geometry (depth rejects hidden sky), before transparent
    // corpses/effects. Alpha is always 1; the sky never overwrites scene depth.
    this.mesh.alphaIndex = -1000000;
    this.material = new ShaderMaterial('painted-sky-material', scene, { vertexSource, fragmentSource }, {
      attributes: ['position'], uniforms: ['worldViewProjection', 'drift', 'horizon', 'imageProcessing', 'weatherCloud', 'skyNight', 'skyGlow', 'moonDirection'],
      samplers: ['cloudMap'], needAlphaBlending: true,
    });
    this.material.disableDepthWrite = true;
    this.material.backFaceCulling = false;
    this.material.setColor3('horizon', SKY_HORIZON);
    this.material.setFloat('weatherCloud',0);
    this.material.setVector4('skyNight',new Vector4(0,0,0,0));this.material.setVector3('skyGlow',Vector3.Zero());this.material.setVector3('moonDirection',new Vector3(0,-1,0));
    this.drift = new Vector2();
    this.imageProcessing = new Vector2();
    this.mesh.material = this.material;
    // Pleasant fallback while the cached image loads, or if the request fails.
    this.texture = RawTexture.CreateRGBTexture(new Uint8Array([140, 179, 207]), 1, 1, scene, false, false);
    this.material.setTexture('cloudMap', this.texture);
    this.tick(0);
  }

  load(manifestUrl,{signal,timeoutMs=SKY_LOAD_TIMEOUT_MS,timers,fetcher=globalThis.fetch,createTexture=(scene,callbacks)=>new Texture(null,scene,{noMipmap:false,invertY:false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,...callbacks})}={}) {
    if (this.loadPromise) return this.loadPromise;
    const scene=this.scene,lifetime=new MapLoadLifetime({signal,timeoutMs,timers,stage:'sky'}),revision=this.loadRevision=(this.loadRevision??0)+1;
    let candidate,installed=false,released=false;
    const release=()=>{if(candidate&&!installed&&!released){released=true;releaseMapTexture(candidate,scene);}};
    const check=()=>{if(scene.isDisposed||revision!==this.loadRevision)lifetime.abort(mapLoadAbortError());lifetime.check();};
    const observer=scene.onDisposeObservable.addOnce(()=>lifetime.abort(mapLoadAbortError())),abort=()=>release();lifetime.signal.addEventListener('abort',abort,{once:true});
    this.lastLoad={status:'loading',timeoutMs};
    const pending = (async () => {
      check();const response = await lifetime.run(()=>fetcher(manifestUrl, { cache: 'no-cache',signal:lifetime.signal }));check();
      if (!response.ok) throw new Error(`Sky manifest: ${response.status}`);
      const manifest = await lifetime.run(()=>response.json());check();
      const texture = await lifetime.run(()=>new Promise((resolve,reject)=>{
        let settled=false;const finish=error=>{if(settled)return;settled=true;lifetime.signal.removeEventListener('abort',cancel);if(error)reject(error);else resolve(candidate);},cancel=()=>finish(lifetime.signal.reason??mapLoadAbortError());
        lifetime.signal.addEventListener('abort',cancel,{once:true});
        try{candidate=createTexture(scene,{onLoad:()=>queueMicrotask(()=>{try{check();finish();}catch(error){finish(error);}}),onError:(_,error)=>queueMicrotask(()=>finish(error??new Error('Sky texture unavailable')))});check();candidate.updateURL(new URL(manifest.texture,manifestUrl).href);check();}
        catch(error){finish(error);}
      }));check();
      texture.wrapU = texture.wrapV = Texture.MIRROR_ADDRESSMODE;
      texture.anisotropicFilteringLevel = 1;
      this.material.setTexture('cloudMap', texture);
      const previous=this.texture;this.texture=texture;installed=true;releaseMapTexture(previous,scene);
      this.lastLoad={status:'ready',timeoutMs};
      return true;
    })().catch(error => {
      release();this.lastLoad={status:'fallback',timeoutMs,error:String(error?.message??error).slice(0,180)};
      console.warn('Using fallback sky:', error);
      return false;
    }).finally(()=>{
      lifetime.signal.removeEventListener('abort',abort);scene.onDisposeObservable.remove(observer);lifetime.close();
      if(!installed&&this.loadPromise===pending)this.loadPromise=null;
    });
    this.loadPromise=pending;return pending;
  }

  tick(time) {
    // Existing game clock only: no second animation loop, texture uploads, or RT.
    this.drift.set((time * .0012) % 2, (time * .0004) % 2);
    this.material.setVector2('drift', this.drift);
    const config = this.scene.imageProcessingConfiguration;
    this.imageProcessing.set(config.exposure ** (1 / 2.2), config.contrast - 1);
    this.material.setVector2('imageProcessing', this.imageProcessing);
  }
}
