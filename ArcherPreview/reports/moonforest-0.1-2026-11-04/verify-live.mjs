// HTTP bytes only. This never opens or controls a browser.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const app=resolve(import.meta.dirname,'../..'),repo=resolve(app,'..');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const paths=(await readFile(resolve(app,'reports/publish-village-paths.txt'),'utf8')).trim().split(/\r?\n/);
const result={commit,browserAutomation:false,scope:'HTTP SHA-256 equality; no pixels or physical-device measurement',verified:[],expectedFiles:paths.length,passed:false};
try{
 for(const path of paths){
  if(!path.startsWith('ArcherPreviewSite/')||path.includes('..'))throw Error('Unexpected release path');
  const response=await fetch('https://ranke0802.github.io/moonforest/'+path+'?rev='+commit.slice(0,7),{headers:{'Cache-Control':'no-cache','User-Agent':'Moonforest-release-hash-verification'},signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error(`HTTP ${response.status}: ${path}`);
  const actual=Buffer.from(await response.arrayBuffer()),expected=await readFile(resolve(repo,path));
  if(hash(actual)!==hash(expected))throw Error('Published bytes differ: '+path);
  result.verified.push({path,bytes:actual.length,sha256:hash(actual)});
 }
 result.passed=result.verified.length===paths.length;
}catch(error){result.error=String(error.message);}
await writeFile(resolve(import.meta.dirname,'live-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,verified:result.verified.length,expected:paths.length,error:result.error}));
if(!result.passed)process.exitCode=1;
