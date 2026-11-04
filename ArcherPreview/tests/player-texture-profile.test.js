import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {playerTextureManifest,playerTextureCapabilities,selectPlayerTextureProfile} from '../src/player-texture-profile.js';

const base=new URL('../public/assets/',import.meta.url);
const bytes=path=>readFileSync(new URL(path,base));
const read=path=>JSON.parse(bytes(path));
const hash=data=>createHash('sha256').update(data).digest('hex');
const aliases=['warrior-v3','warrior-v4','warrior-v5','warrior-plains'];
const mobileAgents=[{userAgent:'Mozilla iPhone OS 18_0'},
  {userAgent:'iPad'},{platform:'MacIntel',maxTouchPoints:5},
  {userAgent:'Android SM-S911 Chrome'},
  {userAgent:'Mozilla/5.0 (Linux; Android 14; Lenovo TB320FC) Chrome/130'}];

test('S23, iPad, iPhone and Y700 with a 4096 texture limit select one compressed 4K plan for all four maps',()=>{
  for(const nav of mobileAgents)for(const character of aliases){
    for(const format of ['astc','bptc','s3tc','etc2']){
      const caps={[format]:{},maxTextureSize:4096};
      assert.equal(playerTextureManifest(character,caps,nav),'warrior-v3-mobile4k');
      const profile=selectPlayerTextureProfile(character,caps,nav);
      assert.equal(profile.maxSize,4096);assert.equal(profile.gpuCompressed,true);
      assert.equal(profile.capabilities.formats[format],true);
    }
  }
});

test('no GPU compression uses bounded image fallbacks, never the old 8K profile',()=>{
  for(const nav of mobileAgents)for(const character of aliases){
    for(const size of [4096,8192,16384]){
      const profile=selectPlayerTextureProfile(character,{maxTextureSize:size},nav);
      assert.equal(profile.manifest,'warrior-v3-mobile2k-rgba');
      assert.equal(profile.maxSize,2048);assert.equal(profile.gpuCompressed,false);
      assert.ok(profile.estimatedGpuBytes<129*1024*1024);
      assert.equal(profile.maxImageRgbaBytes,16*1024*1024);
    }
    for(const size of [2048,3072,4095]){
      const profile=selectPlayerTextureProfile(character,{maxTextureSize:size,astc:{}},nav);
      assert.equal(profile.manifest,'warrior-v3-mobile2k-rgba');
      assert.ok(profile.maxSize<=size);assert.equal(profile.gpuCompressed,false);
    }
  }
});

test('unsupported/unknown limits report the actual limit and every supported format',()=>{
  for(const size of [1024,0,undefined,NaN,Infinity]){
    const caps={maxTextureSize:size,astc:true,etc2:false,bptc:{},s3tc:null};
    assert.throws(()=>playerTextureManifest('warrior-v3',caps,{userAgent:'Android Y700'}),error=>{
      assert.equal(error.code,'PLAYER_TEXTURE_CAPABILITY');
      assert.match(error.message,/MAX_TEXTURE_SIZE=/);
      assert.ok(error.message.includes(Number.isFinite(size)&&size>0?String(size):'unknown'));
      for(const format of ['ASTC=yes','BPTC=yes','S3TC=no','ETC2=no'])assert.ok(error.message.includes(format));
      assert.deepEqual(error.capabilities,playerTextureCapabilities(caps));return true;
    });
  }
});

test('desktop retains original player and unrelated characters retain their manifests',()=>{
  for(const character of aliases)for(const nav of [{userAgent:'Windows Chrome'},
    {userAgent:'Mac Safari',platform:'MacIntel',maxTouchPoints:0}]){
    assert.equal(playerTextureManifest(character,{maxTextureSize:16384},nav),'warrior-v3');
    assert.equal(selectPlayerTextureProfile(character,{},nav).maxSize,8192);
  }
  for(const [character,expected]of [['archer','character'],['warrior-v2','warrior-v2'],['warrior','warrior']]){
    assert.equal(playerTextureManifest(character,undefined,{userAgent:'iPhone'}),expected);
  }
});

const source=read('warrior-v3.json'),original=read(source.model),ios=read(read('warrior-v3-ios.json').model);
const dimensions=[8192,8192,2048,2048,2048,4096];
const textureSource=texture=>texture.source??texture.extensions?.KHR_texture_basisu?.source??texture.extensions?.EXT_texture_webp?.source;
const fields=['buffers','bufferViews','accessors','nodes','skins','meshes','materials','animations','samplers','scenes','scene'];

