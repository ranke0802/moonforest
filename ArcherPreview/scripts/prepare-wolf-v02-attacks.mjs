import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {projectPath,sourcePath} from '../../Sources/resolve-source.mjs';
const id='wolf-v02-attacks-r9',relative='Sources/actors/tripo-monsters/'+id,registryPath=projectPath('Sources/source-inputs.json'),registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
registry.directories[id]=relative;fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
const directory=sourcePath(id),bytes=fs.readFileSync(path.join(directory,'clips.json')),data=JSON.parse(bytes);
const sourceHash=createHash('sha256').update(bytes).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8')),validationBytes=fs.readFileSync(path.join(directory,manifest.validation)),validation=JSON.parse(validationBytes);
if(manifest.clipsJsonSha256!==sourceHash||validation.clipsJsonSha256!==sourceHash||manifest.validationSha256!==createHash('sha256').update(validationBytes).digest('hex')||manifest.boneCount!==28||manifest.restNodeTRSMaximumError>1e-6)throw Error('Authored wolf source differs from its reviewed deformation proof');
const approved=JSON.parse(fs.readFileSync(projectPath('ArcherPreview/public/assets/alpha-wolf.json'),'utf8'));
if(data.sourceSha256!==approved.sourceSha256||data.clips.length<1||data.clips.length>2||bytes.length>2_000_000)throw Error('Authored wolf sidecar is outside its approved source/budget');
for(const clip of data.clips){
 if(!['Wolf_Snap_Bite_V02','Wolf_Forepaw_Swipe_V02'].includes(clip.name)||clip.duration<=0||clip.duration>1.5||clip.channels.length>100||clip.channels.length<20)throw Error('Invalid authored wolf clip');
 if(clip.rootTrack.length<2||clip.yawTrack.length!==clip.rootTrack.length)throw Error('Missing authored root metadata');
}
// Constant TRS channels need their two endpoints, not sixty copies of the
// exact same vector/quaternion. Moving channels remain byte-value equivalent.
const prepared=structuredClone(data);let originalKeys=0,runtimeKeys=0;
for(const clip of prepared.clips)for(const channel of clip.channels){
 originalKeys+=channel.times.length;const first=channel.values[0];
 if(channel.values.every(value=>value.length===first.length&&value.every((n,i)=>Object.is(n,first[i])))){
  channel.times=[channel.times[0],channel.times.at(-1)];channel.values=[channel.values[0],channel.values.at(-1)];
 }
 runtimeKeys+=channel.times.length;
}
prepared.preparation={sourceDataSha256:createHash('sha256').update(bytes).digest('hex'),constantChannels:'Exact duplicate values reduced to first/last keys only; no quantization',originalKeys,runtimeKeys};
const runtime=projectPath('ArcherPreview/src/wolf-v02-attack-clips.json'),runtimeBytes=Buffer.from(JSON.stringify(prepared)+'\n');fs.writeFileSync(runtime,runtimeBytes);
let count=0;
function register(folder){
 for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  const file=path.join(folder,entry.name),real=fs.realpathSync(file);if(!real.startsWith(directory+path.sep))throw Error('Source link leaves registered directory');
  if(entry.isDirectory()){register(file);continue;}if(!entry.isFile())throw Error('Source must be physical: '+file);
  const content=fs.readFileSync(file),rel=path.relative(projectPath(''),file).replaceAll('\\','/'),item={id:'file:'+rel,path:rel,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex'),origins:['New short attacks authored on registered wolf-attack-r8; original geometry, UVs, weights, bind and textures preserved'],requiredBy:['moonforest-0.2-wolf-authored-attacks'],status:'bundled'},index=registry.inputs.findIndex(row=>row.id===item.id);
  if(index<0)registry.inputs.push(item);else registry.inputs[index]=item;count++;
 }
}
register(directory);fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
console.log(JSON.stringify({source:id,runtime:path.relative(projectPath(''),runtime),runtimeBytes:runtimeBytes.length,originalKeys,runtimeKeys,clips:data.clips.map(c=>({name:c.name,duration:c.duration,channels:c.channels.length})),registered:count}));
