// Read-only baseline comparison: substitute only this task's six changed source
// modules from Git. The working tree, tests, assets and module URLs stay intact.
import {registerHooks} from 'node:module';
import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const revision='09410d8';
const paths=['actor-encounter-adapter.js','authored-monster-runtime.js','main.js','monster-group-scheduler.js','monster-spawn-document.js','monster-spawn-editor.js'];
const sources=new Map(paths.map(name=>[resolve(repository,'ArcherPreview/src',name).toLowerCase(),execFileSync('git',['show',revision+':ArcherPreview/src/'+name],{cwd:repository,encoding:'utf8',maxBuffer:8*1024*1024})]));
registerHooks({load(url,context,nextLoad){
 if(url.startsWith('file:')){const source=sources.get(resolve(fileURLToPath(url)).toLowerCase());if(source!==undefined)return {format:'module',shortCircuit:true,source};}
 return nextLoad(url,context);
}});
