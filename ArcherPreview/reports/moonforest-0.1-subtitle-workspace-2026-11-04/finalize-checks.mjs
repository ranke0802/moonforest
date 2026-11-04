// Release bookkeeping only; no browser or application interaction.
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const app=resolve(import.meta.dirname,'../..'),repo=resolve(app,'..'),report=import.meta.dirname;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const save=async (name,value)=>writeFile(resolve(report,name),JSON.stringify(value,null,2)+'\n');
const mode=process.argv[2];
if(mode==='regression'){
 const log=await readFile(resolve(report,'full-regression.log'),'utf8');
 const count=key=>{const match=log.match(new RegExp('(?:ℹ|#) '+key+' (\\d+)'));if(!match)throw Error('Missing regression counter '+key);return Number(match[1]);};
 const result={total:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),cancelled:count('cancelled')};
 if(result.failed||result.cancelled||result.skipped||result.total!==result.passed)throw Error('Regression did not pass');
 const hashes=await json(resolve(report,'tested-source-hashes.json'));
 for(const [path,sha256] of Object.entries(hashes))if(hash(await readFile(resolve(app,path)))!==sha256)throw Error('Tested source changed: '+path);
 Object.assign(result,{sourceFiles:Object.keys(hashes).length,sourceUnchanged:true});
 await save('regression.json',result);console.log(JSON.stringify(result));
}else if(mode==='restore'){
 const {backup}=await json(resolve(report,'preservation.json')),files=await json(resolve(backup,'manifest.json'));
 for(const row of files){if(!row.exists)throw Error('Unexpected missing baseline report: '+row.path);const bytes=await readFile(resolve(backup,row.path));if(hash(bytes)!==row.sha256)throw Error('Backup changed: '+row.path);await copyFile(resolve(backup,row.path),resolve(repo,row.path));if(hash(await readFile(resolve(repo,row.path)))!==row.sha256)throw Error('Restore failed: '+row.path);}
 console.log(JSON.stringify({restoredPreexistingReports:files.length}));
}else if(mode==='paths'){
 const manifest=await json(resolve(repo,'ArcherPreviewSite/deployment-files.json'));
 const allowed=new Set(manifest.files.map(row=>'ArcherPreviewSite/'+row.path));allowed.add('ArcherPreviewSite/deployment-files.json');
 const list=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
 const paths=[...new Set([...list(['diff','--name-only','--','ArcherPreviewSite']),...list(['ls-files','--others','--exclude-standard','--','ArcherPreviewSite'])])].filter(path=>allowed.has(path)).sort();
 const baseline=await json(resolve(report,'baseline-worktree.json')),preexisting=new Set(baseline.userTrackedStatus.map(row=>row.slice(3)));
 for(const path of paths)if(preexisting.has(path))throw Error('Preexisting site change: '+path);
 for(const path of paths){const bytes=await readFile(resolve(repo,path));if(path.endsWith('/deployment-files.json'))continue;const row=manifest.files.find(row=>'ArcherPreviewSite/'+row.path===path);if(hash(bytes)!==row.sha256||bytes.length!==row.bytes)throw Error('Final deployment file differs: '+path);}
 await writeFile(resolve(app,'reports/publish-village-paths.txt'),paths.join('\n')+'\n');
 await save('release-paths.json',paths);console.log(JSON.stringify({changedSiteFiles:paths.length,builtFiles:manifest.files.length,bytes:manifest.bytes,resourceRevision:manifest.resourceRevision}));
}else throw Error('Expected regression, restore or paths');
