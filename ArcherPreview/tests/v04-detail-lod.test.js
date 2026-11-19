import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,StandardMaterial} from '@babylonjs/core';
import {installDetailLods,DETAIL_LOD,detailLodEnabled} from '../src/v04/detail-lod.js';

test('small scenery gains two far levels chosen by screen coverage; the source mesh is untouched',()=>{
 const engine=new NullEngine({renderWidth:1280,renderHeight:590}),scene=new Scene(engine);
 const camera=new FreeCamera('camera',new Vector3(0,1,-4),scene);camera.setTarget(Vector3.Zero());scene.activeCamera=camera;
 const base=MeshBuilder.CreateSphere('tuft',{diameter:.6,segments:24},scene);base.material=new StandardMaterial('m',scene);base.useLODScreenCoverage=true;
 const packed=MeshBuilder.CreateSphere('tuft-packed',{diameter:.6,segments:22},scene);base.addLODLevel(.035,packed);
 const before=base.getTotalIndices(),prepared=[];
 const made=installDetailLods(base,{prepare:mesh=>prepared.push(mesh)});
 assert.equal(made.length,2);assert.deepEqual(prepared,made);assert.equal(base.getTotalIndices(),before,'source geometry is not shared with the copies');
 const [mid,far]=made,triangles=before/3;
 assert.ok(mid.getTotalIndices()/3<=Math.max(60,triangles*.18)&&far.getTotalIndices()/3<=Math.max(24,triangles*.04)&&far.getTotalIndices()<mid.getTotalIndices());
 assert.equal(mid.material,base.material);assert.equal(far.metadata.detailLod,'far');assert.equal(far.subMeshes.length,1);assert.equal(far.subMeshes[0].indexCount,far.getTotalIndices());
 assert.equal(base.getLODLevels().length,3);assert.equal(far.getLODLevels().length,0);
 scene.render();
 const at=distance=>{camera.position.set(0,0,-distance);camera.setTarget(Vector3.Zero());camera.getViewMatrix(true);scene.updateTransformMatrix(true);return base.getLOD(camera);};
 assert.equal(at(12),packed,'near: the packed level');assert.equal(at(45),mid);assert.equal(at(120),far);
 // Too small to be worth it, and a second call adds nothing new to a tiny mesh.
 const tiny=MeshBuilder.CreateBox('crate',{},scene);assert.deepEqual(installDetailLods(tiny),[]);
 assert.equal(detailLodEnabled(),false,'only the 0.4 world turns it on');assert.ok(DETAIL_LOD.tiers[0].coverage>DETAIL_LOD.tiers[1].coverage);
 scene.dispose();engine.dispose();
});

test('0.3 tiers: size classes by kind; mixed kinds take the largest; 0.4 keeps its own',async()=>{
 const {detailTiersFor,DETAIL_LOD_KIND_TIERS:K}=await import('../src/v04/detail-lod.js');
 assert.equal(detailTiersFor(['tree','tree'],{world:'0.3'}),K.tree);
 assert.equal(detailTiersFor(['prop'],{world:'0.3'}),K.wall);
 assert.equal(detailTiersFor(['shrub','rock'],{world:'0.3'}),K.shrub);
 assert.equal(detailTiersFor(['tree','shrub'],{world:'0.3'}),K.tree);
 assert.equal(detailTiersFor(['building'],{world:'0.3'}),null);
 assert.equal(detailTiersFor(['shrub'],{world:'0.4'}),DETAIL_LOD.tiers);
 assert.ok(K.tree[0].coverage>K.tree[1].coverage&&K.tree[0].coverage>K.shrub[0].coverage);
});
