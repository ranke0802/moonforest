import { createHash } from 'node:crypto';

export const hash = data => createHash('sha256').update(data).digest('hex');

/** Lossless GLB packaging: stable geometry, morphs, skins, each clip and each image. */
export function splitGlb(bytes, { baseColorOnly = false } = {}) {
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  if (baseColorOnly) for (const material of gltf.materials || []) {
    // The runtime toon material uses painted color and geometric normals only.
    // Unreferenced maps are not fetched/decoded by the glTF material loader.
    delete material.normalTexture;
    delete material.occlusionTexture;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
      material.pbrMetallicRoughness.metallicFactor = 0;
      material.pbrMetallicRoughness.roughnessFactor = 1;
    }
  }
  const binaryStart = 28 + jsonLength;
  const originalViews = gltf.bufferViews;
  const groups = new Map(), assigned = new Map(), files = new Map();
  const assign = (accessor, group) => {
    const a = gltf.accessors[accessor];
    const views = [a.bufferView, a.sparse?.indices.bufferView, a.sparse?.values.bufferView];
    for (const view of views) if (view !== undefined && !assigned.has(view)) assigned.set(view, group);
  };
  for (const [i, mesh] of (gltf.meshes || []).entries()) for (const p of mesh.primitives) {
    for (const a of Object.values(p.attributes)) assign(a, `mesh-${i}`);
    if (p.indices !== undefined) assign(p.indices, `mesh-${i}`);
    for (const target of p.targets || []) for (const a of Object.values(target)) assign(a, `morph-${i}`);
  }
  for (const skin of gltf.skins || []) if (skin.inverseBindMatrices !== undefined) assign(skin.inverseBindMatrices, 'skin');
  for (const clip of gltf.animations || []) for (const sampler of clip.samplers) {
    assign(sampler.input, `animation-${clip.name}`); assign(sampler.output, `animation-${clip.name}`);
  }
  const store = (data, extension, parts, type) => {
    const name = `${hash(data)}.${extension}`;
    files.set(name, { data, parts, type });
    return name;
  };
  const imageViews = new Set();
  for (const image of gltf.images || []) {
    if (image.bufferView === undefined) continue;
    const v = originalViews[image.bufferView], offset = binaryStart + (v.byteOffset || 0);
    const extension = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp' }[image.mimeType];
    if (!extension) throw new Error(`Unsupported image type ${image.mimeType}`);
    image.uri = store(bytes.subarray(offset, offset + v.byteLength), extension, [[offset, v.byteLength]], image.mimeType);
    imageViews.add(image.bufferView); delete image.bufferView;
  }
  const remap = new Map(); gltf.bufferViews = []; gltf.buffers = [];
  originalViews.forEach((v, oldIndex) => {
    if (imageViews.has(oldIndex)) return;
    const group = assigned.get(oldIndex) || 'other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push([oldIndex, v]);
  });
  for (const entries of groups.values()) {
    const chunks = [], parts = []; let offset = 0;
    for (const [oldIndex, v] of entries) {
      const padding = (4 - offset % 4) % 4;
      if (padding) { chunks.push(Buffer.alloc(padding)); parts.push([null, padding]); offset += padding; }
      const start = binaryStart + (v.byteOffset || 0);
      chunks.push(bytes.subarray(start, start + v.byteLength)); parts.push([start, v.byteLength]);
      remap.set(oldIndex, gltf.bufferViews.length);
      gltf.bufferViews.push({ ...v, buffer:gltf.buffers.length, byteOffset:offset }); offset += v.byteLength;
    }
    const data = Buffer.concat(chunks);
    gltf.buffers.push({ uri:store(data, 'bin', parts, 'application/octet-stream'), byteLength:data.length });
  }
  for (const a of gltf.accessors) {
    if (a.bufferView !== undefined) a.bufferView = remap.get(a.bufferView);
    if (a.sparse) {
      a.sparse.indices.bufferView = remap.get(a.sparse.indices.bufferView);
      a.sparse.values.bufferView = remap.get(a.sparse.values.bufferView);
    }
  }
  const json = Buffer.from(JSON.stringify(gltf));
  const model = store(json, 'gltf', null, 'model/gltf+json');
  return { gltf, model, files };
}
