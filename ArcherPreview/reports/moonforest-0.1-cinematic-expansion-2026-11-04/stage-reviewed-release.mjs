// Exact allow-list staging and byte checks. Never stages baseline user edits.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const report=import.meta.dirname,app=resolve(report,'../..'),repo=resolve(app,'..');
const relativeReport='ArcherPreview/reports/moonforest-0.1-cinematic-expansion-2026-11-04';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const git=(args,options={})=>execFileSync('git',args,{cwd:repo,maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],...options});
const list=args=>git(args,{encoding:'utf8'}).split('\0').filter(Boolean);
const hash=b=>createHash('sha256').update(b).digest('hex');
const baseline=await json(resolve(report,'baseline-worktree.json'));
if(git(['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==baseline.head)throw Error('Release baseline moved');
if(list(['diff','--cached','--name-only','-z']).length)throw Error('Index is not empty');
const preexisting=new Set(baseline.userTrackedStatus.map(row=>row.slice(3)));
const source=await json(resolve(report,'source-paths.json')),site=await json(resolve(report,'release-paths.json'));
const audit=await json(resolve(report,'current-build-audit.json'));
if(!audit.passed||!audit.stage.checked||audit.stage.files!==1503)throw Error('Final immutable build audit incomplete');
const exclude=new Set(['baseline-worktree.json','preservation.json','workflow.json','release.json','live-verification.json','staged-validation.json','staged-paths.json']);
const reports=(await readdir(report)).filter(name=>/\.(json|mjs)$/.test(name)&&!exclude.has(name)).map(name=>relativeReport+'/'+name);
const paths=[...new Set([...source,...site,...reports,relativeReport+'/authoring-expansion-example.moonforest-project'])].sort();
for(const path of paths)if(preexisting.has(path))throw Error('Preexisting path: '+path);
const sourceHashes=await json(resolve(report,'tested-source-hashes.json'));
for(const [path,sha256] of Object.entries(sourceHashes))if(hash(await readFile(resolve(app,path)))!==sha256)throw Error('Tested source changed: '+path);
git(['-c','core.safecrlf=false','add','--pathspec-from-file=-','--pathspec-file-nul'],{input:paths.join('\0')+'\0'});
const staged=list(['diff','--cached','--name-only','-z']).sort();
if(JSON.stringify(staged)!==JSON.stringify(paths))throw Error('Staged path set differs');
git(['diff','--cached','--check','--',...source,...reports]);
const manifest=await json(resolve(repo,'ArcherPreviewSite/deployment-files.json'));
for(const path of site){
 const bytes=git(['show',':'+path]);
 const expected=await readFile(resolve(repo,path));
 if(!bytes.equals(expected))throw Error('Staged bytes differ: '+path);
 if(!path.endsWith('/deployment-files.json')){const row=manifest.files.find(row=>'ArcherPreviewSite/'+row.path===path);if(!row||row.bytes!==bytes.length||row.sha256!==hash(bytes))throw Error('Staged file differs from manifest: '+path);}
}
const protectedHashes=(await json(resolve(report,'verification-baseline.json'))).protectedWorkingTreeHashes;
for(const [path,sha256] of Object.entries(protectedHashes))if(hash(await readFile(resolve(app,path)))!==sha256)throw Error('Protected source changed: '+path);
const status=git(['status','--porcelain','-uno'],{encoding:'utf8'}).trimEnd().split(/\r?\n/).filter(Boolean);
const preserved=status.filter(row=>preexisting.has(row.slice(3))).sort();
if(JSON.stringify(preserved)!==JSON.stringify([...baseline.userTrackedStatus].sort()))throw Error('Preexisting tracked status changed');
await writeFile(resolve(report,'staged-paths.json'),JSON.stringify(paths,null,2)+'\n');
const result={passed:true,stagedFiles:paths.length,sourceFiles:source.length,siteFiles:site.length,reportFiles:reports.length+1,protectedSourcesUnchanged:Object.keys(protectedHashes).length,preservedPreexistingTrackedChanges:preserved.length,baselineCollisions:0,stagedSiteBytesMatchManifest:true,maxGitBufferBytes:32*1024*1024};
await writeFile(resolve(report,'staged-validation.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
