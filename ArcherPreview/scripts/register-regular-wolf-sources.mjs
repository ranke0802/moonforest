import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {projectRoot} from '../../Sources/resolve-source.mjs';

const root='Sources/actors/tripo-monsters/regular-wolves-r1',originalRoot='Sources/actors/tripo-monsters/2026-11-11-v2';
const directories={'regular-wolves-r1':root,'regular-quadrupeds-r1':'Sources/actors/tripo-monsters/regular-quadrupeds-r1','regular-quadruped-textures-r1':'Sources/actors/tripo-monsters/regular-quadruped-textures-r1','tripo-monsters-2026-11-11-v2':originalRoot};
const registryPath=path.join(projectRoot,'Sources/source-inputs.json'),before=fs.readFileSync(registryPath),registry=JSON.parse(before),registered=[];
Object.assign(registry.directories,directories);
function register(relative){
 const absolute=path.join(projectRoot,relative),real=fs.realpathSync(absolute),outside=path.relative(projectRoot,real);
 if(fs.lstatSync(absolute).isSymbolicLink()||path.isAbsolute(outside)||outside==='..'||outside.startsWith('..'+path.sep))throw Error('Source must stay physically inside MoonForest: '+relative);
 const data=fs.readFileSync(absolute),old=registry.inputs.find(row=>row.path===relative);
 const row={id:'file:'+relative,path:relative,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),origins:old?.origins??['MoonForest original-colour body-fitted regular wolf rig and inherited approved canine motions, 2026-11-13'],requiredBy:[...new Set([...(old?.requiredBy??[]),'moonforest-0.2-regular-wolves-r1'])],status:'bundled'};
 if(old)Object.assign(old,row);else registry.inputs.push(row);registered.push(relative);
}
function visit(relative){
 for(const entry of fs.readdirSync(path.join(projectRoot,relative),{withFileTypes:true})){
  if(entry.name==='__pycache__'||/\.blend\d+$|\.(log|pyc)$/.test(entry.name)||entry.name.endsWith('.txt')&&!entry.name.startsWith('README'))continue;
  const child=relative+'/'+entry.name;
  if(entry.isDirectory())visit(child);else if(entry.isFile())register(child);else throw Error('Source cannot be a link: '+child);
 }
}
for(const id of ['gray-wolf','stylized-wolf','wolf-3','fox','boar'])register(originalRoot+'/originals/'+id+'.glb');
register(originalRoot+'/manifest.json');for(const [id,directory]of Object.entries(directories))if(id!=='tripo-monsters-2026-11-11-v2')visit(directory);
if(!fs.readFileSync(registryPath).equals(before))throw Error('Source registry changed concurrently; rerun after the other writer finishes');
fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
const output={sourceId:'regular-wolves-r1',directories,registered,inputs:registry.inputs.filter(row=>registered.includes(row.path))};
const report=path.join(projectRoot,'ArcherPreview/reports/regular-wolves-r1/source-registration.json');fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({sourceId:output.sourceId,files:registered.length,bytes:output.inputs.reduce((sum,row)=>sum+row.bytes,0)}));
