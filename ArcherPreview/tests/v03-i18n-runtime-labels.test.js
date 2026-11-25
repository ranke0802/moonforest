// Runtime labels of the shared game (monster names over health bars, top
// buttons, settings text built after the language pack loads) follow the
// chosen language; Korean stays the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {tr,translateTree,useLanguage} from '../src/v03/i18n.js';
import {watchTranslations,translateLabels} from '../src/v03/live-translate.js';

const LANGS=['en','ja','vi','zh'];
test('the player settings expose translated music attribution and the complete shipped credit file',async()=>{
 const source=await readFile(new URL('../moonforest-0.3.html',import.meta.url),'utf8');
 const inventory=JSON.parse(await readFile(new URL('../../ArcherPreviewSite/deployment-files.json',import.meta.url),'utf8'));
 for(const [lang,label] of Object.entries({ko:'음악 · 효과음 크레딧',en:'Music and sound credits',ja:'音楽・効果音のクレジット',vi:'Ghi công âm nhạc và hiệu ứng âm thanh',zh:'音乐与音效鸣谢'})){
  const {document}=parseHTML(source);
  await useLanguage(lang,{doc:document});translateTree(document.getElementById('app'));
  const credits=document.querySelector('#motion-speed-dialog details#v03-audio-credits');
  assert.ok(credits,'the settings used at the title and in play contain the credits');
  assert.equal(credits.querySelector('summary').textContent,label);
  assert.match(credits.textContent,/Scott Buckley/);assert.match(credits.textContent,/Additional Sound FX by Will Leamon/);
  const full=credits.querySelector('a[hreflang="en"]');
  if(lang!=='ko')assert.doesNotMatch(credits.textContent,/[가-힣]/);
  assert.equal(full.target,'_blank');assert.equal(full.rel,'noopener');
  const path=new URL(full.getAttribute('href'),'https://example.test/moonforest/moonforest-0.3.html').pathname;
  assert.equal(path,'/moonforest/AUDIO_CREDITS.txt');
 }
 const filename='AUDIO_CREDITS.txt',credits=(await readFile(new URL('../public/'+filename,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
 const descriptor=inventory.files.find(row=>row.path===filename);
 assert.equal(createHash('sha256').update(credits).digest('hex'),descriptor.sha256);
 assert.match(credits,/A Dragon's Lullaby/);assert.match(credits,/Anabasis I/);
 assert.match(credits,/Changes:/);assert.match(credits,/OGA-BY-3.0.txt/);
 await useLanguage('ko');
});
const MUST=['회색 늑대','늑대 2','늑대 3','여우','멧돼지','우두머리 늑대','타락한 성녀 엘레나','비탄의 마녀 엘레나','수호 곰','후드 고블린','고블린','곰','곰 보스','격파','광폭화',
 '가방','수첩','소환','전체','설정','달리기 이동','캐릭터 · 장비','장비','개별 선택 · 능력치','무기 · 검','방어구 · 방패','기본 · 공격력 +5','기본 · 방어력 +2','화면 · 카메라','화질','프레임','날씨','맑음 · 기본','3D 해상도','넉다운','대기','회피 구르기'];

for(const id of LANGS)test(`${id} translates runtime labels`,async()=>{
 assert.equal(await useLanguage(id),id);
 const missing=MUST.filter(text=>tr(text)===text);
 assert.deepEqual(missing,[]);
 assert.notEqual(tr('120 FPS · 기본'),'120 FPS · 기본');assert.match(tr('60 FPS · 기본'),/^60 FPS · /);
 assert.match(tr('기본 · 240%'),/240%$/);assert.notEqual(tr('기본 · 240%'),'기본 · 240%');
 assert.equal(tr(' 검격 잔상'),' '+tr('검격 잔상'),'surrounding spaces are kept');
});
test('English names and the fullscreen caption',async()=>{
 await useLanguage('en');
 assert.equal(tr('회색 늑대'),'Gray Wolf');assert.equal(tr('전체'),'Full');assert.equal(tr('달리기 이동'),'Run');
});
test('settings text added after the language loads is translated while the dialog is open',async()=>{
 await useLanguage('en');
 const {document}=parseHTML('<div id="app"><nav class="top-actions"><button data-commercial-label="전체"></button></nav><dialog id="motion-speed-dialog"><p>화질</p></dialog></div>');
 translateLabels(document.getElementById('app'));
 assert.equal(document.querySelector('button').dataset.commercialLabel,'Full');
 const watch=watchTranslations(document),dialog=document.getElementById('motion-speed-dialog');
 assert.equal(dialog.querySelector('p').textContent,'Quality','first pass at start');
 const late=document.createElement('summary');late.textContent='캐릭터 · 장비';dialog.append(late);
 dialog.setAttribute('open','');
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(late.textContent,'Character · Gear','translated when the dialog opens');
 const option=document.createElement('option');option.textContent='맑음 · 기본';dialog.append(option);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(option.textContent,'Clear · Default','added while open');
 watch.dispose();
});
test('Korean leaves everything as written',async()=>{
 await useLanguage('ko');
 assert.equal(tr('회색 늑대'),'회색 늑대');
 const {document}=parseHTML('<dialog id="motion-speed-dialog" open><p>화질</p></dialog>');
 watchTranslations(document).dispose();
 assert.equal(document.querySelector('p').textContent,'화질');
});
