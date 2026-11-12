import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sourcePath,projectPath,toolPath} from '../../Sources/resolve-source.mjs';
import {splitGlb,hash} from './resource-pack.js';
import {compressMeshopt} from './meshopt-lossless.js';
import {WOLF_BALANCE,WOLF_CLIPS,WOLF_VERSION,WOLF_SCALE} from '../src/wolf-spec.js';

const source=sourcePath('wolf-attack-r8'),out=projectPath('Sources/actors/tripo-monsters/wolf-game-r8'),assets=projectPath('ArcherPreview/public/assets'),content=path.join(assets,'content');fs.mkdirSync(out,{recursive:true});fs.mkdirSync(content,{recursive:true});
const bytes=fs.readFileSync(path.join(source,'models/alpha-wolf-attack-r8.glb')),meta=JSON.parse(fs.readFileSync(path.join(source,'manifest.json')));if(hash(bytes)!==meta.modelSha256)throw Error('R8 source hash differs');
const split=splitGlb(bytes,{baseColorOnly:true});const original=split.gltf,root=original.nodes.findIndex(n=>n.name==='root');
// Only root TRS is sampled into gameplay metadata; all original accessors,
// body translation keys and Breath channels remain in the lossless model.
function values(index){const a=original.accessors[index],view=original.bufferViews[a.bufferView],buffer=split.files.get(original.buffers[view.buffer].uri).data,width={SCALAR:1,VEC3:3,VEC4:4}[a.type],offset=(view.byteOffset??0)+(a.byteOffset??0);return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>buffer.readFloatLE(offset+i*(view.byteStride??width*4)+k*4)));}
function sampler(animation,target){const c=animation.channels.find(c=>c.target.node===root&&c.target.path===target),s=animation.samplers[c.sampler],times=values(s.input).map(v=>v[0]),points=values(s.output);return t=>{let i=0;while(i<times.length-2&&t>times[i+1])i++;const q=Math.max(0,Math.min(1,(t-times[i])/Math.max(1e-9,times[Math.min(i+1,times.length-1)]-times[i])));return points[i].map((v,k)=>v+(points[Math.min(i+1,points.length-1)][k]-v)*q);};}
const catalog=original.animations.map(animation=>{const c=meta.clips.find(c=>c.id===animation.name),p=sampler(animation,'translation'),r=sampler(animation,'rotation'),count=Math.round(c.seconds*30)+1,rootTrack=[],yawTrack=[];for(let i=0;i<count;i++){const t=Math.min(c.seconds,i/30),q=r(t);rootTrack.push(p(t));yawTrack.push(Math.atan2(2*(q[3]*q[1]+q[0]*q[2]),1-2*(q[1]*q[1]+q[2]*q[2])));}return {name:c.id,duration:c.seconds,fps:30,rootTrack,yawTrack,groundTrack:Array(count).fill(0)};});
const image=original.images[0],imageBytes=split.files.get(image.uri).data,jpeg=path.join(out,'albedo-source.jpg'),png=path.join(out,'albedo-source.png'),texture=path.join(out,'albedo-4k-uastc.ktx2');fs.writeFileSync(jpeg,imageBytes);
if(!fs.existsSync(texture)){
 if(!fs.existsSync(png))execFileSync(toolPath('python'),['-c','from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2])',jpeg,png]);
 execFileSync(process.env.KTX_EXE??'C:/Program Files/KTX-Software/bin/ktx.exe',['create','--format','R8G8B8_SRGB','--assign-tf','srgb','--assign-primaries','bt709','--assign-texcoord-origin','top-left','--generate-mipmap','--encode','uastc','--uastc-quality','4','--zstd','18','--threads','4',png,texture],{stdio:'inherit'});
}
execFileSync(process.env.KTX_EXE??'C:/Program Files/KTX-Software/bin/ktx.exe',['validate',texture],{stdio:'inherit'});
const tex=fs.readFileSync(texture),texName=hash(tex)+'.ktx2';split.files.set(texName,{data:tex});original.images=[{uri:texName,mimeType:'image/ktx2'}];for(const t of original.textures){const source=t.source;t.extensions={...t.extensions,KHR_texture_basisu:{source}};delete t.source;}
for(const key of ['extensionsUsed','extensionsRequired'])original[key]=[...new Set([...(original[key]??[]),'KHR_texture_basisu'])];
const packed=await compressMeshopt(original,split.files);for(const [name,file]of packed.files)fs.writeFileSync(path.join(content,name),file.data);
const config={name:'우두머리 늑대',version:WOLF_VERSION,sourceAssetId:'wolf-attack-r8',sourceSha256:hash(bytes),scale:WOLF_SCALE,height:1.5*WOLF_SCALE,animations:Object.fromEntries(Object.values(WOLF_CLIPS).map(name=>[name,name])),catalog,model:'./content/'+packed.model,resources:[...packed.files.keys()].map(name=>'./content/'+name),balance:WOLF_BALANCE,rendering:meta.rendering,texture:{width:4096,height:4096,format:'KTX2 UASTC sRGB',sourceSha256:hash(imageBytes),runtimeSha256:hash(tex)},geometryCompression:packed.stats};
fs.writeFileSync(path.join(assets,'alpha-wolf.json'),JSON.stringify(config,null,2)+'\n');fs.writeFileSync(path.join(out,'runtime-manifest.json'),JSON.stringify(config,null,2)+'\n');
fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify({sourceAssetId:'wolf-attack-r8',sourceSha256:hash(bytes),meshUvWeightsNormalsJointsMorphsAndAllTwelveClips:'Lossless Meshopt; no filters, quantization or reordering',textures:'4K UASTC without RDO; source JPEG preserved separately',runtimeModel:packed.model,geometryCompression:packed.stats},null,2)+'\n');
console.log(JSON.stringify({model:packed.model,resources:packed.files.size,bytes:[...packed.files.values()].reduce((n,f)=>n+f.data.length,0),geometry:packed.stats}));
