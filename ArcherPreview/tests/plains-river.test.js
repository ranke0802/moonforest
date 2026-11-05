import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Color3,DirectionalLight,FreeCamera,Material,NullEngine,Scene,ShadowGenerator,Texture,Vector3} from '@babylonjs/core';
import {buildPlainsRiverGeometry,createPlainsRiver,plainsRiverNoise,PLAINS_RIVER_NOISE_SIZE} from '../src/plains-river.js';
import {PLAINS_STREAM,plainsObstacles} from '../src/great-plains-layout.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {configurePlainsDecor} from '../src/great-plains-decor.js';
import {applyPlainsViewDistance} from '../src/plains-view-distance.js';
import {createWorld,replaceWorldMap} from '../src/world.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const settle=()=>new Promise(resolve=>setTimeout(resolve,5));
const counts=scene=>({meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,renderTargets:scene.customRenderTargets.length,before:scene.onBeforeRenderObservable.observers.length,dispose:scene.onDisposeObservable.observers.length});
const canvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});

function fixture(t,{shadow=false}={}){
  const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('river-camera',new Vector3(5,6,7),scene);
  camera.getViewMatrix(true);engine.createCanvas=()=>{throw Error('River must not allocate a canvas');};
  const world={scene,camera,terrain:createGreatPlainsTerrain(),lighting:{direction:new Vector3(.3,.9,.25)},mapId:'great-plains',plains:true,touchDevice:false};
  if(shadow){const light=new DirectionalLight('river-light',new Vector3(-.3,-1,-.2),scene);world.shadows=new ShadowGenerator(32,light);}
  t.after(()=>{scene.dispose();engine.dispose();});return world;
}
function watchUniforms(material){
  const calls=[];
  for(const name of ['setFloat','setVector3','setVector4','setColor3']){
    const original=material[name].bind(material);
    material[name]=(key,value)=>{calls.push({name,key,value:value?.asArray?.()??value});return original(key,value);};
  }
  return {calls,last:key=>calls.findLast(call=>call.key===key)?.value};
}

test('river detail is deterministic and its sole tile stays within the 64px RGBA budget',()=>{
  const a=plainsRiverNoise(),b=plainsRiverNoise();
  assert.ok(a instanceof Uint8Array);assert.equal(PLAINS_RIVER_NOISE_SIZE,64);assert.equal(a.length,64*64*4);assert.deepEqual(a,b);
  for(let channel=0;channel<4;channel++){
    const values=new Set();for(let i=channel;i<a.length;i+=4)values.add(a[i]);
    assert.ok(values.size>32,`channel ${channel} lost its bed/ripple detail`);
  }
  assert.equal(Array.from({length:7},(_,i)=>(64>>i)**2*4).reduce((a,b)=>a+b),21844,'full mip chain is approximately 22KB, excluding SDK/driver overhead');
});

test('static terrain-fitted river keeps the authored centreline with fewer vertices and no extra triangles',()=>{
  const terrain=createGreatPlainsTerrain(),g=buildPlainsRiverGeometry(PLAINS_STREAM,terrain),vertices=g.positions.length/3;
  assert.equal(PLAINS_STREAM.length,161);assert.equal(vertices,483);assert.equal(g.indices.length/3,640);
  assert.equal(g.uvs.length,vertices*2);assert.equal(g.riverData.length,vertices*2);assert.equal(g.flowDirection.length,vertices*2);
  assert.ok(g.indices.every(index=>Number.isInteger(index)&&index>=0&&index<vertices));
  let previousY=Infinity,previousV=-Infinity;const widths=[];
  for(let row=0;row<PLAINS_STREAM.length;row++){
    const middle=row*9+3,[x,z]=PLAINS_STREAM[row],y=g.positions[middle+1];
    near(g.positions[middle],x);near(g.positions[middle+2],z);assert.ok(y<=previousY);previousY=y;
    const v=g.uvs[row*6+3];assert.ok(v>previousV);previousV=v;
    for(const edge of [row*9,row*9+6]){
      widths.push(Math.hypot(g.positions[edge]-x,g.positions[edge+2]-z));near(g.positions[edge+1],y);
    }
  }
  assert.ok(Math.min(...widths)>=1.825-1e-7);assert.ok(Math.max(...widths)<=2.095+1e-7);assert.ok(Math.max(...widths)-Math.min(...widths)>.20);
  for(let i=0;i<vertices;i++){
    const [x,y,z]=g.positions.slice(i*3,i*3+3),depth=g.riverData[i*2];
    assert.ok(Number.isFinite(depth)&&depth>=0&&depth<=1.5);near(depth,Math.max(0,Math.min(1.5,y-terrain.heightAt(x,z))));
    near(Math.hypot(g.flowDirection[i*2],g.flowDirection[i*2+1]),1);
  }
  for(let i=0;i<g.indices.length;i+=3){
    const [a,b,c]=g.indices.slice(i,i+3).map(index=>g.positions.slice(index*3,index*3+3));
    assert.ok(Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))>1e-6,'degenerate horizontal water triangle');
  }
});

