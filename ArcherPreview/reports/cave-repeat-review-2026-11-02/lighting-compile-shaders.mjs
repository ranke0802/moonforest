import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const out=new URL('file:///C:/Users/ryank/Documents/ChatGPT/MM%20Project/output/cave-repeat-lighting-review/2026-11-02/shaders/');
const compiler='C:/Users/ryank/Documents/ChatGPT/MM Project/output/witch-cave-material-fix/2026-11-01/tools/glslang/bin/glslang.exe';
const rows=[];
for(const info of JSON.parse(readFileSync(new URL('export.json',out),'utf8')))for(const stage of ['vert','frag']){
 const result=spawnSync(compiler,['-S',stage,fileURLToPath(new URL(info.name+'.compiled.'+stage,out))],{encoding:'utf8'});
 rows.push({name:info.name,stage,esVersion:info.version,ubo:info.ubo,exit:result.status,output:(result.stdout??'')+(result.stderr??'')});
}
const failed=rows.filter(x=>x.exit!==0);writeFileSync(new URL('compile-results.json',out),JSON.stringify(rows,null,2));
writeFileSync(new URL('lighting-shader-compile.json',import.meta.url),JSON.stringify({scope:'Actual expanded production shaders, independent GLSL compiler; not GPU pixel/thermal test.',directory:fileURLToPath(out),stages:rows.length,passed:rows.length-failed.length,failed},null,2));
console.log(JSON.stringify({stages:rows.length,passed:rows.length-failed.length,failed}));if(failed.length)process.exitCode=1;
