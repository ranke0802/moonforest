import {readFile,writeFile,mkdir,readdir,lstat,access} from 'node:fs/promises';
import {resolve,relative,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'../../..'),project=resolve(root,'ArcherPreview'),out=import.meta.dirname;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(args,cwd=root)=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
const optionalGit=args=>{try{return git(args);}catch{return null;}};
// Independent read-only traversal avoids needing installed build dependencies.
async function collectRuntime(publicRoot){
  const assetsRoot=resolve(publicRoot,'assets'),files=new Map(),pending=[];
  const references=(value,result=[])=>{if(typeof value==='string'&&/^(?:\.\/)?content\//.test(value))result.push(value);else if(Array.isArray(value))for(const row of value)references(row,result);else if(value&&typeof value==='object')for(const row of Object.values(value))references(row,result);return result;};
  const add=async absolute=>{const bytes=await readFile(absolute),path=relative(publicRoot,absolute).replaceAll('\\','/');files.set(path,{absolute,bytes:bytes.length});return bytes;};
  const enqueue=(url,base)=>{if(url.startsWith('data:'))return;const absolute=fileURLToPath(new URL(url,pathToFileURL(base))),path=relative(publicRoot,absolute).replaceAll('\\','/');if(!/^assets\/content\/[a-f0-9]{64}\.(?:gltf|bin|png|jpg|jpeg|webp|ktx2|js|wasm|wav|mp3)$/.test(path))throw Error('Unsafe dependency '+path);pending.push(absolute);};
  const manifests=(await readdir(assetsRoot,{withFileTypes:true})).filter(row=>row.isFile()&&row.name.endsWith('.json')&&!['village-fixture.json','resource-index.json'].includes(row.name));
  for(const entry of manifests){const absolute=resolve(assetsRoot,entry.name),bytes=await add(absolute),data=JSON.parse(bytes);if(data.developmentFixture)throw Error('Development manifest '+entry.name);for(const ref of references(data))enqueue(ref,absolute);}
  while(pending.length){const absolute=pending.pop(),path=relative(publicRoot,absolute).replaceAll('\\','/');if(files.has(path))continue;const bytes=await add(absolute);if(sha(bytes)!==basename(path).slice(0,64))throw Error('Content hash mismatch '+path);if(path.endsWith('.gltf')){const gltf=JSON.parse(bytes);for(const entry of [...gltf.buffers??[],...gltf.images??[]])if(entry.uri)enqueue(entry.uri,absolute);}}
  for(const entry of await readdir(publicRoot,{withFileTypes:true}))if(entry.isFile()&&(entry.name==='resource-cache.js'||entry.name==='app.webmanifest'||entry.name==='moonforest-help.html'||/notice|licen[cs]e|credits|copying/i.test(entry.name))&&(!entry.name.includes('.')||/\.(?:js|txt|md|html|json|webmanifest)$/i.test(entry.name)))await add(resolve(publicRoot,entry.name));
  const authored=JSON.parse(await readFile(resolve(project,'src/authored-map-index.json'),'utf8')),cinematics=JSON.parse(await readFile(resolve(project,'src/cinematic-registry.json'),'utf8'));
  for(const row of [...Object.values(authored.maps),...cinematics.entries]){const path=row.path??row.url;if(!path||path.startsWith('/')||path.includes('..'))throw Error('Unsafe authored dependency');const bytes=await add(resolve(publicRoot,path));if(sha(bytes)!==row.sha256||row.bytes!==undefined&&bytes.length!==row.bytes)throw Error('Authored document hash mismatch');}
  return{files,manifestCount:manifests.length};
}
const paths=git(['ls-files','-z']).split('\0').filter(Boolean);
const head=git(['rev-parse','HEAD']),history={};
for(const revision of ['6812674','cccaeb2','a8b190a','36fd9a3','5d1ee03','8bfabf0','99fcd56','40ab932']){
  try{git(['merge-base','--is-ancestor',revision,'HEAD']);history[revision]=true;}catch{history[revision]=false;}
}
const {files,manifestCount}=await collectRuntime(resolve(project,'public'));
const resources=[];
for(const [path,info]of [...files].sort(([a],[b])=>a.localeCompare(b))){
  // The independent traversal has already read and verified every content hash.
  const content=/^assets\/content\/([a-f0-9]{64})\./.exec(path);
  resources.push({path:'ArcherPreview/public/'+path,bytes:info.bytes,sha256:content?.[1]??sha(await readFile(info.absolute))});
}
const runtimeInventory={version:1,head,files:resources,bytes:resources.reduce((n,r)=>n+r.bytes,0),sha256:sha(JSON.stringify(resources))};
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'independent-runtime-inventory.json'),JSON.stringify(runtimeInventory,null,2)+'\n');

