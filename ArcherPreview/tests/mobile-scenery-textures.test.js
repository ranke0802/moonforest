import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sceneryHighTextureProfile,protectedSceneryTexture} from '../src/mobile-texture-policy.js';
import {VillageTextureStreaming} from '../src/village-texture-streaming.js';
import {highTextureBytes,textureCompressionAvailable} from '../src/village-texture-budget.js';

const profile=size=>({shading:'toon-color',textures:{albedo:{url:'./content/test'+size+'.ktx2',width:size,height:size,codec:'uastc'}},resources:['./content/test'+size+'.ktx2']});
const asset=()=>({category:'prop',highTextures:profile(4096),mobileHighTextures:profile(1024)});
test('mobile profiles are selected by asset, desktop and protected houses keep exact original references',()=>{
 const a=asset();assert.equal(sceneryHighTextureProfile('cart',a,true),a.mobileHighTextures);
 assert.equal(sceneryHighTextureProfile('cart',a,false),a.highTextures);
 for(const [id,category] of [['house-01-cottage','prop'],['village-approach','landmark'],['chapel','prop'],['home','building']]){
  const c={...a,category};assert.equal(protectedSceneryTexture(id,c),true);assert.equal(sceneryHighTextureProfile(id,c,true),c.highTextures);
 }
 assert.equal(sceneryHighTextureProfile('cart',{mobileHighTextures:profile(1024)},true),undefined);
 for(const patch of [{shading:'pbr'},{resources:[]},{textures:{albedo:{...profile(1024).textures.albedo,width:8192,height:8192}}}]){
  const c={...a,mobileHighTextures:{...profile(1024),...patch}};assert.equal(sceneryHighTextureProfile('cart',c,true),a.highTextures);
 }
});
test('mobile streaming reserves and loads selected tier while house reservation stays 4K; release restores original slots',async()=>{
 const original={tag:'base'},material={albedoTexture:original,metadata:{villageToon:true}};
 const a=asset(),house={...asset(),category:'building'};
 const manager=Object.assign(Object.create(VillageTextureStreaming.prototype),{world:{touchDevice:true},assets:new Map([
  ['cart',{config:a,source:{materials:[material]}}],['home',{config:house,source:{materials:[material]}}]]),
  wanted:new Map([['cart',1],['home',1]]),resident:new Map(),failed:new Set(),stats:{highTextureLoads:0,highTextureReleases:0},disposed:false,pending:null,pendingBytes:0,budget:96*1048576,maxTextureSize:4096,compressedSupported:true});
 const loaded=[];manager.loadTexture=async config=>{const t={getSize:()=>({width:config.width,height:config.height}),dispose(){this.disposed=true;}};loaded.push({config,t});return t;};
 assert.equal(highTextureBytes(manager.profile('cart')),1398128);
 const mobileTask=manager.start('cart');assert.equal(manager.pendingBytes,highTextureBytes(a.mobileHighTextures));await mobileTask;
 assert.equal(loaded[0].config,a.mobileHighTextures.textures.albedo);assert.equal(manager.stats.highTextureMax,1024);
 manager.release('cart');assert.equal(material.albedoTexture,original);assert.equal(loaded[0].t.disposed,true);
 await manager.start('home');assert.equal(loaded[1].config,house.highTextures.textures.albedo);assert.equal(manager.stats.highTextureMax,4096);
 manager.release('home');assert.equal(material.albedoTexture,original);assert.equal(manager.stats.highTextureBytes,0);
});
test('sparse compression capabilities reserve actual RGBA fallback, never ASTC storage for ETC1S',()=>{
 const p=profile(1024);p.textures.albedo.codec='etc1s';
 assert.equal(textureCompressionAvailable(p.textures.albedo,{astc:true}),false);
 assert.equal(highTextureBytes(p,{astc:true}),5592404);
 assert.equal(highTextureBytes(p,{etc2:true}),1398128);
 assert.equal(highTextureBytes(p,{bptc:true}),1398128);
 p.textures.albedo.alpha=true;assert.equal(highTextureBytes(p,{etc1:true}),5592404);
 p.textures.albedo.codec='uastc';assert.equal(highTextureBytes(p,{astc:true}),1398128);
 assert.equal(highTextureBytes(p,{}),5592404);
});
test('every published mobile tier stays within 2K and references exact bounded KTX bytes without changing original geometry',()=>{
 let count=0;
 for(const name of ['village','great-plains','monster-forest','witch-cave','village-plains-outskirts']){
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/'+name+'.json',import.meta.url),'utf8'));
  for(const [id,c] of Object.entries(manifest.assets)){
   if(protectedSceneryTexture(id,c))assert.equal(c.mobileHighTextures,undefined,id);
   if(!c.mobileHighTextures)continue;count++;
   const selected=sceneryHighTextureProfile(id,c,true),tex=selected.textures.albedo;
   assert.equal(selected,c.mobileHighTextures);assert.ok(tex.width<=2048);assert.ok(highTextureBytes(selected)<highTextureBytes(c.highTextures));
   const bytes=readFileSync(new URL('../public/assets/'+tex.url,import.meta.url));
   assert.equal(bytes.readUInt32LE(20),tex.width);assert.equal(bytes.readUInt32LE(24),tex.height);
   assert.equal(bytes.readUInt32LE(40),Math.log2(tex.width)+1);assert.equal(bytes.length,tex.bytes);
  }
 }
 assert.ok(count>0,'packed mobile color tiers must be present');
});
