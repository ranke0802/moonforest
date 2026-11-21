import test from 'node:test';
import assert from 'node:assert/strict';
import {enableSplitTextureUpload,disableSplitTextureUpload,splitTextureUpload,splitTextureUploadStats,splitTextureUploadDone,splitUploadRequested} from '../src/split-texture-upload.js';

const ASTC=37808;
function rig({error=0,version=2}={}){
  const calls=[],frame=[],timers=[];let clock=0,lost=null;
  const proto={TEXTURE_2D:3553,NO_ERROR:0,
    getError(){const e=this.pending;this.pending=0;return e;},
    createTexture(){return {scratch:true};},bindTexture(){},deleteTexture(){},
    texStorage2D(target,levels,format,width,height){calls.push({op:'storage',levels,format,width,height,bound:engine.bound});},
    compressedTexSubImage2D(target,level,x,y,width,height,format,data){if(error)this.pending=error;calls.push({op:'sub',level,y,width,height,format,bytes:data.byteLength,first:data[0],bound:engine.bound});},
    texParameteri(){calls.push({op:'param'});},
    compressedTexImage2D(){calls.push({op:'native'});}};
  const gl=Object.create(proto);gl.pending=0;
  const engine={_gl:gl,webGLVersion:version,bound:null,
    onBeginFrameObservable:{add(fn){frame.push(fn);return fn;},remove(fn){const i=frame.indexOf(fn);if(i>=0)frame.splice(i,1);}},
    onContextLostObservable:{add(fn){lost=fn;return fn;},remove(){lost=null;}},
    _bindTextureDirectly(target,texture){engine.bound=texture;},
    // as Babylon 9.31: immutable storage and sub-images when the texture has mipmaps
    _uploadCompressedDataToTextureDirectly(texture,format,width,height,data,face,lod){
      const internalFormat=texture._useSRGBBuffer?format+32:format,hardware=texture._hardwareTexture;
      if(texture.generateMipMaps){
        if(!hardware.memoryAllocated){gl.texStorage2D(3553,Math.floor(Math.log2(Math.max(width,height)))+1,internalFormat,texture.width,texture.height);hardware.memoryAllocated=true;}
        gl.compressedTexSubImage2D(3553,lod,0,0,width,height,internalFormat,data);
      }else gl.compressedTexImage2D(3553,lod,internalFormat,width,height,0,data);
    }};
  const options={now:()=>clock,setTimer:(fn,ms)=>{const t={fn,at:clock+ms};timers.push(t);return t;},clearTimer:t=>{const i=timers.indexOf(t);if(i>=0)timers.splice(i,1);}};
  return {gl,engine,calls,options,timers,
    frame:(ms=16)=>{clock+=ms;for(const fn of [...frame])fn();},
    // advance the clock without rendering: only timers run
    wait:ms=>{const end=clock+ms;for(;;){timers.sort((a,b)=>a.at-b.at);const t=timers[0];if(!t||t.at>end)break;timers.shift();clock=t.at;t.fn();}clock=end;},
    loseContext:()=>lost?.(),frameObservers:frame};
}
function texture(size,{blockBytes=16}={}){
  const mipmaps=[];
  for(let s=size,level=0;s>=1;s=Math.floor(s/2),level++){const data=new Uint8Array(Math.ceil(s/4)*Math.ceil(s/4)*blockBytes);for(let i=0;i<data.length;i+=4096)data[i]=(level*7+(i>>12))&255;mipmaps.push({width:s,height:s,data});}
  return {transcodedFormat:ASTC,isInGammaSpace:true,hasAlpha:false,transcoderName:'test',mipmaps};
}
const internalTexture=(generateMipMaps=true)=>({_hardwareTexture:{underlyingResource:{}},_useSRGBBuffer:false,isReady:false,generateMipMaps});
const settled=async promise=>{let value='pending';promise.then(v=>{value=v;});await null;await null;return value;};

test('small textures and engines that were not enabled keep the native upload',()=>{
  const {engine,calls,options}=rig();
  assert.equal(splitTextureUpload(engine,texture(2048),internalTexture(),{}),false,'not enabled');
  enableSplitTextureUpload(engine,options);
  const small=internalTexture();
  assert.equal(splitTextureUpload(engine,texture(256),small,{}),false,'below the size rule');
  assert.equal(calls.length,0);assert.equal(splitTextureUploadDone(engine,small),null);
  assert.equal(enableSplitTextureUpload(rig({version:1}).engine),null,'WebGL1 has no immutable storage');
});

