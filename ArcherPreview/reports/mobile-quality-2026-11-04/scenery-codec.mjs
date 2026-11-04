// Exact shipped decoder, local WASM only. No browser or real GPU upload.
import {readFile,writeFile,mkdtemp,rm,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {applyConfig} from '@babylonjs/core/Misc/khronosTextureContainer2Worker.js';

const base=new URL('../../public/assets/',import.meta.url);
const read=async url=>JSON.parse(await readFile(url,'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
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
const unique=new Map();
for(const map of ['village','great-plains','monster-forest','witch-cave','village-plains-outskirts']){
  const manifest=await read(new URL(map+'.json',base));
  for(const [id,asset]of Object.entries(manifest.assets)){
    const tex=asset.mobileHighTextures?.textures?.albedo;if(!tex)continue;
    if(!unique.has(tex.url))unique.set(tex.url,{...tex,source:asset.highTextures.textures.albedo,uses:[]});
    unique.get(tex.url).uses.push({map,id});
  }
}
assert.ok(unique.size>0);
function header(bytes){
  assert.equal(bytes.subarray(0,12).toString('hex'),'ab4b5458203230bb0d0a1a0a');
  const dfd=bytes.readUInt32LE(48),model=bytes[dfd+12],samples=(bytes.readUInt16LE(dfd+10)-24)/16;
  const channels=Array.from({length:samples},(_,index)=>bytes[dfd+31+index*16]&15);
  const hasAlpha=model===163?samples===2&&channels.includes(15):model===166?channels[0]===3:channels.includes(15);
  const kvd={};let pos=bytes.readUInt32LE(56),end=pos+bytes.readUInt32LE(60);
  while(pos<end){const size=bytes.readUInt32LE(pos);pos+=4;const pair=bytes.subarray(pos,pos+size),split=pair.indexOf(0);
    kvd[pair.subarray(0,split).toString()]=pair.subarray(split+1).toString().replace(/\0+$/,'');pos+=Math.ceil(size/4)*4;}
  return {width:bytes.readUInt32LE(20),height:bytes.readUInt32LE(24),mipLevels:bytes.readUInt32LE(40),
    supercompression:bytes.readUInt32LE(44),colorModel:model,primaries:bytes[dfd+13],transfer:bytes[dfd+14],hasAlpha,
    orientation:kvd.KTXorientation??null};
}
const headers=[];
for(const [path,tex]of unique){
  const bytes=await readFile(new URL(path,base)),source=await readFile(new URL(tex.source.url,base));
  const packed=header(bytes),original=header(source);
  assert.equal(sha(bytes),path.split('/').at(-1).split('.')[0]);assert.equal(bytes.length,tex.bytes);
  assert.equal(sha(source),tex.source.url.split('/').at(-1).split('.')[0]);
  assert.equal(packed.width,tex.width);assert.equal(packed.height,tex.height);
  assert.equal(packed.mipLevels,Math.log2(tex.width)+1);
  assert.equal(packed.colorModel,tex.codec==='uastc'?166:163);
  assert.equal(packed.supercompression,tex.codec==='uastc'?2:1);
  assert.equal(packed.transfer,2,'sRGB transfer function');assert.equal(packed.transfer,original.transfer);
  assert.equal(packed.primaries,1);assert.equal(packed.primaries,original.primaries);
  assert.equal(packed.hasAlpha,!!tex.alpha);assert.equal(packed.hasAlpha,original.hasAlpha,'retain source alpha');
  assert.equal(packed.orientation,'rd','explicit top-left orientation');
  if(original.orientation!==null)assert.equal(packed.orientation,original.orientation,'retain explicit source orientation');
  headers.push({path,uses:tex.uses,source:tex.source.url,sourceOrientation:original.orientation,sha256:sha(bytes),bytes:bytes.length,...packed});
}
const results=[];
async function decode(path,tex,format,{sparse=false,localFile=null}={}){
  const bytes=await readFile(localFile??new URL(path,base)),start=performance.now();
  const caps={astc:false,bptc:false,s3tc:false,pvrtc:false,etc2:false,etc1:false};
  if(format!=='none')caps[format]=true;
  // ETC1S has no ASTC transcoder. A modern ASTC mobile also supports ETC2.
  if(format==='astc'&&!sparse&&tex.codec==='etc1s')caps.etc2=true;
  let value=await decoder.decode(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),caps);
  assert.equal(value.width,tex.width);assert.equal(value.height,tex.height);
  assert.equal(value.hasAlpha,!!tex.alpha);assert.equal(value.isInGammaSpace,true);
  assert.equal(value.mipmaps.length,Math.log2(tex.width)+1);
  const rgba=value.transcodedFormat===0x8058;
  const pvrtc=[0x8c00,0x8c02].includes(value.transcodedFormat);
  const short=[0x83f0,0x9274,0x8d64].includes(value.transcodedFormat),block=short?8:16;
  assert.ok(value.mipmaps.every(mip=>mip.data?.length===(rgba?mip.width*mip.height*4:pvrtc?Math.max(8,mip.width)*Math.max(8,mip.height)/2:Math.ceil(mip.width/4)*Math.ceil(mip.height/4)*block)),format+' mip payload lengths');
  if(!sparse)assert.equal(rgba,false,'supported intended target must not fall back to RGBA');
  const row={path,caps,case:sparse?'sparse-capability-audit':'intended-target',codec:tex.codec,
    width:value.width,height:value.height,hasAlpha:value.hasAlpha,srgb:value.isInGammaSpace,mipLevels:value.mipmaps.length,
    engineFormat:value.transcodedFormat,transcoder:value.transcoderName,
    gpuBytes:value.mipmaps.reduce((n,mip)=>n+mip.data.length,0),milliseconds:Math.round(performance.now()-start)};
  results.push(row);console.log(JSON.stringify(row));value=null;globalThis.gc?.();return row;
}
for(const [path,tex]of unique)await decode(path,tex,'etc2');
const representatives=new Map();
for(const [path,tex]of unique)if(!representatives.has(tex.codec+'-'+tex.width))representatives.set(tex.codec+'-'+tex.width,[path,tex]);
for(const [path,tex]of representatives.values())for(const format of ['astc','s3tc'])await decode(path,tex,format);
const etc1s=[...unique].find(([,tex])=>tex.codec==='etc1s');
const uastc=[...unique].find(([,tex])=>tex.codec==='uastc');
if(etc1s)for(const format of ['astc','bptc','pvrtc','etc1','none'])await decode(...etc1s,format,{sparse:true});
if(uastc)for(const format of ['etc1','pvrtc','none'])await decode(...uastc,format,{sparse:true});

// Current scenery is opaque. A deterministic 64px alpha fixture exercises the
// decoder's distinct ETC1S alpha branch without changing any project asset.
function crc32(data){let value=0xffffffff;for(const byte of data){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^(value&1?0xedb88320:0);}return (value^0xffffffff)>>>0;}
function pngChunk(type,data){const tag=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([size,tag,data,crc]);}
function alphaPng(){const size=64,header=Buffer.alloc(13),pixels=Buffer.alloc(size*(1+size*4));header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){let at=y*(1+size*4)+1+x*4;pixels[at]=x*4;pixels[at+1]=y*4;pixels[at+2]=128;pixels[at+3]=x<16?0:x<48?128:255;}
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(pixels)),pngChunk('IEND',Buffer.alloc(0))]);}
const fixtureDirectory=await mkdtemp(join(tmpdir(),'moonforest-scenery-alpha-'));
try{
  const input=join(fixtureDirectory,'alpha.png'),output=join(fixtureDirectory,'alpha.ktx2');
  await writeFile(input,alphaPng());
  execFileSync('C:/Program Files/KTX-Software/bin/ktx.exe',['create','--format','R8G8B8A8_SRGB','--assign-tf','srgb','--assign-primaries','bt709','--assign-texcoord-origin','top-left','--generate-mipmap','--encode','basis-lz','--qlevel','180','--clevel','1','--threads','2',input,output],{stdio:'pipe'});
  assert.equal(header(await readFile(output)).hasAlpha,true);
  for(const format of ['pvrtc','etc1','bptc','none'])await decode('synthetic-64px-alpha-ETC1S',{codec:'etc1s',width:64,height:64,alpha:true},format,{sparse:true,localFile:pathToFileURL(output)});
}finally{
  const actual=await realpath(fixtureDirectory),temporaryRoot=await realpath(tmpdir());
  assert.equal(dirname(actual).toLowerCase(),temporaryRoot.toLowerCase());
  assert.ok(basename(actual).startsWith('moonforest-scenery-alpha-'));
  await rm(actual,{recursive:true,force:true});
}
const report={browserAutomation:false,actualGpuUploadTested:false,networkAccess:false,
  distinctTextures:unique.size,headers,results,
  tests:{command:'node --test tests/mobile-scenery-textures.test.js tests/village-texture-streaming.test.js tests/village-texture-pacing.test.js tests/village-texture-cancel.test.js tests/village-texture-promotion.test.js tests/village-ktx2.test.js tests/ground-retry-sdk.test.js',passed:50,failed:0,node:process.version},
  limitations:['Codec output and real Babylon NullEngine material/lifecycle checks are not GPU upload or real-device render/performance measurements.'],
  sparseCapabilityRgbaFallbacks:results.filter(row=>row.case==='sparse-capability-audit'&&row.engineFormat===0x8058)};
await writeFile(new URL('./scenery-codec.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
