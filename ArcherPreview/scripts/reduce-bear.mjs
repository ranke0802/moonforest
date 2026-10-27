// Reduce only geometry. Keep surviving vertex attributes and all animation data exact.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import { hash } from './resource-pack.js';
const [input, output, reportFile] = process.argv.slice(2);
if (!reportFile) throw new Error('Usage: reduce-bear.mjs input.glb output.glb report.json');
const bytes=fs.readFileSync(input), jsonLength=bytes.readUInt32LE(12), start=28+jsonLength;
const original=JSON.parse(bytes.toString('utf8',20,20+jsonLength)), g=structuredClone(original);
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const types={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
function raw(aIndex){
  const a=original.accessors[aIndex],v=original.bufferViews[a.bufferView],size=widths[a.type]*types[a.componentType][0];
  assert.ok(!a.sparse);const result=Buffer.alloc(a.count*size);
  for(let i=0;i<a.count;i++)bytes.copy(result,i*size,start+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||size),start+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||size)+size);
  return result;
}
function data(i){const a=original.accessors[i],b=raw(i),[size,read]=types[a.componentType];return Float32Array.from({length:a.count*widths[a.type]},(_,n)=>b[read](n*size));}
assert.equal(g.meshes.length,1);const p=g.meshes[0].primitives[0];assert.equal(g.meshes[0].primitives.length,1);assert.ok(!p.targets);
const position=data(p.attributes.POSITION),normal=data(p.attributes.NORMAL),uv=data(p.attributes.TEXCOORD_0);
const joints=[data(p.attributes.JOINTS_0),data(p.attributes.JOINTS_1)],weights=[data(p.attributes.WEIGHTS_0),data(p.attributes.WEIGHTS_1)];
const count=position.length/3, parents=new Map();g.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
const skin=g.skins[0],bind=data(skin.inverseBindMatrices), meshNode=g.nodes.findIndex(n=>n.mesh===0);
const poses=[['Running',.25],['Axe_Spin_Attack',.55],['Knock_Down_1',.65],['Stand_Up3',.5]];
function pose(name,phase){
  const clip=g.animations.find(a=>a.name===name),transforms=g.nodes.map(n=>({translation:n.translation||[0,0,0],rotation:n.rotation||[0,0,0,1],scale:n.scale||[1,1,1]}));
  for(const c of clip.channels){const s=clip.samplers[c.sampler],times=data(s.input),values=data(s.output),w=widths[g.accessors[s.output].type],t=times[times.length-1]*phase;
    assert.ok(!s.interpolation||s.interpolation==='LINEAR'||s.interpolation==='STEP');let a=0;while(a+1<times.length&&times[a+1]<=t)a++;const b=Math.min(a+1,times.length-1),f=a===b||s.interpolation==='STEP'?0:(t-times[a])/(times[b]-times[a]);
    const av=Array.from(values.slice(a*w,(a+1)*w)),bv=Array.from(values.slice(b*w,(b+1)*w));
    transforms[c.target.node][c.target.path]=c.target.path==='rotation'?Quaternion.Slerp(Quaternion.FromArray(av),Quaternion.FromArray(bv),f).asArray():av.map((v,k)=>v+(bv[k]-v)*f);
  }
  const cache=new Map();function world(i){if(cache.has(i))return cache.get(i);const t=transforms[i],m=Matrix.Compose(Vector3.FromArray(t.scale),Quaternion.FromArray(t.rotation),Vector3.FromArray(t.translation));const r=parents.has(i)?m.multiply(world(parents.get(i))):m;cache.set(i,r);return r;}
  const inverseMesh=Matrix.Invert(world(meshNode));return skin.joints.map((node,i)=>Matrix.FromArray(bind,i*16).multiply(world(node)).multiply(inverseMesh));
}
const matrices=poses.map(([name,phase])=>pose(name,phase)),stride=5+poses.length*3,attributes=new Float32Array(count*stride);
const point=new Vector3(),transformed=new Vector3();
for(let i=0;i<count;i++){
  attributes.set(normal.subarray(i*3,i*3+3),i*stride);attributes.set(uv.subarray(i*2,i*2+2),i*stride+3);
  point.set(position[i*3],position[i*3+1],position[i*3+2]);
  for(let k=0;k<poses.length;k++)for(let set=0;set<2;set++)for(let j=0;j<4;j++){
    const weight=weights[set][i*4+j];if(!weight)continue;Vector3.TransformCoordinatesToRef(point,matrices[k][joints[set][i*4+j]],transformed);
    const at=i*stride+5+k*3;attributes[at]+=transformed.x*weight;attributes[at+1]+=transformed.y*weight;attributes[at+2]+=transformed.z*weight;
  }
}
await MeshoptSimplifier.ready;
const indices=Uint32Array.from(data(p.indices)), attributeWeights=[.25,.25,.25,2,2,...Array(poses.length*3).fill(.8)];
// Permissive handles the source's many split normals; UVs and posed positions
// are explicit error terms, while original skin weights remain unchanged.
const [reduced,error]=MeshoptSimplifier.simplifyWithAttributes(indices,position,3,attributes,stride,attributeWeights,null,90000,.04,['Permissive']);
assert.ok(reduced.length<=90000,`Budget not met: ${reduced.length/3}`);
const [remap,vertexCount]=MeshoptSimplifier.compactMesh(reduced), replacements=new Map();
for(const index of Object.values(p.attributes)){
  const a=g.accessors[index],old=raw(index),size=old.length/count,next=Buffer.alloc(vertexCount*size);
  for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)old.copy(next,remap[i]*size,i*size,(i+1)*size);
  assert.equal(g.bufferViews[a.bufferView].byteStride,undefined);a.count=vertexCount;delete a.byteOffset;replacements.set(a.bufferView,next);
  if(a.min||a.max){const [n,read]=types[a.componentType],w=widths[a.type];a.min=Array(w).fill(Infinity);a.max=Array(w).fill(-Infinity);for(let i=0;i<vertexCount;i++)for(let k=0;k<w;k++){const v=next[read]((i*w+k)*n);a.min[k]=Math.min(a.min[k],v);a.max[k]=Math.max(a.max[k],v);}}
}
const ia=g.accessors[p.indices],indexBytes=Buffer.alloc(reduced.length*4);reduced.forEach((v,i)=>indexBytes.writeUInt32LE(v,i*4));
ia.componentType=5125;ia.count=reduced.length;delete ia.byteOffset;delete ia.min;delete ia.max;replacements.set(ia.bufferView,indexBytes);
const chunks=[];let offset=0;g.bufferViews.forEach((v,i)=>{const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}const old=original.bufferViews[i],chunk=replacements.get(i)||bytes.subarray(start+(old.byteOffset||0),start+(old.byteOffset||0)+old.byteLength);v.byteOffset=offset;v.byteLength=chunk.length;chunks.push(chunk);offset+=chunk.length;});
const pad=(4-offset%4)%4;if(pad)chunks.push(Buffer.alloc(pad));const binary=Buffer.concat(chunks);g.buffers=[{byteLength:binary.length}];
const json=Buffer.from(JSON.stringify(g)),jsonPadded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonPadded.length+binary.length,8);header.writeUInt32LE(jsonPadded.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);
const result=Buffer.concat([header,jsonPadded,binHeader,binary]);fs.writeFileSync(output,result);
// All non-mesh buffers, hierarchy, skeleton and clip descriptors are exact.
for(const key of ['nodes','skins','animations','materials','images'])assert.deepEqual(g[key],original[key]);
const untouched=original.bufferViews.flatMap((v,i)=>replacements.has(i)?[]:[{view:i,sha256:hash(bytes.subarray(start+(v.byteOffset||0),start+(v.byteOffset||0)+v.byteLength))}]);
for(const v of untouched){const b=g.bufferViews[v.view];assert.equal(hash(binary.subarray(b.byteOffset,b.byteOffset+b.byteLength)),v.sha256);}
const report={input,output,beforeTriangles:indices.length/3,afterTriangles:reduced.length/3,beforeVertices:count,afterVertices:vertexCount,error,poseSamples:poses,unchangedAnimationClips:g.animations.map(a=>a.name),unchangedViews:untouched,beforeBytes:bytes.length,afterBytes:result.length,originalSHA256:hash(bytes),reducedSHA256:hash(result)};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,unchangedViews:untouched.length}));
