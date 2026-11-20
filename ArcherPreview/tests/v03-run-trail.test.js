import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunTrail} from '../src/v03/run-trail.js';
import {estimateTextureMemory,textureBytes} from '../src/texture-memory.js';

const store=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,String(value));},map};};

test('a run killed on screen leaves its last stage for the next run',()=>{
 const storage=store();let clock=1000;const now=()=>clock;
 const first=createRunTrail({storage,now});
 assert.equal(first.previous,null);
 clock=3000;first.mark('title');clock=9000;first.mark('opening');first.mark('opening');
 // no end(): the page was killed
 const second=createRunTrail({storage,now});
 assert.equal(second.previous.stage,'opening');
 assert.equal(second.previous.ended,false);
 assert.equal(second.previous.hidden,false);
 assert.deepEqual(second.previous.trail,[['boot',0],['title',2],['opening',8]]);
});

test('a normal leave and a background discard are told apart from a kill',()=>{
 const storage=store();
 const left=createRunTrail({storage});left.mark('play');left.end();
 assert.equal(createRunTrail({storage}).previous.ended,true);
 const hidden=createRunTrail({storage});hidden.mark('play');hidden.setHidden(true);
 const next=createRunTrail({storage});
 assert.equal(next.previous.ended,false);assert.equal(next.previous.hidden,true);
});

test('a boot-only hand-over run passes the real previous run on',()=>{
 const storage=store();
 const killed=createRunTrail({storage});killed.mark('title');killed.mark('opening');
 const handOver=createRunTrail({storage});handOver.end();
 const next=createRunTrail({storage});
 assert.equal(next.previous.stage,'opening');assert.equal(next.previous.ended,false);
 assert.equal(next.previous.carried,undefined);
 // one level only: the stored record does not nest older runs
 next.mark('title');const after=createRunTrail({storage});
 assert.equal(after.previous.stage,'title');assert.equal(JSON.stringify(after.previous).includes('opening'),false);
});

test('the trail keeps its last twelve stages and survives broken storage',()=>{
 const storage=store();const trail=createRunTrail({storage});
 for(let i=0;i<20;i++)trail.mark('s'+i);
 const kept=createRunTrail({storage}).previous.trail;
 assert.equal(kept.length,12);assert.equal(kept.at(-1)[0],'s19');
 const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
 const safe=createRunTrail({storage:broken});safe.mark('title');safe.end();
 assert.equal(safe.previous,null);assert.equal(safe.stage,'title');
});

test('texture memory follows size, format and mipmaps',()=>{
 assert.equal(textureBytes({width:4096,height:4096,format:5,type:0,generateMipMaps:true}),4096*4096*4*4/3);
 assert.equal(textureBytes({width:4096,height:4096,format:36492,generateMipMaps:true}),4096*4096*4/3);
 assert.equal(textureBytes({width:1024,height:1024,format:33776}),1024*1024/2);
 assert.equal(textureBytes({width:0,height:0,format:5}),0);
 const engine={getLoadedTexturesCache:()=>[
  {width:4096,height:4096,format:5,type:0,generateMipMaps:true,url:'a/horse.glb#image0'},
  {width:4096,height:4096,format:36492,generateMipMaps:true,url:'content/abc.ktx2'},
  {width:0,height:0,format:5},
 ]};
 const report=estimateTextureMemory(engine);
 assert.equal(report.count,2);assert.equal(report.megabytes,107);assert.equal(report.uncompressedMegabytes,85);
 assert.equal(report.largest[0].name,'horse.glb#image0');assert.equal(report.largest[0].compressed,false);
 assert.equal(estimateTextureMemory(null),null);
});
