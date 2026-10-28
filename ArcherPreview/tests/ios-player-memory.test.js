import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,Texture} from '@babylonjs/core';
import {GLTFLoader} from '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {registeredGLTFExtensions} from '@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry.js';
import {serializeTextureCreation} from '../src/serial-player-textures.js';
import {playerTextureManifest} from '../src/player-texture-profile.js';
const base=new URL('../public/assets/',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,base),'utf8'));

test('iPhone/iPad choose only the compressed 8K plan; Android/desktop keep the original player',()=>{
  const caps={astc:{},maxTextureSize:16384};
  for(const nav of [{userAgent:'Mozilla iPhone OS 18_0'},{userAgent:'iPad'},{platform:'MacIntel',maxTouchPoints:5}]){
    assert.equal(playerTextureManifest('warrior-v3',caps,nav),'warrior-v3-ios');
    assert.throws(()=>playerTextureManifest('warrior-v3',{...caps,astc:null},nav),/8K/);
    assert.throws(()=>playerTextureManifest('warrior-v3',{...caps,maxTextureSize:4096},nav),/8K/);
  }
  for(const nav of [{userAgent:'Android SM-S911'},{platform:'MacIntel',maxTouchPoints:0}])assert.equal(playerTextureManifest('warrior-v3',caps,nav),'warrior-v3');
  assert.equal(playerTextureManifest('warrior-v2',caps,{userAgent:'iPhone'}),'warrior-v2');
  assert.equal(playerTextureManifest('archer',caps,{}),'character');
});

test('serial loading uses actual Babylon creation: synchronous alpha/UV assignment, then one upload at a time',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine),events=[],assigned=[];
  const update=Texture.prototype.updateURL;
  t.after(()=>{Texture.prototype.updateURL=update;engine.dispose();});
  Texture.prototype.updateURL=function(url){
    events.push('upload:'+url.split('/').at(-1));
    setTimeout(()=>{events.push('ready:'+url.split('/').at(-1));this._delayedOnLoad();},5);
  };
  const loader={_createTextureAsync:GLTFLoader.prototype._createTextureAsync,
    _babylonScene:scene,_parent:{useSRGBBuffers:true},_uniqueRootUrl:'https://test/',
    _loadSampler:()=>({noMipMaps:false,samplingMode:3,wrapU:1,wrapV:1}),
    loadImageAsync:async(_,im)=>{events.push('read:'+im.uri);return new Uint8Array(4);}};
  const original=loader._createTextureAsync,readImage=loader.loadImageAsync,restore=serializeTextureCreation(loader);
  const load=i=>loader._createTextureAsync('/textures/'+i,{index:0},{index:i,uri:i+'.ktx2',mimeType:'image/ktx2'},texture=>{
    texture.coordinatesIndex=i;texture.hasAlpha=true;assigned.push(texture);
  },undefined,true);
  const first=load(0),second=load(1);
  assert.equal(assigned.length,2);assert.equal(assigned[1].coordinatesIndex,1);assert.equal(assigned[1].hasAlpha,true);
  assert.deepEqual(events,[]);assert.equal(loader.loadImageAsync,readImage);
  await Promise.all([first,second]);
  assert.deepEqual(events,['read:0.ktx2','upload:0.ktx2','ready:0.ktx2','read:1.ktx2','upload:1.ktx2','ready:1.ktx2']);
  restore();assert.equal(loader._createTextureAsync,original);
});

test('a failed texture stops remaining reads without retrying or changing unrelated glTF loaders',async()=>{
  const reads=[],loader={loadImageAsync:async(_,i)=>{reads.push(i);throw new Error('decode failed');},
    _createTextureAsync(_,s,image,assign){assign({});return this.loadImageAsync('',image);}};
  serializeTextureCreation(loader);
  const results=await Promise.allSettled([0,1,2].map(i=>loader._createTextureAsync('',{},i,()=>{})));
  assert.deepEqual(reads,[0]);assert.ok(results.every(r=>r.status==='rejected'));
  const factory=registeredGLTFExtensions.get('MOONFOREST_serial_player_textures').factory;
  const plain={gltf:{asset:{}},_createTextureAsync(){}};const original=plain._createTextureAsync;
  const extension=factory(plain);extension.onLoading();assert.equal(plain._createTextureAsync,original);extension.dispose();
});

test('iOS package preserves 8K, full mip chains, alpha, geometry, rig, materials and source UVs',()=>{
  const source=read('warrior-v3.json'),ios=read('warrior-v3-ios.json'),a=read(source.model),b=read(ios.model);
  assert.equal(ios.textureProfile.maxSize,8192);assert.equal(ios.textureProfile.preserveSourceResolution,true);
  assert.equal(b.asset.extras.moonforestSerialTextures,true);
  for(const field of ['buffers','bufferViews','accessors','nodes','skins','meshes','materials','animations','samplers','scenes'])assert.deepEqual(b[field],a[field],field);
  for(const [key,value]of Object.entries(source))if(!['model','resources','textureProfile'].includes(key))assert.deepEqual(ios[key],value,key);
  assert.equal(b.images.length,a.images.length);
  const dimensions=[8192,8192,2048,2048,2048,4096];let compressed=0,rgba=0;
  b.images.forEach((im,i)=>{
    assert.equal(im.mimeType,'image/ktx2');const raw=readFileSync(new URL('content/'+im.uri,base));
    assert.equal(createHash('sha256').update(raw).digest('hex'),im.uri.split('.')[0]);
    assert.equal(raw.readUInt32LE(20),dimensions[i]);assert.equal(raw.readUInt32LE(24),dimensions[i]);
    assert.equal(raw.readUInt32LE(40),Math.log2(dimensions[i])+1);assert.equal(raw.readUInt32LE(44),2); // Zstd
    const dfd=raw.readUInt32LE(48);assert.equal(raw[dfd+12],166); // UASTC, never RGBA
    for(let level=0;level<raw.readUInt32LE(40);level++)compressed+=Number(raw.readBigUInt64LE(80+level*24+16));
    rgba+=dimensions[i]**2*4*4/3;
  });
  assert.ok(compressed/rgba<.251);
  b.textures.forEach((texture,i)=>assert.equal(texture.extensions.KHR_texture_basisu.source,a.textures[i].source??a.textures[i].extensions.EXT_texture_webp.source));
  assert.ok(ios.resources.every(p=>!a.images.some(im=>p.endsWith(im.uri))));
  assert.deepEqual(new Set(ios.resources),new Set([ios.model,...b.buffers.filter(x=>x.uri).map(x=>'./content/'+x.uri),...b.images.map(x=>'./content/'+x.uri)]));
});
