import { Color3, Matrix, Quaternion, ShaderMaterial, VertexBuffer } from '@babylonjs/core';
import { BindBonesParameters, BindMorphTargetParameters } from '@babylonjs/core/Materials/materialHelper.functions.js';
import { CAVE_FOG_GLSL } from './cave-fog-cover.js';
import { bindCaveFogMaterial } from './cave-fog-binding.js';
import '@babylonjs/core/Shaders/ShadersInclude/bonesDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/bonesVertex.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexGlobalDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertexGlobal.js';
import '@babylonjs/core/Shaders/ShadersInclude/morphTargetsVertex.js';

// One unlit back-face pass, using the original GPU geometry and skeleton.
// No screen-sized render target, extra shadow pass or CPU skinning. The cave
// shares its small visibility mask (one complete fallback texel outside it).
const vertexSource = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float outlineWidth;
uniform float outlinePixels;
uniform vec2 outlineViewport;
varying vec3 caveInkPosition;
#include<bonesDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
void main(void) {
  vec3 positionUpdated = position;
  vec3 normalUpdated = normal;
  #include<morphTargetsVertexGlobal>
  #include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
  mat4 finalWorld = world;
  #include<bonesVertex>
  vec4 worldPosition = finalWorld * vec4(positionUpdated, 1.0);
  caveInkPosition = worldPosition.xyz;
  vec3 worldNormal = normalize(mat3(finalWorld) * normalUpdated);
  if (outlinePixels > 0.0) {
    gl_Position = viewProjection * worldPosition;
    vec4 displaced = viewProjection * (worldPosition + vec4(worldNormal,0.0));
    vec2 delta = (displaced.xy / displaced.w - gl_Position.xy / gl_Position.w) * outlineViewport;
    if (dot(delta,delta) > .000001) gl_Position.xy += normalize(delta) * outlinePixels * 2.0 / outlineViewport * gl_Position.w;
  } else {
    worldPosition.xyz += worldNormal * outlineWidth;
    gl_Position = viewProjection * worldPosition;
  }
}`;
const fragmentSource = `
precision mediump float;
uniform vec3 outlineColor;
uniform float outlineOpacity;
uniform float hitFlash;
varying vec3 caveInkPosition;
${CAVE_FOG_GLSL}
void main(void) {
  if (caveFogHidesInk(caveInkPosition)) discard;
  gl_FragColor = vec4(mix(outlineColor, vec3(1.0), hitFlash), outlineOpacity);
}`;
const materials = new WeakMap();
const widths = { sword: .0025, shield: .0035, bear: .006, goblin: .004, elena: .003, scarecrow: .0035 };
export const isRuntimeOutline = mesh => mesh.metadata?.moonforestOutline === true;

function outlineMaterial(scene) {
  if (materials.has(scene)) return materials.get(scene);
  const material = new ShaderMaterial('moonforest-character-outline', scene,
    { vertexSource, fragmentSource }, {
      attributes: ['position', 'normal'],
      defines: ['#define NORMAL'],
      uniforms: ['world', 'viewProjection', 'outlineWidth', 'outlinePixels', 'outlineViewport', 'outlineColor', 'outlineOpacity', 'hitFlash', 'caveFogRect', 'caveFogActive'],
      samplers: ['caveFogMap'],
    });
  material.backFaceCulling = true;
  material.cullBackFaces = false;
  material.disableDepthWrite = true;
  material.setColor3('outlineColor', new Color3(.035, .025, .035));
  material.setFloat('outlineWidth', .004);
  material.setFloat('outlineOpacity', 1);
  material.setFloat('hitFlash', 0);
  material.setFloat('caveFogActive', 0);
  material.onBindObservable.add(mesh => {
    const effect = material.getEffect();
    bindCaveFogMaterial(scene,material);
    // ShaderMaterial caches bone bindings with the shared material. Consecutive
    // silhouettes must bind their own rig even when the material/effect is unchanged.
    BindBonesParameters(mesh, effect);
    if(mesh.morphTargetManager){BindMorphTargetParameters(mesh,effect);if(mesh.morphTargetManager.isUsingTextureForTargets)mesh.morphTargetManager._bind(effect);}
    effect?.setFloat('outlineWidth', mesh.metadata.outlineWidth);
    effect?.setFloat('outlinePixels', mesh.metadata.outlinePixels??0);
    const engine=scene.getEngine(),canvas=engine.getRenderingCanvas();
    effect?.setFloat2('outlineViewport',canvas?.clientWidth||engine.getRenderWidth(),canvas?.clientHeight||engine.getRenderHeight());
    effect?.setFloat('outlineOpacity', mesh.visibility);
    const source = mesh.parent;
    effect?.setFloat('hitFlash', source&&(source.renderOverlay||source.metadata?.elenaInlineFlash) ? source.overlayAlpha : 0);
  });
  materials.set(scene, material);
  return material;
}

export function attachCharacterOutlines(asset, kind) {
  const added = [];
  for (const source of [...asset.meshes]) {
    if (!source.getTotalVertices?.() || isRuntimeOutline(source) || /outline/i.test(source.name)) continue;
    let profile = kind;
    if (kind === 'warrior') {
      profile = { Golden_Oathblade: 'sword', Bunnyguard_Shield: 'shield' }[source.name];
      if (!profile) continue;
    }
    if (!widths[profile] || !source.isVerticesDataPresent(VertexBuffer.NormalKind)) continue;
    if (source.getChildMeshes(true).some(isRuntimeOutline)) continue;
    const shell = source.clone(`${source.name} / silhouette`, source, true);
    // The parent supplies the source's entire animated transform. Copy only its skin bind pose.
    shell.position.setAll(0); shell.rotation.setAll(0);
    shell.rotationQuaternion = Quaternion.Identity(); shell.scaling.setAll(1);
    shell.setPivotMatrix(Matrix.Identity());
    shell.updatePoseMatrix(source.getPoseMatrix());
    shell.skeleton = source.skeleton;
    shell.morphTargetManager = source.morphTargetManager;
    shell.numBoneInfluencers = source.numBoneInfluencers;
    shell.computeBonesUsingShaders = source.computeBonesUsingShaders;
    shell.metadata = { moonforestOutline: true, outlineWidth: widths[profile], ...(profile==='elena'?{outlinePixels:.5}:{}) };
    shell.material = outlineMaterial(source.getScene());
    shell.isPickable = false; shell.checkCollisions = false; shell.receiveShadows = false;
    shell.renderOutline = false; shell.renderOverlay = false;
    shell.alwaysSelectAsActiveMesh = source.alwaysSelectAsActiveMesh;
    shell.visibility = source.visibility; shell.isVisible = source.isVisible;
    added.push(shell);
  }
  asset.meshes.push(...added);
  return added;
}
