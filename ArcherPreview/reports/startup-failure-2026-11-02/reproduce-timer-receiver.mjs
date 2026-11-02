import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MapLoadLifetime} from '../../src/map-load-lifetime.js';
const base='57ce2771bea311910951c36121198fc29b0341e0',repo=new URL('../../../',import.meta.url);
const oldSource=execFileSync('git',['show',base+':ArcherPreview/src/map-load-lifetime.js'],{cwd:repo,encoding:'utf8',maxBuffer:16*1024*1024}),bundle=execFileSync('git',['show',base+':ArcherPreviewSite/assets/index-D7c31AED.js'],{cwd:repo,encoding:'utf8',maxBuffer:16*1024*1024});
const Old=(await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'))).MapLoadLifetime;
const original={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};let oldError,newPass=false;
try{
 globalThis.setTimeout=function(...args){if(this!==globalThis)throw TypeError('Illegal invocation');return original.setTimeout(...args);};
 globalThis.clearTimeout=function(...args){if(this!==globalThis)throw TypeError('Illegal invocation');return original.clearTimeout(...args);};
 try{const lifetime=new Old();lifetime.close();}catch(error){oldError={name:error.name,message:error.message};}
 const lifetime=new MapLoadLifetime();await lifetime.run(()=>42);lifetime.renew();lifetime.close();newPass=true;
}finally{Object.assign(globalThis,original);}
if(oldError?.message!=='Illegal invocation'||!newPass)throw Error('Regression was not reproduced and fixed');
const line=bundle.split('\n')[40],column=18373,excerpt=line.slice(column-81,column+70);
const result={base,oldSourceSha256:createHash('sha256').update(oldSource).digest('hex'),reportedStack:{file:'index-D7c31AED.js',line:41,column,excerpt},oldError,newPass,conclusion:'The shipped constructor calls the detached Window timer as this.scheduleTimer. Browser host receiver checking rejects this instance receiver. The fixed adapter calls globalThis timers and preserves injected clock receivers.',limits:'Original shipped source is executed with browser-style receiver validation in Node; no browser automation or physical GPU test.'};
await writeFile(new URL('./timer-root-cause.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
