import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {hash} from './resource-pack.js';
import {readAccessor} from './web-geometry.js';
import {compressMeshopt,decodeMeshoptBuffers,MESHOPT_EXTENSION} from './meshopt-lossless.js';

const root=resolve(import.meta.dirname,'..');
export async function packVillageMeshopt({publicRoot=resolve(root,'public')}={}){
  const base=resolve(publicRoot,'assets'),content=resolve(base,'content');await mkdir(content,{recursive:true});
  const read=async p=>JSON.parse(await readFile(p,'utf8'));
  const village=await read(resolve(base,'village.json')),warrior=await read(resolve(base,'warrior-v3.json'));
  const cache=new Map(),models=new Map(),report=[];
  const uniqueBefore=new Map(),uniqueAfter=new Map();
  async function pack(config,kind){
    if(models.has(config.model)){Object.assign(config,models.get(config.model));return;}
    const inputModel=config.model,g=await read(resolve(base,inputModel));
    // A repeat invocation may verify the existing output without recompressing.
    if(g.extensionsUsed?.includes(MESHOPT_EXTENSION))return;
    const files=new Map();
    for(const item of [...g.buffers,...(g.images??[])])if(item.uri)files.set(item.uri,{data:await readFile(resolve(content,item.uri))});
    files.set(basename(inputModel),{data:await readFile(resolve(base,inputModel))});
    const result=await compressMeshopt(g,files,cache),decoded=await decodeMeshoptBuffers(result.gltf,result.files);
    for(let i=0;i<g.accessors.length;i++)assert.deepEqual(readAccessor(decoded.gltf,decoded.files,i),readAccessor(g,files,i),'Accessor changed '+inputModel+' '+i);
    for(const [name,{data}]of result.files)await writeFile(resolve(content,name),data);
    const update={model:'./content/'+result.model,resources:[...result.files.keys()].map(n=>'./content/'+n),bytes:[...result.files.values()].reduce((n,f)=>n+f.data.length,0)};
    for(const [name,f]of files)uniqueBefore.set(name,f.data.length);
    for(const [name,f]of result.files)uniqueAfter.set(name,f.data.length);
    report.push({kind,inputModel:basename(inputModel),model:result.model,sourceBytes:[...files.values()].reduce((n,f)=>n+f.data.length,0),bytes:update.bytes,...result.stats,accessorsVerified:g.accessors.length});
    models.set(inputModel,update);Object.assign(config,update);
  }
  // Deliberately sequential, preserving all 25 assets and their four variants.
  for(const asset of Object.values(village.assets))for(const tier of [...asset.lods,asset.mobileNear])await pack(tier,'village');
  await pack(warrior,'warrior');
  const decoder=await readFile(resolve(root,'node_modules/meshoptimizer/meshopt_decoder.cjs'));
  const uri=hash(decoder)+'.js';await writeFile(resolve(content,uri),decoder);
  await writeFile(resolve(publicRoot,'meshoptimizer-NOTICE.txt'),await readFile(resolve(root,'node_modules/meshoptimizer/LICENSE.md')));
  await writeFile(resolve(base,'meshopt-decoder.json'),JSON.stringify({version:'1.3.0',url:'./content/'+uri,workers:1,bytes:decoder.length},null,2)+'\n');
  const policy={format:MESHOPT_EXTENSION,lossless:true,quantization:false,filters:'NONE',version:0};
  village.meshCompression=policy;warrior.meshCompression=policy;
  await writeFile(resolve(base,'village.json'),JSON.stringify(village,null,2)+'\n');
  await writeFile(resolve(base,'warrior-v3.json'),JSON.stringify(warrior,null,2)+'\n');
  if(report.length){
    const result={policy,models:report,beforeUniqueBytes:[...uniqueBefore.values()].reduce((a,b)=>a+b,0),afterUniqueBytes:[...uniqueAfter.values()].reduce((a,b)=>a+b,0),decoderBytes:decoder.length};
    await writeFile(resolve(root,'reports/village-meshopt.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({...result,models:report.length}));return result;
  }
  return {alreadyCompressed:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await packVillageMeshopt();
