import {readdir,readFile,lstat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const hash=value=>createHash('sha256').update(value).digest('hex');
const roots=['ArcherPreview/src'];
// Historical, optional asset-authoring scripts are not runtime build inputs.
// Include the release entry points and their resource/graph guards explicitly.
export const SOURCE_ENTRY_FILES=['ArcherPreview/moonforest-0.2.html','ArcherPreview/package.json','ArcherPreview/package-lock.json','ArcherPreview/vite.config.js',
 ...['build-moonforest-0.2.mjs','sync-moonforest-0.2.mjs','stage-pages.mjs','source-provenance.mjs','release-deployment.mjs','runtime-module-graph.mjs','resource-bundles.mjs','build-village-site.mjs'].map(name=>'ArcherPreview/scripts/'+name)];
const entries=SOURCE_ENTRY_FILES;
// Track executable inputs, not authoring originals or machine-local build output.
// Normalize Windows checkout line endings to compare the same tree on Pages/Linux.
export async function captureSourceProvenance(repository){
 const root=resolve(repository),paths=[...entries];
 async function visit(path){
  for(const entry of await readdir(resolve(root,path),{withFileTypes:true})){
   if(entry.isSymbolicLink())throw new Error('Source provenance cannot follow links: '+path+'/'+entry.name);
   const child=path+'/'+entry.name;
   if(entry.isDirectory())await visit(child);
   else if(entry.isFile()&&/\.(?:js|mjs|json|css|html)$/.test(entry.name))paths.push(child);
  }
 }
 for(const path of roots)await visit(path);
 const files=[];
 for(const path of paths.sort()){
  const target=resolve(root,path),child=relative(root,target);
  if(child.startsWith('..')||(await lstat(target)).isSymbolicLink())throw new Error('Unsafe source provenance input');
  const bytes=Buffer.from((await readFile(target,'utf8')).replaceAll('\r\n','\n'));
  files.push({path,bytes:bytes.length,sha256:hash(bytes)});
 }
 return {version:1,algorithm:'sha256-lf',fingerprint:hash(JSON.stringify(files)),files};
}
export function sourceCommitInfo(repository){
 try{
  const baseCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();
  const dirty=!!execFileSync('git',['status','--porcelain','--untracked-files=normal','--',...roots,...entries],{cwd:repository,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();
  return {baseCommit,dirty};
 }catch{return {baseCommit:null,dirty:null};}
}
export async function verifySourceProvenance(repository,expected){
 if(expected?.version!==1||expected.algorithm!=='sha256-lf'||!Array.isArray(expected.files)||hash(JSON.stringify(expected.files))!==expected.fingerprint)throw new Error('Invalid source provenance record');
 const actual=await captureSourceProvenance(repository);
 if(actual.fingerprint!==expected.fingerprint){
  const previous=new Map(expected.files.map(row=>[row.path,row.sha256])),current=new Map(actual.files.map(row=>[row.path,row.sha256]));
  const changed=[...new Set([...previous.keys(),...current.keys()])].filter(path=>previous.get(path)!==current.get(path));
  throw new Error('Reviewed build source differs; rebuild and review before publishing: '+changed.slice(0,8).join(', '));
 }
 return {fingerprint:actual.fingerprint,files:actual.files.length};
}
