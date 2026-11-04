// Bookkeeping for the isolated integration checkout; no browser operations.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const report=import.meta.dirname,app=resolve(report,'../..'),repo=resolve(app,'..');
const reportPrefix='ArcherPreview/reports/moonforest-0.1-cinematic-expansion-2026-11-04/';
const base='025ec479345978270c2a4ac7a04d072b8f92ed42';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});
const paths=args=>git(args).split('\0').filter(Boolean);
const save=(name,value)=>writeFile(resolve(report,name),JSON.stringify(value,null,2)+'\n');
if(process.argv[2]==='regression'){
 const log=await readFile(resolve(report,'integration-full-regression.log'),'utf8');
 const count=key=>{const match=log.match(new RegExp('(?:ℹ|#) '+key+' (\\d+)'));if(!match)throw Error('Missing '+key);return Number(match[1]);};
 const result={total:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),cancelled:count('cancelled')};
 result.passedAll=result.total===result.passed&&!result.failed&&!result.skipped&&!result.cancelled;
 if(!result.passedAll)throw Error('Integrated whole suite did not pass');
 const hashes=await json(resolve(report,'integration-tested-source-hashes.json'));
 for(const [path,sha256]of Object.entries(hashes))if(hash(await readFile(resolve(app,path)))!==sha256)throw Error('Tested source changed: '+path);
 Object.assign(result,{sourceFiles:Object.keys(hashes).length,sourceUnchanged:true,integratedRemoteBase:base});
 await save('integration-regression.json',result);console.log(JSON.stringify(result));
}else if(process.argv[2]==='restore-test-reports'){
 const changed=paths(['diff','--name-only','-z','HEAD','--','ArcherPreview/reports']).filter(path=>!path.startsWith(reportPrefix));
 if(changed.length)execFileSync('git',['restore','--source=HEAD','--worktree','--',...changed],{cwd:repo,stdio:'pipe'});
 console.log(JSON.stringify({restoredGeneratedTrackedReports:changed.length,originalWorktreeTouched:false}));
}else if(process.argv[2]==='paths'){
 const manifest=await json(resolve(repo,'ArcherPreviewSite/deployment-files.json'));
 const allowed=new Map(manifest.files.map(row=>['ArcherPreviewSite/'+row.path,row]));
 const candidates=[...new Set([...paths(['diff','--name-only','-z',base,'--','ArcherPreviewSite']),...paths(['ls-files','--others','--exclude-standard','-z','--','ArcherPreviewSite'])])];
 const selected=candidates.filter(path=>allowed.has(path)||path==='ArcherPreviewSite/deployment-files.json').sort();
 for(const path of selected){if(path.endsWith('/deployment-files.json'))continue;const row=allowed.get(path),bytes=await readFile(resolve(repo,path));if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw Error('Reviewed artifact differs: '+path);}
 await save('integration-release-paths.json',selected);
 await writeFile(resolve(app,'reports/publish-village-paths.txt'),selected.join('\n')+'\n');
 console.log(JSON.stringify({base,changedSiteFiles:selected.length,files:manifest.files.length,bytes:manifest.bytes,resourceRevision:manifest.resourceRevision}));
}else if(process.argv[2]==='stage'){
 const regression=await json(resolve(report,'integration-regression.json'));
 const audit=await json(resolve(report,'integration-build-audit.json'));
 const parity=await json(resolve(report,'integration-source-parity.json'));
 const ui=await json(resolve(report,'integration-ui.json'));
 if(!regression.passedAll||!regression.sourceUnchanged||!audit.passed||!audit.stage.checked||!parity.passed||!ui.passed||!ui.sourceUnchanged)throw Error('Final integration gates incomplete');
 if(paths(['diff','--cached','--name-only','-z']).length)throw Error('Unexpected staged changes');
 if(paths(['diff','--name-only','-z','HEAD','--','ArcherPreview/src','ArcherPreview/scripts','ArcherPreview/tests','ArcherPreview/public']).length)throw Error('Unexpected implementation changes after freeze');
 const manifest=await json(resolve(repo,'ArcherPreviewSite/deployment-files.json'));
 const allowed=new Set(manifest.files.map(row=>'ArcherPreviewSite/'+row.path));allowed.add('ArcherPreviewSite/deployment-files.json');
 const site=[...new Set([...paths(['diff','--name-only','-z','HEAD','--','ArcherPreviewSite']),...paths(['ls-files','--others','--exclude-standard','-z','--','ArcherPreviewSite'])])].filter(path=>allowed.has(path));
 const excluded=new Set(['integration-release.json','integration-live-verification.json','integration-workflow.json','integration-staged-validation.json']);
 const reports=(await readdir(report)).filter(name=>name.startsWith('integration-')&&/\.(json|mjs)$/.test(name)&&!excluded.has(name)).map(name=>reportPrefix+name);
 const selected=[...new Set([...site,...reports])].sort();
 execFileSync('git',['-c','core.safecrlf=false','add','--pathspec-from-file=-','--pathspec-file-nul'],{cwd:repo,input:selected.join('\0')+'\0',stdio:'pipe'});
 if(JSON.stringify(paths(['diff','--cached','--name-only','-z']).sort())!==JSON.stringify(selected))throw Error('Index differs from exact allow-list');
 execFileSync('git',['diff','--cached','--check','--',...reports],{cwd:repo,stdio:'pipe'});
 for(const path of site){const bytes=execFileSync('git',['show',':'+path],{cwd:repo,maxBuffer:32*1024*1024});if(!bytes.equals(await readFile(resolve(repo,path))))throw Error('Staged byte mismatch: '+path);}
 const result={passed:true,stagedFiles:selected.length,siteFiles:site.length,reportFiles:reports.length,sourceUnchanged:true,stagedSiteBytesEqual:true,paths:selected,remoteBase:base};
 await save('integration-staged-validation.json',result);console.log(JSON.stringify({...result,paths:undefined}));
}else throw Error('Expected regression, restore-test-reports, paths, or stage');
