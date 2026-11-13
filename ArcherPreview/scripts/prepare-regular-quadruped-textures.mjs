import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {projectRoot,sourcePath} from '../../Sources/resolve-source.mjs';

const output=path.join(projectRoot,'Sources/actors/tripo-monsters/regular-quadruped-textures-r1'),cache=path.join(projectRoot,'.cache/regular-quadruped-textures-r1');
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(cache,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),quote=value=>value.replaceAll("'","''");
const ktx=process.env.KTX_EXE??'ktx',manifest={version:1,profile:{codec:'uastc',quality:2,zstd:18,mipmaps:true,sourceResolutionPreserved:true,sourcePixels:'Original JPEG retained in authoring GLB; runtime GPU block encoding is perceptually lossy, not pixel-identical.'},textures:{}};
for(const id of ['gray-wolf','stylized-wolf','wolf-3','fox','boar']){
 const original=sourcePath('tripo-monsters-2026-11-11-v2','originals',id+'.glb'),glb=fs.readFileSync(original),jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.subarray(20,20+jsonLength)),view=gltf.bufferViews[gltf.images[0].bufferView];
 const image=glb.subarray(28+jsonLength+(view.byteOffset??0),28+jsonLength+(view.byteOffset??0)+view.byteLength),jpeg=path.join(cache,id+'.jpg'),png=path.join(cache,id+'.png'),target=path.join(output,id+'.ktx2');
 fs.writeFileSync(jpeg,image);
 const input=fs.readFileSync(original);if(hash(input)!==hash(glb))throw Error('Original changed during preparation');
 const command=`Add-Type -AssemblyName System.Drawing; $quadBitmap=[System.Drawing.Bitmap]::new('${quote(jpeg)}'); try { $quadBitmap.Save('${quote(png)}',[System.Drawing.Imaging.ImageFormat]::Png) } finally { $quadBitmap.Dispose() }`;
 if(process.platform==='win32')execFileSync('powershell',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:'pipe'});
 else execFileSync(process.env.PYTHON_EXE??'python3',['-c','from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2])',jpeg,png],{stdio:'pipe'});
 console.log('Preparing 4K UASTC: '+id);
 execFileSync(ktx,['create','--format','R8G8B8_SRGB','--assign-tf','srgb','--assign-primaries','bt709','--assign-texcoord-origin','top-left','--generate-mipmap','--encode','uastc','--uastc-quality','2','--zstd','18','--threads','2',png,target],{windowsHide:true,stdio:'pipe'});
 execFileSync(ktx,['validate',target],{windowsHide:true,stdio:'pipe'});
 const bytes=fs.readFileSync(target),width=bytes.readUInt32LE(20),height=bytes.readUInt32LE(24),levels=bytes.readUInt32LE(40);
 if(width!==4096||height!==4096||levels!==13)throw Error('Unexpected texture dimensions/mips');
 let gpuBlockBytes=0,rgbaBytes=0;for(let i=0;i<levels;i++){const w=Math.max(1,width>>i),h=Math.max(1,height>>i);gpuBlockBytes+=Math.ceil(w/4)*Math.ceil(h/4)*16;rgbaBytes+=w*h*4;}
 manifest.textures[id]={file:id+'.ktx2',sha256:hash(bytes),bytes:bytes.length,sourceImageSha256:hash(image),sourceOriginal:path.relative(projectRoot,original).replaceAll('\\','/'),width,height,levels,gpuBlockBytes,rgbaBytes};
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({id,bytes:bytes.length,width,height,gpuBlockBytes,rgbaBytes}));
}
