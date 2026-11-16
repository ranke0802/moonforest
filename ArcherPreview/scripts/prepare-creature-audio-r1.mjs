import {readFile,writeFile,mkdir,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sourcePath} from '../../Sources/resolve-source.mjs';

export const CREATURE_AUDIO_MANIFEST='audio-creatures-r1.json';
export const CREATURE_AUDIO_CREDITS='AUDIO_CREATURES_R1_CREDITS.txt';
const actions={attack:2,hurt:2,death:1,step:3,impact:2,alert:1};
const species=['wolf','fox','boar','bear'];
const expected=new Map(species.flatMap(kind=>Object.entries(actions).map(([action,count])=>[`${kind}_${action}`,count])));
const project=resolve(import.meta.dirname,'..');
const inside=(root,path)=>{const child=relative(root,path);return child&&!isAbsolute(child)&&child!=='..'&&!child.startsWith('../')&&!child.startsWith('..\\');};

// Read only registered local originals. Publishing this overlay never regenerates
// audio.json, replaces old content, or changes the shared resource bundle index.
export async function prepareCreatureAudio({sourceDirectory=sourcePath('creature-audio-r1'),outputDirectory=resolve(project,'public/assets'),baseManifestPath=resolve(project,'public/assets/audio.json')}={}){
  const root=await realpath(sourceDirectory),output=resolve(outputDirectory);
  async function input(file,extension){
    if(typeof file!=='string'||!file||isAbsolute(file)||file.includes('\\')||file.split('/').some(part=>part==='..'||part==='.'||!part))throw new Error('Unsafe creature audio source path: '+file);
    const path=resolve(root,file);
    if(!inside(root,path)||!inside(root,await realpath(path))||(await lstat(path)).isSymbolicLink())throw new Error('Creature audio source leaves its registered directory: '+file);
    if(extension&&!file.toLowerCase().endsWith('.'+extension))throw new Error('Unexpected creature audio source format: '+file);
    const data=await readFile(path);if(!data.length)throw new Error('Empty creature audio source: '+file);
    return {data,url:extension?`./content/${createHash('sha256').update(data).digest('hex')}.${extension}`:null};
  }
  const specification=JSON.parse((await input('manifest.json')).data);
  if(specification.version!==1||!specification.sounds||Object.keys(specification.sounds).length!==expected.size)throw new Error('Creature audio requires exactly the 24 species/action cues');
  if(!specification.music||Object.keys(specification.music).join()!=='alpha_wolf')throw new Error('Creature audio can add only the alpha_wolf score');
  if(Object.keys(specification.cueSettings??{}).some(key=>!expected.has(key)))throw new Error('Unexpected creature cue settings');
  const sounds={},packed=[],settings={};
  for(const [key,count]of expected){
    const value=specification.sounds[key],files=Array.isArray(value)?value:[value];
    if(files.length!==count)throw new Error(`${key} requires ${count} variant(s)`);
    const variants=[];
    for(const file of files){const asset=await input(file,'wav');packed.push(asset);variants.push(asset.url);}
    sounds[key]=count===1?variants[0]:variants;
    const supplied=specification.cueSettings?.[key]??{};
    for(const field of ['volume','priority','cooldown'])if(supplied[field]!==undefined&&(!Number.isFinite(supplied[field])||supplied[field]<0))throw new Error('Invalid creature cue setting: '+key+'.'+field);
    settings[key]={volume:.3,priority:key.endsWith('_step')?0:2,cooldown:.12,...supplied};
  }
  const track=specification.music.alpha_wolf;
  for(const field of ['volume','seconds','sampleRate','channels','decodedBytes'])if(!Number.isFinite(track[field])||(field==='volume'?track[field]<0:track[field]<=0))throw new Error('Invalid alpha score metadata: '+field);
  if(!Number.isSafeInteger(track.sampleRate)||!Number.isSafeInteger(track.channels)||!Number.isSafeInteger(track.decodedBytes))throw new Error('Alpha score buffer metadata must use integer counts');
  const score=await input(track.file,'mp3');packed.push(score);
  const credits=await input(specification.creditsFile??'CREDITS.txt','txt');
  const base=JSON.parse(await readFile(baseManifestPath,'utf8'));
  if(!base.sounds||!base.music||!Array.isArray(base.resources))throw new Error('Invalid base audio manifest');
  const manifest={...base,sounds:{...base.sounds,...sounds},music:{...base.music,alpha_wolf:{url:score.url,volume:track.volume,seconds:track.seconds,sampleRate:track.sampleRate,channels:track.channels,decodedBytes:track.decodedBytes}},cueSettings:{...base.cueSettings,...settings},resources:[...new Set([...base.resources,...packed.map(asset=>asset.url)])],creatureAudio:{version:1,credits:`../${CREATURE_AUDIO_CREDITS}`}};
  // Complete all source validation before any output becomes visible.
  await mkdir(resolve(output,'content'),{recursive:true});
  for(const asset of packed){
    const path=resolve(output,asset.url);
    try{const old=await readFile(path);if(!old.equals(asset.data))throw new Error('Existing content hash mismatch: '+asset.url);}
    catch(error){if(error.code!=='ENOENT')throw error;await writeFile(path,asset.data,{flag:'wx'});}
  }
  await writeFile(resolve(dirname(output),CREATURE_AUDIO_CREDITS),credits.data);
  await writeFile(resolve(output,CREATURE_AUDIO_MANIFEST),JSON.stringify(manifest,null,2)+'\n');
  return {manifest:CREATURE_AUDIO_MANIFEST,soundCues:expected.size,soundFiles:packed.length-1,musicFiles:1,uniqueNewResources:new Set(packed.map(asset=>asset.url)).size,bytes:packed.reduce((sum,asset)=>sum+asset.data.length,0),credits:CREATURE_AUDIO_CREDITS};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await prepareCreatureAudio()));
