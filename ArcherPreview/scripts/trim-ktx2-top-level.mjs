// Drops the largest mip level of a supercompressed KTX2 (UASTC + Zstd or none): a 4096 texture with a
// full mip chain becomes the 2048 one the encoder already made, byte for byte (no re-encoding).
// Usage: node scripts/trim-ktx2-top-level.mjs <in.ktx2> <outDir>  → writes <sha256>.ktx2, prints JSON.
// Used for regular (non-boss) monsters in 0.3 (2026-11-23): their 4K level is never on screen at a
// size that needs it, and it was 3/4 of the download, the cache read and the GPU memory.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';

const MAGIC=Buffer.from([0xab,0x4b,0x54,0x58,0x20,0x32,0x30,0xbb,0x0d,0x0a,0x1a,0x0a]);
export function trimTopLevel(input){
  const data=Buffer.from(input);
  if(!data.subarray(0,12).equals(MAGIC))throw new Error('not a KTX2 file');
  const u32=offset=>data.readUInt32LE(offset),u64=offset=>Number(data.readBigUInt64LE(offset));
  const [vkFormat,typeSize,width,height,depth,layers,faces,levels,scheme]=Array.from({length:9},(_,i)=>u32(12+i*4));
  if(levels<2)throw new Error('needs at least two mip levels');
  if(depth>1||layers>1||faces!==1)throw new Error('only plain 2D textures');
  if(scheme===1)throw new Error('BasisLZ (ETC1S) keeps a shared codebook: not handled here');
  const dfdOffset=u32(48),dfdLength=u32(52),kvdOffset=u32(56),kvdLength=u32(60),sgdLength=u64(72);
  if(sgdLength)throw new Error('unexpected supercompression global data');
  const index=Array.from({length:levels},(_,i)=>({offset:u64(80+i*24),length:u64(88+i*24),raw:u64(96+i*24)}));
  const kept=index.slice(1),dfd=data.subarray(dfdOffset,dfdOffset+dfdLength),kvd=data.subarray(kvdOffset,kvdOffset+kvdLength);
  const head=80+kept.length*24,newDfd=head,newKvd=newDfd+dfd.length;
  // Level data, smallest first as the format orders it. Supercompressed levels need no alignment;
  // uncompressed UASTC keeps the 16-byte block alignment.
  const align=scheme===0?16:1;let cursor=newKvd+kvd.length;const placed=[];
  for(let level=kept.length-1;level>=0;level--){cursor=Math.ceil(cursor/align)*align;placed[level]=cursor;cursor+=kept[level].length;}
  const out=Buffer.alloc(cursor);MAGIC.copy(out,0);
  [vkFormat,typeSize,Math.max(1,width>>1),Math.max(height?1:0,height>>1),depth,layers,faces,levels-1,scheme].forEach((v,i)=>out.writeUInt32LE(v,12+i*4));
  out.writeUInt32LE(newDfd,48);out.writeUInt32LE(dfd.length,52);out.writeUInt32LE(kvd.length?newKvd:0,56);out.writeUInt32LE(kvd.length,60);
  out.writeBigUInt64LE(0n,64);out.writeBigUInt64LE(0n,72);
  kept.forEach((level,i)=>{out.writeBigUInt64LE(BigInt(placed[i]),80+i*24);out.writeBigUInt64LE(BigInt(level.length),88+i*24);out.writeBigUInt64LE(BigInt(level.raw),96+i*24);
    data.copy(out,placed[i],level.offset,level.offset+level.length);});
  dfd.copy(out,newDfd);kvd.copy(out,newKvd);
  return {bytes:out,width:width>>1,height:height>>1,levels:levels-1};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [source,dir]=process.argv.slice(2);if(!source||!dir){console.error('usage: trim-ktx2-top-level.mjs <in.ktx2> <outDir>');process.exit(2);}
  const result=trimTopLevel(readFileSync(source)),sha=createHash('sha256').update(result.bytes).digest('hex');
  mkdirSync(dir,{recursive:true});writeFileSync(join(dir,sha+'.ktx2'),result.bytes);
  console.log(JSON.stringify({source,file:sha+'.ktx2',bytes:result.bytes.length,width:result.width,height:result.height,levels:result.levels}));
}