test('visual river construction and flow preserve native terrain and all synthetic water colliders',t=>{
  const w=fixture(t),river=createPlainsRiver(w),native=()=>sha(Buffer.from(w.terrain.heights.buffer)),collision=()=>sha(JSON.stringify(plainsObstacles().filter(obstacle=>/^river-\d+$/.test(obstacle.id))));
  assert.equal(native(),'97eb8b1678ada2929067f26a92be6d8887a1171c3d8ea2c66a936804416dfc88');
  assert.equal(collision(),'efef1483af4ef464f4b7d1c6687c2999e55af1b9c60dd947c6ce0d7eb7fce1a5');
  for(let frame=0;frame<600;frame++){river.tick(frame/60);if(frame%60===0)river.bind();}
  river.dispose();
  assert.equal(native(),'97eb8b1678ada2929067f26a92be6d8887a1171c3d8ea2c66a936804416dfc88');
  assert.equal(collision(),'efef1483af4ef464f4b7d1c6687c2999e55af1b9c60dd947c6ce0d7eb7fce1a5');
});

test('actual renderer owns one opaque static submesh and one tiny texture without shadows or render targets',t=>{
  const w=fixture(t,{shadow:true}),baseline=counts(w.scene),river=createPlainsRiver(w),{mesh,material,texture}=river;
  assert.deepEqual(counts(w.scene),{...baseline,meshes:baseline.meshes+1,materials:baseline.materials+1,textures:baseline.textures+1});
  assert.equal(mesh.subMeshes.length,1);assert.equal(mesh.getTotalVertices(),483);assert.equal(mesh.getTotalIndices()/3,640);
  assert.equal(mesh.isWorldMatrixFrozen,true);assert.equal(mesh.isPickable,false);assert.equal(mesh.receiveShadows,false);
  assert.ok(!w.shadows.getShadowMap().renderList.includes(mesh));
  assert.equal(material.transparencyMode,Material.MATERIAL_OPAQUE);assert.equal(material.alpha,1);assert.equal(material.needAlphaBlendingForMesh(mesh),false);assert.equal(material.needAlphaTesting(),false);
  for(const kind of mesh.getVerticesDataKinds())assert.equal(mesh.getVertexBuffer(kind).isUpdatable(),false,kind+' must not be a dynamic buffer');
  assert.deepEqual({...texture.getSize()},{width:64,height:64});assert.equal(texture.getInternalTexture().generateMipMaps,true);
  assert.equal(texture.wrapU,Texture.WRAP_ADDRESSMODE);assert.equal(texture.wrapV,Texture.WRAP_ADDRESSMODE);assert.equal(texture.anisotropicFilteringLevel,2);
  assert.deepEqual(material.getActiveTextures(),[texture]);assert.equal(river.inspect().textureBytes,16384);
  river.dispose();assert.deepEqual(counts(w.scene),baseline);
});

test('1000 flow ticks only advance a bounded scalar and never update geometry, texture, terrain or observers',t=>{
  const w=fixture(t),river=createPlainsRiver(w),{mesh,texture,material}=river,baseline=counts(w.scene),uniforms=watchUniforms(material);
  const before=Object.fromEntries(mesh.getVerticesDataKinds().map(kind=>[kind,Array.from(mesh.getVerticesData(kind))])),indices=Array.from(mesh.getIndices()),matrix=Array.from(mesh.getWorldMatrix().m);
  const mutations=[];
  for(const [owner,names]of [[mesh,['setVerticesData','updateVerticesData','setIndices']],[texture,['update']]])for(const name of names){const original=owner[name].bind(owner);owner[name]=(...args)=>{mutations.push(name);return original(...args);};}
  let terrainSamples=0;const heightAt=w.terrain.heightAt.bind(w.terrain);w.terrain.heightAt=(...args)=>{terrainSamples++;return heightAt(...args);};
  for(let frame=0;frame<1000;frame++)river.tick(frame/60);
  assert.equal(uniforms.calls.length,0,'GPU-bound state is uploaded only when this mesh binds');assert.equal(terrainSamples,0);assert.deepEqual(mutations,[]);assert.deepEqual(counts(w.scene),baseline);
  for(const [kind,data]of Object.entries(before))assert.deepEqual(Array.from(mesh.getVerticesData(kind)),data);
  assert.deepEqual(Array.from(mesh.getIndices()),indices);assert.deepEqual(Array.from(mesh.getWorldMatrix().m),matrix);
  river.tick(12.5);river.bind();assert.equal(uniforms.last('flowTime'),12.5);river.tick(76.5);river.bind();assert.equal(uniforms.last('flowTime'),12.5);
  river.tick(64);river.bind();assert.equal(uniforms.last('flowTime'),0);river.tick(-.25);assert.equal(river.inspect().time,63.75);
  for(const value of [NaN,Infinity,-Infinity,undefined])river.tick(value);assert.equal(river.inspect().time,63.75);
  river.dispose();const total=uniforms.calls.length;river.tick(25);river.bind();river.dispose();assert.equal(uniforms.calls.length,total);assert.equal(river.inspect().time,63.75);
});

