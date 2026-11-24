import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,Vector3,VertexBuffer} from '@babylonjs/core';
import {createPlainsLeafDrift} from '../src/plains-leaf-drift.js';

test('a single bounded leaf batch follows live oak canopies, hides in combat and releases its owned resources',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  const pos=new Vector3(0,0,0),oak='tree-01-round-oak';
  let enabled=true;
  const tree={root:{position:pos,isEnabled:()=>enabled},placement:{asset:oak,scale:.8},meshes:[]};
  const prepared={recordsByAsset:new Map([[oak,[tree]]]),assets:new Map([[oak,{config:{height:9}}]])};
  const world={scene,touchDevice:true,terrain:{heightAt:()=>0},villagePrepared:prepared};
  const drift=createPlainsLeafDrift(world,{random:()=>.4});
  const tick=(p=pos,allowed=true,n=90)=>{for(let i=0;i<n;i++)drift.update(1/60,p,allowed);};
  try{
    tick();assert.equal(scene.meshes.length,0);
    tree.meshes.push({});tree.placement.background=true;tick();assert.equal(scene.meshes.length,0);
    tree.placement.background=false;tick(new Vector3(35,0,35));assert.equal(scene.meshes.length,0);
    tick();const mesh=scene.meshes[0];assert.ok(mesh.isEnabled());assert.equal(mesh.getTotalVertices(),8*4);
    assert.equal(mesh.subMeshes.length,1);assert.equal(mesh.isPickable,false);
    const before=mesh.getVerticesData(VertexBuffer.PositionKind).slice();tick(pos,true,4);
    assert.notDeepEqual(mesh.getVerticesData(VertexBuffer.PositionKind),before);
    tick(pos,false,1);assert.equal(mesh.isEnabled(),false);
    tick();assert.equal(mesh.isEnabled(),true);assert.equal(scene.meshes.length,1);
    enabled=false;tick(pos,true,1);assert.equal(mesh.isEnabled(),false);
    enabled=true;tick();tree.authoredSuppressed=true;tick();assert.equal(mesh.isEnabled(),false);
    tree.authoredSuppressed=false;tick();tick(new Vector3(30,0,0),true,1);assert.equal(mesh.isEnabled(),false);
    drift.dispose();assert.equal(scene.meshes.length,0);
    assert.equal(scene.textures.some(t=>t.name==='plains-oak-leaf'),false);
  }finally{drift.dispose();scene.dispose();engine.dispose();}
});
