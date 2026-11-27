import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {selectEditionPlayerTextureProfile,selectPlayerTextureProfile,playerTexture4kSupported,PLAYER_2K_KTX2,defaultPlayerTextureDetail} from '../src/player-texture-profile.js';
import {readPlayerTextureChoice,writePlayerTextureChoice,selectV03PlayerTextures,mountPlayerTextureSettings,activePlayerTexture,PLAYER_TEXTURE_KEY,LEGACY_PC_TEXTURE_KEY} from '../src/v03/player-texture-choice.js';
import {t,setPack} from '../src/v03/i18n.js';
import ko from '../src/v03/locales/ko.js';
import en from '../src/v03/locales/en.js';
import ja from '../src/v03/locales/ja.js';
import vi from '../src/v03/locales/vi.js';
import zh from '../src/v03/locales/zh.js';

const PC={userAgent:'Windows Chrome'},ANDROID={userAgent:'Linux; Android 14; SM-S911N'},IPHONE={userAgent:'iPhone'};
const S23={maxTextureSize:4096,astc:{},etc2:{}},DESKTOP={maxTextureSize:16384,bptc:{},s3tc:{}};
const memory=(seed={})=>{const map=new Map(Object.entries(seed));return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),map};};
const MiB=1024**2;

test('0.3 defaults to compressed 2K on desktop, Android and iPhone',()=>{
 assert.equal(PLAYER_2K_KTX2,'warrior-v3-mobile2k');assert.equal(defaultPlayerTextureDetail(),'2k');assert.equal(defaultPlayerTextureDetail(null),'4k');
 for(const [nav,caps] of [[PC,DESKTOP],[ANDROID,S23],[IPHONE,S23]]){
  const base=selectEditionPlayerTextureProfile('warrior-v3',caps,nav);
  assert.equal(base.manifest,PLAYER_2K_KTX2);assert.equal(base.maxSize,2048);assert.equal(base.gpuCompressed,true);assert.equal(base.selectionReason,'default-2k');
  assert.deepEqual(base.textureDetail,{value:'2k',requested:'2k',source:'default',fourKAvailable:true});
  assert.equal(base.mobile,nav!==PC);
  const two=selectEditionPlayerTextureProfile('warrior-v3',caps,nav,{detail:'2k',source:'user'});
  assert.equal(two.manifest,PLAYER_2K_KTX2);assert.equal(two.maxSize,2048);assert.equal(two.selectionReason,'chosen-2k');
  assert.deepEqual(two.textureDetail,{value:'2k',requested:'2k',source:'user',fourKAvailable:true});
  const four=selectEditionPlayerTextureProfile('warrior-v3',caps,nav,{detail:'4k',source:'user'});
  assert.equal(four.manifest,'warrior-v3-mobile4k');assert.equal(four.selectionReason,'chosen-4k');
  const unpacked=selectEditionPlayerTextureProfile('warrior-v3',caps,nav,{ktx2Manifest:null});
  assert.equal(unpacked.manifest,'warrior-v3-mobile4k');assert.equal(unpacked.selectionReason,'default-4k');
 }
 // A device without a compressed format loads the RGBA fallback.
 const weak=selectEditionPlayerTextureProfile('warrior-v3',{maxTextureSize:4096},ANDROID);
 assert.equal(weak.manifest,'warrior-v3-mobile2k-rgba');assert.equal(weak.selectionReason,'default-2k');assert.deepEqual(weak.textureDetail,{value:'2k',requested:'2k',source:'default',fourKAvailable:false});
 // Every player alias, and other actors untouched.
 for(const alias of ['warrior-v4','warrior-v5','warrior-plains'])assert.equal(selectEditionPlayerTextureProfile(alias,S23,ANDROID).manifest,PLAYER_2K_KTX2);
 assert.equal(selectEditionPlayerTextureProfile('archer',S23,ANDROID).manifest,'character');
});

