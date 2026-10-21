import {readFileSync,writeFileSync} from 'node:fs';
import {splitGlb,hash} from './resource-pack.js';
const root=new URL('../public/assets/',import.meta.url);
const assets=['azure-elf.glb','violet-warrior.glb','violet-warrior-v2.glb'];
const packs=assets.map(file=>splitGlb(readFileSync(new URL(file,root))));
for(let i=0;i<assets.length;i++){
 const bytes=readFileSync(new URL(assets[i],root)),n=bytes.readUInt32LE(12),g=JSON.parse(bytes.toString('utf8',20,20+n)),p=packs[i];
 // Every accessor byte and image survives split packaging, including sparse payloads.
 for(let a=0;a<g.accessors.length;a++)for(const get of [v=>v,v=>v.sparse?.indices,v=>v.sparse?.values]){
  const old=get(g.accessors[a]),next=get(p.gltf.accessors[a]);if(old?.bufferView===undefined)continue;
  const ov=g.bufferViews[old.bufferView],nv=p.gltf.bufferViews[next.bufferView],buffer=p.files.get(p.gltf.buffers[nv.buffer].uri).data;
  if(!bytes.subarray(28+n+(ov.byteOffset||0),28+n+(ov.byteOffset||0)+ov.byteLength).equals(buffer.subarray(nv.byteOffset,nv.byteOffset+nv.byteLength)))throw new Error('Accessor changed');
 }
}
function channels(file){const b=readFileSync(new URL(file,root)),n=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+n));
 const value=i=>{const a=g.accessors[i],v=g.bufferViews[a.bufferView],start=28+n+(v.byteOffset||0)+(a.byteOffset||0);return b.subarray(start,start+a.count*({SCALAR:1,VEC3:3,VEC4:4}[a.type])*4);};
 return new Map(g.animations.flatMap(a=>a.channels.map(c=>[`${a.name}/${g.nodes[c.target.node].name}/${c.target.path}`,Buffer.concat([value(a.samplers[c.sampler].input),value(a.samplers[c.sampler].output)])])));
}
const old=channels(assets[1]),v2=channels(assets[2]);let preserved=0,maxDifference=0;
for(const [key,b]of old){if(!/^(Run_03|Thrust_Slash)\//.test(key)||key.includes('/Golden_Oathblade/'))continue;const next=v2.get(key);if(!next||next.length!==b.length)throw new Error('Missing original channel '+key);for(let i=0;i<b.length;i+=4)maxDifference=Math.max(maxDifference,Math.abs(b.readFloatLE(i)-next.readFloatLE(i)));preserved++;}
if(maxDifference>1e-6)throw new Error('Original run/attack changed '+maxDifference);
const shared=[...packs[2].files].filter(([n])=>packs[1].files.has(n)).reduce((n,[,f])=>n+f.data.length,0),extra=[...packs[2].files].filter(([n])=>!packs[1].files.has(n)).reduce((n,[,f])=>n+f.data.length,0);
const report={preservedOriginalBodyChannels:preserved,maxDifference,sharedWarriorBytes:shared,newV2Bytes:extra,models:assets,allAccessorBytesPreserved:true};
writeFileSync(new URL('../resource-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(report);
