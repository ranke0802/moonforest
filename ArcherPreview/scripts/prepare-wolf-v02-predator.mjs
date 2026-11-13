import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {projectPath,sourcePath} from '../../Sources/resolve-source.mjs';

const id='wolf-v02-predator-r11',relative='Sources/actors/tripo-monsters/'+id;
const registryPath=projectPath('Sources/source-inputs.json'),registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
registry.directories[id]=relative;registry.directories['wolf-predator-r11-review-reference']='Sources/references/wolf-predator-r11';
fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
const directory=sourcePath(id),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=fs.readFileSync(path.join(directory,'clips.json')),data=JSON.parse(bytes),manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
const proofBytes=fs.readFileSync(path.join(directory,manifest.validation)),proof=JSON.parse(proofBytes);
if(manifest.assetId!==id||manifest.clipsJsonSha256!==hash(bytes)||proof.clipsJsonSha256!==hash(bytes)||manifest.validationSha256!==hash(proofBytes)||manifest.boneCount!==28||manifest.restNodeTRSMaximumError>1e-6||manifest.sourceMeshesAndOriginal12ActionsUnchanged!==true)throw Error('R11 source differs from its deformation evidence');
const approved=JSON.parse(fs.readFileSync(projectPath('ArcherPreview/public/assets/alpha-wolf.json')));
const expected=new Set(['Wolf_Predator_Diagonal_Bite_V02','Wolf_Predator_Reverse_Bite_V02','Wolf_Backward_Brace_V02','Wolf_Staggered_Collapse_V02']);
if(data.sourceSha256!==approved.sourceSha256||data.clips.length!==expected.size||bytes.length>5_000_000)throw Error('R11 clip source/budget mismatch');
for(const clip of data.clips){
 if(!expected.delete(clip.name)||clip.duration<=0||clip.duration>2.5||clip.channels.length>100||clip.channels.length<20||clip.rootTrack.length<2||clip.yawTrack.length!==clip.rootTrack.length)throw Error('Invalid R11 clip: '+clip.name);
 const channels=new Set();
 for(const c of clip.channels){
  const key=c.node+'/'+c.path;if(channels.has(key)||!['translation','rotation','scale'].includes(c.path)||c.times.length!==c.values.length||c.times.length<2)throw Error('Invalid R11 channel: '+key);channels.add(key);
  for(let i=0;i<c.times.length;i++)if(!Number.isFinite(c.times[i])||c.times[i]<0||c.times[i]>clip.duration+1e-6||i&&c.times[i]<=c.times[i-1]||c.values[i].length!==(c.path==='rotation'?4:3)||!c.values[i].every(Number.isFinite))throw Error('Invalid R11 key: '+key);
  if(c.path==='scale'&&c.values.some(v=>v.some((n,i)=>Math.abs(n-c.values[0][i])>1e-5)))throw Error('R11 cannot stretch bone scales: '+key);
 }
}
const prepared=structuredClone(data);let originalKeys=0,runtimeKeys=0;
for(const clip of prepared.clips)for(const c of clip.channels){originalKeys+=c.times.length;const first=c.values[0];if(c.values.every(v=>v.every((n,i)=>Object.is(n,first[i])))){c.times=[c.times[0],c.times.at(-1)];c.values=[c.values[0],c.values.at(-1)];}runtimeKeys+=c.times.length;}
prepared.preparation={sourceDataSha256:hash(bytes),constantChannels:'Exact duplicate values only; every moving key, contact phase and root/yaw retained',originalKeys,runtimeKeys};
const runtime=projectPath('ArcherPreview/src/wolf-v02-predator-clips.json');fs.writeFileSync(runtime,JSON.stringify(prepared)+'\n');
let registered=0;
function registerTree(folder,requiredBy){
 const base=fs.realpathSync(folder);
 function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(e.name==='__pycache__'||/\.blend\d+$/.test(e.name))continue;
  const file=path.join(dir,e.name),real=fs.realpathSync(file);if(!real.startsWith(base+path.sep))throw Error('Source leaves its physical directory');
  if(e.isDirectory()){visit(file);continue;}if(!e.isFile())throw Error('Source must be a physical file');
  const content=fs.readFileSync(file),rel=path.relative(projectPath(''),file).replaceAll('\\','/');
  const referenceOrigin=e.name==='review-input.mp4'?'User-provided 2026-11-13 gameplay review, copied into canonical workspace':e.name==='mission-wolf-rest-reference.jpg'?'Mission:Wolf Skinwalker photo, research-only pose reference; no game texture or public report reuse':e.name==='relaxed-collapse-concept.png'?'Built-in image_gen pose concept created before R11 collapse authoring; canonical copy, see concept-provenance.json':'R11 animation reference study and provenance, see research-notes.json and concept-provenance.json';
  const entry={id:'file:'+rel,path:rel,bytes:content.length,sha256:hash(content),origins:[requiredBy==='wolf-predator-r11-review'?referenceOrigin:'New R11 animation-only derivative; unchanged R8 mesh, UVs, normals, weights, binds and 4K texture'],requiredBy:[requiredBy],status:'bundled'};
  const i=registry.inputs.findIndex(row=>row.id===entry.id);if(i<0)registry.inputs.push(entry);else registry.inputs[i]=entry;registered++;
 }}visit(folder);
}
registerTree(directory,'moonforest-0.2-wolf-predator-r11');registerTree(sourcePath('wolf-predator-r11-review-reference'),'wolf-predator-r11-review');
fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
console.log(JSON.stringify({source:id,runtimeBytes:fs.statSync(runtime).size,originalKeys,runtimeKeys,registered,clips:data.clips.map(c=>({name:c.name,duration:c.duration}))}));