test('a large texture goes up in strips within the frame budget and is loaded only when whole',async()=>{
  const {engine,gl,calls,options,frame}=rig();enableSplitTextureUpload(engine,options);
  const data=texture(2048),internal=internalTexture(),out={};
  assert.equal(splitTextureUpload(engine,data,internal,out),true);
  for(const name of ['compressedTexImage2D','compressedTexSubImage2D','texStorage2D'])assert.equal(Object.prototype.hasOwnProperty.call(gl,name),false,'the format probe leaves the context as it was');
  assert.equal(internal._hardwareTexture.memoryAllocated,true,'Babylon is told the storage exists');
  assert.equal(calls.filter(c=>c.op==='storage'&&c.bound===internal).length,1,'storage is allocated once');
  assert.equal(calls.some(c=>c.op==='native'),false,'nothing reached the native full-level upload');
  assert.equal(calls.some(c=>c.op==='param'),false,'no sampler or level state is touched');
  const storage=calls.find(c=>c.op==='storage'&&c.bound===internal);
  assert.deepEqual([storage.levels,storage.format,storage.width,storage.height],[12,ASTC,2048,2048]);
  // 512 px is 262,144 bytes: levels 2..11 go up at once, 1 and 0 wait
  assert.deepEqual(calls.filter(c=>c.op==='sub'&&c.bound===internal).map(c=>c.level).sort((a,b)=>a-b),[2,3,4,5,6,7,8,9,10,11]);
  assert.deepEqual([internal.isReady,internal.width,internal.height,internal.generateMipMaps,internal.format,out.transcoderName],[false,2048,2048,true,ASTC,'test']);
  assert.equal(engine.bound,null);
  const done=splitTextureUploadDone(engine,internal);assert.ok(done);
  calls.length=0;frame();
  assert.deepEqual(calls.filter(c=>c.op==='sub').map(c=>[c.level,c.y,c.height,c.bytes]),[[1,0,1024,1<<20]],'frame 1: the 1024 level, one megabyte');
  const strips=[];
  for(let i=0;i<4;i++){
    assert.equal(await settled(done),'pending');assert.equal(internal.isReady,false);
    calls.length=0;frame();const sub=calls.filter(c=>c.op==='sub');
    assert.equal(sub.reduce((n,c)=>n+c.bytes,0),1<<20);strips.push(...sub.map(c=>[c.level,c.y,c.height,c.first]));
  }
  assert.deepEqual(strips.map(s=>s.slice(0,3)),[[0,0,512],[0,512,512],[0,1024,512],[0,1536,512]]);
  assert.deepEqual(strips.map(s=>s[3]),[0,256,512,768].map(k=>k&255),'each strip carries its own part of the data');
  assert.equal(await settled(done),true);assert.equal(internal.isReady,true);
  calls.length=0;frame();assert.equal(calls.length,0,'nothing left');
  const stats=splitTextureUploadStats(engine);
  assert.deepEqual([stats.textures,stats.pending,stats.maxFrameBytes,stats.bytes,stats.idlePumps],[1,0,1<<20,5<<20,0]);
});

test('with the render loop paused a timer finishes the upload, and the budget can follow the game state',async()=>{
  const {engine,calls,options,frame,wait,timers}=rig();let loading=false;
  enableSplitTextureUpload(engine,{...options,bytesPerFrame:()=>loading?8<<20:1<<20});
  const first=internalTexture();splitTextureUpload(engine,texture(4096),first,{});
  const done=splitTextureUploadDone(engine,first);
  frame();calls.length=0;
  // frames stop (map travel, modal): 4096 has 16 MB + 4 MB + 1 MB waiting, one megabyte already sent
  wait(99);assert.equal(calls.length,0,'frames may still be coming: the timer leaves the budget alone');
  wait(200);
  assert.equal(await settled(done),true);assert.equal(first.isReady,true);
  assert.equal(calls.filter(c=>c.op==='sub').reduce((n,c)=>n+c.bytes,0),20<<20);
  assert.ok(splitTextureUploadStats(engine).idlePumps>=2);
  assert.equal(timers.length,0,'no timer is left once the queue is empty');
  loading=true;const second=internalTexture();splitTextureUpload(engine,texture(2048),second,{});
  frame();assert.equal(await settled(splitTextureUploadDone(engine,second)),true,'a loading screen takes the whole texture in one frame');
});

