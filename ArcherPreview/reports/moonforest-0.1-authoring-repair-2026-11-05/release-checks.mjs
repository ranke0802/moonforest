import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const report=import.meta.dirname,app=resolve(report,'../..'),repo=resolve(app,'..');
const prefix='ArcherPreview/reports/moonforest-0.1-authoring-repair-2026-11-05/';
const base='36fd9a3bc143b76f708ebc514ff002ac5ac9bf5e';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(args,options={})=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024,...options});
const names=args=>git(args).split('\0').filter(Boolean);
const save=(name,value)=>writeFile(resolve(report,name),JSON.stringify(value,null,2)+'\n');
const mode=process.argv[2];
if(mode==='snapshot'){
 const files=names(['ls-files','-z','--','ArcherPreview/src','ArcherPreview/scripts','ArcherPreview/tests','ArcherPreview/public/moonforest-help.html']),hashes={};
 for(const path of files)hashes[path.slice('ArcherPreview/'.length)]=hash(await readFile(resolve(repo,path)));
 await save('tested-source-hashes.json',hashes);console.log(JSON.stringify({frozenSources:files.length,integratedRemoteBase:base}));
}else if(mode==='regression'){
 const log=await readFile(resolve(report,'full-regression.log'),'utf8'),count=key=>{const match=log.match(new RegExp('(?:ℹ|#) '+key+' (\\d+)'));if(!match)throw Error('Missing '+key);return Number(match[1]);};
 const result={total:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),cancelled:count('cancelled')};
 if(result.failed||result.skipped||result.cancelled||result.total!==result.passed)throw Error('Whole suite did not pass');
 const hashes=await json(resolve(report,'tested-source-hashes.json'));for(const [path,sha256]of Object.entries(hashes))if(hash(await readFile(resolve(app,path)))!==sha256)throw Error('Frozen source changed: '+path);
 Object.assign(result,{passedAll:true,sourceFiles:Object.keys(hashes).length,sourceUnchanged:true,integratedRemoteBase:base});await save('regression.json',result);console.log(JSON.stringify(result));
}else if(mode==='restore-generated'){
 const paths=names(['diff','--name-only','-z','--','ArcherPreview/reports']).filter(path=>!path.startsWith(prefix));if(paths.length)git(['restore','--worktree','--',...paths]);console.log(JSON.stringify({restoredGeneratedReports:paths.length}));
}else if(mode==='paths'){
 const manifest=await json(resolve(repo,'ArcherPreviewSite/deployment-files.json')),allowed=new Map(manifest.files.map(row=>['ArcherPreviewSite/'+row.path,row]));
 const candidates=[...new Set([...names(['diff','--name-only','-z',base,'--','ArcherPreviewSite']),...names(['ls-files','--others','--exclude-standard','-z','--','ArcherPreviewSite'])])];
 const paths=candidates.filter(path=>allowed.has(path)||path==='ArcherPreviewSite/deployment-files.json').sort();for(const path of paths){if(path.endsWith('/deployment-files.json'))continue;const row=allowed.get(path),bytes=await readFile(resolve(repo,path));if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw Error('Reviewed site artifact differs: '+path);}
 await save('release-paths.json',paths);await writeFile(resolve(app,'reports/publish-village-paths.txt'),paths.join('\n')+'\n');console.log(JSON.stringify({base,changedPublicFiles:paths.length,files:manifest.files.length,bytes:manifest.bytes,resourceRevision:manifest.resourceRevision}));
}else throw Error('Expected snapshot, regression, restore-generated, or paths');
