import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {CHAPTER_MONSTER_MODELS} from '../src/v03/chapter-monster-models.js';

for(const [kind,entry] of Object.entries(CHAPTER_MONSTER_MODELS)){
  test(kind+' has its own fitted skeleton, animation set and compressed color',()=>{
    const bytes=readFileSync(entry.url),jsonLength=bytes.readUInt32LE(12);
    assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);
    const doc=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
    const bin=bytes.subarray(28+jsonLength);
    const skin=doc.skins[0],mesh=doc.meshes[0].primitives[0];
    assert.equal(doc.meshes.length,1);assert.equal(doc.materials.length,1);
    assert.ok(doc.accessors[mesh.indices].count/3<=10200);
    assert.ok(Math.abs(doc.accessors[mesh.attributes.POSITION].max[1]-entry.height)<.001);
    assert.deepEqual(doc.animations.map(a=>a.name).sort(),Object.values(entry.clips).sort());
    assert.ok(doc.nodes.some(n=>n.name==='Hand.R'));assert.ok(doc.nodes.some(n=>n.name==='Hand.L'));
    assert.equal(skin.joints.length,21);assert.equal(doc.accessors[skin.inverseBindMatrices].count,skin.joints.length);
    const weights=doc.accessors[mesh.attributes.WEIGHTS_0],joints=doc.accessors[mesh.attributes.JOINTS_0];
    assert.equal(weights.count,joints.count);
    const off=doc.bufferViews[weights.bufferView].byteOffset,joff=doc.bufferViews[joints.bufferView].byteOffset;
    for(let i=0;i<weights.count;i++){
      let sum=0;
      for(let c=0;c<4;c++){sum+=bin.readFloatLE(off+(i*4+c)*4);assert.ok(bin[joff+i*4+c]<21);}
      assert.ok(Math.abs(sum-1)<.00001);
    }
    // In these two bind meshes the chin and tusks used to follow the shoulders
    // when attacking. Their shape should follow the skull through every clip.
    const jawLandmarks = {
      'goblin-warrior': [3228, 2831, 3373, 3086],
      'goblin-shaman': [1251, 3513, 3304, 3619],
    }[kind];
    if (jawLandmarks) {
      const head = skin.joints.findIndex(node => doc.nodes[node].name === 'Head');
      assert.ok(head >= 0);
      for (const vertex of jawLandmarks) {
        let headWeight = 0;
        for (let slot = 0; slot < 4; slot++) {
          const index = vertex * 4 + slot;
          if (bin[joff + index] === head) headWeight += bin.readFloatLE(off + index * 4);
        }
        assert.ok(headWeight > 0.9999, `${kind} jaw vertex ${vertex} follows the skull`);
      }
    }
    assert.ok(doc.extensionsRequired.includes('KHR_texture_basisu'));
    const image=doc.images[0],texture=doc.bufferViews[image.bufferView].byteOffset;
    assert.equal(image.mimeType,'image/ktx2');assert.equal(bin.readUInt32LE(texture+20),2048);
    assert.ok(bin.readUInt32LE(texture+40)>1);
  });
}
