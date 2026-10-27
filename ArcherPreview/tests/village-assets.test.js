import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Matrix, Mesh, NullEngine, Quaternion, Scene, Vector3, VertexBuffer } from '@babylonjs/core';
import { createVillageTransform } from '../src/village-environment.js';
import { VILLAGE_PLACEMENTS } from '../src/village-layout.js';

const assetsUrl=new URL('../public/assets/',import.meta.url);
const manifestUrl=['village.json','village-fixture.json'].map(n=>new URL(n,assetsUrl)).find(existsSync);
const manifest=manifestUrl?JSON.parse(readFileSync(manifestUrl)):null;
function positions(modelUrl){
  const gltf=JSON.parse(readFileSync(modelUrl)),buffers=gltf.buffers.map(b=>readFileSync(new URL(b.uri,modelUrl))),parents=new Map(),matrices=new Map(),out=[];
  gltf.nodes.forEach((node,i)=>(node.children??[]).forEach(child=>parents.set(child,i)));
  const world=i=>{
    if(matrices.has(i))return matrices.get(i);
    const n=gltf.nodes[i],local=n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));
    const matrix=parents.has(i)?local.multiply(world(parents.get(i))):local;matrices.set(i,matrix);return matrix;
  };
  gltf.nodes.forEach((node,i)=>{
    if(node.mesh===undefined)return;
    for(const primitive of gltf.meshes[node.mesh].primitives){
      const a=gltf.accessors[primitive.attributes.POSITION],v=gltf.bufferViews[a.bufferView],bytes=buffers[v.buffer];
      assert.equal(a.componentType,5126);assert.equal(a.type,'VEC3');
      const start=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??12;
      for(let j=0;j<a.count;j++)out.push(...Vector3.TransformCoordinates(new Vector3(bytes.readFloatLE(start+j*stride),bytes.readFloatLE(start+j*stride+4),bytes.readFloatLE(start+j*stride+8)),world(i)).asArray());
    }
  });
  return out;
}

test('approved wagon/cart vertices, front correction and actual runtime transforms agree',t=>{
  if(!manifest?.assets['covered-wagon']||!manifest.assets.handcart)return t.skip('wagon/cart generation not ready');
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  t.after(()=>{scene.dispose();engine.dispose();});
  for(const id of ['covered-wagon','handcart']){
    const config=manifest.assets[id],vertices=positions(new URL(config.lods[0].model,manifestUrl));
    assert.ok(Math.abs(config.frontYawOffset-Math.PI/2)<1e-8);
    const rotation=Matrix.RotationY(config.frontYawOffset),min=new Vector3(Infinity,Infinity,Infinity),max=min.negate();
    for(let i=0;i<vertices.length;i+=3){const p=Vector3.TransformCoordinates(Vector3.FromArray(vertices,i),rotation);min.minimizeInPlace(p);max.maximizeInPlace(p);}
    max.subtract(min).asArray().forEach((n,i)=>assert.ok(Math.abs(n-config.bounds[i])<1e-4,`${id} canonical axis ${i} differs from packed bounds`));
    assert.ok(Math.abs(min.y)<1e-4,'bottom-center origin must stay on the ground');
    const placement=VILLAGE_PLACEMENTS.find(p=>p.asset===id),{root,facing}=createVillageTransform({scene,terrain:{heightAt:()=>2.5}},placement,config);
    const mesh=new Mesh(`real-${id}-vertices`,scene);mesh.setVerticesData(VertexBuffer.PositionKind,vertices);mesh.parent=facing;mesh.computeWorldMatrix(true);
    const box=mesh.getBoundingInfo().boundingBox;
    assert.ok(Math.abs(box.minimumWorld.y-2.475)<1e-4,'actual runtime ground anchor must include only the tiny contact inset');
    assert.ok(Math.abs(box.maximumWorld.y-box.minimumWorld.y-config.height*placement.scale)<1e-4);
    const front=Vector3.TransformNormal(new Vector3(-1,0,0),facing.getWorldMatrix()).normalize();
    assert.ok(Vector3.Dot(front,new Vector3(Math.sin(placement.yaw),0,Math.cos(placement.yaw)))>.999999,'raw -X handle/tow bar must face the authored forward direction');
    root.dispose();
  }
});
