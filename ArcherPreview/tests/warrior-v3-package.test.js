import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitGlb,hash} from '../scripts/resource-pack.js';
import {readAccessor,simplifyGeometry} from '../scripts/web-geometry.js';
import {warriorWebPolicy} from '../scripts/warrior-web-policy.js';
import {verifyCapeRevision,R6_SHA256} from '../scripts/pack-village-warrior.mjs';
import {EXT_texture_webp} from '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

const read=p=>readFileSync(new URL(p,import.meta.url));
const json=p=>JSON.parse(read(p));
const config=json('../public/assets/warrior-v3.json');
const actual=json('../public/assets/'+config.model);
const source=splitGlb(read('../assets/models/violet-warrior-v3.glb'));
const decoded=await readRuntimeGltf(new URL('../public/assets/'+config.model,import.meta.url));

test('V3 uses the reviewed R6 cape update with existing controller configuration',()=>{
  assert.equal(hash(read('../assets/models/violet-warrior-v3.glb')),R6_SHA256);
  const report=verifyCapeRevision(splitGlb(read('../assets/models/violet-warrior-v2.glb')),source);
  assert.equal(report.clips,9);assert.equal(report.geometryAndSkinAccessorsPreserved,167);
  const old=json('../public/assets/warrior-v2.json');
  for(const key of Object.keys(old))if(!['model','resources','version','modelRevision'].includes(key))assert.deepEqual(config[key],old[key],key);
});

test('V3 preserves full cape/body/rig/motions and the existing shield geometry policy',async()=>{
  const expected=await simplifyGeometry(source.gltf,source.files,warriorWebPolicy);
  for(const key of ['nodes','skins','meshes','materials','animations','accessors'])assert.deepEqual(actual[key],expected.gltf[key],key);
  for(let i=0;i<actual.accessors.length;i++)assert.deepEqual(readAccessor(decoded.gltf,decoded.files,i),readAccessor(expected.gltf,expected.files,i),'accessor '+i);
});

test('V3 restores both original 8K player maps and preserves all source resolutions',()=>{
  const profile=json('../assets/warrior-v3-textures.json');
  assert.equal(profile.sourceSha256,R6_SHA256);
  assert.equal(config.textureProfile.maxSize,8192);
  assert.equal(Object.values(profile.images).filter(r=>r.width===8192).length,2);
  for(const image of actual.images){
    const r=Object.values(profile.images).find(r=>r.uri===image.uri);
    assert.ok(r&&r.width===r.sourceWidth&&r.height===r.sourceHeight&&!r.resized&&r.pixelExactSource);
    const bytes=read('../public/assets/content/'+image.uri);
    assert.equal(hash(bytes),image.uri.split('.')[0]);assert.equal(bytes.length,r.bytes);
    if(r.width===8192)assert.ok(source.files.has(image.uri),'8K original must be byte exact');
  }
  const needed=new Set([config.model,...actual.buffers.filter(b=>b.uri).map(b=>'./content/'+b.uri),...actual.images.map(i=>'./content/'+i.uri)]);
  assert.deepEqual(new Set(config.resources),needed);
  assert.ok(profile.afterBytes<profile.beforeBytes);
});

test('Babylon resolves the shipped WebP texture extension to the correct image',async()=>{
  for(const texture of actual.textures){
    if(!texture.extensions?.EXT_texture_webp)continue;
    let decoded;
    const loader={gltf:actual,isExtensionUsed:n=>actual.extensionsUsed.includes(n),
      _createTextureAsync:async(_c,_s,image,assign)=>{decoded=image;assign(image);return image;}};
    const extension=new EXT_texture_webp(loader);
    texture._textureInfo={nonColorData:false};
    try {
      await extension._loadTextureAsync('/textures/0',texture,()=>{});
      assert.equal(decoded.mimeType,'image/webp');assert.match(decoded.uri,/\.webp$/);
    }finally{delete texture._textureInfo;extension.dispose();}
  }
});
