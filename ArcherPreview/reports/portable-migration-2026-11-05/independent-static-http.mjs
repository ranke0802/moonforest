import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,relative,extname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const project=resolve(import.meta.dirname,'../..'),site=resolve(project,'dist-village');
const manifest=JSON.parse(await readFile(resolve(site,'deployment-files.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.gltf':'model/gltf+json','.wasm':'application/wasm','.mp3':'audio/mpeg','.wav':'audio/wav'};
let requests=0;
const server=createServer(async(request,response)=>{
  requests++;
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
  try{
    const url=new URL(request.url,'http://localhost'),pathname=decodeURIComponent(url.pathname),target=resolve(site,'.'+(pathname==='/'?'/index.html':pathname)),local=relative(site,target);
    if(!local||local.startsWith('..')||isAbsolute(local)){response.writeHead(403);response.end();return;}
    const info=await stat(target);if(!info.isFile())throw Error('not file');
    response.writeHead(200,{'Content-Type':mime[extname(target)]??'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store'});
    if(request.method==='HEAD')response.end();else createReadStream(target).pipe(response);
  }catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const started=performance.now();let verifiedBytes=0;
try{
  for(const row of manifest.files){
    const response=await fetch(base+'/'+row.path);assert.equal(response.status,200,row.path);
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,row.bytes,row.path);assert.equal(hash(bytes),row.sha256,row.path);verifiedBytes+=bytes.length;
  }
  const entryRoutes=[];
  for(const character of ['moonforest-0.1','warrior-v3','warrior-plains','warrior-v4','warrior-v5']){
    const route='/index.html?character='+character,response=await fetch(base+route);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/html/);entryRoutes.push(route);
  }
  const studio=await fetch(base+'/cinematic-studio.html');assert.equal(studio.status,200);entryRoutes.push('/cinematic-studio.html');
  const index=await fetch(base+'/deployment-files.json');assert.deepEqual(await index.json(),manifest);
  const head=await fetch(base+'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  const write=await fetch(base+'/',{method:'POST',body:'read-only probe'});assert.equal(write.status,405);
  assert.equal(verifiedBytes,manifest.bytes);
  console.log(JSON.stringify({version:1,scope:'Read-only local HTTP fetch and exact deployment-byte validation; no browser execution, rendered UI or FPS claim.',site,files:manifest.files.length,verifiedBytes,resourceRevision:manifest.resourceRevision,entryRoutes,headPassed:true,writesRejected:true,requests,durationMs:performance.now()-started,passed:true},null,2));
}finally{await new Promise(resolve=>server.close(resolve));}