test('4K needs 4096 textures and a compressed format; otherwise 2K with the reason; under 2048 the old rules',()=>{
 for(const [caps,manifest] of [[{maxTextureSize:4096},'warrior-v3-mobile2k-rgba'],[{maxTextureSize:2048,astc:{}},PLAYER_2K_KTX2],[{maxTextureSize:8192},'warrior-v3-mobile2k-rgba']]){
  assert.equal(playerTexture4kSupported(caps),false);
  const asked=selectEditionPlayerTextureProfile('warrior-v3',caps,ANDROID,{detail:'4k',source:'user'});
  assert.equal(asked.manifest,manifest);assert.equal(asked.selectionReason,'4k-unsupported-2k');assert.equal(asked.textureDetail.fourKAvailable,false);assert.equal(asked.textureDetail.value,'2k');
 }
 assert.equal(playerTexture4kSupported(S23),true);assert.equal(playerTexture4kSupported(DESKTOP),true);
 assert.throws(()=>selectEditionPlayerTextureProfile('warrior-v3',{maxTextureSize:1024,astc:{}},ANDROID),error=>error.code==='PLAYER_TEXTURE_CAPABILITY');
 assert.equal(selectEditionPlayerTextureProfile('warrior-v3',{},PC).textureDetail.value,'original');
});

test('the memory picture behind the choice (estimates as reported in the diagnostics)',()=>{
 const two=selectEditionPlayerTextureProfile('warrior-v3',S23,ANDROID);
 const four=selectEditionPlayerTextureProfile('warrior-v3',S23,ANDROID,{detail:'4k'});
 const rgba=selectEditionPlayerTextureProfile('warrior-v3',{maxTextureSize:4096},ANDROID);
 assert.equal(Math.round(two.estimatedGpuBytes/MiB),32);
 assert.equal(Math.round(four.estimatedGpuBytes/MiB),80);
 assert.equal(Math.round(rgba.estimatedGpuBytes/MiB),128);
});

test('the stored choice is an id; the address and the old 0.3 PC list still count',()=>{
 assert.deepEqual(readPlayerTextureChoice(),{detail:'2k',source:'default'});
 assert.deepEqual(readPlayerTextureChoice({ktx2Manifest:null}),{detail:'4k',source:'default'});
 const store=memory();assert.equal(writePlayerTextureChoice(store,'4K 고화질'),false);assert.equal(store.map.size,0);
 assert.equal(writePlayerTextureChoice(store,'4k'),true);assert.equal(store.map.get(PLAYER_TEXTURE_KEY),'4k');
 assert.deepEqual(readPlayerTextureChoice({storage:store}),{detail:'4k',source:'user'});
 assert.deepEqual(readPlayerTextureChoice({storage:memory({[PLAYER_TEXTURE_KEY]:'8k'})}),{detail:'2k',source:'default'});
 assert.deepEqual(readPlayerTextureChoice({storage:store,search:'?playertex=2k'}),{detail:'2k',source:'url'});
 assert.deepEqual(readPlayerTextureChoice({search:'?character=warrior-v3&playertex=4k'}),{detail:'4k',source:'url'});
 assert.deepEqual(readPlayerTextureChoice({legacyStorage:memory({[LEGACY_PC_TEXTURE_KEY]:'original'})}),{detail:'4k',source:'legacy-original'});
 assert.deepEqual(readPlayerTextureChoice({legacyStorage:memory({[LEGACY_PC_TEXTURE_KEY]:'compressed'})}),{detail:'2k',source:'default'});
 assert.deepEqual(readPlayerTextureChoice({storage:memory({[PLAYER_TEXTURE_KEY]:'2k'}),legacyStorage:memory({[LEGACY_PC_TEXTURE_KEY]:'original'})}),{detail:'2k',source:'user'},'a new choice wins');
 const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
 assert.deepEqual(readPlayerTextureChoice({storage:broken,legacyStorage:broken}),{detail:'2k',source:'default'});assert.equal(writePlayerTextureChoice(broken,'4k'),false);
});

