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
await writeFile(resolve(output,'audio.json'),JSON.stringify({version:2,sounds,music,resources},null,2)+'\n');
console.log(`Audio: ${names.length} immutable cues, ${(bytes/1024/1024).toFixed(2)} MiB`);
