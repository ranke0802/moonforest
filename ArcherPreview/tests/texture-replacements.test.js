import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TEXTURE_REPLACEMENTS,MONSTER_2K_TEXTURES,replacementExtension,setTextureTier} from '../src/texture-replacements.js';
import {trimTopLevel} from '../scripts/trim-ktx2-top-level.mjs';

const assets=new URL('../public/assets/',import.meta.url);

test('every replacement is a published KTX2 named by its own hash, for a picture some model still names',()=>{
 const manifest=JSON.parse(readFileSync(new URL('texture-replacements.json',assets),'utf8'));
 assert.deepEqual(manifest.textures,Object.fromEntries(Object.entries(TEXTURE_REPLACEMENTS).map(([from,to])=>[from,'./content/'+to])),'the published list and the loader table agree');
 const named=['environment.json','great-plains.json','guardian-bear.json'].map(name=>readFileSync(new URL(name,assets),'utf8')).join('');
 for(const [from,to] of Object.entries(TEXTURE_REPLACEMENTS)){
  assert.match(to,/^[a-f0-9]{64}\.ktx2$/);assert.ok(named.includes(from),from+' is still a model resource');
  const file=new URL('content/'+to,assets);assert.ok(existsSync(file));
  const bytes=readFileSync(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),to.slice(0,64));
  assert.deepEqual([...bytes.subarray(0,12)],[0xab,0x4b,0x54,0x58,0x20,0x32,0x30,0xbb,0x0d,0x0a,0x1a,0x0a],'a KTX2 file');
 }
});

test('the loader hook swaps only a listed picture, only once the decoder is ready, and keeps the sampler and colour space',async()=>{
 const calls=[],sampler={magFilter:9729},loader={gltf:{images:[{uri:'aaa.jpg',index:0},{uri:'sub/bbb.png',index:1},{uri:'ccc.jpg',index:2}],samplers:[sampler]},
  _createTextureAsync(context,usedSampler,image,assign,options,srgb,source){calls.push({context,usedSampler,image,options,srgb,source});const made={name:image.uri};assign(made);return Promise.resolve(made);}};
 let ready=false;const extension=replacementExtension(loader,{replacements:{'aaa.jpg':'111.ktx2','bbb.png':'222.ktx2'},ready:()=>ready});
 const colour={source:0,sampler:0,_textureInfo:{nonColorData:false}};
 assert.equal(extension._loadTextureAsync('/textures/0',colour,()=>{}),null,'not before the decoder is ours');
 ready=true;
 let assigned=null;const made=await extension._loadTextureAsync('/textures/0',colour,texture=>{assigned=texture;});
 assert.equal(assigned,made);assert.deepEqual(calls[0].image,{uri:'111.ktx2',mimeType:'image/ktx2',index:0});assert.equal(calls[0].usedSampler,sampler);assert.equal(calls[0].srgb,true);assert.equal(calls[0].options,undefined);assert.equal(calls[0].source,colour);
 await extension._loadTextureAsync('/textures/3',{source:0,sampler:0,_textureInfo:{nonColorData:false}},()=>{});
 assert.equal(calls[1].image,calls[0].image,'one stand-in per image, so its bytes are fetched once');
 await extension._loadTextureAsync('/textures/1',{source:1,sampler:0,_textureInfo:{nonColorData:true}},()=>{});
 assert.equal(calls[2].image.uri,'sub/222.ktx2');assert.equal(calls[2].srgb,false);assert.deepEqual(calls[2].options,{useRGBAIfASTCBC7NotAvailableWhenUASTC:true});
 assert.equal(extension._loadTextureAsync('/textures/2',{source:2,_textureInfo:{}},()=>{}),null,'other pictures load as before');
 assert.equal(extension._loadTextureAsync('/textures/4',{_textureInfo:{}},()=>{}),null);
 assert.equal(calls.length,3);
});

test('0.3 regular monsters: each 2K file is its 4K original without the top level, byte for byte, and published',()=>{
 const manifest=JSON.parse(readFileSync(new URL('texture-replacements.json',assets),'utf8'));
 assert.deepEqual(manifest.tiers['monster-2k'],Object.fromEntries(Object.entries(MONSTER_2K_TEXTURES).map(([from,to])=>[from,'./content/'+to])));
 const named=['gray-wolf-r2.json','stylized-wolf-r2.json','wolf-3-r2.json','fox-r2.json','boar-r3.json'].map(name=>readFileSync(new URL(name,assets),'utf8')).join('');
 const bosses=['alpha-wolf.json','elena.json','mourning-elena.json'].map(name=>JSON.parse(readFileSync(new URL(name,assets),'utf8')).model);
 for(const [from,to] of Object.entries(MONSTER_2K_TEXTURES)){
  assert.ok(named.includes(from.slice(0,64)),from+' is a regular monster texture');
  for(const model of bosses)assert.ok(!readFileSync(new URL(model,assets),'utf8').includes(from),'bosses keep 4K');
  const original=readFileSync(new URL('content/'+from,assets)),small=readFileSync(new URL('content/'+to,assets));
  assert.equal(createHash('sha256').update(small).digest('hex'),to.slice(0,64));
  assert.ok(trimTopLevel(original).bytes.equals(small),'the published file is exactly the trimmed original');
  assert.equal(small.readUInt32LE(20),2048);assert.equal(small.readUInt32LE(24),2048);assert.equal(small.readUInt32LE(40),original.readUInt32LE(40)-1);
  // Level n of the small file is level n+1 of the original.
  for(let level=0;level<small.readUInt32LE(40);level++){
   const at=(file,l)=>[Number(file.readBigUInt64LE(80+l*24)),Number(file.readBigUInt64LE(88+l*24))];
   const [a,al]=at(small,level),[b,bl]=at(original,level+1);assert.equal(al,bl);assert.ok(small.subarray(a,a+al).equals(original.subarray(b,b+bl)));
  }
 }
});

test('a tier swaps a KTX2 image named through KHR_texture_basisu, only while the edition turns it on',async()=>{
 const calls=[],loader={gltf:{images:[{uri:'4k.ktx2',index:0}],samplers:[{}]},
  _createTextureAsync(context,sampler,image,assign){calls.push(image.uri);const made={};assign(made);return Promise.resolve(made);}};
 let tier=null;const extension=replacementExtension(loader,{replacements:{},tiers:()=>tier,ready:()=>true});
 assert.equal(extension.order,1,'runs before KHR_texture_basisu');
 const texture={sampler:0,extensions:{KHR_texture_basisu:{source:0}},_textureInfo:{}};
 assert.equal(extension._loadTextureAsync('/textures/0',texture,()=>{}),null,'no tier: the original 4K');
 tier={'4k.ktx2':'2k.ktx2'};await extension._loadTextureAsync('/textures/0',texture,()=>{});
 assert.deepEqual(calls,['2k.ktx2']);
 setTextureTier(null);
});