const audio=[];
for(const path of paths.filter(path=>path.startsWith('Assets/Resources/Audio/'))){const bytes=await readFile(resolve(root,path));audio.push({path,bytes:bytes.length,sha256:sha(bytes)});}
const legacy='ArcherPreview/assets/models/violet-warrior-v2.glb',legacyBytes=await exists(resolve(root,legacy))?await readFile(resolve(root,legacy)):null;
const absoluteSourceReferences=[];
for(const path of paths.filter(path=>/^ArcherPreview\/(src|scripts)\/.*\.(?:[cm]?js|py)$/.test(path))){
  const lines=(await readFile(resolve(root,path),'utf8')).split(/\r?\n/);
  for(let i=0;i<lines.length;i++)if(/[A-Za-z]:[\\/](?:dev|Users)[\\/]/.test(lines[i]))absoluteSourceReferences.push({path,line:i+1});
}
const stage=git(['ls-files','--stage']).split('\n');
const linkedTracked=stage.filter(row=>/^(120000|160000) /.test(row));
const gitDir=resolve(root,git(['rev-parse','--git-dir'])),commonDir=resolve(root,git(['rev-parse','--git-common-dir']));
const packDir=resolve(gitDir,'objects/pack'),hardlinks=[];
for(const name of (await readdir(packDir)).filter(n=>n.endsWith('.pack'))){
  try{const links=execFileSync('fsutil',['hardlink','list',resolve(packDir,name)],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);hardlinks.push({name,linkCount:links.length});}catch(error){hardlinks.push({name,error:error.message});}
}
const suspiciousPaths=paths.filter(path=>/(^|\/)(?:node_modules|\.env(?:\.[^/]*)?|id_rsa|id_ed25519|credentials|\.npmrc)(?:\/|$)|\.(?:pem|key|p12|pfx)$/i.test(path));
const oldTrees=[];
if(process.argv.includes('--compare-old')){
  for(const entry of await readdir('C:/dev',{withFileTypes:true}))if(entry.isDirectory()&&/^moonforest-/i.test(entry.name)){
    const oldRoot=resolve('C:/dev',entry.name);
    try{
      const untracked=git(['ls-files','--others','--exclude-standard','-z','Assets','ArcherPreview/assets','ArcherPreview/public'],oldRoot).split('\0').filter(Boolean);
      const current=new Set(paths),runtime=new Set(resources.map(row=>row.path)),missing=untracked.filter(path=>!current.has(path));
      oldTrees.push({root:oldRoot,untrackedResources:untracked.length,alreadyTrackedAtTarget:untracked.length-missing.length,missingFromTarget:missing,missingRequiredByRuntime:missing.filter(path=>runtime.has(path))});
    }catch(error){oldTrees.push({root:oldRoot,error:error.message});}
  }
}
const report={version:1,generatedAt:new Date().toISOString(),root,head,branch:git(['branch','--show-current']),scope:'Read-only independent source/resource and Git portability audit; no browser or game changes.',history,
  git:{directoryIsRealDirectory:(await lstat(resolve(root,'.git'))).isDirectory(),commonDirInsideRoot:commonDir===gitDir,alternatesPresent:await exists(resolve(gitDir,'objects/info/alternates')),worktreeRegistryPresent:await exists(resolve(gitDir,'worktrees')),origin:optionalGit(['remote','get-url','origin']),objectPackHardlinks:hardlinks,linkedTracked},
  trackedFiles:paths.length,sourceChangesFromReviewedHead:git(['diff','--name-only','6812674','--','ArcherPreview/src','ArcherPreview/index.html','ArcherPreview/cinematic-studio.html']).split('\n').filter(Boolean),
  runtime:{manifestCount,requiredFiles:resources.length,contentFiles:resources.filter(r=>r.path.includes('/content/')).length,bytes:runtimeInventory.bytes,inventorySha256:runtimeInventory.sha256,contentHashesVerified:true},
  siblingAudio:{files:audio.length,bytes:audio.reduce((n,r)=>n+r.bytes,0),inventorySha256:sha(JSON.stringify(audio))},
  legacyTestFixture:{path:legacy,present:Boolean(legacyBytes),bytes:legacyBytes?.length??0,sha256:legacyBytes?sha(legacyBytes):null,requiredBy:'tests/warrior-v3-package.test.js:20'},
  absoluteSourceReferences,suspiciousTrackedPaths:suspiciousPaths,oldTrees,
  limitations:['Historical asset regeneration paths are audited separately from the current runtime/build dependency graph.','A clean credential-pattern scan is a scoped check, not proof that arbitrary historical Git objects contain no secret.','System Node/npm and operating-system files remain external tooling unless supplied in the optional portable runtime.']};
await writeFile(resolve(out,'independent-source-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({head,trackedFiles:paths.length,history,gitIndependent:report.git.directoryIsRealDirectory&&report.git.commonDirInsideRoot&&!report.git.alternatesPresent&&!report.git.worktreeRegistryPresent&&hardlinks.every(r=>r.linkCount===1),runtime:report.runtime,siblingAudio:report.siblingAudio,legacyTestFixture:report.legacyTestFixture,absoluteSourceReferences:absoluteSourceReferences.length,suspiciousTrackedPaths:suspiciousPaths,oldTrees:oldTrees.map(row=>({...row,missingFromTarget:row.missingFromTarget?.length}))}));
