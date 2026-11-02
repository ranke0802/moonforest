import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import assert from 'node:assert/strict';
import {hash} from './resource-pack.js';
const root=resolve(import.meta.dirname,'..'),review=resolve(root,'reports/saint-50k-2026-11-02'),assets=resolve(root,'public/assets');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const r=await read(resolve(review,'candidate-report.json')),v=await read(resolve(review,'motion-validation.json')),c=await read(resolve(assets,'elena.json'));
assert.equal(c.model,r.source.model,'Apply once to the reviewed source');
assert.equal(r.candidate.triangles,56918);assert.equal(r.candidate.vertices,96734);
assert.ok(v.samples.length===72&&v.samples.every(s=>s.maxRetainedVertexDifference===0));
assert.equal(c.bodyHeight,1.7);
const g=await read(resolve(review,'candidate',r.candidate.model));
const names=[...new Set([r.candidate.model,...g.buffers.map(b=>b.uri).filter(Boolean),...g.images.map(i=>i.uri).filter(Boolean)])];
const newPaths=[];
for(const name of names){
 const bytes=await readFile(resolve(review,'candidate',name));assert.equal(hash(bytes),name.split('.')[0]);
 if(name.endsWith('.ktx2'))assert.ok(bytes.equals(await readFile(resolve(assets,'content',name))));
 else{await writeFile(resolve(assets,'content',name),bytes);newPaths.push('ArcherPreview/public/assets/content/'+name);}
}
c.model='./content/'+r.candidate.model;c.resources=names.map(n=>'./content/'+n);
c.version='Fallen Saint Elena · approved 56,918 triangles';
c.geometry={triangles:56918,vertices:96734,originalTopology:false,originalTriangleSurfaces:false,lossless:false,optimization:{revision:'2026-11-02-approved-56918',method:'attribute-aware index simplification; exact retained vertices',sourceTriangles:103930,sourceVertices:158730,sourceModelFile:basename(r.source.model),textureUnchanged:true,bonesAndAnimationUnchanged:true,protectedFeatures:'head, neck, hands, fingers, UV seams and true open boundaries',remainingVisualDifference:'User approved 56,918-triangle candidate after same-pose comparisons. Geometry reduction is lossy; this is not a <=50K model.'}};
await writeFile(resolve(assets,'elena.json'),JSON.stringify(c,null,2)+'\n');
await copyFile(resolve(review,'retained-vertices.u32'),resolve(root,'tests/fixtures/saint-reviewed-retained.u32'));
await writeFile(resolve(review,'applied-files.json'),JSON.stringify({approvedByUser:true,approvedTriangles:56918,paths:[...newPaths,'ArcherPreview/public/assets/elena.json'],texture:r.texture,sourceBefore:r.source.model,modelAfter:c.model,unchanged:'1.7m scale, animations/catalog/ground and hit tracks, style, combat settings'},null,2)+'\n');
console.log(JSON.stringify({model:c.model,triangles:c.geometry.triangles,vertices:c.geometry.vertices,resources:c.resources.length,textureUnchanged:true}));
