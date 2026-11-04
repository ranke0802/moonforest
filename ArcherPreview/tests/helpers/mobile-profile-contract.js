import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const assetsBase=new URL('../../public/assets/',import.meta.url),hash=value=>createHash('sha256').update(value).digest('hex');
const sceneryCategories=new Set(['tree','rock','prop','plant','defense','fence']);
const protectedIds=new Set(['village-approach','chapel','guardian-bear','hooded-goblin','elena','mourning-elena']);

// The sole authorized additive field is a mobile albedo alternative. Do not
// normalize LODs, original textures, bounds or any other source-graph fields.
export function originalAssetGraph(asset,id){
 const profile=asset.mobileHighTextures;
 if(profile!==undefined){
  assert.ok(sceneryCategories.has(asset.category)&&!protectedIds.has(id)&&!id.startsWith('house'),id+' is excluded from mobile scenery profiles');
  const original=asset.highTextures,albedo=profile.textures?.albedo,source=original?.textures?.albedo;
  assert.equal(original?.shading,'toon-color',id+' original color pipeline');
  assert.deepEqual(Object.keys(profile.textures??{}),['albedo'],id+' alternative must be color only');
  assert.ok([1024,2048].includes(albedo?.width)&&albedo.height===albedo.width,id+' mobile color size must be 1K or 2K');
  assert.ok(albedo.width<source.width&&albedo.height<source.height,id+' must retain the larger original color source');
  assert.deepEqual(Object.keys(albedo).sort(),['url','width','height','bytes','codec','alpha','gpuBlockBytes'].sort(),id+' bounded texture metadata');
  for(const field of ['codec','alpha','gpuBlockBytes'])assert.equal(albedo[field],source[field],id+' '+field+' must retain its source semantics');
  assert.match(albedo.url,/^\.\/content\/[a-f0-9]{64}\.ktx2$/,id+' content-addressed alternative');
  const bytes=readFileSync(new URL(albedo.url,assetsBase));
  assert.equal(bytes.length,albedo.bytes,id+' alternative byte budget');assert.equal(hash(bytes),albedo.url.split('/').at(-1).split('.')[0],id+' alternative content hash');
  assert.deepEqual([...bytes.subarray(0,12)],[0xab,0x4b,0x54,0x58,0x20,0x32,0x30,0xbb,0x0d,0x0a,0x1a,0x0a],id+' KTX2 header');
  assert.equal(bytes.readUInt32LE(20),albedo.width,id+' actual texture width');assert.equal(bytes.readUInt32LE(24),albedo.height,id+' actual texture height');
  assert.equal(bytes.readUInt32LE(40),Math.floor(Math.log2(albedo.width))+1,id+' complete mip chain');
  assert.deepEqual(profile,{...original,textures:{albedo},resources:[albedo.url],colorResolution:albedo.width,colorEncoding:`KTX2 ${albedo.codec.toUpperCase()} / sRGB / full mip chain / mobile ${albedo.width}`},id+' all other profile metadata remains original');
 }
 const {mobileHighTextures,...original}=asset;return original;
}

export function originalManifestText(text){
 const manifest=JSON.parse(text);let additive=false;
 for(const [id,asset]of Object.entries(manifest.assets??{})){
  additive||=Object.hasOwn(asset,'mobileHighTextures');manifest.assets[id]=originalAssetGraph(asset,id);
 }
 // Before the additive metadata the authored manifests used this exact format.
 // Keeping the historical hashes proves every original field is still exact.
 return additive?JSON.stringify(manifest,null,2)+'\n':text.replace(/\r\n?/g,'\n');
}

export function originalInputText(path,text){
 return /(?:^|\/)public\/assets\/(?:village|great-plains|monster-forest|witch-cave|village-plains-outskirts)\.json$/.test(path)?originalManifestText(text):text.replace(/\r\n?/g,'\n');
}

export function assertOriginalInputFingerprint(path,text,expected){
 const original=hash(originalInputText(path,text)),raw=hash(text.replace(/\r\n?/g,'\n'));
 // Existing masks predate the additive profile; a future full rebake can
 // record the exact current raw manifest as before. Both retain every source
 // geometry input, and profile validation above always runs before either path.
 assert.ok(original===expected||raw===expected,path+' original geometry inputs do not match the delivered bake');
}
