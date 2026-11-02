import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync,inflateSync} from 'node:zlib';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {ResourceDownloads} from '../../src/resource-downloads.js';

const assets=new URL('../../public/assets/',import.meta.url);
const index=JSON.parse(readFileSync(new URL('resource-index.json',assets)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const output={scope:'Read-only local byte/index inspection and controlled CacheStorage/service-worker boundary reproductions. No browser/GPU or user-device cache access.',revision:index.revision,ground:[],reproductions:{}};
const unique=new Map();
for(const id of ['village','monster-forest','great-plains','witch-cave']){
  const manifest=JSON.parse(readFileSync(new URL(id+'-ground.json',assets)));
  const row={id,resources:[]};
  for(const role of ['color','detail']){
    const resource=manifest[role],name=resource.url.split('/').at(-1),bytes=readFileSync(new URL(resource.url,assets));
    const entry={role,name,size:bytes.length,manifestSize:resource.bytes,indexSize:index.files[name],sha256:sha(bytes),hashMatches:sha(bytes)===name.slice(0,64),magic:bytes.subarray(0,12).toString('hex')};
    assert.equal(bytes.length,resource.bytes);assert.equal(bytes.length,index.files[name]);assert.equal(entry.hashMatches,true);
    if(name.endsWith('.ktx2')){
      entry.ktx2={vkFormat:bytes.readUInt32LE(12),width:bytes.readUInt32LE(20),height:bytes.readUInt32LE(24),depth:bytes.readUInt32LE(28),layerCount:bytes.readUInt32LE(32),faceCount:bytes.readUInt32LE(36),levelCount:bytes.readUInt32LE(40),supercompression:bytes.readUInt32LE(44),levels:[]};
      assert.equal(entry.magic,'ab4b5458203230bb0d0a1a0a');assert.equal(entry.ktx2.width,resource.width);assert.equal(entry.ktx2.height,resource.height);
      for(let i=0;i<entry.ktx2.levelCount;i++){
        const off=80+i*24,start=Number(bytes.readBigUInt64LE(off)),length=Number(bytes.readBigUInt64LE(off+8)),uncompressed=Number(bytes.readBigUInt64LE(off+16));
        assert.ok(start>=80&&start+length<=bytes.length);entry.ktx2.levels.push({start,length,uncompressed});
      }
    }else if(name.endsWith('.png')){
      assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      entry.png={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),bitDepth:bytes[24],colorType:bytes[25],chunks:[]};
      const image=[];for(let cursor=8;cursor<bytes.length;){const length=bytes.readUInt32BE(cursor),type=bytes.toString('ascii',cursor+4,cursor+8);assert.ok(cursor+12+length<=bytes.length);entry.png.chunks.push({type,length});if(type==='IDAT')image.push(bytes.subarray(cursor+8,cursor+8+length));cursor+=length+12;}
      entry.png.inflatedBytes=inflateSync(Buffer.concat(image)).length;assert.equal(entry.png.width,resource.width);assert.equal(entry.png.height,resource.height);
    }
    const pack=index.bundles.find(pack=>pack.files.includes(name));
    entry.bundle=pack?.url??null;
    if(pack){
      const packed=readFileSync(new URL(pack.url,assets)),unpacked=gunzipSync(packed);let offset=0;
      assert.equal(packed.length,pack.bytes);assert.equal(unpacked.length,pack.unpackedBytes);
      for(const member of pack.files){const size=index.files[member];if(member===name)assert.deepEqual(unpacked.subarray(offset,offset+size),bytes);offset+=size;}
      entry.bundleMemberMatches=true;
    }
    row.resources.push(entry);unique.set(name,{resource,bytes});
  }
  output.ground.push(row);
}

const base='https://cache-audit.example.test/ArcherPreviewSite/assets/';
const groundName=output.ground[0].resources[0].name,groundUrl=base+'content/'+groundName,groundSize=index.files[groundName];
for(const pathCount of [2,16]){
  const names=[groundName,...Object.keys(index.files).filter(name=>name!==groundName)].slice(0,pathCount),stored=new Map(names.map(name=>[base+'content/'+name,new Response('<html>stale asset fallback</html>',{status:200,headers:{'Content-Type':'text/html'}})]));
  let fetches=0,matches=0,keyEnumerations=0;
  const cache={async match(url){matches++;return stored.get(url)?.clone();},async keys(){keyEnumerations++;return [...stored.keys()].map(url=>({url}));},async put(){throw new Error('Unexpected write');}};
  const downloads=new ResourceDownloads(index.files,base,{index,cacheStorage:{async open(){return cache;}},fetcher:async()=>{fetches++;throw new Error('Unexpected network');}});
  const result=await downloads.prepare(names.map(name=>'content/'+name));
  assert.equal(fetches,0);assert.equal(result.complete,true);assert.equal(result.total,0);assert.equal(downloads.stats.cacheHits,pathCount);
  output.reproductions['existingPoisonedCache'+pathCount]={pathCount,fetches,matches,keyEnumerations,reportedComplete:result.complete,downloadTotal:result.total,cacheHits:downloads.stats.cacheHits,storedGroundBytes:(await stored.get(groundUrl).arrayBuffer()).byteLength,expectedGroundBytes:groundSize};
}
{
  let fetches=0;const stored=new Map(),wrong=Buffer.alloc(groundSize,32);wrong.write('<html>wrong body with correct byte count</html>');
  const cache={async match(url){return stored.get(url)?.clone();},async put(url,response){stored.set(url,new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers}));},async delete(url){return stored.delete(url);}};
  const downloads=new ResourceDownloads(index.files,base,{cacheStorage:{async open(){return cache;}},fetcher:async()=>{fetches++;return new Response(wrong,{headers:{'Content-Type':'text/html'}});}});
  const result=await downloads.prepare(['content/'+groundName]);const response=stored.get(groundUrl),storedBytes=Buffer.from(await response.clone().arrayBuffer());
  assert.equal(result.complete,true);assert.equal(storedBytes.length,groundSize);assert.notEqual(sha(storedBytes),groundName.slice(0,64));
  output.reproductions.standaloneWrongBodyAccepted={fetches,reportedComplete:result.complete,size:storedBytes.length,type:response.headers.get('Content-Type'),hashMatches:false};
}
{
  const listeners={},stored=new Map([[groundUrl,new Response('<html>cached fallback</html>',{headers:{'Content-Type':'text/html'}})]]);let fetches=0;
  const context={URL,Map,Set,Response,console,self:{registration:{scope:'https://cache-audit.example.test/ArcherPreviewSite/'},addEventListener(type,fn){listeners[type]=fn;}},caches:{async open(){return {async match(url){return stored.get(url)?.clone();}};}},fetch:async()=>{fetches++;throw new Error('Unexpected network');}};
  vm.runInNewContext(readFileSync(new URL('../../public/resource-cache.js',import.meta.url),'utf8'),context);
  const attempts=[];
  for(const options of [{},{cache:'reload'},{cache:'no-store',headers:{'X-Moonforest-Cache-Writer':'page'}}]){
    let response;listeners.fetch({request:new Request(groundUrl,options),respondWith(value){response=value;}});const actual=await response;
    attempts.push({requestCache:options.cache??'default',pageWriter:!!options.headers,status:actual.status,type:actual.headers.get('Content-Type'),bytes:(await actual.arrayBuffer()).byteLength});
  }
  assert.equal(fetches,0);output.reproductions.workerPoisonedCacheRepeated={fetches,attempts};
}
output.findings=[
  'Every local ground resource matches its content SHA256, manifest byte count, resource index byte count, and structural header. Bundle entries for those resources match the standalone bytes.',
  'Both ResourceDownloads cache lookup branches trust presence only. Cached bad/truncated/wrong-type responses report complete with zero new transfers.',
  'Standalone page downloads check total bytes but do not check SHA256 or normalize/validate Content-Type. Wrong same-length bytes can enter persistent cache.',
  'The service worker returns cached entries without validating status, size, type, or hash, so the same poisoned entry survives repeated loads.',
  'Request cache reload/no-store and the page-writer header do not bypass existing CacheStorage hits. The worker network path also discards the incoming request cache mode.',
  'These are demonstrated recovery gaps, not proof that the user device contains corrupt cache bytes. Ground callback details and a fresh bypassed fetch are required to discriminate from decoder/registration/GPU errors.'
];
writeFileSync(new URL('cache-audit.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({revision:output.revision,resources:unique.size,reproductions:output.reproductions,findings:output.findings},null,2));
