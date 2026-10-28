import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,StandardMaterial,Texture} from '@babylonjs/core';
import {groundLayout,sampleGroundCurve} from '../src/village-ground-layout.js';
import {VillageGroundDetail} from '../src/village-ground.js';
import {VILLAGE_PLACEMENTS,villageObstacles} from '../src/village-layout.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {hash} from '../scripts/resource-pack.js';

test('curved circulation road stays connected and clear of houses and fences',()=>{
  const nav=new VillageNavigation(villageObstacles()),ring=groundLayout()[2].samples;
  assert.deepEqual(ring[0],ring.at(-1));
  for(let i=0;i<ring.length;i++){
    const [x,z]=ring[i];assert.ok(Number.isFinite(x)&&Number.isFinite(z));
    assert.ok(nav.free({x,z},.32,48),`road crosses an obstacle at ${x},${z}`);
    if(i)assert.ok(Math.hypot(x-ring[i-1][0],z-ring[i-1][1])<.4,'road must have no gaps');
  }
  assert.equal(VILLAGE_PLACEMENTS.length,698,'reshaping trunks must not rearrange existing plots');
  const samples=sampleGroundCurve([[0,0],[4,2],[8,0]]);assert.deepEqual(samples[0],[0,0]);assert.deepEqual(samples.at(-1),[8,0]);
});

test('ground keeps a sub-1MB transfer and cuts GPU memory while retaining packed detail',()=>{
  const root=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('village-ground.json',root)));
  assert.equal(manifest.color.width,2048);assert.equal(manifest.detail.width,256);assert.equal(manifest.extraDrawCalls,0);
  assert.deepEqual(manifest.soilMaskAlphaRange,[64,255],'forest RGB must survive browser image premultiplication');
  assert.ok(manifest.gpuBytesWithMips<6*1048576);
  assert.ok(manifest.color.bytes+manifest.detail.bytes<1000000,'KTX2 carries offline mipmaps as well as its base level');
  for(const ref of manifest.resources)assert.equal(hash(readFileSync(new URL(ref,root))),ref.split('/').at(-1).split('.')[0]);
});

test('ground detail stays opaque and shares one small sampler without extra geometry',t=>{
  const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>{scene.dispose();engine.dispose();});
  const material=new StandardMaterial('ground',scene),texture=new Texture(null,scene);texture.hasAlpha=false;
  material.diffuseTexture=texture;
  const plugin=new VillageGroundDetail(material,texture),samplers=[],active=[];plugin.getSamplers(samplers);plugin.getActiveTextures(active);
  assert.equal(samplers.length,1);assert.deepEqual(active,[texture]);assert.ok(!material.needAlphaBlending());
  let bound;plugin.bindForSubMesh({setTexture:(name,value)=>{bound=value;}});assert.equal(bound,texture);
  assert.equal(plugin.getCustomCode('vertex'),null);assert.match(plugin.getCustomCode('fragment').CUSTOM_FRAGMENT_BEFORE_FOG,/baseColor.a/);
});

test('slender trunks have narrower physical collision without changing authored placements',()=>{
  for(const p of VILLAGE_PLACEMENTS.filter(p=>p.kind==='tree'&&Math.hypot(p.x,p.z)<49)){
    const before=villageObstacles([p],{refinedTrees:false})[0],after=villageObstacles([p])[0];
    assert.ok(after.radius<before.radius);assert.equal(after.height,before.height);
  }
});
