import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {projectPath} from '../../Sources/resolve-source.mjs';
const id='wolf-v02-momentum-r14',relative='Sources/actors/tripo-monsters/'+id,directory=projectPath(relative),hash=b=>createHash('sha256').update(b).digest('hex');
const registryPath=projectPath('Sources/source-inputs.json'),registry=JSON.parse(fs.readFileSync(registryPath)),approved=JSON.parse(fs.readFileSync(projectPath('ArcherPreview/public/assets/alpha-wolf.json')));
const base=fs.realpathSync(projectPath('')),real=fs.realpathSync(directory),rel=path.relative(base,real);
if(fs.lstatSync(directory).isSymbolicLink()||path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep))throw Error('R14 source must be physical and portable');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),clipBytes=fs.readFileSync(path.join(directory,'clips.json')),data=JSON.parse(clipBytes),overlayBytes=fs.readFileSync(path.join(directory,'run-ram-overlay.json')),overlay=JSON.parse(overlayBytes);
const proofBytes=fs.readFileSync(path.join(directory,manifest.validation)),proof=JSON.parse(proofBytes);
if(manifest.assetId!==id||manifest.boneCount!==28||manifest.clipsJsonSha256!==hash(clipBytes)||manifest.validationSha256!==hash(proofBytes)||manifest.sourceMeshesAndOriginal12ActionsUnchanged!==true||manifest.restNodeTRSMaximumError>1e-6||proof.clipsJsonSha256!==hash(clipBytes))throw Error('R14 source/deformation evidence mismatch');
if(data.sourceSha256!==approved.sourceSha256||data.clips.length!==1||clipBytes.length>8_000_000||overlayBytes.length>1_000_000)throw Error('R14 source/budget mismatch');
const clip=data.clips[0];if(clip.name!=='Wolf_Airborne_Knockback_Land_V02'||Math.abs(clip.duration-1.65)>1e-6||clip.channels.length!==84)throw Error('R14 reaction interface mismatch');
const properties=new Set();
for(const c of clip.channels){
 const key=c.node+'/'+c.path;if(properties.has(key)||!['translation','rotation','scale'].includes(c.path)||c.times.length!==c.values.length||c.times.length<2)throw Error('Invalid R14 channel '+key);properties.add(key);
 for(let i=0;i<c.times.length;i++)if(!Number.isFinite(c.times[i])||c.times[i]<0||c.times[i]>clip.duration+1e-6||i&&c.times[i]<=c.times[i-1]||c.values[i].length!==(c.path==='rotation'?4:3)||!c.values[i].every(Number.isFinite))throw Error('Invalid R14 key '+key);
 if(c.path==='scale'&&c.values.some(v=>v.some((n,i)=>Math.abs(n-c.values[0][i])>1e-6)))throw Error('R14 cannot stretch bone scale '+key);
}
// Partial RUN deltas are data, never absolute AnimationGroup tracks. The
// author's validation binds both tables to the same unchanged approved rig.
const expectedOverlay=manifest.overlaySha256??manifest.runRamOverlaySha256??manifest.runRamOverlayJsonSha256;
if(expectedOverlay!==hash(overlayBytes))throw Error('R14 overlay hash mismatch');
if(overlay.sourceSha256&&overlay.sourceSha256!==approved.sourceSha256)throw Error('R14 overlay rig mismatch');
if(overlay.boneCount!==28||overlay.sourceClip!=='Wolf_Run_R5'||overlay.duration!==.6||overlay.composition!=='sampledLocal * phaseDeltaWeighted'||overlay.channels.length!==3||Math.abs(overlay.sourcePhaseDuration-17/30)>1e-8)throw Error('R14 partial overlay contract mismatch');
const allowed=new Set(['neck','head','jaw']);
for(const c of overlay.channels){if(!allowed.delete(c.node)||c.path!=='rotationDelta'||c.values.length!==overlay.phaseTimes.length||c.values.some(v=>v.length!==4||!v.every(Number.isFinite))||c.values[0].some((v,i)=>v!==c.values.at(-1)[i]))throw Error('Invalid R14 run layer or loop seam '+c.node);}
if(overlay.envelope.weights[0]!==0||overlay.envelope.weights.at(-1)!==0||overlay.envelope.times.length!==overlay.envelope.weights.length)throw Error('R14 overlay must enter/leave nativeRUN exactly');
const prepared=structuredClone(data);let originalKeys=0,runtimeKeys=0;
for(const c of prepared.clips[0].channels){originalKeys+=c.times.length;const first=c.values[0];if(c.values.every(v=>v.every((n,i)=>Object.is(n,first[i])))){c.times=[c.times[0],c.times.at(-1)];c.values=[c.values[0],c.values.at(-1)];}runtimeKeys+=c.times.length;}
prepared.preparation={sourceDataSha256:hash(clipBytes),constantChannels:'Only bit-identical constant channels compressed; all moving keys, root/yaw and timing preserved.',originalKeys,runtimeKeys};
const runtime=projectPath('ArcherPreview/src/wolf-v02-momentum-r14-clips.json');fs.writeFileSync(runtime,JSON.stringify(prepared)+'\n');fs.writeFileSync(projectPath('ArcherPreview/src/wolf-v02-run-ram-overlay.json'),overlayBytes);
let registered=0;
function registerTree(folder,requiredBy,origin){const physical=fs.realpathSync(folder);function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 if(e.name==='__pycache__'||/\.blend\d+$/.test(e.name)||e.name.endsWith('.log'))continue;
 const file=path.join(dir,e.name),actual=fs.realpathSync(file);if(!actual.startsWith(physical+path.sep))throw Error('R14 source leaves its physical directory');
 if(e.isDirectory()){visit(file);continue;}if(!e.isFile())throw Error('Non-physical R14 source');const bytes=fs.readFileSync(file),p=path.relative(base,file).replaceAll('\\','/'),entry={id:'file:'+p,path:p,bytes:bytes.length,sha256:hash(bytes),origins:[origin],requiredBy:[requiredBy],status:'bundled'};
 const i=registry.inputs.findIndex(row=>row.id===entry.id);if(i<0)registry.inputs.push(entry);else registry.inputs[i]=entry;registered++;
 }}visit(folder);}
if(!process.argv.includes('--runtime-only')){
 registry.directories[id]=relative;registerTree(directory,'moonforest-0.2-wolf-momentum-r14','R14 animation-only derivative of approved R8 rig and R13 support poses: continuous-RUN neck/head/jaw overlay and airborne reaction. Original mesh/UV/normals/weights/binds/4K textures and12clips preserved.');
 registry.directories['wolf-combat-r14-approved-reference']='Sources/references/wolf-combat-r14';registerTree(projectPath('Sources/references/wolf-combat-r14'),'moonforest-0.2-wolf-momentum-r14-review','User-approved visual motion direction, two concept boards. Reference only; not game art or implementation evidence.');
 fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
}
console.log(JSON.stringify({source:id,runtimeBytes:fs.statSync(runtime).size,overlayBytes:overlayBytes.length,originalKeys,runtimeKeys,registered,validationHash:hash(proofBytes),clips:data.clips.map(c=>({name:c.name,duration:c.duration}))}));
