import test from 'node:test';
import assert from 'node:assert/strict';
import {VillageTextureStreaming} from '../src/village-texture-streaming.js';
import {VILLAGE_TEXTURE_BUDGET,highTextureBytes,selectHighTextures} from '../src/village-texture-budget.js';
const profile=(size=4096)=>({textures:Object.fromEntries(['albedo','normal','orm'].map(role=>[role,{width:role==='albedo'?size:size/4,height:role==='albedo'?size:size/4}]))});
function fixture(){
 const original={tag:'placeholder'},material={albedoTexture:original,bumpTexture:original,metallicTexture:original,unfreeze(){},freeze(){}};
 const asset=size=>({source:{materials:[material]},config:{highTextures:profile(size)}});
 const manager=Object.assign(Object.create(VillageTextureStreaming.prototype),{assets:new Map([['house',asset(4096)],['tower',asset(4096)],['prop',asset(2048)]]),wanted:new Map([['house',1],['tower',.8],['prop',.3]]),resident:new Map(),failed:new Set(),stats:{highTextureLoads:0,highTextureReleases:0},disposed:false,pending:null,pendingBytes:0,budget:VILLAGE_TEXTURE_BUDGET.mobile,maxTextureSize:4096});
 const created=[];manager.loadTexture=async config=>{const t={disposed:false,getSize:()=>({width:config.width,height:config.height}),dispose(){this.disposed=true;}};created.push(t);return t;};
 return {manager,material,original,created};
}
test('4K replaces all maps and distance exit restores placeholders and frees textures',async()=>{
 const {manager,material,original,created}=fixture();await manager.start('house');
 assert.equal(manager.stats.highTextureMax,4096);assert.equal(created.length,3);assert.equal(material.albedoTexture,created[0]);
 assert.equal(manager.stats.highTextureReserved,0);assert.ok(manager.stats.highTextureBytes<96*1048576);
 manager.release('house');assert.equal(material.albedoTexture,original);assert.equal(material.bumpTexture,original);assert.equal(material.metallicTexture,original);
 assert.ok(created.every(t=>t.disposed));assert.equal(manager.resident.size,0);assert.equal(manager.stats.highTextureMax,0);
 assert.equal(manager.stats.highTextureBytes,0);
});
test('leaving the near view during streaming cancels remaining loads without replacing the material',async()=>{
 const {manager,material,original,created}=fixture(),load=manager.loadTexture;
 manager.loadTexture=async(...args)=>{const t=await load(...args);manager.wanted.clear();return t;};
 await manager.start('house');assert.equal(created.length,1);assert.equal(created[0].disposed,true);assert.equal(material.albedoTexture,original);assert.equal(manager.resident.size,0);assert.equal(manager.stats.highTextureReserved,0);
});
test('a texture failure releases partial allocations and retains the working placeholder',async()=>{
 const {manager,material,original,created}=fixture(),load=manager.loadTexture;
 manager.loadTexture=async(...args)=>{if(created.length)throw new Error('network stopped');return load(...args);};
 await assert.rejects(manager.load('house'),/network stopped/);assert.ok(created.every(t=>t.disposed));assert.equal(material.albedoTexture,original);
});

test('mobile budget fits one large and one small asset, with resident hysteresis and device caps',()=>{
 const {manager:m}=fixture();
 assert.deepEqual([...selectHighTextures(m.wanted,m.assets,m.resident,m.budget,4096).keys()],['house','prop']);
 assert.deepEqual([...selectHighTextures(m.wanted,m.assets,m.resident,m.budget,2048).keys()],['prop']);
 m.wanted.set('tower',1.1);m.resident.set('house',{});
 assert.deepEqual([...selectHighTextures(m.wanted,m.assets,m.resident,m.budget,4096).keys()],['house','prop']);
 m.wanted.set('tower',1.3);
 assert.deepEqual([...selectHighTextures(m.wanted,m.assets,m.resident,m.budget,4096).keys()],['tower','prop']);
 assert.equal(highTextureBytes(profile(8192)),Infinity,'8K cannot enter the new budget');
});

test('pending reservations block overlapping loads and survive cancellation until allocation is freed',async()=>{
 const {manager:m,created}=fixture(),load=m.loadTexture;let finish;
 m.loadTexture=async(...args)=>{await new Promise(resolve=>{finish=resolve;});return load(...args);};
 const pending=m.start('house');assert.equal(m.pending,'house');assert.ok(m.stats.highTextureReserved>95*1048576);
 assert.equal(m.start('tower'),undefined,'parallel upload blocked');
 m.wanted.delete('house');finish();await pending;
 assert.equal(m.stats.highTextureReserved,0);assert.ok(created.every(t=>t.disposed));
 m.loadTexture=load;await m.start('tower');
 assert.equal(m.start('house'),undefined);assert.ok(m.stats.highTexturePeak<=m.budget);
});

test('resident allocations must be released before a replacement can load',async()=>{
 const {manager:m,created}=fixture();await m.start('house');
 assert.equal(m.start('tower'),undefined);assert.equal(created.length,3);
 m.release('house');await m.start('tower');assert.equal(created.length,6);
 assert.ok(m.stats.highTexturePeak<=m.budget);assert.equal(m.stats.highTextureReserved,0);
});

test('unexpected decoded dimensions dispose textures instead of violating the profile',async()=>{
 const {manager:m,created,original,material}=fixture(),load=m.loadTexture;
 m.loadTexture=async(...args)=>{const t=await load(...args);t.getSize=()=>({width:8192,height:8192});return t;};
 await assert.rejects(m.load('house'),/dimensions differ/);assert.ok(created.every(t=>t.disposed));assert.equal(material.albedoTexture,original);
});

test('toon streaming loads only color and cannot restore discarded PBR maps',async()=>{
 const {manager:m,material,created}=fixture(),high=m.assets.get('house').config.highTextures;
 high.shading='toon-color';high.textures={albedo:high.textures.albedo};material.bumpTexture=null;material.metallicTexture=null;
 await m.start('house');assert.equal(created.length,1);assert.equal(material.bumpTexture,null);assert.equal(material.metallicTexture,null);
 assert.ok(m.stats.highTextureBytes<86*1048576);m.release('house');assert.equal(material.bumpTexture,null);
});