test('a texture disposed while it waits is dropped; a lost context settles every wait',async()=>{
  const {engine,calls,options,frame,loseContext}=rig();enableSplitTextureUpload(engine,options);
  const internal=internalTexture();splitTextureUpload(engine,texture(2048),internal,{});frame();
  const done=splitTextureUploadDone(engine,internal);
  internal._hardwareTexture=null;calls.length=0;frame();
  assert.equal(calls.length,0);assert.equal(await settled(done),false);assert.equal(internal.isReady,false);
  assert.deepEqual([splitTextureUploadStats(engine).dropped,splitTextureUploadStats(engine).pending],[1,0]);
  const other=internalTexture();splitTextureUpload(engine,texture(2048),other,{});
  loseContext();assert.equal(await settled(splitTextureUploadDone(engine,other)),true,'Babylon rebuilds it after the restore');
  assert.equal(splitTextureUploadStats(engine).pending,0);
});

test('a format the device rejects keeps the native upload, asked once',()=>{
  const {engine,calls,options}=rig({error:1282});enableSplitTextureUpload(engine,options);
  const rejected=internalTexture();
  assert.equal(splitTextureUpload(engine,texture(2048),rejected,{}),false);
  assert.equal(rejected._hardwareTexture.memoryAllocated,undefined,'Babylon must still allocate the storage itself');
  const probes=calls.length;
  assert.equal(calls.some(c=>c.op==='storage'&&c.width===2048),false,'the real texture was not touched');
  assert.equal(splitTextureUpload(engine,texture(2048),internalTexture(),{}),false);
  assert.equal(calls.length,probes,'no second probe');
  assert.equal(splitTextureUploadStats(engine).unsupported,2);
});

test('the sRGB choice Babylon makes is the one used, eight-byte blocks work, odd sizes fall back, disabling finishes what waits',async()=>{
  const {engine,calls,options,frameObservers,timers}=rig();enableSplitTextureUpload(engine,options);
  const srgb=internalTexture();srgb._useSRGBBuffer=true;
  assert.equal(splitTextureUpload(engine,texture(2048),srgb,{}),true);
  assert.equal(calls.find(c=>c.op==='storage'&&c.width===2048).format,ASTC+32);
  const eight=internalTexture(false);
  assert.equal(splitTextureUpload(engine,texture(4096,{blockBytes:8}),eight,{}),true);
  const odd=texture(2048);odd.mipmaps[3].data=new Uint8Array(100);
  assert.equal(splitTextureUpload(engine,odd,internalTexture(),{}),false);
  const waits=[splitTextureUploadDone(engine,srgb),splitTextureUploadDone(engine,eight)];
  assert.equal(disableSplitTextureUpload(engine),true);
  assert.deepEqual([await settled(waits[0]),await settled(waits[1]),srgb.isReady,eight.isReady],[true,true,true,true]);
  assert.deepEqual([frameObservers.length,timers.length],[0,0]);
  assert.equal(splitTextureUpload(engine,texture(2048),internalTexture(),{}),false);
});

test('it is off unless the address asks for it, and the choice stays with the tab',()=>{
  const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  assert.equal(splitUploadRequested('',storage),false,'the existing version by default');
  assert.equal(splitUploadRequested('?character=warrior-v3&splitupload=1',storage),true);
  assert.equal(splitUploadRequested('?character=warrior-v3',storage),true,'kept after the game reloads the page without the query');
  assert.equal(splitUploadRequested('?splitupload=0',storage),false);
  assert.equal(splitUploadRequested('',storage),false,'and off stays off');
  const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');},removeItem(){}};
  assert.equal(splitUploadRequested('?splitupload=1',broken),true,'storage refused: the address still decides');
  assert.equal(splitUploadRequested('',broken),false);
});
