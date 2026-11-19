import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,MeshBuilder,StandardMaterial,Vector3,Skeleton,Bone,Matrix,VertexBuffer} from '@babylonjs/core';
import {mergePlayerMeshes} from '../src/player-mesh-merge.js';

const worldPoints=mesh=>{mesh.computeWorldMatrix(true);const p=mesh.getVerticesData('position'),w=mesh.getWorldMatrix(),out=[];for(let i=0;i<p.length;i+=3)out.push(Vector3.TransformCoordinates(new Vector3(p[i],p[i+1],p[i+2]),w));return out;};
const close=(a,b)=>a.length===b.length&&a.every((v,i)=>Vector3.Distance(v,b[i])<1e-4);

test('rigid parts with one material and parent become one mesh in the same place',()=>{
 const scene=new Scene(new NullEngine());const hand=new TransformNode('hand',scene);hand.position.set(1,2,3);hand.rotation.y=.7;
 const leather=new StandardMaterial('leather',scene),gold=new StandardMaterial('gold',scene);
 const parts=[0,1,2].map(i=>{const m=MeshBuilder.CreateBox('pad_'+i,{size:.1},scene);m.sideOrientation=1;m.parent=hand;m.position.set(i*.2,.1,0);m.rotation.z=i*.3;m.material=leather;return m;});
 const shield=MeshBuilder.CreateBox('Shield',{size:1},scene);shield.parent=hand;shield.material=leather;
 const rivet=MeshBuilder.CreateBox('rivet',{size:.05},scene);rivet.parent=hand;rivet.material=gold;
 const container={meshes:[shield,...parts,rivet],animationGroups:[]};
 const before=parts.flatMap(worldPoints);
 const stats=mergePlayerMeshes(container,{keep:['Shield']});
 assert.equal(stats.groups,1);assert.equal(container.meshes.length,3,'shield, merged pads, rivet');
 const merged=container.meshes.find(m=>m.metadata?.moonforestMergedFrom);
 assert.equal(merged.parent,hand);assert.equal(merged.sideOrientation,1,'winding follows the glTF parts');assert.equal(merged.material,leather);
 assert.ok(close(worldPoints(merged),before),'every vertex keeps its world position');
 hand.position.set(-4,0,9);assert.ok(merged.getWorldMatrix()!==null&&close(worldPoints(merged),parts.length?worldPoints(merged):[]));
 assert.ok(parts.every(m=>m.isDisposed()));assert.ok(!shield.isDisposed()&&!rivet.isDisposed());
});

test('skinned parts sharing skeleton, material and pose keep their weights; differing pose stays apart',()=>{
 const scene=new Scene(new NullEngine());const armature=new TransformNode('Armature',scene);
 const skeleton=new Skeleton('rig','rig',scene);new Bone('root',skeleton,null,Matrix.Identity());
 const ink=new StandardMaterial('ink',scene);
 const make=(name,y)=>{const m=MeshBuilder.CreateBox(name,{size:.3},scene);m.parent=armature;m.position.y=y;m.material=ink;m.skeleton=skeleton;const n=m.getTotalVertices();m.setVerticesData(VertexBuffer.MatricesIndicesKind,new Float32Array(n*4));m.setVerticesData(VertexBuffer.MatricesWeightsKind,new Float32Array(n*4).map((_,i)=>i%4===0?1:0));m.numBoneInfluencers=4;return m;};
 const a=make('Hair_Outline',0),b=make('Face_Outline',0),c=make('Cape_Outline',1);
 const container={meshes:[a,b,c],animationGroups:[]};
 const stats=mergePlayerMeshes(container);
 assert.equal(stats.groups,1);assert.equal(container.meshes.length,2);
 const merged=container.meshes.find(m=>m.metadata?.moonforestMergedFrom);
 assert.deepEqual(merged.metadata.moonforestMergedFrom,['Hair_Outline','Face_Outline']);
 assert.equal(merged.skeleton,skeleton);assert.equal(merged.numBoneInfluencers,4);
 assert.ok(merged.isVerticesDataPresent(VertexBuffer.MatricesWeightsKind));
 assert.equal(merged.getTotalVertices(),48);assert.ok(!c.isDisposed());
});

test('animated meshes and the off switch are left alone',()=>{
 const scene=new Scene(new NullEngine());const mat=new StandardMaterial('m',scene);
 const [a,b]=['a','b'].map(n=>{const m=MeshBuilder.CreateBox(n,{},scene);m.material=mat;return m;});
 assert.equal(mergePlayerMeshes({meshes:[a,b],animationGroups:[]},{enabled:false}).groups,0);
 assert.equal(mergePlayerMeshes({meshes:[a,b],animationGroups:[{targetedAnimations:[{target:a}]}]}).groups,0);
});
