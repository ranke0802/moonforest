import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshBuilder,NullEngine,Scene} from '@babylonjs/core';
import {prepareVillageInstancing,villageContextRestoreError} from '../src/village-instancing.js';

function makeFixture(t){
  const engine=new NullEngine(),scene=new Scene(engine),nativeGl=engine._gl;
  t.after(()=>{engine._gl=nativeGl;engine.dispose();});
  const original=MeshBuilder.CreateBox('detached-gltf-source',{},scene);
  const lod=original.clone('detached-lod'),independent=MeshBuilder.CreateBox('other-source',{},scene);
  for(const mesh of [original,lod,independent])scene.removeMesh(mesh);
  for(const geometry of [original.geometry,independent.geometry])scene.removeGeometry(geometry);
  prepareVillageInstancing([original,lod,independent],{recoverContext:true});
  let restores=0;
  engine.onContextRestoredObservable.add(()=>{restores++;});
  function restore({lost=false}={}){
    engine._gl={isContextLost:()=>lost};
    engine._contextWasLost=true;
    engine._flagContextRestored();
    assert.equal(engine._contextWasLost,false,'Babylon can resume its render loop');
    return restores;
  }
  return {original,lod,independent,scene,restore};
}

test('one temporary detached buffer allocation failure is retried before continuing other restore observers',t=>{
  const f=makeFixture(t),geometry=f.original.geometry,rebuild=geometry._rebuild.bind(geometry);
  let attempts=0;
  t.mock.method(geometry,'_rebuild',()=>{
    if(++attempts===1)throw Error('Unable to create index buffer');
    return rebuild();
  });
  assert.equal(f.restore(),1);
  assert.equal(attempts,2,'shared geometry gets one retry total');
  assert.equal(villageContextRestoreError(f.scene),null);
});

test('persistent detached restoration failure is reported while the next source and SDK observers still run',t=>{
  const f=makeFixture(t),geometry=f.original.geometry,rebuild=geometry._rebuild.bind(geometry);
  let failing=true,attempts=0,otherRestores=0;
  f.independent.onRebuildObservable.add(()=>{otherRestores++;});
  t.mock.method(geometry,'_rebuild',()=>{
    attempts++;
    if(failing)throw Error('Unable to create vertex buffer');
    return rebuild();
  });
  assert.equal(f.restore(),1);
  assert.equal(attempts,1,'never rebuild a partially restored vertex buffer set');
  assert.equal(otherRestores,1);
  assert.equal(villageContextRestoreError(f.scene),'Unable to create vertex buffer');
  failing=false;
  assert.equal(f.restore(),2);
  assert.equal(attempts,2);
  assert.equal(otherRestores,2);
  assert.equal(villageContextRestoreError(f.scene),null);
});

test('a detached allocation failure cannot be retried while the actual WebGL context is lost again',t=>{
  const f=makeFixture(t);
  let attempts=0;
  t.mock.method(f.original.geometry,'_rebuild',()=>{
    attempts++;
    throw Error('Unable to create index buffer');
  });
  assert.equal(f.restore({lost:true}),1);
  assert.equal(attempts,1);
  assert.equal(villageContextRestoreError(f.scene),'Unable to create index buffer');
});

test('an unrelated rebuild error from a detached source is contained without retrying',t=>{
  const f=makeFixture(t);
  let attempts=0;
  f.lod.onRebuildObservable.add(()=>{
    attempts++;
    throw Error('disposed owned draw wrapper');
  });
  assert.equal(f.restore(),1);
  assert.equal(attempts,1);
  assert.equal(villageContextRestoreError(f.scene),'disposed owned draw wrapper');
});
