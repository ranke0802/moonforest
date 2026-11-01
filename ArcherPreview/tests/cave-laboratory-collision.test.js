import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CAVE_LABORATORY_GEOMETRY as contract} from '../src/cave-laboratory-geometry.js';
import {CAVE_LABORATORY_COLLISION_DATA as data} from '../src/cave-laboratory-collision-data.js';
import {caveLaboratoryClearance,inspectLaboratoryCollision} from '../src/cave-laboratory-collision.js';
import {CAVE_COLLISION_DATA} from '../src/witch-cave-collision-data.js';
import {CAVE_CAMERA_DATA} from '../src/witch-cave-camera-data.js';
import {CAVE_SIGHT_DATA} from '../src/witch-cave-sight-data.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {MOURNING_SIZE} from '../src/elena-spec.js';
import {caveSourceFingerprint} from '../scripts/cave-source-fingerprint.mjs';
const raw=Buffer.from(data.values,'base64'),values=new Uint16Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)),sha=b=>createHash('sha256').update(b).digest('hex'),base=new URL('../public/assets/',import.meta.url),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} differs from${b}`);

test('native body field pins the actual source/ground epoch while all real camera and sight surfaces stay delivered',()=>{
  assert.equal(data.version,contract.version);assert.equal(data.revision,contract.revision);assert.equal(data.sourceSha256,contract.sourceSha256);assert.equal(data.terrainSha256,contract.terrainSha256);
  const expected=caveSourceFingerprint();for(const d of [data,CAVE_COLLISION_DATA,CAVE_CAMERA_DATA,CAVE_SIGHT_DATA])assert.equal(d.fingerprint,expected);
  assert.equal(data.algorithm,'whole-cell-exact-native-body-v1');assert.equal(data.step,.125);assert.equal(data.quantum,.001);assert.deepEqual(data.bodyBand,[.22,1.75]);
  const model=JSON.parse(readFileSync(new URL(data.model,base))),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base))),config=manifest.assets[contract.assetId];assert.equal(config.lods[0].model,data.model);assert.equal(config.sourceSha256,data.sourceSha256);
  for(const buffer of model.buffers)if(buffer.uri){const bytes=readFileSync(new URL(buffer.uri,new URL(data.model,base)));assert.equal(sha(bytes),data.modelResources[buffer.uri]);}
});

test('exact native physical radius plus2mm is normalized once to the unchanged legacy radius+.08 policy',()=>{
  assert.equal(data.legacyMargin,.08);assert.equal(data.nativeSkin,.002);
  for(const [x,z]of [[-25,-29],[-43,-14],[-24,-17.5]]){
    const col=Math.floor((x-data.minX)/data.step),row=Math.floor((z-data.minZ)/data.step),distance=values[row*data.width+col]*data.quantum,normalized=caveLaboratoryClearance(x,z);
    near(normalized,distance+.08-.002);
    for(const radius of [WARRIOR_DIMENSIONS.moveRadius,.32,.34,.7,MOURNING_SIZE.radius])assert.equal(normalized>=radius+.08,distance>=radius+.002);
  }
});

test('the real narrow-route regressions stay open without globally clearing old walls or closed native rock',()=>{
  const nav=new CaveNavigation(caveObstacles());
  for(const [x,z,radius]of [[-25,-29,.34],[-28,-29,.32],[-43,-14,.34],[-24,-17.5,.7],[-42.5,-14,.7],[-24,-18.5,WARRIOR_DIMENSIONS.moveRadius]])assert.equal(nav.free({x,z},radius,74),true,`old legal route ${x},${z},r${radius}`);
  assert.equal(nav.free({x:0,z:0},WARRIOR_DIMENSIONS.moveRadius,74),false,'legacy non-walking rock/water remains blocked');
  const solid=values.findIndex(v=>v===0);assert.ok(solid>=0);const x=data.minX+(solid%data.width+.5)*data.step,z=data.minZ+(Math.floor(solid/data.width)+.5)*data.step;
  assert.ok(caveLaboratoryClearance(x,z)<WARRIOR_DIMENSIONS.moveRadius+.08,'actual native zero-distance cells remain solid');
});

test('all whole-cell certificates are constant within a cell, bounded in memory and safe outside their padded authority',()=>{
  assert.equal(raw.byteLength,data.width*data.height*2);assert.equal(raw.byteLength,103840);assert.ok(raw.byteLength<1.5*1024*1024);assert.ok(MOURNING_SIZE.radius<data.maxSupportedRadius);
  for(let i=0;i<values.length;i+=97){const x=data.minX+(i%data.width)*data.step,z=data.minZ+Math.floor(i/data.width)*data.step,a=caveLaboratoryClearance(x+.001,z+.001),b=caveLaboratoryClearance(x+data.step-.001,z+data.step-.001);assert.equal(a,b);assert.ok(values[i]*data.quantum<=data.maxDistance);}
  const b=contract.bounds;near(data.minX,b.minX-data.padding);near(data.minZ,b.minZ-data.padding);near(data.minX+data.width*data.step,b.maxX+data.padding);near(data.minZ+data.height*data.step,b.maxZ+data.padding);assert.ok(data.padding>data.maxSupportedRadius+data.nativeSkin+data.step*Math.SQRT2);
  for(const [x,z]of [[data.minX-.001,-18],[data.minX+data.width*data.step+.001,-18],[-35,data.minZ-.001],[-35,data.minZ+data.height*data.step+.001]])assert.equal(caveLaboratoryClearance(x,z),Infinity);
  const before=inspectLaboratoryCollision();for(let i=0;i<1000;i++)caveLaboratoryClearance(-35+i%2*.02,-18);assert.deepEqual(inspectLaboratoryCollision(),before,'repeated queries do not retain per-frame buffers or meshes');
});
