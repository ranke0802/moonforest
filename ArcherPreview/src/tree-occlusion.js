import { MaterialPluginBase, Vector3 } from '@babylonjs/core';

// A broad-phase segment/box test, never a raycast through foliage triangles.
export function blocksView(camera, target, min, max, padding = .18) {
  let enter = 0, leave = 1;
  for (const axis of ['x', 'y', 'z']) {
    const origin = camera[axis], delta = target[axis] - origin;
    const low = min[axis] - padding, high = max[axis] + padding;
    if (Math.abs(delta) < 1e-8) {
      if (origin < low || origin > high) return false;
      continue;
    }
    const a = (low - origin) / delta, b = (high - origin) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return leave > .002 && enter < .995;
}

// Screen-door transparency keeps opaque depth testing and native GPU instances.
// Unlike alpha blending it adds no transparent pass or per-tree material copies.
class TreeCoverage extends MaterialPluginBase {
  constructor(material) { super(material, 'MoonforestTreeCoverage', 400, {}, true, true); }
  getAttributes(attributes) { attributes.push('treeCoverage'); }
  getCustomCode(type) {
    if (type === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: `
        varying float vTreeCoverage;
        #ifdef INSTANCES
        attribute float treeCoverage;
        #endif`,
      CUSTOM_VERTEX_MAIN_BEGIN: `
        vTreeCoverage = 1.0;
        #ifdef INSTANCES
        vTreeCoverage = treeCoverage;
        #endif`,
    };
    if (type === 'fragment') return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        varying float vTreeCoverage;
        float treeBayer2(vec2 p) { return 2.0 * mod(p.x + p.y, 2.0) + mod(p.y, 2.0); }`,
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
        if (vTreeCoverage < 0.999) {
          vec2 p = mod(floor(gl_FragCoord.xy), 4.0);
          float threshold = (4.0 * treeBayer2(mod(p, 2.0)) + treeBayer2(floor(p / 2.0)) + 0.5) / 16.0;
          if (vTreeCoverage < threshold) discard;
        }`,
    };
    return null;
  }
}

export function prepareTreeOcclusion(meshes) {
  for (const mesh of meshes) {
    if (!mesh.getTotalVertices?.()) continue;
    mesh.registerInstancedBuffer('treeCoverage', 1);
    mesh.instancedBuffers.treeCoverage = 1;
    const material = mesh.material;
    if (!material || material.pluginManager?.getPlugin('MoonforestTreeCoverage')) continue;
    const frozen = material.isFrozen;
    material.unfreeze();
    new TreeCoverage(material);
    if (frozen) material.freeze();
  }
}

export class TreeOcclusion {
  constructor(roots) {
    this.trees = roots.map(root => {
      const meshes = root.getChildMeshes(false).filter(mesh => mesh.getTotalVertices() > 0);
      const min = new Vector3(Infinity, Infinity, Infinity), max = min.negate();
      for (const mesh of meshes) {
        const box = mesh.getBoundingInfo().boundingBox;
        min.minimizeInPlace(box.minimumWorld); max.maximizeInPlace(box.maximumWorld);
      }
      return { meshes, min, max, coverage: 1, target: 1 };
    });
    this.checkIn = 0;
    this.head = new Vector3(); this.chest = new Vector3();
  }
  update(camera, player, dt) {
    this.checkIn -= dt;
    if (this.checkIn <= 0) {
      this.checkIn = .1;
      this.head.copyFrom(player); this.head.y += 1.5;
      this.chest.copyFrom(player); this.chest.y += .85;
      for (const tree of this.trees) {
        tree.target = blocksView(camera, this.head, tree.min, tree.max) ||
          blocksView(camera, this.chest, tree.min, tree.max) ? .45 : 1;
      }
    }
    const step = Math.min(dt, .1) * 4;
    for (const tree of this.trees) {
      if (tree.coverage === tree.target) continue;
      tree.coverage += Math.sign(tree.target - tree.coverage) * Math.min(step, Math.abs(tree.target - tree.coverage));
      for (const mesh of tree.meshes) mesh.instancedBuffers.treeCoverage = tree.coverage;
    }
  }
}
