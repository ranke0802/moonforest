import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,VertexBuffer,Vector3,PBRMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {instantiateStaticMap} from '../src/static-map-instances.js';
import {prepareChestOpening,createChestOpening,CHEST_OPEN_ANGLE,CHEST_OPEN_SECONDS} from '../src/chest-opening.js';

const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('quest-props.json',base))).assets['chest-common'],facts=[];let packed;
async function fixture(t){
 packed??=readRuntimeGltf(new URL(config.lods[1].model,base));const source=await packed,json=structuredClone(source.gltf);for(const b of json.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+source.files.get(b.uri).data.toString('base64');
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json},'');const material=new PBRMaterial('chest-original',scene);material.backFaceCulling=false;asset.materials.push(material);for(const mesh of asset.meshes)if(mesh.getTotalVertices()>0)mesh.material=material;
 t.after(()=>{asset.dispose();scene.dispose();engine.dispose();});return{asset,engine,scene};
}
function triangles(mesh){
 const positions=mesh.getVerticesData(VertexBuffer.PositionKind),normal=mesh.getVerticesData(VertexBuffer.NormalKind),uv=mesh.getVerticesData(VertexBuffer.UVKind),indices=mesh.getIndices(),matrix=mesh.computeWorldMatrix(true),p=new Vector3(),n=new Vector3(),rows=[];
 for(let i=0;i<indices.length;i+=3){const corners=[];for(const id of indices.slice(i,i+3)){Vector3.TransformCoordinatesFromFloatsToRef(positions[id*3],positions[id*3+1],positions[id*3+2],matrix,p);Vector3.TransformNormalFromFloatsToRef(normal[id*3],normal[id*3+1],normal[id*3+2],matrix,n);corners.push({position:p.asArray(),key:[...n.asArray(),uv[id*2],uv[id*2+1]].map(v=>Math.round(v*1e6)).join(',')});}rows.push({key:corners.map(v=>v.key).sort().join('|'),corners});}return rows;
}
test('real packed chest preserves all exterior triangle/normal/UV tuples and adds only eight interior wall triangles',async t=>{
 const {asset,scene}=await fixture(t),original=asset.meshes.find(m=>m.getTotalVertices()>0),originalGeometry=original.geometry,sourceTriangles=triangles(original),material=original.material,start=performance.now(),profile=prepareChestOpening(asset),partitionMs=performance.now()-start;
 assert.equal(profile.originalTriangles,4479);assert.equal(profile.totalTriangles,4487);assert.equal(profile.addedTriangles,8);assert.equal(profile.recessedFloorTriangles,20);assert.equal(profile.vertices,5125);assert.ok(!asset.geometries.includes(originalGeometry));assert.equal(originalGeometry.isDisposed(),true);assert.strictEqual(prepareChestOpening(asset),profile);
 const sources=asset.meshes.filter(m=>m.getTotalVertices()>0),result=new Map();for(const tri of sources.flatMap(triangles)){const group=result.get(tri.key)??[];group.push(tri);result.set(tri.key,group);}assert.equal(sources.length,2);assert.ok(sources.every(m=>m.material===material));let matched=0,maximumExteriorVertexError=0;for(const tri of sourceTriangles){let distance=Infinity;for(const candidate of result.get(tri.key)??[])distance=Math.min(distance,Math.max(...tri.corners.map(corner=>Math.min(...candidate.corners.filter(v=>v.key===corner.key).map(v=>Math.hypot(...v.position.map((p,i)=>p-corner.position[i])))))));if(distance<1e-6){matched++;maximumExteriorVertexError=Math.max(maximumExteriorVertexError,distance);}}assert.equal(matched,4479-20,'only the concealed original solid top plate is replaced');
 const area=corners=>{const[a,b,c]=corners.map(c=>Vector3.FromArray(c.position));return Vector3.Cross(b.subtract(a),c.subtract(a)).length()/2;},originalDegenerate=sourceTriangles.filter(tri=>area(tri.corners)<1e-10).length,derivedDegenerate=sources.flatMap(triangles).filter(tri=>area(tri.corners)<1e-10).length;
 assert.equal(originalDegenerate,1,'document the unchanged zero-area triangle in the packed input');assert.equal(derivedDegenerate,originalDegenerate,'the cavity must not introduce degenerate faces');assert.ok(!scene.meshes.includes(sources.find(m=>m.name==='chest-lid')));facts.push({case:'actual-partition',...profile,partitionMs,originalDegenerate,derivedDegenerate,externalTrianglesNormalsUVPreserved:4459,maximumExteriorVertexError,additionalMaterials:0,additionalTextures:0});
});
test('independent native instance lids ease to 105 degrees in .85 seconds while bodies and shared geometry remain unchanged',async t=>{
 const {asset,scene}=await fixture(t);prepareChestOpening(asset);const rows=[];
 for(let i=0;i<5;i++){const root=new TransformNode('chest-'+i,scene),instance=instantiateStaticMap(asset,name=>i+'-'+name);for(const node of instance.rootNodes)node.parent=root;root.position.x=i*2;root.rotation.y=i*.3;const opening=createChestOpening(root),body=root.getChildMeshes().find(m=>m.sourceMesh?.metadata?.chestBody);for(const node of[root,...root.getDescendants()])node.freezeWorldMatrix();rows.push({root,opening,body,world:body.computeWorldMatrix(true).asArray().slice()});t.after(()=>root.dispose());}
 const first=rows[0].opening;assert.equal(first.open(),true);assert.equal(first.open(),false);let previous=0;const increments=[];for(let frame=0;frame<51;frame++){first.advance(1/60);increments.push(Math.abs(first.state.angle)-previous);previous=Math.abs(first.state.angle);assert.deepEqual(rows[0].body.getWorldMatrix().asArray(),rows[0].world);}
 assert.ok(Math.abs(first.state.angle-CHEST_OPEN_ANGLE)<1e-10);assert.equal(first.state.active,false);assert.ok(increments[0]>increments[25]&&increments[25]>increments[49]);assert.equal(first.hinge.isWorldMatrixFrozen,true);assert.equal(rows[1].opening.state.angle,0);assert.ok(rows.every(row=>row.body.geometry===rows[0].body.geometry));
 const open=createChestOpening(rows[1].root,{opened:true});assert.equal(open.state.angle,CHEST_OPEN_ANGLE);assert.equal(open.state.active,false);assert.equal(open.hinge.isWorldMatrixFrozen,true);open.setOpened(false);assert.equal(open.state.angle,0);assert.equal(open.state.opened,false);open.setOpened(true);assert.equal(open.state.angle,CHEST_OPEN_ANGLE);assert.equal(open.state.active,false);facts.push({case:'native-animation',degrees:105,duration:CHEST_OPEN_SECONDS,instances:5,bodyWorldUnchanged:true,openingOnlyLid:true,sharedGeometries:2,easeIncrements:[increments[0],increments[25],increments[49]]});
});
test.after(()=>{const folder=new URL('../reports/chest-opening-2026-11-03/',import.meta.url);mkdirSync(folder,{recursive:true});writeFileSync(new URL('geometry-animation-validation.json',folder),JSON.stringify({scope:'Actual Babylon packed asset geometry/instancing and hinge transform, no phone/GPU timing claim.',facts},null,2)+'\n');});
