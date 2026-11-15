import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';

test('the existing desktop compressed graph retains geometry, rig, animation, UV and sampler data',()=>{
 const root=new URL('../public/assets/',import.meta.url),models=['warrior-v3','warrior-v3-ios'].map(id=>{
  const manifest=JSON.parse(readFileSync(new URL(id+'.json',root)));return JSON.parse(readFileSync(new URL(manifest.model,root)));
 });
 for(const key of ['accessors','buffers','bufferViews','meshes','nodes','skins','animations','samplers'])assert.deepEqual(models[1][key],models[0][key],key);
 const sizes=models[1].images.map(image=>{const bytes=readFileSync(new URL('content/'+image.uri,root));assert.equal(bytes.toString('ascii',1,5),'KTX ');return bytes.readUInt32LE(20);});
 assert.deepEqual(sizes.sort((a,b)=>a-b),[2048,2048,2048,4096,8192,8192]);
});
import {selectPlayerTextureProfile,playerTextureManifest} from '../src/player-texture-profile.js';
import {setupPlayerTextureSettings,readPlayerTexturePreference,PLAYER_TEXTURE_PREFERENCE_KEY} from '../src/player-texture-settings.js';

const pc={userAgent:'Windows Chrome'},release='moonforest-0.2',caps={maxTextureSize:8192,bptc:{}};
const aliases=['warrior-v3','warrior-v4','warrior-v5','warrior-plains'];
test('0.2 PC selects one complete existing compressed 8K graph while explicit original and frozen legacy stay original',()=>{
 for(const alias of aliases)for(const format of ['astc','bptc','s3tc','etc2']){
  const selected=selectPlayerTextureProfile(alias,{maxTextureSize:8192,[format]:{}},pc,{release});
  assert.equal(selected.manifest,'warrior-v3-ios');assert.equal(selected.maxSize,8192);assert.equal(selected.preserveSourceResolution,true);assert.equal(selected.gpuCompressed,true);
  assert.ok(selected.estimatedGpuBytes>=208*1024**2&&selected.estimatedGpuBytes<209*1024**2);assert.ok(selected.maxImageUploadBytes<86*1024**2);
  assert.equal(playerTextureManifest(alias,caps,pc,{release,desktopPreference:'original'}),'warrior-v3');
  assert.equal(playerTextureManifest(alias,caps,pc),'warrior-v3');assert.equal(playerTextureManifest(alias,caps,pc,{release:'moonforest-0.1'}),'warrior-v3');
 }
 for(const unavailable of [undefined,{}, {maxTextureSize:8192},{maxTextureSize:4096,astc:{}},{maxTextureSize:NaN,bptc:{}}]){
  const selected=selectPlayerTextureProfile('warrior-v3',unavailable,pc,{release});assert.equal(selected.manifest,'warrior-v3');assert.equal(selected.maxSize,8192);assert.equal(selected.selectionReason,'compression-unavailable-original');
 }
});

test('desktop preference cannot replace mobile 4K/2K selection or unrelated actors',()=>{
 for(const navigator of [{userAgent:'Android'}, {userAgent:'iPhone'}, {platform:'MacIntel',maxTouchPoints:5}])for(const desktopPreference of ['original','compressed','auto']){
  assert.deepEqual(selectPlayerTextureProfile('warrior-v3',caps,navigator,{release,desktopPreference}),selectPlayerTextureProfile('warrior-v3',caps,navigator));
  assert.equal(playerTextureManifest('warrior-v3',{maxTextureSize:8192},navigator,{release,desktopPreference}),'warrior-v3-mobile2k-rgba');
 }
 assert.equal(playerTextureManifest('archer',caps,pc,{release}),'character');assert.equal(playerTextureManifest('warrior-v2',caps,pc,{release}),'warrior-v2');
});

function fixture(options={}){
 const {document}=parseHTML('<div id="settings"></div>'),host=document.querySelector('#settings'),values=new Map(),changed=[],applied=[];
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const control=setupPlayerTextureSettings({host,storage,release,navigator:pc,onChange:value=>changed.push(value),onApply:async value=>applied.push(value),...options});
 return {document,host,values,storage,changed,applied,control};
}

test('PC preference persists, restores original and only invokes the explicit apply callback',async()=>{
 const f=fixture();assert.equal(f.control.value,'compressed');assert.equal(f.host.querySelectorAll('select').length,1);assert.equal(f.applied.length,0);
 f.control.setValue('original');assert.equal(f.values.get(PLAYER_TEXTURE_PREFERENCE_KEY),'original');assert.equal(readPlayerTexturePreference(f.storage),'original');assert.deepEqual(f.changed,['original']);assert.equal(f.applied.length,0);
 await f.control.apply();assert.deepEqual(f.applied,['original']);
 f.control.setValue('compressed');const selected=selectPlayerTextureProfile('warrior-v3',caps,pc,{release,desktopPreference:f.control.value});
 assert.equal(f.control.noteFailure(selected,new Error('decoder failed')),true);assert.equal(f.control.value,'compressed');assert.equal(f.applied.length,1,'failure never retries/falls back automatically');
 assert.equal(f.control.inspect().failed,true);assert.equal(f.host.querySelectorAll('button')[0].hidden,false);
 await f.control.apply({original:true});assert.equal(f.control.value,'original');assert.deepEqual(f.applied,['original','original']);assert.equal(f.control.inspect().failed,false);
 f.control.dispose();assert.equal(f.host.children.length,0);assert.equal(await f.control.apply(),false);
});

test('mobile and legacy create no PC controls; denied storage remains session-usable',()=>{
 for(const options of [{navigator:{userAgent:'Android'}},{release:'moonforest-0.1'}]){
  const f=fixture(options);assert.equal(f.host.children.length,0);assert.equal(f.control.noteFailure({mobile:true,gpuCompressed:true},new Error()),false);f.control.dispose();
 }
 const storage={getItem(){throw Error('denied');},setItem(){throw Error('denied');}},f=fixture({storage});
 assert.equal(f.control.value,'compressed');assert.equal(f.control.restoreOriginal(),'original');assert.deepEqual(f.changed,['original']);f.control.dispose();
});

test('manual apply is single-flight, and errors do not schedule retries',async()=>{
 let done,calls=0;const f=fixture({onApply:()=>{calls++;return new Promise(resolve=>{done=resolve;});}}),first=f.control.apply();
 assert.equal(f.control.inspect().applying,true);assert.equal(await f.control.apply(),false);assert.equal(calls,1);done();await first;assert.equal(f.control.inspect().applying,false);f.control.dispose();
 const rejected=fixture({onApply:async()=>{calls++;throw Error('manual load failed');}});assert.equal(await rejected.control.apply(),false);assert.equal(rejected.control.inspect().failed,true);assert.equal(rejected.control.value,'compressed');assert.equal(calls,2);rejected.control.dispose();
});
