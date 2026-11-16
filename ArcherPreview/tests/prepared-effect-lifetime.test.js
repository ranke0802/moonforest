import test from 'node:test';
import assert from 'node:assert/strict';
import {Observable,NullEngine,Scene,Mesh,ShaderMaterial} from '@babylonjs/core';
import {createPreparedEffectLease,inspectPreparedEffects} from '../src/prepared-effect-lifetime.js';

function fixture(){
 const engine={onDisposeObservable:new Observable(),onReleaseEffectsObservable:new Observable()},scene={getEngine:()=>engine,onDisposeObservable:new Observable(),isDisposed:false};
 const mesh=()=>({getScene:()=>scene,onDisposeObservable:new Observable(),isDisposed:()=>false});
 const effect=()=>({getEngine:()=>engine,isReady:()=>true,_refCount:1,_isDisposed:false,calls:0,dispose(force=false){this.calls++;if(force)this._refCount=0;else this._refCount--;if(this._refCount===0)this._isDisposed=true;}});
 return {engine,scene,mesh,effect};
}

test('one pin per mesh/effect and committed references survive another lease rollback',()=>{
 const f=fixture(),mesh=f.mesh(),effect=f.effect(),a=createPreparedEffectLease();
 assert.equal(a.retain(mesh,effect),true);assert.equal(a.retain(mesh,effect),true);a.commit();assert.equal(effect._refCount,2);
 const b=createPreparedEffectLease();assert.equal(b.retain(mesh,effect),true);b.rollback();assert.equal(effect._refCount,2);
 assert.deepEqual([inspectPreparedEffects(f.engine).liveOwners,inspectPreparedEffects(f.engine).liveEffects,inspectPreparedEffects(f.engine).refs],[1,1,1]);
 mesh.onDisposeObservable.notifyObservers(mesh);f.scene.onDisposeObservable.notifyObservers(f.scene);assert.equal(effect._refCount,1);assert.equal(effect.calls,1);assert.equal(inspectPreparedEffects(f.engine).refs,0);
});

test('concurrent commit adopts a pending pin while failed-only work rolls back cleanly',()=>{
 const f=fixture(),mesh=f.mesh(),effect=f.effect(),a=createPreparedEffectLease(),b=createPreparedEffectLease();
 a.retain(mesh,effect);b.retain(mesh,effect);b.commit();a.rollback();assert.equal(effect._refCount,2);
 const failed=createPreparedEffectLease(),other=f.effect();failed.retain(mesh,other);failed.rollback();failed.rollback();assert.equal(other._refCount,1);assert.equal(inspectPreparedEffects(f.engine).refs,1);
 f.scene.onDisposeObservable.notifyObservers(f.scene);assert.equal(effect._refCount,1);assert.equal(inspectPreparedEffects(f.engine).liveOwners,0);
});

test('owner limit and engine unique limit reject excess without evicting live programs',()=>{
 const f=fixture(),first=f.mesh(),lease=createPreparedEffectLease(),all=Array.from({length:129},f.effect);
 for(let i=0;i<16;i++)assert.equal(lease.retain(first,all[i]),true);
 assert.equal(lease.retain(first,all[16]),false);assert.equal(all[16]._refCount,1);
 for(let i=16;i<128;i++)assert.equal(lease.retain(f.mesh(),all[i]),true);
 assert.equal(lease.retain(f.mesh(),all[128]),false);
 assert.equal(lease.retain(f.mesh(),all[0]),true,'same effect across meshes uses one unique effect slot');lease.commit();
 const stats=inspectPreparedEffects(f.engine);assert.deepEqual([stats.liveEffects,stats.refs,stats.rejectedOwnerLimit,stats.rejectedEngineLimit],[128,129,1,1]);
 f.engine.onDisposeObservable.notifyObservers(f.engine);assert.ok(all.every(effect=>effect._refCount===1));assert.equal(inspectPreparedEffects(f.engine).refs,0);
});

test('forced disposal and releaseEffects clear stale pins without decrementing disposed programs again',()=>{
 const f=fixture(),mesh=f.mesh(),effect=f.effect(),lease=createPreparedEffectLease();lease.retain(mesh,effect);lease.commit();effect.dispose(true);
 assert.equal(inspectPreparedEffects(f.engine).refs,0);assert.equal(effect.calls,1);assert.equal(effect._refCount,0);
 const replacement=f.effect(),next=createPreparedEffectLease();next.retain(mesh,replacement);next.commit();
 f.engine.onReleaseEffectsObservable.notifyObservers(f.engine);assert.equal(replacement._refCount,1);assert.equal(inspectPreparedEffects(f.engine).liveOwners,0);
 mesh.onDisposeObservable.notifyObservers(mesh);assert.equal(replacement.calls,1);
});

test('invalid and not-ready effects are never pinned',()=>{
 const f=fixture(),mesh=f.mesh(),effect=f.effect(),lease=createPreparedEffectLease();effect.isReady=()=>false;
 assert.equal(lease.retain(mesh,effect),false);effect.isReady=()=>true;effect._refCount=0;assert.equal(lease.retain(mesh,effect),false);lease.rollback();
 assert.equal(inspectPreparedEffects(f.engine).refs,0);assert.equal(effect.calls,0);
});

test('actual Babylon NullEngine effect survives draw-wrapper disposal until mesh owner releases its pin',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=Mesh.CreateBox('prepared',1,scene),material=new ShaderMaterial('paint',scene,{vertexSource:'precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;void main(){gl_Position=worldViewProjection*vec4(position,1.0);}',fragmentSource:'precision highp float;void main(){gl_FragColor=vec4(1.0);}'},{attributes:['position'],uniforms:['worldViewProjection']});
 mesh.material=material;assert.equal(material.isReadyForSubMesh(mesh,mesh.subMeshes[0],false),true);const effect=mesh.subMeshes[0].effect,lease=createPreparedEffectLease(),before=effect._refCount;
 assert.ok(effect);assert.equal(lease.retain(mesh,effect),true);lease.commit();assert.equal(effect._refCount,before+1);
 mesh.subMeshes[0].resetDrawCache(undefined,true);assert.equal(effect.isDisposed,false);assert.equal(effect._refCount,before);
 mesh.dispose();assert.equal(inspectPreparedEffects(engine).refs,0);assert.equal(effect._refCount,before-1);scene.dispose();engine.dispose();
});
