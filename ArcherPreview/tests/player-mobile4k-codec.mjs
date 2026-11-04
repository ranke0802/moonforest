// Offline verification using the exact pinned Babylon decoder and local WASM.
// This verifies codec output, not browser GPU uploads or rendered appearance.
// Run: node --expose-gc tests/player-mobile4k-codec.mjs
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {applyConfig} from '@babylonjs/core/Misc/khronosTextureContainer2Worker.js';

const base=new URL('../public/assets/',import.meta.url);
const read=async url=>JSON.parse(await readFile(url,'utf8'));
const decoderConfig=await read(new URL('ktx2-decoder.json',base));
const urls=Object.fromEntries(Object.entries(decoderConfig.urls).map(([key,path])=>[key,new URL(path,base).href]));
const sandbox={console,WebAssembly,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,
  Float32Array,Float64Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,setTimeout,clearTimeout,performance,
  fetch:async url=>{
    assert.ok(Object.values(urls).includes(String(url)),'Only pinned local decoder resources');
    return new Response(await readFile(new URL(url)));
  }};
const context=vm.createContext(sandbox);
vm.runInContext(await readFile(new URL(urls.jsDecoderModule),'utf8'),context);
vm.runInContext(await readFile(new URL(urls.jsMSCTranscoder),'utf8'),context);
const binaries={jsDecoderModule:sandbox.KTX2DECODER,jsMSCTranscoder:sandbox.MSC_TRANSCODER};
for(const [key,url]of Object.entries(urls))if(key.startsWith('wasm')){
  const bytes=await readFile(new URL(url));
  binaries[key]=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}
applyConfig(urls,binaries);
sandbox.KTX2DECODER.WASMMemoryManager.LoadBinariesFromCurrentThread=true;
const decoder=new sandbox.KTX2DECODER.KTX2Decoder();
const profile=await read(new URL('warrior-v3-mobile4k.json',base));
const model=await read(new URL(profile.model,base));
const results=[];
const formats={astc:[0x93b0],bptc:[0x8e8c],s3tc:[0x83f0,0x83f3],etc2:[0x9274,0x9278]};
for(const [format,allowed]of Object.entries(formats)){
  for(const image of model.images){
    const path=new URL('content/'+image.uri,base),bytes=await readFile(path),start=performance.now();
    assert.equal(createHash('sha256').update(bytes).digest('hex'),image.uri.split('.')[0]);
    const caps={astc:false,bptc:false,s3tc:false,pvrtc:false,etc2:false,etc1:false,[format]:true};
    let decoded=await decoder.decode(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),caps);
    assert.ok(allowed.includes(decoded.transcodedFormat),format+': never use RGBA fallback');
    assert.equal(decoded.width,bytes.readUInt32LE(20));assert.equal(decoded.height,bytes.readUInt32LE(24));
    assert.ok(decoded.width<=4096&&decoded.height<=4096);
    assert.equal(decoded.mipmaps.length,bytes.readUInt32LE(40));
    const blockBytes=[0x83f0,0x9274].includes(decoded.transcodedFormat)?8:16;
    assert.ok(decoded.mipmaps.every(mip=>mip.data?.length===Math.ceil(mip.width/4)*Math.ceil(mip.height/4)*blockBytes));
    const row={image:image.uri,name:image.name,caps:format,width:decoded.width,height:decoded.height,
      engineFormat:decoded.transcodedFormat,transcoder:decoded.transcoderName,hasAlpha:decoded.hasAlpha,
      mipLevels:decoded.mipmaps.length,gpuBytes:decoded.mipmaps.reduce((n,mip)=>n+mip.data.length,0),
      milliseconds:Math.round(performance.now()-start)};
    results.push(row);console.log(JSON.stringify(row));decoded=null;globalThis.gc?.();
  }
}
const report={browserAutomation:false,actualGpuUploadTested:false,networkAccess:false,
  manifest:'warrior-v3-mobile4k.json',results,
  aggregateGpuBytes:Object.fromEntries(Object.keys(formats).map(format=>[format,results.filter(row=>row.caps===format).reduce((n,row)=>n+row.gpuBytes,0)]))};
await writeFile(new URL('../reports/mobile-quality-2026-11-04/player-codec.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
