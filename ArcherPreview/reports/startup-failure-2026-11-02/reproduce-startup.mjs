import {readFile,writeFile} from 'node:fs/promises';
import {NullEngine} from '@babylonjs/core';
import {createWorld} from '../../src/world.js';
import {prepareStartupResources} from '../../src/startup-resources.js';
const root=new URL('../../public/assets/',import.meta.url),origin='https://startup-source.test/';
globalThis.location=new URL(origin+'?character=warrior-v5');
const index=JSON.parse(await readFile(new URL('resource-index.json',root)));
globalThis.fetch=async url=>{const name=new URL(url).pathname.split('/').at(-1);return new Response(await readFile(new URL(name,root)),{status:200});};
globalThis.caches={open:async()=>({keys:async()=>Object.keys(index.files).map(name=>({url:origin+'assets/content/'+name})),match:async()=>new Response('cached')})};
const results=[];
for(const cave of [false,true])for(const touchDevice of [false,true]){
 const engine=new NullEngine(),world=createWorld(engine,{cave,village:!cave,warrior:true,touchDevice}),progress=[];
 try{const player=await prepareStartupResources(world,new URL(`assets/warrior-v3${touchDevice?'-ios':''}.json`,origin),p=>progress.push(p));results.push({cave,touchDevice,passed:true,player:player.model,resources:world.startupResources});}
 catch(e){results.push({cave,touchDevice,passed:false,error:e.message,stack:e.stack});}
 finally{world.releaseResourceDownloads?.();engine.dispose();}
}
await writeFile(new URL('./startup-reproduction.json',import.meta.url),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
