// Node/WASM verification of the exact shipped decoder with iPhone ASTC caps.
// No browser, WebDriver, GPU context, or model generation.
import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {applyConfig} from '@babylonjs/core/Misc/khronosTextureContainer2Worker.js';
const base=new URL('../public/assets/',import.meta.url);
const read=async url=>JSON.parse(await readFile(url,'utf8'));
const config=await read(new URL('ktx2-decoder.json',base));
const urls=Object.fromEntries(Object.entries(config.urls).map(([key,path])=>[key,new URL(path,base).href]));
const localFetch=async url=>{
  assert.ok(Object.values(urls).includes(String(url)),'Only pinned local decoder resources');
  return new Response(await readFile(new URL(url)));
};
const exports={},sandbox={exports,module:{exports},console,WebAssembly,Uint8Array,Uint16Array,Uint32Array,Float32Array,ArrayBuffer,DataView,TextDecoder,fetch:localFetch};
vm.runInNewContext(await readFile(new URL(config.urls.jsDecoderModule,base),'utf8'),sandbox);
const binaries={jsDecoderModule:exports};
for(const key of ['wasmUASTCToASTC','wasmZSTDDecoder']){
  const bytes=await readFile(new URL(config.urls[key],base));
  binaries[key]=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}
applyConfig(urls,binaries);exports.WASMMemoryManager.LoadBinariesFromCurrentThread=true;
const decoder=new exports.KTX2Decoder(),report=[];
const player=process.argv[3]?null:await read(new URL('warrior-v3-ios.json',base));
const model=player?await read(new URL(player.model,base)):null;
const paths=model?model.images.map(x=>new URL('content/'+x.uri,base)):[process.argv[3]];
for(const path of paths){
  const bytes=await readFile(path),start=performance.now();
  const result=await decoder.decode(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),{astc:true,bptc:false,s3tc:false,pvrtc:false,etc2:true,etc1:false});
  assert.equal(result.transcodedFormat,0x93b0,'ASTC 4x4 required; no RGBA fallback');
  assert.equal(result.width,bytes.readUInt32LE(20));assert.equal(result.height,bytes.readUInt32LE(24));
  assert.equal(result.mipmaps.length,bytes.readUInt32LE(40));
  assert.ok(result.mipmaps.every(m=>m.data?.length===Math.ceil(m.width/4)*Math.ceil(m.height/4)*16));
  report.push({path:String(path),width:result.width,height:result.height,hasAlpha:result.hasAlpha,
    format:'ASTC_4x4',transcoder:result.transcoderName,levels:result.mipmaps.length,
    gpuBytes:result.mipmaps.reduce((n,m)=>n+m.data.length,0),milliseconds:Math.round(performance.now()-start)});
  console.log(JSON.stringify(report.at(-1)));globalThis.gc?.();
}
await writeFile(process.argv[2],JSON.stringify({browserAutomation:false,actualGpuUploadTested:false,results:report},null,2)+'\n');
