import { Color3, Mesh, MeshBuilder, RawTexture, ShaderMaterial, Texture, Vector2 } from '@babylonjs/core';

export const SKY_HORIZON = new Color3(.61, .71, .77);

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
void main() {
  vec3 direction = normalize(skyDirection);
  // A flat cloud layer above the viewer; no longitude seam or polar pinching.
  vec2 uv = direction.xz / (max(direction.y, 0.0) + .35) * .28 + drift;
  vec3 clouds = texture2D(cloudMap, uv).rgb;
  vec3 color = mix(horizon, clouds, smoothstep(0.0, .32, direction.y));
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
      attributes: ['position'], uniforms: ['worldViewProjection', 'drift', 'horizon', 'imageProcessing'],
      samplers: ['cloudMap'], needAlphaBlending: true,
    });
    this.material.disableDepthWrite = true;
    this.material.backFaceCulling = false;
    this.material.setColor3('horizon', SKY_HORIZON);
    this.drift = new Vector2();
    this.imageProcessing = new Vector2();
    this.mesh.material = this.material;
    // Pleasant fallback while the cached image loads, or if the request fails.
    this.texture = RawTexture.CreateRGBTexture(new Uint8Array([140, 179, 207]), 1, 1, scene, false, false);
    this.material.setTexture('cloudMap', this.texture);
    this.tick(0);
  }

  load(manifestUrl) {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      const response = await fetch(manifestUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Sky manifest: ${response.status}`);
      const manifest = await response.json();
      const texture = await new Promise((resolve, reject) => {
        const candidate = new Texture(new URL(manifest.texture, manifestUrl).href, this.scene, false, false,
          Texture.TRILINEAR_SAMPLINGMODE, () => resolve(candidate), (_, error) => { candidate.dispose(); reject(error ?? new Error('Sky texture unavailable')); });
      });
      texture.wrapU = texture.wrapV = Texture.MIRROR_ADDRESSMODE;
      texture.anisotropicFilteringLevel = 1;
      this.material.setTexture('cloudMap', texture);
      this.texture.dispose(); this.texture = texture;
      return true;
    })().catch(error => {
      console.warn('Using fallback sky:', error);
      this.loadPromise = null;
      return false;
    });
    return this.loadPromise;
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
