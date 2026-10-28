import {readFile,writeFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash} from './resource-pack.js';

export const TREE_IDS=['tree-01-round-oak','tree-02-slender-pine'];

export function packTreeGeometry(raw){
  const {positions,normals,uvs,indices}=raw,count=positions.length;
  if(!count||normals.length!==count||uvs.length!==count||indices.length%3)throw new Error('Invalid vertex channels');
  for(const [values,size] of [[positions,3],[normals,3],[uvs,2]])if(values.some(v=>v.length!==size||v.some(n=>!Number.isFinite(n))))throw new Error('Invalid finite vertex data');
  if(indices.some(i=>!Number.isInteger(i)||i<0||i>=count))throw new Error('Invalid triangle index');
  const chunks=[],bufferViews=[],accessors=[];let byteOffset=0;
  const add=(values,type,componentType,target,min,max)=>{
    const array=componentType===5126?new Float32Array(values):new Uint16Array(values);
    const bytes=Buffer.from(array.buffer),bufferView=bufferViews.length;
    bufferViews.push({buffer:0,byteOffset,byteLength:bytes.length,target});chunks.push(bytes);byteOffset+=bytes.length;
    const padding=(4-byteOffset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));byteOffset+=padding;}
    accessors.push({bufferView,componentType,count:values.length/({SCALAR:1,VEC2:2,VEC3:3}[type]),type,...(min?{min,max}:{})});
    return accessors.length-1;
  };
  if(count>65535)throw new Error('Refined trees must stay inside the mobile 16-bit index budget');
  const min=[0,1,2].map(a=>Math.min(...positions.map(p=>p[a]))),max=[0,1,2].map(a=>Math.max(...positions.map(p=>p[a])));
  const attributes={POSITION:add(positions.flat(),'VEC3',5126,34962,min,max),NORMAL:add(normals.flat(),'VEC3',5126,34962),TEXCOORD_0:add(uvs.flat(),'VEC2',5126,34962)};
  const index=add(indices,'SCALAR',5123,34963);
  return {bytes:Buffer.concat(chunks),bufferViews,accessors,primitive:{attributes,indices:index,material:0,mode:4}};
}

export async function packVillageTreeRefinement(root=resolve(import.meta.dirname,'../public/assets'),source=resolve(process.env.VILLAGE_TREE_REFINEMENT_DIR??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/village-warrior-v3/2026-10-28/tree-refinement')){
  const read=p=>readFile(p,'utf8').then(JSON.parse);
  const [manifest,baseline,audit,review]=await Promise.all([read(resolve(root,'village.json')),read(resolve(source,'baseline-manifest.json')),read(resolve(source,'refinement-audit.json')),read(resolve(source,'approval.json'))]);
  if(review.status!=='APPROVED'||review.auditSha256!==hash(await readFile(resolve(source,'refinement-audit.json'))))throw new Error('Tree geometry needs reviewed evidence');
  if(Object.keys(manifest.assets).length!==25||audit.textureFilesAdded!==0)throw new Error('Existing village assets only');
  for(const id of TREE_IDS){
    const asset=manifest.assets[id],before=baseline.assets[id],record=audit.assets.find(a=>a.id===id);
    if(JSON.stringify(asset.highTextures)!==JSON.stringify(before.highTextures))throw new Error('Original tree textures changed');
    const packed=[];
    for(let level=0;level<3;level++){
      const filename=`${id}-lod${level}.json`,rawBytes=await readFile(resolve(source,filename));
      if(review.geometryHashes[filename]!==hash(rawBytes))throw new Error('Reviewed tree geometry changed');
      const raw=JSON.parse(rawBytes),g=packTreeGeometry(raw);
      if(raw.indices.length/3!==record.tiers[level].triangles||raw.indices.length/3>=before.lods[level].triangles)throw new Error('Tree triangle budget regression');
      g.uri=hash(g.bytes)+'.bin';await writeFile(resolve(root,'content',g.uri),g.bytes);packed.push(g);
    }
    for(const [slot,lod]of [...asset.lods,asset.mobileNear].entries()){
      const level=slot===3?0:slot,sourceLod=slot===3?before.mobileNear:before.lods[level];
      const original=await read(resolve(root,sourceLod.model));
      const geometry=packed[level];
      // Exported positions already include the old node transforms and glTF axis conversion.
      const model={asset:{version:'2.0',generator:'Moonforest existing-tree refinement'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:id,mesh:0}],meshes:[{name:id,primitives:[geometry.primitive]}],buffers:[{uri:geometry.uri,byteLength:geometry.bytes.length}],bufferViews:geometry.bufferViews,accessors:geometry.accessors,materials:original.materials,textures:original.textures,images:original.images,samplers:original.samplers};
      const bytes=Buffer.from(JSON.stringify(model)),ref='./content/'+hash(bytes)+'.gltf';await writeFile(resolve(root,ref),bytes);
      lod.model=ref;lod.triangles=record.tiers[level].triangles;lod.resources=[ref,'./content/'+geometry.uri,...model.images.map(i=>'./content/'+i.uri)];
      lod.bytes=0;for(const resource of new Set(lod.resources))lod.bytes+=(await readFile(resolve(root,resource))).length;
    }
    asset.treeRefinement={version:1,method:'existing-canopy-retopology-and-opaque-leaf-sprays',sourceModelSha256:basename(before.lods[0].model,'.gltf'),originalTriangles:before.lods.map(l=>l.triangles),leafPositionsSharedAcrossLods:true,newTextures:0};
  }
  manifest.geometryLod.nearGeometryPreserved=false;
  manifest.geometryLod.nearGeometryEdits=TREE_IDS;
  manifest.geometryLod.mobileNearPreserved=true; // Mobile and desktop use the same near mesh.
  await writeFile(resolve(root,'village.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({treeRefinement:TREE_IDS.map(id=>({id,triangles:manifest.assets[id].lods.map(l=>l.triangles)})),newTextures:0}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await packVillageTreeRefinement();
