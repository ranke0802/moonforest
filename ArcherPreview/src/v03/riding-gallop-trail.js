import {BoundingInfo, Mesh, ShaderMaterial, Vector3, VertexData} from '@babylonjs/core';
import {prepareModelShaders} from '../boss-shader-warmup.js';
import {reducedMotion,onAccessibilityChange} from './accessibility.js';

// Horse-local metres, with the nose facing +Z. The strips stay beside the
// flanks and the dust lifts behind the hind hooves, below the rider.
const vertexSource = `
  precision highp float;
  attribute vec3 position;
  attribute vec4 color;
  attribute vec2 uv;
  uniform mat4 worldViewProjection;
  uniform float cycle, strength;
  varying vec4 tint;
  void main() {
    float age = fract(cycle + uv.x);
    float dust = uv.y;
    vec3 p = position;
    p.x += sign(position.x) * age * mix(0.10, 0.24, dust);
    p.z -= age * mix(0.78, 1.38, dust);
    p.y += dust * age * (0.50 - 0.28 * age);
    tint = vec4(color.rgb, color.a * strength * 4.0 * age * (1.0 - age));
    gl_Position = worldViewProjection * vec4(p, 1.0);
  }`;
const fragmentSource = `
  precision mediump float;
  varying vec4 tint;
  void main() { gl_FragColor = tint; }`;

function trailGeometry() {
  const positions = [], colors = [], uvs = [], indices = [];
  const air = [.80, .89, .85], earth = [.67, .55, .40];
  function point(x, y, z, tint, alpha, phase, dust) {
    positions.push(x, y, z);
    colors.push(...tint, alpha);
    uvs.push(phase, dust);
  }
  function closeFan(start) {
    for (let i = 0; i < 6; i++) indices.push(start, start + 1 + i, start + 1 + (i + 1) % 6);
  }
  for (const side of [-1, 1]) {
    const stagger = side > 0 ? .26 : 0;
    for (const [baseX, baseY, noseZ, length, width, phase] of [
      [.49, .99, .31, 1.08, .048, .07], [.58, .66, -.19, .76, .035, .58],
    ]) {
      const start = positions.length / 3;
      const ribbonPoint = (along, edge, alpha) => point(
        side * (baseX + .22 * along + edge * width * .55),
        baseY + .09 * Math.sin(Math.PI * along) + edge * width,
        noseZ - length * along, air, alpha, phase + stagger, 0);
      ribbonPoint(.42, 0, .52);
      for (const [along, edge] of [[0,0],[.27,1],[.65,.75],[1,0],[.65,-.75],[.27,-1]]) {
        ribbonPoint(along, edge, 0);
      }
      closeFan(start);
    }
    for (const [baseX, baseZ, size, phase] of [[.24,-.74,.14,.11],[.35,-.84,.105,.55],[.30,-1.04,.08,.84]]) {
      const start = positions.length / 3, y = .11, seed = phase + stagger;
      point(side * baseX, y, baseZ, earth, .43, seed, 1);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3 + phase, across = Math.cos(angle), up = Math.sin(angle);
        point(side * (baseX + size * across), y + size * .68 * up, baseZ + size * .55 * up, earth, 0, seed, 1);
      }
      closeFan(start);
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.uvs = uvs;
  data.indices = indices;
  return data;
}

export function createRidingGallopTrail(horseRoot) {
  const scene = horseRoot?.getScene?.();
  if (!scene) return {update(){}, dispose(){}};
  const mesh = new Mesh('v03-riding-gallop-trail', scene);
  trailGeometry().applyToMesh(mesh);
  // The geometry is static. Include the full shader travel in its local bounds.
  mesh.setBoundingInfo(new BoundingInfo(new Vector3(-1, 0, -2.7), new Vector3(1, 1.2, .4)));
  const material = new ShaderMaterial('v03-riding-gallop-air', scene, {vertexSource, fragmentSource}, {
    attributes:['position','color','uv'], uniforms:['worldViewProjection','cycle','strength'], needAlphaBlending:true,
  });
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  mesh.material = material;
  mesh.parent = horseRoot;
  mesh.isPickable = false;
  mesh.setEnabled(false);

  let disposed = false, cycle = 0, preparation = null, ready = false;
  // Reduced motion: the device setting or the player's choice (accessibility.js).
  let reduced = reducedMotion();
  function prepare() {
    if (preparation || reduced) return;
    preparation = prepareModelShaders({meshes:[mesh]}, {includeInstanceVariants:false, keepPrograms:false})
      .then(() => { ready = !disposed; })
      .catch(error => { if (!disposed) console.warn('[MoonForest 0.3] gallop trail unavailable', error); });
  }
  function motionChanged() {
    reduced = reducedMotion();
    if (reduced) mesh.setEnabled(false);
    else prepare();
  }
  const stopListening = onAccessibilityChange(motionChanged);
  mesh.onDisposeObservable.addOnce(() => {
    disposed = true;
    stopListening();
    material.dispose();
  });
  prepare();
  return {
    update(dt, strength) {
      if (disposed || !ready) return;
      if (reduced || !(strength > 0)) {
        if (mesh.isEnabled(false)) mesh.setEnabled(false);
        return;
      }
      if (Number.isFinite(dt)) cycle = (cycle + Math.max(0, Math.min(.1, dt)) * 2.1) % 1;
      material.setFloat('cycle', cycle);
      material.setFloat('strength', Math.min(strength, 1));
      if (!mesh.isEnabled(false)) mesh.setEnabled(true);
    },
    dispose() { if (!disposed) mesh.dispose(); },
  };
}
