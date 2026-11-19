import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,VertexBuffer} from '@babylonjs/core';
globalThis.document??={documentElement:{dataset:{edition:'0.3'}}};
const {simplifierReady,simplifyOwnMesh,simplifySharedShell}=await import('../src/mesh-simplify.js');
await simplifierReady();
const bumpy=scene=>{const m=MeshBuilder.CreateGround('g',{width:40,height:40,subdivisions:60},scene);const p=m.getVerticesData('position');for(let i=0;i<p.length;i+=3)p[i+1]=Math.sin(p[i]*.05)*.5;m.setVerticesData('position',p);return m;};

test('terrain keeps every vertex and loses flat triangles',()=>{
 const scene=new Scene(new NullEngine()),g=bumpy(scene),verts=g.getTotalVertices(),before=g.getTotalIndices();
 assert.ok(simplifyOwnMesh(g,{ratio:.12,error:.04,absolute:true}));
 assert.equal(g.getTotalVertices(),verts);assert.ok(g.getTotalIndices()<before*.5,'well under half the triangles');
 const idx=g.getIndices();assert.ok(idx.every(i=>i<verts));
});

test('a shared outline shell gets its own indices; the body and its buffers stay intact',()=>{
 const scene=new Scene(new NullEngine()),body=MeshBuilder.CreateSphere('body',{segments:48},scene);
 const shell=body.clone('body / silhouette',body,true),bodyTris=body.getTotalIndices();
 assert.equal(shell.geometry,body.geometry);
 assert.ok(simplifySharedShell(shell,{ratio:.5,error:.01}));
 assert.notEqual(shell.geometry,body.geometry);assert.equal(body.getTotalIndices(),bodyTris);
 assert.ok(shell.getTotalIndices()<bodyTris*.75);
 assert.equal(shell.geometry.getVertexBuffer(VertexBuffer.PositionKind)._buffer,body.geometry.getVertexBuffer(VertexBuffer.PositionKind)._buffer,'no vertex data copied');
 shell.dispose();assert.ok(body.getVerticesData('position')?.length>0);assert.ok(!body.geometry.getVertexBuffer(VertexBuffer.PositionKind)._buffer._isDisposed&&body.geometry.getVertexBuffer(VertexBuffer.PositionKind).getBuffer());
 const second=body.clone('again',body,true);assert.ok(simplifySharedShell(second,{ratio:.5,error:.01}),'cached reduction reused');
});
