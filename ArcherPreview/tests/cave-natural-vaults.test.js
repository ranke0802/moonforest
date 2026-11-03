import test from 'node:test';
import assert from 'node:assert/strict';
import {CAVE_LOW_VAULTS,CAVE_ROUTES,CAVE_BOSS,caveRoofHeight} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {caveCameraCeilingHeight} from '../src/witch-cave-camera.js';
import {LAB_VAULT_GRID,LAB_VAULT_POSITIONS,LAB_VAULT_INDICES,laboratoryVaultHeight,appendLaboratoryVault} from '../src/cave-laboratory-vault.js';

test('low passage vaults alternate with high rooms without reducing the boss envelope',()=>{
 for(const p of CAVE_LOW_VAULTS){const old=7+.4*Math.sqrt(Math.max(0,67*67-p.x*p.x-p.z*p.z));assert.ok(caveRoofHeight(p.x,p.z)<old-6);}
 assert.ok(caveRoofHeight(CAVE_BOSS.x,CAVE_BOSS.z)-CAVE_BOSS.height>16);
 const terrain=createWitchCaveTerrain();let low=Infinity,high=-Infinity,samples=0;
 for(const route of CAVE_ROUTES)for(let k=1;k<route.length;k++)for(let j=0;j<=30;j++){
  const a=route[k-1],b=route[k],t=j/30,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,space=caveCameraCeilingHeight(x,z)-terrain.heightAt(x,z);
  assert.ok(space>4.8,JSON.stringify({x,z,space}));low=Math.min(low,space);high=Math.max(high,space);samples++;
 }
 assert.ok(low<8&&high>20);assert.ok(samples>700);
});

test('laboratory camera height equals the actual rendered triangle at arbitrary barycentric points',()=>{
 const p=LAB_VAULT_POSITIONS,ids=LAB_VAULT_INDICES;
 assert.equal(ids.length/3,288);assert.equal(laboratoryVaultHeight(0,0),Infinity);
 for(let i=0;i<ids.length;i+=3)for(const weights of [[.2,.3,.5],[.65,.25,.1]]){
  const v=[0,0,0];for(let k=0;k<3;k++)for(let d=0;d<3;d++)v[d]+=p[ids[i+k]*3+d]*weights[k];
  assert.ok(Math.abs(laboratoryVaultHeight(v[0],v[2])-v[1])<2e-6);
  assert.ok(caveCameraCeilingHeight(v[0],v[2])<=v[1]+2e-6);
 }
 const terrain=createWitchCaveTerrain();for(let z=-25;z<=-10;z++)for(let x=-42;x<=-29;x++)assert.ok(laboratoryVaultHeight(x,z)-terrain.heightAt(x,z)>4,'lab walking/head space');
 assert.ok(LAB_VAULT_GRID.minX<-48&&LAB_VAULT_GRID.maxX>-23,'edges overlap structural enclosure');
});

test('lower vault merges in the existing roof draw and leaves source arrays unchanged',()=>{
 const geometry={positions:Float32Array.of(0,30,0,1,30,0,0,30,1),indices:Uint16Array.of(0,1,2)},snapshot=structuredClone(geometry),merged=appendLaboratoryVault(geometry);
 assert.deepEqual(geometry,snapshot);assert.equal(merged.indices.length,geometry.indices.length+LAB_VAULT_INDICES.length);
 assert.equal(merged.positions.length,geometry.positions.length+LAB_VAULT_POSITIONS.length);
 assert.deepEqual(Array.from(merged.indices.slice(0,3)),[0,1,2]);
 assert.equal(appendLaboratoryVault(geometry,{enabled:false}),geometry);
});
