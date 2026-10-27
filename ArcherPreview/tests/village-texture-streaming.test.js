import test from 'node:test';
import assert from 'node:assert/strict';
import {VillageTextureStreaming} from '../src/village-texture-streaming.js';
function fixture(){
 const original={tag:'placeholder'},material={albedoTexture:original,bumpTexture:original,metallicTexture:original,unfreeze(){},freeze(){}};
 const manager=Object.assign(Object.create(VillageTextureStreaming.prototype),{assets:new Map([['house',{source:{materials:[material]},config:{highTextures:{textures:{albedo:{},normal:{},orm:{}}}}}]]),wanted:new Map([['house',1]]),resident:new Map(),stats:{highTextureLoads:0,highTextureReleases:0},disposed:false});
 const created=[];manager.loadTexture=async()=>{const t={disposed:false,getSize:()=>({width:8192,height:8192}),dispose(){this.disposed=true;}};created.push(t);return t;};
 return {manager,material,original,created};
}
test('near 8K replaces all three maps and distance exit restores placeholders and frees textures',async()=>{
 const {manager,material,original,created}=fixture();await manager.load('house');
 assert.equal(manager.stats.highTextureMax,8192);assert.equal(created.length,3);assert.equal(material.albedoTexture,created[0]);
 manager.release('house');assert.equal(material.albedoTexture,original);assert.equal(material.bumpTexture,original);assert.equal(material.metallicTexture,original);
 assert.ok(created.every(t=>t.disposed));assert.equal(manager.resident.size,0);assert.equal(manager.stats.highTextureMax,0);
});
test('leaving the near view during streaming cancels remaining loads without replacing the material',async()=>{
 const {manager,material,original,created}=fixture(),load=manager.loadTexture;
 manager.loadTexture=async(...args)=>{const t=await load(...args);manager.wanted.clear();return t;};
 await manager.load('house');assert.equal(created.length,1);assert.equal(created[0].disposed,true);assert.equal(material.albedoTexture,original);assert.equal(manager.resident.size,0);
});
test('a texture failure releases partial allocations and retains the working placeholder',async()=>{
 const {manager,material,original,created}=fixture(),load=manager.loadTexture;
 manager.loadTexture=async(...args)=>{if(created.length)throw new Error('network stopped');return load(...args);};
 await assert.rejects(manager.load('house'),/network stopped/);assert.ok(created.every(t=>t.disposed));assert.equal(material.albedoTexture,original);
});
