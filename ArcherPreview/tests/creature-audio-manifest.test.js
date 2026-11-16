import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareCreatureAudio,CREATURE_AUDIO_MANIFEST,CREATURE_AUDIO_CREDITS} from '../scripts/prepare-creature-audio-r1.mjs';
import {collectVillageSiteFiles} from '../scripts/build-village-site.mjs';
import {releaseRoute} from '../src/release-route.js';

async function fixture(t){
  const directory=await mkdtemp(resolve(tmpdir(),'moonforest-creature-audio-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const sourceDirectory=resolve(directory,'source'),publicDirectory=resolve(directory,'public'),outputDirectory=resolve(publicDirectory,'assets');
  await mkdir(resolve(sourceDirectory,'sfx'),{recursive:true});await mkdir(resolve(sourceDirectory,'music'));
  await mkdir(resolve(outputDirectory,'content'),{recursive:true});
  const old=Buffer.from('unchanged previous score'),oldUrl=`./content/${createHash('sha256').update(old).digest('hex')}.mp3`;
  await writeFile(resolve(outputDirectory,oldUrl),old);await writeFile(resolve(publicDirectory,'resource-cache.js'),'// fixture');
  const base={version:3,sounds:{slash:'old.wav',bear_attack:'old-bear.wav',goblin_attack:'old-goblin.wav'},music:{boss:{url:oldUrl,volume:.32},combat:{url:oldUrl,volume:.29},elena_saint:{url:oldUrl,volume:.28}},ambience:{ambience_forest:{url:oldUrl,volume:.12}},cueSettings:{slash:{volume:.5}},resources:[oldUrl]};
  const baseManifestPath=resolve(outputDirectory,'audio.json');await writeFile(baseManifestPath,JSON.stringify(base));
  const manifest={version:1,sounds:{},cueSettings:{},music:{alpha_wolf:{file:'music/alpha-wolf-r1.mp3',volume:.32,seconds:70.588,sampleRate:32000,channels:2,decodedBytes:18070592}},creditsFile:'CREDITS.txt'};
  let index=0;
  for(const kind of ['wolf','fox','boar','bear'])for(const [action,count]of Object.entries({attack:2,hurt:2,death:1,step:3,impact:2,alert:1})){
    const key=`${kind}_${action}`,files=[];
    for(let i=0;i<count;i++){
      const file=`sfx/${key}_${i+1}.wav`,data=Buffer.alloc(46);data.write('RIFF');data.writeUInt32LE(38,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(32000,24);data.writeUInt32LE(64000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(2,40);data.writeInt16LE(++index,44);
      await writeFile(resolve(sourceDirectory,file),data);files.push(file);
    }
    manifest.sounds[key]=count===1?files[0]:files;
    manifest.cueSettings[key]={volume:.25,cooldown:.15,priority:action==='step'?0:2};
  }
  await writeFile(resolve(sourceDirectory,'music/alpha-wolf-r1.mp3'),'new original score fixture');
  const credits='CREATURE AUDIO R1\nOriginal composition and synthesis; no external recorded samples.\n';
  await writeFile(resolve(sourceDirectory,'CREDITS.txt'),credits);
  const save=()=>writeFile(resolve(sourceDirectory,'manifest.json'),JSON.stringify(manifest));await save();
  return {directory,sourceDirectory,publicDirectory,outputDirectory,baseManifestPath,base,manifest,credits,save};
}

test('44 new creature variants and alpha score publish additively, retain prior scores, and enter the normal site collector',async t=>{
  const f=await fixture(t),baseBytes=await readFile(f.baseManifestPath),sourceBefore=await readFile(resolve(f.sourceDirectory,'sfx/wolf_attack_1.wav'));
  const result=await prepareCreatureAudio(f);assert.equal(result.soundFiles,44);assert.equal(result.soundCues,24);assert.equal(result.musicFiles,1);
  const manifest=JSON.parse(await readFile(resolve(f.outputDirectory,CREATURE_AUDIO_MANIFEST),'utf8'));
  assert.deepEqual(await readFile(f.baseManifestPath),baseBytes);
  assert.deepEqual(await readFile(resolve(f.sourceDirectory,'sfx/wolf_attack_1.wav')),sourceBefore);
  assert.deepEqual(manifest.music.boss,f.base.music.boss);assert.deepEqual(manifest.music.combat,f.base.music.combat);assert.deepEqual(manifest.music.elena_saint,f.base.music.elena_saint);assert.deepEqual(manifest.ambience,f.base.ambience);
  assert.equal(manifest.sounds.slash,f.base.sounds.slash);assert.equal(manifest.sounds.goblin_attack,f.base.sounds.goblin_attack);assert.notEqual(manifest.sounds.bear_attack,f.base.sounds.bear_attack);
  for(const kind of ['wolf','fox','boar','bear']){
    assert.equal(manifest.sounds[`${kind}_attack`].length,2);assert.equal(manifest.sounds[`${kind}_hurt`].length,2);assert.equal(manifest.sounds[`${kind}_step`].length,3);assert.equal(manifest.sounds[`${kind}_impact`].length,2);
    assert.equal(typeof manifest.sounds[`${kind}_death`],'string');assert.equal(typeof manifest.sounds[`${kind}_alert`],'string');
  }
  assert.equal(manifest.music.alpha_wolf.decodedBytes,18070592);assert.deepEqual(manifest.cueSettings.slash,f.base.cueSettings.slash);assert.equal(new Set(manifest.resources).size,46);
  for(const url of manifest.resources){const bytes=await readFile(resolve(f.outputDirectory,url));assert.equal(createHash('sha256').update(bytes).digest('hex'),url.split('/').at(-1).split('.')[0]);}
  assert.equal(await readFile(resolve(f.publicDirectory,CREATURE_AUDIO_CREDITS),'utf8'),f.credits);
  const published=await collectVillageSiteFiles(f.publicDirectory,{requireCompleteVillage:false,catalog:[]});
  assert.ok(published.files.has(`assets/${CREATURE_AUDIO_MANIFEST}`));assert.ok(published.files.has(CREATURE_AUDIO_CREDITS));assert.equal([...published.files.keys()].filter(path=>path.startsWith('assets/content/')).length,46);
  const firstOutput=await readFile(resolve(f.outputDirectory,CREATURE_AUDIO_MANIFEST));await prepareCreatureAudio(f);assert.deepEqual(await readFile(resolve(f.outputDirectory,CREATURE_AUDIO_MANIFEST)),firstOutput);
});

test('incomplete variants fail before publishing a manifest or new content',async t=>{
  const f=await fixture(t);f.manifest.sounds.fox_attack=['sfx/fox_attack_1.wav'];await f.save();
  await assert.rejects(prepareCreatureAudio(f),/fox_attack requires 2/);
  assert.deepEqual(await readdir(resolve(f.outputDirectory,'content')),[f.base.resources[0].split('/').at(-1)]);
  await assert.rejects(readFile(resolve(f.outputDirectory,CREATURE_AUDIO_MANIFEST)),{code:'ENOENT'});
});

test('source paths cannot escape the registered creature folder and unrelated scores cannot be replaced',async t=>{
  const f=await fixture(t);f.manifest.sounds.wolf_attack[0]='../outside.wav';await f.save();
  await assert.rejects(prepareCreatureAudio(f),/Unsafe creature audio source path/);
  f.manifest.sounds.wolf_attack[0]='sfx/wolf_attack_1.wav';f.manifest.music.boss={file:'music/alpha-wolf-r1.mp3'};await f.save();
  await assert.rejects(prepareCreatureAudio(f),/only the alpha_wolf score/);
});

test('startup selects creature audio only for 0.2 without reading the later versionRoute binding',async()=>{
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8'),line=main.match(/^const audio=new GameAudio.*$/m)?.[0];assert.ok(line);
  const create=new Function('GameAudio','ActionAudio','releaseRoute','location',line.replace('import.meta.env.BASE_URL',JSON.stringify('/preview/'))+'return audio;');
  class Audio{constructor(options){this.options=options;}}class Actions{}
  for(const [href,wantsOverlay]of [['https://game.test/preview/moonforest-0.2.html',true],['https://game.test/preview/index.html?release=moonforest-0.2',true],['https://game.test/preview/index.html?release=moonforest-0.1',false],['https://game.test/preview/index.html?character=warrior-plains',false]]){
    const audio=create(Audio,Actions,releaseRoute,{href});assert.equal(audio.options.manifestUrl?.href,wantsOverlay?'https://game.test/preview/assets/audio-creatures-r1.json':undefined);
  }
});
