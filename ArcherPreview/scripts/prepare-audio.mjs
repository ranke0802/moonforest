import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const source=resolve(import.meta.dirname,'../../Assets/Resources/Audio/SFX');
const output=resolve(import.meta.dirname,'../public/assets');
const names='slash slash_heavy shield_up block parry roll land jump player_hit boss_hit critical heal_start heal_tick death revive charge_ready bow_draw bow_release arrow_hit foot_0 foot_1 foot_2 equip ui_click ui_open ui_back ui_error boss_appear boss_warning victory low_health'.split(' ');
await mkdir(resolve(output,'content'),{recursive:true});
const sounds={},resources=[];let bytes=0;
async function pack(path,extension){
  const data=await readFile(path),hash=createHash('sha256').update(data).digest('hex'),url=`./content/${hash}.${extension}`;
  await writeFile(resolve(output,url),data);resources.push(url);bytes+=data.length;return url;
}
for(const name of names){
  const variants=['slash','boss_hit','block'].includes(name)?['','_1','_2']:[''];
  const urls=[];for(const suffix of variants)urls.push(await pack(resolve(source,`${name}${suffix}.wav`),'wav'));
  sounds[name]=urls.length===1?urls[0]:urls;
}
const music={boss:{url:await pack(resolve(source,'../Music/boss_battle.mp3'),'mp3'),volume:.32}};
const edits=JSON.parse(await readFile(resolve(source,'../World/mix-report.json'),'utf8')),ambience={},cueSettings={};
for(const [name,edit] of Object.entries(edits)){
  const url=await pack(resolve(source,'../World',edit.file),edit.file.split('.').at(-1));
  if(edit.group==='sounds'){
    sounds[name]=url;cueSettings[name]={volume:edit.volume,priority:name.startsWith('foot_')?0:2,cooldown:name.endsWith('_attack')?1.2:name.endsWith('_death')?1:name.startsWith('foot_')?.12:.12};
  }else (edit.group==='music'?music:ambience)[name]={url,volume:edit.volume,seconds:edit.seconds};
}
await writeFile(resolve(output,'audio.json'),JSON.stringify({version:3,sounds,music,ambience,cueSettings,resources:[...new Set(resources)]},null,2)+'\n');
const sources=JSON.parse(await readFile(resolve(import.meta.dirname,'world-audio-sources.json'),'utf8'));
const oldCredits=await readFile(resolve(source,'../LICENSES.txt'),'utf8');
const creditText=oldCredits+'\n\nWORLD AUDIO EDITS — 2026-10-30\n\n'+Object.values(sources).map(s=>`${s.title} — ${s.author}\n${s.license}\n${s.url}\nChanges: ${s.changes}\n`).join('\n')+'\nCC-BY 4.0: https://creativecommons.org/licenses/by/4.0/\nCC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/\nScott Buckley: www.scottbuckley.com.au\nThe authors do not endorse this game. Preserve attribution on distribution.\n';
await writeFile(resolve(output,'../AUDIO_CREDITS.txt'),creditText);
console.log(`Audio: ${Object.keys(sounds).length} cues, ${Object.keys(music).length} scores, ${Object.keys(ambience).length} ambience loops; ${(bytes/1024/1024).toFixed(2)} MiB`);
