import test from 'node:test';
import assert from 'node:assert/strict';
import {ArcRotateCamera,DirectionalLight,MeshBuilder,NullEngine,PBRMaterial,Scene,ShadowGenerator,Vector3} from '@babylonjs/core';
import {ShadowFadeBudget,installVillageShadowFade,prepareShadowFade,shadowFadeAttribute} from '../src/village-shadow-fade.js';
const record=id=>({root:{isDisposed:()=>false},id});
for(const limit of [28,44])test('shadow handoff fades monotonically, reverses smoothly and never exceeds budget '+limit,()=>{
 const a=Array.from({length:limit},(_,i)=>record('a'+i)),b=Array.from({length:limit},(_,i)=>record('b'+i)),f=new ShadowFadeBudget(limit);
 f.select(a);assert.equal(f.update(0).get(a[0]),1);f.select(b);let previous=1,sawMiddle=false;
 for(let i=0;i<22;i++){const active=f.update(1/30);assert.ok(active.size<=limit);const value=active.get(a[0])??0;assert.ok(value<=previous);sawMiddle||=value>0&&value<1;previous=value;}
 assert.ok(sawMiddle);assert.ok(!f.active.has(a[0]));assert.ok(f.active.get(b[0])<.1);
 for(let i=0;i<8;i++)f.update(1/30);const middle=f.active.get(b[0]);assert.ok(middle>0&&middle<1);f.select(a);f.update(1/30);assert.ok(f.active.get(b[0])<middle);
 f.select(b);f.update(1/30);assert.ok(Math.abs(f.active.get(b[0])-middle)<1e-8);
 for(let i=0;i<30;i++)f.update(1/30);assert.equal(f.active.get(b[0]),1);
 f.select(a);f.update(10);assert.ok(f.active.get(b[0])>.8,'long stall cannot snap fading to zero');f.clear();assert.equal(f.active.size,0);
});
test('per-instance shadow fade is supplied to the existing depth draw; color visibility and LOD stay untouched',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());engine.getCaps().instancedArrays=true;
 new ArcRotateCamera('camera',0,1,20,Vector3.Zero(),scene);const light=new DirectionalLight('key',new Vector3(-.4,-1,-.6),scene),shadows=new ShadowGenerator(1024,light);shadows.usePercentageCloserFiltering=true;installVillageShadowFade(shadows);
 const source=MeshBuilder.CreateBox('source',{},scene);source.material=new PBRMaterial('paint',scene);source.isVisible=false;source._instanceDataStorage.useMonoDataStorageRenderPass=false;prepareShadowFade(source);
 const a=source.createInstance('a'),b=source.createInstance('b');b.position.x=2;a.instancedBuffers[shadowFadeAttribute]=.25;b.instancedBuffers[shadowFadeAttribute]=.75;
 shadows.addShadowCaster(a,false);shadows.addShadowCaster(b,false);let effect;
 shadows.onBeforeShadowMapRenderObservable.add(e=>{effect=e;});await source.material.forceCompilationAsync(source,{useInstances:true});scene.render();
 assert.ok(effect);assert.match(effect.vertexSourceCode,/vVillageShadowFade/);assert.match(effect.fragmentSourceCode,/villageBayer2/);assert.ok(effect.getAttributesNames().includes(shadowFadeAttribute));
 assert.equal(a.visibility,1);assert.equal(b.visibility,1);assert.equal(source.getLODLevels().length,0);assert.equal(shadows.getShadowMap().getSize().width,1024);assert.equal(shadows.getShadowMap().renderList.length,2);
 const data=source._userInstancedBuffersStorage.data[shadowFadeAttribute];assert.ok(data.includes(.25));assert.ok(data.includes(.75));
 const lod=source.clone('stream-lod',null,true);prepareShadowFade(lod);assert.equal(lod._userInstancedBuffersStorage.strides[shadowFadeAttribute],1);assert.equal(lod.instancedBuffers[shadowFadeAttribute],1);
});
