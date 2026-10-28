import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {packTreeGeometry,TREE_IDS} from '../scripts/pack-village-tree-refinement.mjs';
import {hash} from '../scripts/resource-pack.js';

const assets=new URL('../public/assets/',import.meta.url);
const read=url=>JSON.parse(readFileSync(url));
const manifest=read(new URL('village.json',assets));
const gltf=lod=>read(new URL(lod.model,assets));
const numbers=(g,index)=>{
  const a=g.accessors[index],v=g.bufferViews[a.bufferView],buffer=readFileSync(new URL('./content/'+g.buffers[v.buffer].uri,assets));
  const size={SCALAR:1,VEC2:2,VEC3:3}[a.type],step=a.componentType===5126?4:2,start=(v.byteOffset??0)+(a.byteOffset??0);
  return Array.from({length:a.count*size},(_,i)=>a.componentType===5126?buffer.readFloatLE(start+i*step):buffer.readUInt16LE(start+i*step));
};

test('refined tree packing rejects corrupt vertex channels and out-of-range indices',()=>{
  const raw={positions:[[0,0,0],[1,0,0],[0,1,0]],normals:[[0,0,1],[0,0,1],[0,0,1]],uvs:[[0,0],[1,0],[0,1]],indices:[0,1,2]};
  const packed=packTreeGeometry(raw);assert.equal(packed.accessors[3].count,3);assert.equal(packed.bytes.length%4,0);
  assert.throws(()=>packTreeGeometry({...raw,indices:[0,1,3]}),/index/);
  assert.throws(()=>packTreeGeometry({...raw,uvs:[[NaN,0],[1,0],[0,1]]}),/finite/);
});

test('both trees retain single opaque draw meshes, identical mobile geometry and smaller LOD budgets',()=>{
  assert.equal(Object.keys(manifest.assets).length,25);
  assert.deepEqual(manifest.geometryLod.nearGeometryEdits,TREE_IDS);
  for(const id of TREE_IDS){
    const a=manifest.assets[id];assert.equal(a.treeRefinement.newTextures,0);
    assert.equal(a.highTextures.colorResolution,4096);assert.equal(Object.keys(a.highTextures.textures).length,1);
    const near=gltf(a.lods[0]),mobile=gltf(a.mobileNear);
    assert.deepEqual(mobile.buffers,near.buffers);assert.equal(a.mobileNear.triangles,a.lods[0].triangles);
    for(const [level,lod]of a.lods.entries()){
      assert.ok(lod.triangles<a.treeRefinement.originalTriangles[level]);
      const g=gltf(lod),p=g.meshes[0].primitives[0];
      assert.equal(g.meshes.length,1);assert.equal(g.meshes[0].primitives.length,1);assert.equal(g.materials.length,1);
      assert.equal(g.materials[0].alphaMode??'OPAQUE','OPAQUE');assert.equal(g.images.length,1);
      assert.deepEqual(g.nodes,[{name:id,mesh:0}]);
      const positions=numbers(g,p.attributes.POSITION),normals=numbers(g,p.attributes.NORMAL),uvs=numbers(g,p.attributes.TEXCOORD_0),indices=numbers(g,p.indices);
      assert.equal(indices.length/3,lod.triangles);assert.ok(indices.every(i=>i<positions.length/3));
      assert.ok([...positions,...normals,...uvs].every(Number.isFinite));
      for(let i=0;i<normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...normals.slice(i,i+3))-1)<1e-5);
      for(const ref of lod.resources)assert.equal(hash(readFileSync(new URL(ref,assets))),ref.split('/').at(-1).split('.')[0]);
    }
    // Leaf sprays are the final triangles, shared exactly across geometry LODs.
    const leafCount=id.includes('oak')?1200:2000;
    const leafPositions=a.lods.map(lod=>{const g=gltf(lod),p=g.meshes[0].primitives[0],pos=numbers(g,p.attributes.POSITION);return numbers(g,p.indices).slice(-leafCount*3).flatMap(i=>pos.slice(i*3,i*3+3));});
    assert.deepEqual(leafPositions[0],leafPositions[1]);assert.deepEqual(leafPositions[0],leafPositions[2]);
  }
});
