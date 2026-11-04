import test from 'node:test';
import assert from 'node:assert/strict';
import {ArcRotateCamera,DirectionalLight,MeshBuilder,NullEngine,Scene,ShadowGenerator,TransformNode,Vector3} from '@babylonjs/core';
import {VillageVisibility} from '../src/village-visibility.js';
import {prepareVillageInstancing} from '../src/village-instancing.js';
import {shadowFadeAttribute} from '../src/village-shadow-fade.js';
import {caveFogRootEnabled} from '../src/cave-fog-of-war.js';

// Current 5c65642 behavior, before retaining an unchanged caster submission.
function previousUpdateShadows(dt){
 const active=this.shadowFade.update(dt),next=this.shadowScratch;next.clear();let major=0,fading=0;
 for(const r of this.castRecords)if(!active.has(r)){r.shadowCaster=false;r.root.setEnabled(caveFogRootEnabled(r));this.castRecords.delete(r);}
 for(const [r,fade]of active){
  if(r.fogVisible===false)continue;
  if(!this.castRecords.has(r)){r.shadowCaster=true;r.root.setEnabled(caveFogRootEnabled(r));this.castRecords.add(r);}
  if(['building','tree','tower','landmark'].includes(r.placement.kind))major++;
  if(fade<1)fading++;
  for(const mesh of r.meshes){if(mesh.instancedBuffers)mesh.instancedBuffers[shadowFadeAttribute]=fade;next.add(mesh);}
 }
 for(const mesh of this.cast)if(!next.has(mesh))this.world.shadows.removeShadowCaster(mesh,false);
 for(const mesh of next)if(!this.cast.has(mesh))this.world.shadows.addShadowCaster(mesh,false);
 this.shadowScratch=this.cast;this.cast=next;Object.assign(this.stats,{shadowCasters:next.size,majorShadowCasters:major,fadingShadows:fading});
}
function fixture(t){
 const engine=new NullEngine(),scene=new Scene(engine);engine.getCaps().instancedArrays=true;
 const camera=new ArcRotateCamera('camera',0,1,15,Vector3.Zero(),scene),light=new DirectionalLight('key',new Vector3(-.4,-1,-.6),scene),shadows=new ShadowGenerator(1024,light);
 const source=MeshBuilder.CreateBox('source',{},scene);source.isVisible=false;prepareVillageInstancing([source]);
 const world={scene,camera,shadows,touchDevice:true},records=[];let writes=0;
 const instance=(name,root)=>{const mesh=source.createInstance(name);mesh.parent=root;mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();let fade=mesh.instancedBuffers[shadowFadeAttribute];Object.defineProperty(mesh.instancedBuffers,shadowFadeAttribute,{configurable:true,get:()=>fade,set:value=>{writes++;fade=value;}});return mesh;};
 for(let i=0;i<40;i++){
  const root=new TransformNode('record-'+i,scene);root.position.x=i*.1;const meshes=[instance('mesh-'+i,root)];root.freezeWorldMatrix();
  records.push({root,meshes,placement:{id:String(i),x:i*.1,z:0,kind:i%3?'ground-detail':'tree'},min:new Vector3(i*.1-.5,-.5,-.5),max:new Vector3(i*.1+.5,.5,.5)});
 }
 const visibility=new VillageVisibility(world,records,{touch:true});t.after(()=>{visibility.dispose();scene.dispose();engine.dispose();});
 return {visibility,records,instance,writes:()=>writes};
}
function state(f){
 const value=f.visibility;
 return {active:[...value.shadowFade.active].map(([r,fade])=>[r.placement.id,fade]),cast:[...value.cast].map(m=>m.name),castRecords:[...value.castRecords].map(r=>r.placement.id),renderList:value.world.shadows.getShadowMap().renderList.map(m=>m.name),records:f.records.map(r=>({id:r.placement.id,enabled:r.root.isEnabled(),shadowCaster:r.shadowCaster,meshes:r.meshes.map(mesh=>[mesh.name,mesh.instancedBuffers?.[shadowFadeAttribute]])})),stats:Object.fromEntries(['shadowCasters','majorShadowCasters','fadingShadows'].map(key=>[key,value.stats[key]]))};
}

test('settled native casters retain exact attributes and ordering without rebuilding their submission',t=>{
 const before=fixture(t),after=fixture(t);
 for(const f of [before,after])f.visibility.shadowFade.select(f.records.slice(0,28));
 for(let frame=0;frame<360;frame++){
  if(frame===100)for(const f of [before,after])f.visibility.shadowFade.select(f.records.slice(12));
  if(frame===220)for(const f of [before,after])f.visibility.shadowFade.select(f.records.slice(0,28));
  previousUpdateShadows.call(before.visibility,1/60);after.visibility.updateShadows(1/60);
  assert.deepEqual(state(after),state(before),'shadow handoff changed at '+frame);
 }
 assert.ok(after.visibility.stats.shadowUpdateSkips>150);assert.ok(after.writes()<before.writes()*.55);
});

test('late meshes, same-length edits, fog, external attribute changes and disposal invalidate retained casters',t=>{
 const before=fixture(t),after=fixture(t);
 for(const f of [before,after])f.visibility.shadowFade.select(f.records.slice(0,5));
 const verify=()=>{previousUpdateShadows.call(before.visibility,1/60);after.visibility.updateShadows(1/60);assert.deepEqual(state(after),state(before));};
 verify();verify();
 for(const f of [before,after])f.records[0].meshes.push(f.instance('late-mesh',f.records[0].root));verify();verify();
 for(const f of [before,after])f.records[0].meshes[0]=f.instance('replacement-mesh',f.records[0].root);verify();verify();
 for(const f of [before,after])f.records[1].meshes[0].instancedBuffers[shadowFadeAttribute]=.1;verify();
 for(const f of [before,after])f.records[2].fogVisible=false;verify();verify();
 for(const f of [before,after])f.records[2].fogVisible=true;verify();
 for(const f of [before,after])f.records[3].placement.kind='landmark';verify();
 for(const f of [before,after])f.records[4].root.dispose();verify();
 for(const f of [before,after])f.visibility.shadowFade.clear();verify();verify();
 for(const f of [before,after])f.visibility.shadowFade.select([f.records[0]]);verify();
 for(let frame=0;frame<50;frame++)verify();
});