function dialog(lang='ko',options={}){
 setPack(lang,{ko,en,ja,vi,zh}[lang]);
 const {document}=parseHTML('<html><body><div class="settings-sections"><details class="settings-section"><div class="settings-display-options"></div></details></div></body></html>');
 const host=document.querySelector('.settings-sections'),storage=memory();
 const row=mountPlayerTextureSettings({doc:document,host,t,storage,...options});
 return {document,host,storage,row,$:s=>document.querySelector(s)};
}
test('settings: a 2K/4K row in the display group; the pick is stored as an id and the note says when it applies',()=>{
 selectV03PlayerTextures('warrior-v3',S23,ANDROID,{storage:memory()});
 const d=dialog();
 try{
  assert.equal(d.row.element.parentNode,d.$('.settings-display-options'));
  assert.deepEqual([...d.row.select.options].map(o=>[o.value,o.textContent,!!o.disabled]),[['2k','2K (기본)',false],['4k','4K',false]]);
  assert.equal(d.row.select.value,'2k');assert.equal(d.row.note.textContent,ko.ui['settings.playerTextureNote']);
  assert.equal(mountPlayerTextureSettings({doc:d.document,host:d.host,t,storage:d.storage}),null,'once');
  d.row.select.options[0].removeAttribute('selected');d.row.select.options[1].selected=true;d.row.select.dispatchEvent(new d.document.defaultView.Event('change'));
  assert.equal(d.storage.map.get(PLAYER_TEXTURE_KEY),'4k');assert.equal(d.row.note.textContent,ko.ui['settings.playerTextureNext'],'applies from the next visit');
  const next=selectV03PlayerTextures('warrior-v3',S23,ANDROID,{storage:d.storage});
  assert.equal(next.manifest,'warrior-v3-mobile4k');assert.deepEqual(activePlayerTexture(),{value:'4k',requested:'4k',source:'user',fourKAvailable:true});
  assert.equal(d.row.note.textContent,ko.ui['settings.playerTextureNote']);
 }finally{d.row.dispose();}
});
test('settings: where 4K cannot load it is shown but not selectable, and the note says 2K is used',()=>{
 selectV03PlayerTextures('warrior-v3',{maxTextureSize:4096},ANDROID,{storage:memory({[PLAYER_TEXTURE_KEY]:'4k'})});
 const d=dialog();d.row.sync();
 try{
  const four=d.row.select.options[1];assert.equal(four.disabled,true);assert.equal(four.textContent,ko.ui['settings.playerTexture4kOff']);assert.equal(d.row.select.options[0].textContent,'2K (기본)');
  assert.equal(d.row.select.value,'2k');assert.equal(d.row.note.textContent,ko.ui['settings.playerTextureNote4kOff']);
 }finally{d.row.dispose();}
});
test('every language names the row, both choices and the notes',()=>{
 const keys=['settings.playerTexture','settings.playerTexture2k','settings.playerTexture2kPlain','settings.playerTexture4k','settings.playerTexture4kDefault','settings.playerTexture4kOff','settings.playerTextureNote','settings.playerTextureNext','settings.playerTextureNote4kOff'];
 for(const pack of [ko,en,ja,vi,zh])for(const key of keys)assert.ok(pack.ui[key],key);
 for(const lang of ['en','vi']){selectV03PlayerTextures('warrior-v3',S23,PC,{});const d=dialog(lang);try{assert.deepEqual([...d.row.select.options].map(o=>o.textContent),[{en,vi}[lang].ui['settings.playerTexture2k'],{en,vi}[lang].ui['settings.playerTexture4k']]);}finally{d.row.dispose();}}
 setPack('ko',ko);
});

test('main.js: 0.3 selects through the 2K/4K choice and keeps it in the diagnostics; 0.2 keeps its own list and selection',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/const selectedProfile=versionRoute\.edition\?selectV03PlayerTextures\(character,caps,undefined,\{storage:v03RawStorage,legacyStorage:equipmentStorage,search:location\.search\}\)\n\s*:selectPlayerTextureProfile\(character,caps,undefined,\{release:versionRoute\.release,desktopPreference:playerTextureSettings\.value,desktopCompressedSize:versionRoute\.edition\?4096:8192\}\);/);
 assert.match(main,/playerTextureSelection=\{status:'selected',\.\.\.selectedProfile\};/,'textureDetail rides along into playerTextures');
 assert.match(main,/setupPlayerTextureSettings\(\{host:\$\('\.settings-display-options'\),storage:equipmentStorage,release:versionRoute\.edition\?null:versionRoute\.release,/);
 const boot=readFileSync(new URL('../src/v03/boot.js',import.meta.url),'utf8');
 assert.match(boot,/mountPlayerTextureSettings\(\{doc,host,t,storage:prefs\}\);/);
 // 0.2 PC and phones: unchanged.
 assert.equal(selectPlayerTextureProfile('warrior-v3',DESKTOP,PC,{release:'moonforest-0.2'}).manifest,'warrior-v3-ios');
 assert.equal(selectPlayerTextureProfile('warrior-v3',S23,ANDROID,{release:'moonforest-0.2'}).manifest,'warrior-v3-mobile4k');
});
