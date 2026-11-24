import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene} from '@babylonjs/core';
import {setupBuildingTextureSettings} from '../src/building-texture-settings.js';
import {villageLodSources} from '../src/village-lod.js';
import {VillageTextureStreaming} from '../src/village-texture-streaming.js';

const base=new URL('../public/assets/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('village.json',base))).assets;
const houses=Object.keys(manifest).filter(id=>id.startsWith('house-')||id==='chapel');
const fileName=path=>path.split('/').at(-1);

function panel(storage){
  const {document,window}=parseHTML('<main></main>');
  const settings=setupBuildingTextureSettings({host:document.querySelector('main'),storage});
  const select=document.querySelector('select');
  return {settings,select,choose(value){
    select.querySelector('option[value="'+value+'"]').selected=true;
    select.dispatchEvent(new window.Event('change'));
  }};
}

function fixture(t,touchDevice,settings,id){
  const engine=new NullEngine(),scene=new Scene(engine);
  engine.getCaps().maxTextureSize=8192;
  const requests=[],uploads=[],sourceId=id.split('@')[0];
  const material={albedoTexture:{base:true},freeze(){},unfreeze(){}};
  const asset={config:manifest[sourceId],source:{materials:[material]},baseLevel:0};
  if(id.includes('@'))asset.catalog={runtime:{assetKey:sourceId}};
  const world={scene,touchDevice,buildingTextureSettings:settings,prefetchResources:async paths=>requests.push(...paths)};
  const stream=new VillageTextureStreaming(world,new Map([[id,asset]]),[],base,{});
  stream.wanted.set(id,1);
  stream.loadTexture=async desc=>{
    uploads.push(desc.url);
    const bytes=readFileSync(new URL(desc.url,base));
    return {getSize:()=>({width:bytes.readUInt32LE(20),height:bytes.readUInt32LE(24)}),dispose(){}};
  };
  t.after(()=>{stream.dispose();scene.dispose();engine.dispose();});
  return {stream,world,requests,uploads,material};
}

test('the settings control defaults to standard, persists per device, and restores high or standard',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const p=panel(storage);
  assert.equal(p.select.value,'standard');
  p.choose('high');
  assert.equal(panel(storage).select.value,'high');
  p.choose('standard');
  assert.equal(panel(storage).select.value,'standard');
  assert.equal(panel({getItem:()=> 'invalid'}).settings.value,'standard');
});

test('all five building sources keep 1K/512, and their 4K images never piggyback on base models or download packs',()=>{
  assert.equal(houses.length,5);
  const forbidden=new Set(houses.map(id=>fileName(manifest[id].highTextures.textures.albedo.url)));
  const {bundles}=JSON.parse(readFileSync(new URL('resource-index.json',base)));
  assert.ok(bundles.every(pack=>pack.files.every(name=>!forbidden.has(name))));
  for(const id of houses){
    for(const touch of [false,true]){
      const lods=villageLodSources(manifest[id],touch);
      assert.deepEqual(lods.map(l=>l.textureSize),[touch?1024:2048,1024,512]);
      for(const lod of lods){
        assert.ok(lod.resources.every(path=>!forbidden.has(fileName(path))));
        const model=new URL(lod.model,base),gltf=JSON.parse(readFileSync(model));
        for(const image of gltf.images){
          assert.ok(!forbidden.has(fileName(image.uri)));
          const bytes=readFileSync(new URL(image.uri,model));
          assert.equal(bytes.readUInt32LE(20),lod.textureSize);
          assert.equal(bytes.readUInt32LE(24),lod.textureSize);
          if(lod.textureSize===2048)assert.equal(bytes[bytes.readUInt32LE(48)+12],163,'ETC1S color');
        }
      }
    }
  }
});

test('ordinary and authored buildings request only the selected near image on promotion',async t=>{
  for(const touch of [false,true])for(const id of [...houses,'chapel@authored']){
    const p=panel(),{stream,requests,uploads,material}=fixture(t,touch,p.settings,id);
    const config=manifest[id.split('@')[0]],normal=config.lods[0].resources.find(path=>path.endsWith('.ktx2')),high=config.highTextures.textures.albedo.url;
    await stream.start(id);
    assert.deepEqual(requests,touch?[normal]:[]);
    assert.deepEqual(uploads,requests);
    p.choose('high');
    await stream.start(id);
    assert.equal(stream.resident.get(id).resolution,4096);
    assert.equal(requests.at(-1),high);
    p.choose('standard');
    assert.equal(material.albedoTexture.base,true);
    requests.length=uploads.length=0;
    await stream.start(id);
    assert.deepEqual(requests,touch?[normal]:[]);
    assert.deepEqual(uploads,requests);
  }
});

test('switching to standard during a 4K prefetch prevents stale decode and attachment',async t=>{
  const p=panel(),id='chapel';
  p.choose('high');
  const {stream,world,uploads,material}=fixture(t,true,p.settings,id);
  const wait=Promise.withResolvers();
  world.prefetchResources=()=>wait.promise;
  const pending=stream.start(id);
  p.choose('standard');
  wait.resolve();
  await pending;
  assert.deepEqual(uploads,[]);
  assert.equal(material.albedoTexture.base,true);
  assert.equal(stream.failed.size,0);
  await stream.start(id);
  assert.equal(stream.resident.get(id).resolution,2048);
});