for(const [name,cap,compressed]of [['warrior-v3-mobile4k',4096,true],['warrior-v3-mobile2k-rgba',2048,false]]){
  test(name+' keeps exact geometry/rig/materials/clips and has a complete bounded resource graph',()=>{
    const config=read(name+'.json'),gltf=read(config.model);
    assert.equal(config.textureProfile.maxSize,cap);
    assert.equal(config.textureProfile.requiresGpuCompression,compressed);
    assert.equal(gltf.asset.extras.moonforestSerialTextures,true);
    for(const field of fields)assert.deepEqual(gltf[field],original[field],field);
    for(const [key,value]of Object.entries(source))if(!['model','resources','textureProfile','bytes'].includes(key))assert.deepEqual(config[key],value,key);
    assert.equal(gltf.images.length,6);assert.equal(gltf.textures.length,original.textures.length);
    let total=0;
    for(const resource of config.resources){
      const data=bytes(resource);total+=data.length;
      assert.equal(hash(data),resource.split('/').at(-1).split('.')[0]);
    }
    assert.equal(config.bytes,total);
    assert.deepEqual(new Set(config.resources),new Set([config.model,
      ...gltf.buffers.filter(item=>item.uri).map(item=>'./content/'+item.uri),
      ...gltf.images.map(image=>'./content/'+image.uri)]));
    gltf.images.forEach((image,index)=>{
      const raw=bytes('content/'+image.uri),size=Math.min(cap,dimensions[index]);
      if(compressed){
        assert.equal(image.mimeType,'image/ktx2');
        assert.equal(raw.readUInt32LE(20),size);assert.equal(raw.readUInt32LE(24),size);
        assert.equal(raw.readUInt32LE(40),Math.log2(size)+1);
        assert.equal(raw.readUInt32LE(44),2);
        assert.equal(raw[raw.readUInt32LE(48)+12],166);
        for(let level=0;level<raw.readUInt32LE(40);level++){
          const length=Number(raw.readBigUInt64LE(96+level*24)),n=Math.max(1,size>>level);
          assert.equal(length,Math.ceil(n/4)**2*16);
        }
        if(dimensions[index]<=cap)assert.equal(image.uri,ios.images[index].uri,'reuse smaller KTX2 byte exact');
      }else if(dimensions[index]>cap){
        assert.equal(image.mimeType,'image/png');
        assert.equal(raw.readUInt32BE(16),size);assert.equal(raw.readUInt32BE(20),size);
      }else assert.deepEqual(image,original.images[index],'reuse bounded original byte exact');
    });
    gltf.textures.forEach((texture,index)=>{
      assert.equal(textureSource(texture),textureSource(original.textures[index]));
      if(compressed)assert.equal(texture.extensions.KHR_texture_basisu.source,textureSource(original.textures[index]));
      else assert.equal(texture.extensions?.KHR_texture_basisu,undefined);
    });
    assert.equal(gltf.extensionsRequired.includes('KHR_texture_basisu'),compressed);
    const original8k=original.images.slice(0,2).map(image=>image.uri);
    assert.ok(config.resources.every(resource=>!original8k.some(uri=>resource.endsWith(uri))));
  });
}

test('desktop 8K and historical iOS 8K files remain byte exact against the conversion ledger',()=>{
  const report=JSON.parse(readFileSync(new URL('../reports/mobile-quality-2026-11-04/player-package.json',import.meta.url)));
  for(const item of report.originalPlayerFilesVerifiedUnchanged){
    const data=readFileSync(new URL('../'+item.path,import.meta.url));
    assert.equal(hash(data),item.sha256,item.path);assert.equal(data.length,item.bytes,item.path);
  }
  assert.equal(source.textureProfile.maxSize,8192);
  assert.equal(read('warrior-v3-ios.json').textureProfile.maxSize,8192);
  const compressed=report.variants.find(item=>item.manifest.path.endsWith('warrior-v3-mobile4k.json'));
  assert.equal(compressed.images.filter(image=>image.resized).length,2);
  assert.equal(compressed.images.filter(image=>image.reusedExistingBytes).length,4);
  assert.ok(compressed.uniqueImageAstc4x4Bc7WorstCaseEtc2BytesWithMips<81*1024*1024);
  assert.equal(compressed.largestRgbaImageDecodeBytes,64*1024*1024);
  const selected=selectPlayerTextureProfile('warrior-v3',{astc:{},maxTextureSize:4096},mobileAgents[0]);
  assert.equal(selected.estimatedGpuBytes,compressed.uniqueImageAstc4x4Bc7WorstCaseEtc2BytesWithMips);
  const rgba=report.variants.find(item=>item.manifest.path.endsWith('warrior-v3-mobile2k-rgba.json'));
  const fallback=selectPlayerTextureProfile('warrior-v3',{maxTextureSize:8192},mobileAgents[0]);
  assert.equal(fallback.estimatedGpuBytes,rgba.uniqueImageRgbaBytesWithMips);
});
