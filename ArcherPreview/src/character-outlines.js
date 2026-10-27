import { Color3, Matrix, Quaternion, ShaderMaterial, VertexBuffer } from '@babylonjs/core';
import { BindBonesParameters } from '@babylonjs/core/Materials/materialHelper.functions.js';
import '@babylonjs/core/Shaders/ShadersInclude/bonesDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/bonesVertex.js';

// One unlit back-face pass, using the original GPU geometry and skeleton.
// No screen-sized render target, extra textures, shadow pass or CPU skinning.
const vertexSource = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float outlineWidth;
#include<bonesDeclaration>
void main(void) {
  mat4 finalWorld = world;
  #include<bonesVertex>
  vec4 worldPosition = finalWorld * vec4(position, 1.0);
  vec3 worldNormal = normalize(mat3(finalWorld) * normal);
  worldPosition.xyz += worldNormal * outlineWidth;
  gl_Position = viewProjection * worldPosition;
}`;
const fragmentSource = `
precision mediump float;
uniform vec3 outlineColor;
uniform float outlineOpacity;
uniform float hitFlash;
void main(void) {
  gl_FragColor = vec4(mix(outlineColor, vec3(1.0), hitFlash), outlineOpacity);
}`;
const materials = new WeakMap();
const widths = { sword: .0025, shield: .0035, bear: .006, goblin: .004, scarecrow: .0035 };
export const isRuntimeOutline = mesh => mesh.metadata?.moonforestOutline === true;

function outlineMaterial(scene) {
  if (materials.has(scene)) return materials.get(scene);
  const material = new ShaderMaterial('moonforest-character-outline', scene,
    { vertexSource, fragmentSource }, {
      attributes: ['position', 'normal'],
      uniforms: ['world', 'viewProjection', 'outlineWidth', 'outlineColor', 'outlineOpacity', 'hitFlash'],
    });
  material.backFaceCulling = true;
  material.cullBackFaces = false;
  material.disableDepthWrite = true;
  material.setColor3('outlineColor', new Color3(.035, .025, .035));
  material.setFloat('outlineWidth', .004);
  material.setFloat('outlineOpacity', 1);
  material.setFloat('hitFlash', 0);
  material.onBindObservable.add(mesh => {
    const effect = material.getEffect();
    // ShaderMaterial caches bone bindings with the shared material. Consecutive
    // silhouettes must bind their own rig even when the material/effect is unchanged.
    BindBonesParameters(mesh, effect);
    effect?.setFloat('outlineWidth', mesh.metadata.outlineWidth);
    effect?.setFloat('outlineOpacity', mesh.visibility);
    const source = mesh.parent;
    effect?.setFloat('hitFlash', source?.renderOverlay ? source.overlayAlpha : 0);
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
    shell.numBoneInfluencers = source.numBoneInfluencers;
    shell.computeBonesUsingShaders = source.computeBonesUsingShaders;
    shell.metadata = { moonforestOutline: true, outlineWidth: widths[profile] };
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
