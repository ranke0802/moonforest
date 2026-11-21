import test from 'node:test';
import assert from 'node:assert/strict';
import {installMapTextureLifetimeGuard} from '../src/map-texture-lifetime.js';
import {enableSplitTextureUpload} from '../src/split-texture-upload.js';

// The loader's promise (Babylon calls the texture loaded when it resolves) waits for the last strip.
function fakeKtx(){
  class Ktx{constructor(engine){this._engine=engine;}
    async _uploadAsync(data,internal,options){await null;this._createTexture(data,internal,options);}
    _createTexture(data,internal){internal.native=true;internal.isReady=true;}}
  return Ktx;
}
function engineRig(){
  const frame=[];const gl={TEXTURE_2D:3553,NO_ERROR:0,getError:()=>0,createTexture:()=>({}),bindTexture(){},deleteTexture(){},texStorage2D(){},compressedTexSubImage2D(){},compressedTexImage2D(){}};
  const engine={_gl:gl,webGLVersion:2,onBeginFrameObservable:{add(fn){frame.push(fn);return fn;},remove(){}},onContextLostObservable:{add(){},remove(){}},_bindTextureDirectly(){},
    _uploadCompressedDataToTextureDirectly(texture,format,width,height,data){gl.compressedTexImage2D(3553,0,format,width,height,0,data);}};
  return {engine,frame:()=>{for(const fn of frame)fn();}};
}
const texture=size=>{const mipmaps=[];for(let s=size;s>=1;s>>=1)mipmaps.push({width:s,height:s,data:new Uint8Array(Math.ceil(s/4)**2*16)});return {transcodedFormat:37808,isInGammaSpace:true,mipmaps};};
const internalTexture=()=>({_hardwareTexture:{underlyingResource:{}},isReady:false});
const flush=async()=>{for(let i=0;i<6;i++)await null;};

test('the KTX2 loader reports a split texture loaded only after its last strip; others are untouched',async()=>{
  const Ktx=fakeKtx();installMapTextureLifetimeGuard(Ktx);
  const {engine,frame}=engineRig();
  const plain=internalTexture();await new Ktx(engine)._uploadAsync(texture(2048),plain,{});
  assert.equal(plain.native,true,'split upload not enabled on this engine: native path');
  enableSplitTextureUpload(engine,{setTimer:()=>0,clearTimer(){},now:()=>0});
  const small=internalTexture();await new Ktx(engine)._uploadAsync(texture(256),small,{});assert.equal(small.native,true);
  const big=internalTexture();let state='pending';
  new Ktx(engine)._uploadAsync(texture(2048),big,{}).then(()=>{state='loaded';},()=>{state='failed';});
  await flush();assert.deepEqual([state,big.native,big.isReady],['pending',undefined,false]);
  for(let i=0;i<4;i++){frame();await flush();assert.equal(state,'pending');}
  frame();await flush();assert.deepEqual([state,big.isReady],['loaded',true]);
  const gone=internalTexture();let failure=null;
  new Ktx(engine)._uploadAsync(texture(2048),gone,{}).catch(error=>{failure=error;});
  await flush();gone._hardwareTexture=null;frame();await flush();
  assert.equal(failure?.name,'AbortError','a texture disposed while waiting ends as an aborted load');
});