test('binding follows current camera, light, fog modes and plains view-distance changes',t=>{
  const w=fixture(t),river=createPlainsRiver(w),uniforms=watchUniforms(river.material);
  for(const touch of [false,true]){
    w.touchDevice=touch;w.scene.fogMode=Scene.FOGMODE_LINEAR;applyPlainsViewDistance(w,2.4);river.material.onBindObservable.notifyObservers(river.mesh);
    assert.deepEqual(uniforms.last('fogInfo'),[Scene.FOGMODE_LINEAR,w.scene.fogStart,w.scene.fogEnd,w.scene.fogDensity]);
    near(w.scene.fogStart,touch?156:211.2);near(w.scene.fogEnd,touch?192:252);
  }
  w.camera.position.set(-5,17,29);w.camera.getViewMatrix(true);w.lighting.direction.set(-.4,.6,-.2);w.scene.fogColor=new Color3(.19,.23,.21);
  w.scene.fogStart=400;w.scene.fogEnd=500;w.scene.fogDensity=.014;
  for(const mode of [Scene.FOGMODE_LINEAR,Scene.FOGMODE_EXP,Scene.FOGMODE_EXP2,Scene.FOGMODE_NONE]){
    w.scene.fogMode=mode;river.material.onBindObservable.notifyObservers(river.mesh);assert.deepEqual(uniforms.last('fogInfo'),[mode,400,500,.014]);
  }
  assert.deepEqual(uniforms.last('eyePosition'),w.camera.globalPosition.asArray());assert.deepEqual(uniforms.last('sunDirection'),[-.4,.6,-.2]);assert.deepEqual(uniforms.last('fogColor'),[.19,.23,.21]);
  w.scene.fogEnabled=false;w.scene.fogMode=Scene.FOGMODE_LINEAR;river.bind();assert.equal(uniforms.last('fogInfo')[0],0);river.dispose();
});

test('decor reconfiguration and scene disposal release water texture/material/binding ownership',async t=>{
  const w=fixture(t);w.scene.getEngine().createCanvas=canvas;configurePlainsDecor(w);await settle();const baseline=counts(w.scene);
  for(let i=0;i<12;i++){
    const previous=w.plainsDecor.river;configurePlainsDecor(w);await settle();assert.equal(previous.inspect().disposed,true);assert.equal(previous.mesh.isDisposed(),true);assert.equal(previous.texture.getInternalTexture(),null);assert.equal(previous.material.onBindObservable.observers.length,0);assert.deepEqual(counts(w.scene),baseline);
  }
  const last=w.plainsDecor.river;w.scene.dispose();assert.equal(last.inspect().disposed,true);assert.equal(last.texture.getInternalTexture(),null);assert.equal(last.material.onBindObservable.observers.length,0);
});

test('24 real four-map transfers keep bounded scene resources and world.tick reaches only current plains water',async t=>{
  const engine=new NullEngine();engine.createCanvas=canvas;const world=createWorld(engine,{village:true,touchDevice:true});t.after(()=>{world.scene.dispose();engine.dispose();});
  const sequence=['warrior-plains','warrior-v4','warrior-v5','warrior-v4','warrior-plains','warrior-v3'],baseline=new Map();
  for(let cycle=0;cycle<4;cycle++)for(const [step,character]of sequence.entries()){
    const previous=world.plainsDecor?.river;replaceWorldMap(world,character);await settle();if(previous)assert.equal(previous.inspect().disposed,true);
    if(character==='warrior-plains'){
      const river=world.plainsDecor.river;world.tick(65.5+step);assert.equal(river.inspect().time,1.5+step);assert.equal(world.scene.meshes.filter(mesh=>mesh.name==='plains-stream').length,1);assert.equal(world.scene.textures.filter(texture=>texture.name==='plains-stream-flow-detail').length,1);
    }else{
      assert.equal(world.plainsDecor,null);assert.equal(world.scene.meshes.some(mesh=>mesh.name==='plains-stream'),false);assert.equal(world.scene.textures.some(texture=>texture.name==='plains-stream-flow-detail'),false);world.tick(12);
    }
    if(cycle===1)baseline.set(character,counts(world.scene));if(cycle>1)assert.deepEqual(counts(world.scene),baseline.get(character),character+' resources grew');
  }
});
