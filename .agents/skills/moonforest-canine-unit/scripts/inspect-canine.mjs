import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const fail=message=>{throw new Error(message);};
const finiteVector=(value,width)=>Array.isArray(value)&&value.length===width&&value.every(Number.isFinite);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const near=(a,b)=>Math.abs(a-b)<=1e-5*Math.max(1,Math.abs(a),Math.abs(b));

export function inspectSidecar(data){
 if(!Array.isArray(data.clips)||!data.clips.length)fail('Animation sidecar has no clips');
 const names=new Set(),summary=[];
 for(const clip of data.clips){
  if(typeof clip.name!=='string'||!clip.name||names.has(clip.name))fail('Missing or duplicate clip name');names.add(clip.name);
  if(!Number.isFinite(clip.duration)||clip.duration<=0||!Number.isFinite(clip.fps)||clip.fps<=0)fail('Invalid duration/fps: '+clip.name);
  if(!Array.isArray(clip.channels)||!clip.channels.length)fail('Missing animation channels: '+clip.name);
  const targets=new Set();let keys=0,maximumScaleExcursion=0;
  for(const channel of clip.channels){
   const width=channel.path==='rotation'?4:['translation','scale'].includes(channel.path)?3:0;
   const id=channel.node+'/'+channel.path;
   if(!width||typeof channel.node!=='string'||!channel.node||targets.has(id))fail('Unsupported or duplicate target: '+id);targets.add(id);
   if(!Array.isArray(channel.times)||!Array.isArray(channel.values)||channel.times.length<2||channel.times.length!==channel.values.length)fail('Incomplete keys: '+id);
   for(let i=0;i<channel.times.length;i++){
    const time=channel.times[i],value=channel.values[i];
    if(!Number.isFinite(time)||time<0||time>clip.duration+1e-5||(i&&time<=channel.times[i-1])||!finiteVector(value,width))fail('Invalid or unordered key: '+id);
    if(channel.path==='rotation'&&Math.abs(Math.hypot(...value)-1)>1e-4)fail('Non-unit quaternion: '+id);
    if(channel.path==='scale')for(let j=0;j<3;j++){
     const first=channel.values[0][j];if(Math.abs(first)<1e-8)fail('Zero bone scale: '+id);
     maximumScaleExcursion=Math.max(maximumScaleExcursion,Math.abs(value[j]/first-1));
     if(!near(value[j],first))fail('Animated bone scale requires separate review: '+id);
    }
   }
   keys+=channel.times.length;
  }
  if(!Array.isArray(clip.rootTrack)||clip.rootTrack.length<2||!clip.rootTrack.every(v=>finiteVector(v,3))||!Array.isArray(clip.yawTrack)||clip.yawTrack.length!==clip.rootTrack.length||!clip.yawTrack.every(Number.isFinite))fail('Missing/invalid root-yaw metadata: '+clip.name);
  summary.push({name:clip.name,duration:clip.duration,channels:clip.channels.length,keys,maximumScaleExcursion});
 }
 return {kind:'animation-sidecar',clips:summary,scope:'Finite ordered TRS/root keys and material scale excursion; not skin/UV/contact or performance certification'};
}

export function inspectGlb(bytes){
 if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)fail('Invalid GLB 2 header');
 let json,bin;for(let offset=12;offset<bytes.length;){
  if(offset+8>bytes.length)fail('Truncated GLB chunk');const size=bytes.readUInt32LE(offset),kind=bytes.readUInt32LE(offset+4);offset+=8;
  if(offset+size>bytes.length)fail('GLB chunk exceeds file');const chunk=bytes.subarray(offset,offset+size);offset+=size;
  if(kind===0x4e4f534a)json=JSON.parse(chunk.toString('utf8'));else if(kind===0x004e4942)bin=chunk;
 }
 if(!json?.nodes?.length||!json.skins?.length)fail('GLB needs skinned nodes');
 const nodes=json.nodes,clipNames=new Set();let triangles=0,primitives=0,morphTargets=0;
 const counts={};
 for(const mesh of json.meshes??[])for(const p of mesh.primitives??[]){
  primitives++;if((p.mode??4)!==4)fail('Only triangle primitives are counted by this helper');
  const count=json.accessors[p.indices??p.attributes?.POSITION]?.count;
  if(!Number.isInteger(count)||count%3)fail('Invalid triangle accessor');triangles+=count/3;
  morphTargets=Math.max(morphTargets,p.targets?.length??0);
 }
 for(const skin of json.skins){if(!Array.isArray(skin.joints)||skin.joints.some(j=>!Number.isInteger(j)||!nodes[j]))fail('Invalid skin joints');}
 for(const animation of json.animations??[]){
  if(!animation.name||clipNames.has(animation.name))fail('Missing/duplicate animation name');clipNames.add(animation.name);
  for(const channel of animation.channels??[]){
   if(!nodes[channel.target?.node]||!animation.samplers[channel.sampler])fail('Invalid animation target/sampler');
   const role=channel.target.path;counts[role]=(counts[role]??0)+1;
  }
 }
 return {kind:'skinned-glb',triangles,primitives,materials:json.materials?.length??0,joints:json.skins.map(s=>s.joints.length),morphTargets,clips:[...clipNames],channels:counts,hasEmbeddedBinary:!!bin,scope:'GLB structure/counts only; no evaluated skin, texture appearance or combat/GPU certification'};
}

function physicalContained(project,file){
 const relative=path.relative(project,file);if(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))fail('Path escapes project');
 let cursor=project;if(fs.lstatSync(cursor).isSymbolicLink())fail('Project must be a physical directory');
 for(const part of relative.split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink())fail('Source path uses a link: '+cursor);}
 return file;
}

export async function main(args=process.argv.slice(2)){
 const options={};for(let i=0;i<args.length;i+=2){if(!['--project','--source-id','--model','--sidecar'].includes(args[i])||!args[i+1])fail('Use --project ROOT --source-id ID and exactly one of --model relative.glb / --sidecar relative.json');options[args[i]]=args[i+1];}
 if(!options['--project']||!options['--source-id']||!!options['--model']===!!options['--sidecar'])fail('Project, registered source ID and one model/sidecar are required');
 const project=path.resolve(options['--project']);physicalContained(project,path.join(project,'Sources','resolve-source.mjs'));
 const {sourcePath}=await import(pathToFileURL(path.join(project,'Sources','resolve-source.mjs')).href);
 const root=sourcePath(options['--source-id']),input=sourcePath(options['--source-id'],options['--model']??options['--sidecar']);
 const relative=path.relative(root,input);if(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))fail('Input leaves selected registered source');physicalContained(project,input);
 const bytes=fs.readFileSync(input),digest=hash(bytes),registry=JSON.parse(fs.readFileSync(path.join(project,'Sources','source-inputs.json'),'utf8'));
 const relativeInput=path.relative(project,input).replaceAll('\\','/'),registered=registry.inputs.find(row=>row.path===relativeInput);
 if(!registered||registered.bytes!==bytes.length||registered.sha256!==digest)fail('Source file missing from registry or hash/size changed: '+relativeInput);
 const result=options['--model']?inspectGlb(bytes):inspectSidecar(JSON.parse(bytes));
 return {sourceId:options['--source-id'],file:relativeInput,bytes:bytes.length,sha256:digest,registered:true,...result};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await main(),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
