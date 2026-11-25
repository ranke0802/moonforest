import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Mesh,MeshBuilder,PBRMaterial} from '@babylonjs/core';
import {createRidingWardrobe,RIDING_STATS} from '../src/v03/riding-wardrobe.js';
import {HorseCoat} from '../src/v03/horse-coat.js';

function fixture(t){
  const engine=new NullEngine(),scene=new Scene(engine);
  let owned=true,field=null;const save=new Map(),loads=[];
  const storage={getItem:k=>save.get(k),setItem:(k,v)=>save.set(k,v)};
  const makeHorse=()=>{
    const root=new TransformNode('test horse',scene);
    MeshBuilder.CreateBox('coat',{},scene).parent=root;
    const lines=new Mesh('v03-riding-reins',scene);lines.parent=root;
    let ready;const horse={root,ready:new Promise(resolve=>{ready=resolve;}),finish:()=>ready(root),
      place(){},saddleContactToRef(p){p.set(0,1.48,0);return true;},setCoat(v){this.color=v;},
      dispose(){this.released=(this.released??0)+1;root.dispose();}};
    loads.push(horse);return horse;
  };
  const wardrobe=createRidingWardrobe({world:{scene},storage,owned:()=>owned,fieldHorse:()=>field,makeHorse});
  t.after(()=>{wardrobe.closePreview();scene.dispose();engine.dispose();});
  return {engine,scene,loads,storage,save,wardrobe,makeHorse,owner:v=>{owned=v;},inField:v=>{field=v;}};
}
test('an on-foot preview is lazy, cancellable and returns its saddle, mesh and material',async t=>{
  const h=fixture(t),w=h.wardrobe;
  h.owner(false);assert.equal(await w.preview(),null);assert.equal(w.setCoat('#000000'),false);assert.equal(h.loads.length,0);
  h.owner(true);const first=w.preview();assert.equal(w.preview(),first);
  w.closePreview();const second=w.preview();h.loads[0].finish();assert.equal(await first,null);assert.equal(h.loads[0].released,1);
  const sceneMaterials=h.scene.materials.length;h.loads[1].finish();const p=await second;
  assert.equal(h.loads.length,2);assert.ok(p.meshes.some(m=>m.name==='v03-riding-saddle'));
  assert.ok(!p.meshes.some(m=>m.name==='v03-riding-reins'));
  assert.equal(h.scene.materials.length,sceneMaterials+1);
  p.setCoat('#919191');assert.equal(h.loads[1].color,'#919191');assert.equal(w.coat,'original');
  p.dispose();assert.equal(h.loads[1].released,1);assert.equal(h.scene.materials.length,sceneMaterials);
  assert.equal(h.scene.meshes.length,0);
});
test('mounted preview reuses the field horse; cancel, storage failure and save-slot changes are isolated',async t=>{
  const h=fixture(t),w=h.wardrobe,field=h.makeHorse();field.finish();h.inField(field);
  const p=await w.preview();assert.equal(p.actor,field.root);assert.equal(h.loads.length,1);
  p.setCoat('#ffffff');assert.equal(field.color,'#ffffff');p.dispose();assert.equal(field.color,'original');
  assert.ok(w.setCoat('#AABBCC'));assert.equal(w.coat,'#aabbcc');assert.equal(field.color,w.coat);assert.equal(field.released,undefined);
  const q=await w.preview();p.dispose();q.setCoat('#aaaaaa');assert.equal(field.color,'#aaaaaa');
  assert.equal(w.setCoat('bogus'),false);
  h.storage.setItem=()=>{throw Error('storage disabled');};
  assert.equal(w.setCoat('#ffffff'),false);q.dispose();assert.equal(field.color,'#aabbcc');
  w.reload();assert.equal(w.coat,'#aabbcc');h.save.clear();w.reload();assert.equal(w.coat,'original');
  assert.equal(w.stats,RIDING_STATS);field.dispose();
});
test('white and original coats use different uniform values on the same painted material',t=>{
  const h=fixture(t),mat=new PBRMaterial('paint',h.scene),coat=new HorseCoat(mat);
  const buffer={updateFloat4:(name,...values)=>{assert.equal(name,'horseCoat');buffer.value=values;}};
  coat.setCoat('#ffffff');coat.bindForSubMesh(buffer);assert.deepEqual(buffer.value,[1,1,1,1]);
  coat.setCoat('original');coat.bindForSubMesh(buffer);assert.equal(buffer.value[3],0);
});
