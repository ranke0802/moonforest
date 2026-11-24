import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Constants} from '@babylonjs/core';
import {retainedSourceBytes,textureMemoryTotals,estimateTextureMemory} from '../src/texture-memory.js';

// Babylon keeps a texture's source in JS memory so a lost WebGL context can be
// rebuilt in place (context-recovery.js waits for that). The diagnostics now
// report those bytes beside the GPU estimate (2026-11-24).
test('the WebGL engine keeps a buffer-made texture\'s source unless context loss is left unhandled',async()=>{
 // NullEngine stores buffers its own way, so check the real engine's path: the
 // diagnostic's meaning depends on it (Babylon 9.31 abstractEngine.createTexture).
 const source=await readFile(fileURLToPath(import.meta.resolve('@babylonjs/core/Engines/abstractEngine.pure.js')),'utf8');
 assert.match(source,/if \(!this\._doNotHandleContextLost\) \{\s*\/\/ Keep a link to the buffer only if we plan to handle context lost\s*texture\._buffer = buffer;/);
 const raw=await readFile(fileURLToPath(import.meta.resolve('@babylonjs/core/Engines/Extensions/engine.rawTexture.pure.js')),'utf8');
 assert.match(raw,/texture\._bufferView = data;/);
});

test('shared buffers count once; images, blobs and strings by their size',()=>{
 const shared=new ArrayBuffer(1000);
 const textures=[{_buffer:new Uint8Array(shared,0,10)},{_buffer:new Uint8Array(shared,10,20)},{_bufferViewArray:[new Uint8Array(40),new Uint8Array(8)]},
  {_buffer:{naturalWidth:16,naturalHeight:8}},{_buffer:{size:77,arrayBuffer(){}}},{_buffer:'abcd'},{_bufferViewArrayArray:[[new Uint8Array(5)],[new Uint8Array(6)]]},{}];
 assert.deepEqual(retainedSourceBytes(textures),{bytes:1000+48+16*8*4+77+4+11,count:7},'the second view of one buffer holds it but adds no bytes');
 assert.deepEqual(retainedSourceBytes(null),{bytes:0,count:0});
});

test('the recorder and the record metadata carry the retained figure',()=>{
 const mib=1048576,file=new Uint8Array(3*mib);
 const engine={getLoadedTexturesCache:()=>[{width:2048,height:2048,format:Constants.TEXTUREFORMAT_COMPRESSED_RGBA_ASTC_4x4,generateMipMaps:true,url:'content/x.ktx2',_buffer:file}]};
 assert.equal(textureMemoryTotals(engine).retainedSourceMegabytes,3);
 assert.equal(textureMemoryTotals(engine).retainedSources,1);
 const report=estimateTextureMemory(engine);
 assert.equal(report.retainedSourceMegabytes,3);assert.equal(report.largest[0].retainedSourceMegabytes,3);
});
