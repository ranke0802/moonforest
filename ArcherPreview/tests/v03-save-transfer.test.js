// Save slot export / restore (save-transfer.js): a file restores into an
// empty slot exactly, every refusal changes nothing, and the title offers
// export only on filled slots and restore only on empty ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {setTimeout as delay} from 'node:timers/promises';
import {exportSlot,inspectFile,restoreInto,readSlotPayload,checkStorageLoss,requestPersistence,persistenceRecord,nestingDepth,canonical,cyrb53,MAX_FILE_BYTES,createSaveTransfer,deliveryRoute,deliverFile,saveFileName,TRANSFER_ERRORS} from '../src/v03/save-transfer.js';
import {createSaveSession,slotStorage,writeSlotMeta,readSlotIndex,editionStorage,wipeSlot} from '../src/v03/save-slots.js';
import {GoldLoot,GOLD_LEDGER_KEY,GOLD_STORAGE_KEY} from '../src/gold-loot.js';
import {MAP_RESUME_KEY} from '../src/map-resume.js';
import {questKey} from '../src/v03/chapter-progress.js';
import {LANGUAGES,useLanguage,t,writeLanguage} from '../src/v03/i18n.js';
import {createTitleScreen,slotSummary} from '../src/v03/title-screen.js';
import {setupV03} from '../src/v03/boot.js';
import {setTypewriterEnabled} from '../src/v03/typewriter.js';
import {QUESTS} from '../src/v03/data/chapter1.js';

const edition='moonforest-0.3';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const noop=()=>{};
function memory(){
 const data=new Map();
 return {get length(){return data.size;},key:i=>Array.from(data.keys())[i]??null,getItem:k=>data.has(k)?data.get(k):null,
  setItem:(k,v)=>{data.set(k,String(v));},removeItem:k=>{data.delete(k);},snapshot:()=>Object.fromEntries(data),data};
}
// A storage with a size quota (characters of keys and values), like a full
// browser storage: a write past the quota throws, a removal frees room.
function quota(base,room){
 const size=()=>{let n=0;for(const [k,v] of base.data)n+=k.length+v.length;return n;},cap=size()+room;
 return {get length(){return base.length;},key:i=>base.key(i),getItem:k=>base.getItem(k),removeItem:k=>base.removeItem(k),
  setItem(k,v){v=String(v);const next=size()-(base.data.has(k)?k.length+base.data.get(k).length:0)+k.length+v.length;if(next>cap){const error=new Error('quota');error.name='QuotaExceededError';throw error;}base.setItem(k,v);}};
}
const LEDGER={version:1,balance:1234,credits:{'quest:M01':50,'quest:M03':120},
 town:{bag:{'bronze-blade':1,'field-shield':1,potion:4,'moon-herb':2,'wolf-pelt':3},equipped:{sword:'bronze-blade',shield:'field-shield',armor:'leather-coat'},
  condition:{'bronze-blade':{level:3,hp:88,wear:.25},'field-shield':{level:1,hp:120}},progression:{xp:930,points:1,skills:{guardTraining:2,endurance:1}},quickPotion:'potion'}};
const POSITION={version:1,maps:{'witch-cave':{x:3.5,y:0.25,z:-12.25,yaw:1.2,camera:{alpha:1.1,beta:1.2,radius:9}}}};
// A rich record: quests in two chapters, bag, upgrades, gold, skills, mount, position.
function rich(local,slot){
 writeSlotMeta(local,edition,slot,{chapter:2,title:'젖은 발자국',titleKey:'E02',place:'마녀의 동굴',placeKey:'warrior-v5',character:'warrior-v5',level:7,playSeconds:5432,savedAt:1764000000000,createdAt:1763000000000});
 const s=slotStorage(local,edition,slot);
 s.setItem(GOLD_LEDGER_KEY,JSON.stringify(LEDGER));s.setItem(GOLD_STORAGE_KEY,'1234');
 s.setItem(questKey(1),JSON.stringify({quest:QUESTS.length,step:0,count:0,done:['M00','M01','M02']}));
 s.setItem('v03-chapters-v1',JSON.stringify({id:2,done:[1]}));
 s.setItem(questKey(2),JSON.stringify({quest:1,step:2,count:1,done:['E01']}));
 s.setItem(MAP_RESUME_KEY,JSON.stringify(POSITION));
 s.setItem('v03:stable:coat','dapple');s.setItem('v03-riding-v1',JSON.stringify({owned:true,saddle:'leather'}));
 s.setItem('v03-tips-v1',JSON.stringify(['move','attack']));s.setItem('v03-greeted-v1',JSON.stringify(['innkeeper']));
 s.setItem('v03-errands-v1',JSON.stringify({done:['potion'],active:{herbs:{count:2}}}));
 s.setItem('moonforest-v03-armor-v1','leather');s.setItem('v03-note','달빛 ✦ 숲 "따옴표" \\ 역슬래시');
}
function filled(){
 const local=memory();rich(local,1);
 writeSlotMeta(local,edition,2,{chapter:1,titleKey:'M03',title:'약초',level:2,playSeconds:60,savedAt:5,createdAt:4});
 slotStorage(local,edition,2).setItem(GOLD_LEDGER_KEY,JSON.stringify({version:1,balance:9,credits:{}}));
 editionStorage(local,null,edition).setItem('moonforest-frame-rate-v2','60');
 local.setItem('moonforest:lang:v1','ko');local.setItem(edition+':last-slot:v1','1');local.setItem('unrelated','x');
 return local;
}
async function exported(local,slot=1,options={}){const made=await exportSlot({raw:local,edition,slot,now:()=>Date.UTC(2026,10,26,3,4),...options});assert.ok(made);return made;}
// Rewrites a file and signs it again, as a careful forger or a future build would.
async function resign(file){
 const body=canonical({format:file.format,formatVersion:file.formatVersion,game:file.game,createdAt:file.createdAt,payload:file.payload});
 const sha=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body))).toString('hex');
 file.integrity={sha256:sha,cyrb53:cyrb53(body)};return JSON.stringify(file);
}
const outside=(snapshot,slot)=>Object.fromEntries(Object.entries(snapshot).filter(([key])=>!key.startsWith(`${edition}:slot${slot}:`)&&key!==edition+':slots:v1'));

test('export → restore into an empty slot gives the same quests, bag, upgrades, gold, skills, mount and position',async()=>{
 const local=filled(),made=await exported(local);
 assert.match(made.name,/^moonforest-save-warrior-v5-\d{8}-\d{4}\.mfsave$/);
 const inspected=await inspectFile(made.text,{edition});
 assert.equal(inspected.ok,true);assert.equal(inspected.check,'sha256');
 assert.deepEqual(inspected.summary,{chapter:2,placeKey:'warrior-v5',titleKey:'E02',level:7,playSeconds:5432,savedAt:1764000000000,build:'MoonForest 0.3',createdAt:'2026-11-26T03:04:00.000Z'});
 assert.deepEqual(restoreInto({raw:local,edition,slot:3,inspected}),{ok:true,slot:3});
 const a=readSlotPayload(local,edition,1),b=readSlotPayload(local,edition,3);
 assert.deepEqual(b.data,a.data,'every stored key comes back byte for byte');
 assert.deepEqual({...b.meta,slot:1},a.meta);
 const {slot:_a,...metaA}=readSlotIndex(local,edition)[0],{slot:_b,...metaB}=readSlotIndex(local,edition)[2];assert.deepEqual(metaB,metaA);
 const wallet=new GoldLoot({storage:slotStorage(local,edition,3)});
 assert.equal(wallet.balance,1234);assert.deepEqual(wallet.town,LEDGER.town);assert.deepEqual(wallet.credits,LEDGER.credits);
 const s=slotStorage(local,edition,3);
 assert.deepEqual(JSON.parse(s.getItem(MAP_RESUME_KEY)),POSITION);
 assert.equal(s.getItem('v03:stable:coat'),'dapple');
 assert.deepEqual(JSON.parse(s.getItem(questKey(2))).done,['E01']);
});

test('a restore leaves the other slots, the preferences and every other key byte-identical',async()=>{
 const local=filled(),made=await exported(local),before=local.snapshot(),indexBefore=JSON.parse(before[edition+':slots:v1']);
 const inspected=await inspectFile(made.text,{edition});
 assert.equal(restoreInto({raw:local,edition,slot:3,inspected}).ok,true);
 const after=local.snapshot();
 assert.deepEqual(outside(after,3),outside(before,3));
 const indexAfter=JSON.parse(after[edition+':slots:v1']);
 assert.deepEqual(indexAfter[1],indexBefore[1]);assert.deepEqual(indexAfter[2],indexBefore[2]);
 assert.equal(after[edition+':slots:v1'],JSON.stringify({...indexBefore,3:indexAfter[3]}),'the index changes by the new entry only');
});

test('a slot that became filled between inspect and write is refused and nothing changes',async()=>{
 const local=filled(),made=await exported(local),inspected=await inspectFile(made.text,{edition});
 writeSlotMeta(local,edition,3,{chapter:1,titleKey:'M00',level:1,playSeconds:3,savedAt:9,createdAt:9});
 slotStorage(local,edition,3).setItem(GOLD_LEDGER_KEY,JSON.stringify({version:1,balance:5,credits:{}}));
 const before=local.snapshot();
 assert.deepEqual(restoreInto({raw:local,edition,slot:3,inspected}),{ok:false,code:'slot-filled'});
 assert.deepEqual(local.snapshot(),before);
 assert.deepEqual(restoreInto({raw:local,edition,slot:1,inspected}),{ok:false,code:'slot-filled'});
 assert.deepEqual(local.snapshot(),before);
});

test('a write that fails half-way (full storage) leaves storage exactly as it was, leftovers included',async()=>{
 const local=filled(),made=await exported(local),inspected=await inspectFile(made.text,{edition});
 // Keys an unsaved run left in the empty slot 3.
 slotStorage(local,edition,3).setItem(GOLD_LEDGER_KEY,JSON.stringify({version:1,balance:0,credits:{}}));slotStorage(local,edition,3).setItem('v03-tips-v1','["move"]');
 const before=local.snapshot(),need=Object.entries(inspected.payload.data).reduce((n,[k,v])=>n+k.length+edition.length+7+v.length,0);
 for(const room of [0,40,Math.floor(need/2),need-5]){
  const raw=quota(local,room);
  assert.deepEqual(restoreInto({raw,edition,slot:3,inspected}),{ok:false,code:'storage'},'fails with room '+room);
  assert.deepEqual(local.snapshot(),before,'rolled back with room '+room);
 }
 // Another tab saves into the slot while the keys are staged: refused before the slot is marked.
 let staged=0;const racing={...local,get length(){return local.length;},key:i=>local.key(i),getItem:k=>local.getItem(k),removeItem:k=>local.removeItem(k),
  setItem(k,v){local.setItem(k,v);if(++staged===2)writeSlotMeta(local,edition,3,{chapter:1,titleKey:'M00',savedAt:1,createdAt:1});}};
 const raced=restoreInto({raw:racing,edition,slot:3,inspected});
 assert.deepEqual(raced,{ok:false,code:'slot-filled'});
 const now=local.snapshot();assert.deepEqual(outside(now,3),outside(before,3));
 for(const [key,value] of Object.entries(before))if(key.startsWith(edition+':slot3:'))assert.equal(now[key],value,'leftover '+key+' put back');
 assert.equal(Object.keys(now).filter(key=>key.startsWith(edition+':slot3:')).length,2);
});

test('every damaged, foreign, newer or oversized file is refused with its own error and changes nothing',async()=>{
 const local=filled(),made=await exported(local),file=()=>JSON.parse(made.text),before=local.snapshot();
 const valueAt=made.text.indexOf('1234');assert.ok(valueAt>0);
 const flipped=made.text.slice(0,valueAt)+String.fromCharCode(made.text.charCodeAt(valueAt)^1)+made.text.slice(valueAt+1);
 const deep='{"format":"moonforest-save","x":'+'['.repeat(100000)+']'.repeat(100000)+'}';
 const ledger2=file();ledger2.payload.data[GOLD_LEDGER_KEY]=JSON.stringify({...LEDGER,version:2});
 const ledger0=file();ledger0.payload.data[GOLD_LEDGER_KEY]=JSON.stringify({...LEDGER,version:0});
 const extra=file();extra.comment='hello';
 const proto=JSON.parse(made.text);
 const cases=[
  ['truncated',made.text.slice(0,Math.floor(made.text.length/2)),'damaged'],
  ['truncated by one byte',made.text.trimEnd().slice(0,-1),'damaged'],
  ['flipped byte',flipped,'damaged'],
  ['wrong format id',made.text.replace('"moonforest-save"','"moonforest-sav3"'),'not-save'],
  ['plain JSON',JSON.stringify({hello:'world'}),'not-save'],
  ['not JSON','<html><script>alert(1)</script>','not-save'],
  ['empty','','not-save'],
  ['newer format version',await resign({...file(),formatVersion:2}),'newer'],
  ['newer slot schema',await resign({...file(),game:{...file().game,slotSchema:2}}),'newer'],
  ['newer gold ledger inside',await resign(ledger2),'newer'],
  ['older gold ledger inside',await resign(ledger0),'older'],
  ['other edition',await resign({...file(),game:{...file().game,edition:'moonforest-0.2'}}),'other-edition'],
  ['unknown top-level key',await resign(extra),'damaged'],
  ['prototype key in data',(await resign(proto)).replace('"v03-note"','"__proto__"'),'damaged'],
  ['oversized',made.text+' '.repeat(MAX_FILE_BYTES),'too-large'],
  ['deep nesting',deep,'damaged'],
  ['deep nesting, not ours','['.repeat(200000),'not-save'],
 ];
 for(const [name,text,code] of cases){
  const result=await inspectFile(text,{edition});
  assert.deepEqual(result,{ok:false,code},name);
  assert.ok(TRANSFER_ERRORS.includes(code));
  assert.deepEqual(restoreInto({raw:local,edition,slot:3,inspected:result}),{ok:false,code:'not-save'},name+' cannot be written');
  assert.deepEqual(local.snapshot(),before,name+' changes nothing');
 }
 // A re-signed prototype key is still refused by shape, not only by the hash.
 const forged=JSON.parse(made.text);forged.payload.data=JSON.parse(JSON.stringify(forged.payload.data).replace('"v03-note"','"__proto__"'));
 assert.deepEqual(await inspectFile(await resign(forged),{edition}),{ok:false,code:'damaged'});
 assert.equal(nestingDepth(made.text),3);
});

test('without crypto.subtle the file carries and is checked by the small fallback hash',async()=>{
 const local=filled(),weak=await exported(local,1,{subtle:null}),file=JSON.parse(weak.text);
 assert.equal(file.integrity.weak,true);assert.equal(file.integrity.sha256,undefined);
 const checked=await inspectFile(weak.text,{edition});assert.equal(checked.ok,true);assert.equal(checked.check,'weak');
 const strong=await exported(local);
 const here=await inspectFile(strong.text,{edition,subtle:null});assert.equal(here.ok,true);assert.equal(here.check,'weak','a page without subtle still checks the fallback');
 const at=weak.text.indexOf('dapple');
 assert.deepEqual(await inspectFile(weak.text.slice(0,at)+'dappla'+weak.text.slice(at+6),{edition}),{ok:false,code:'damaged'});
});

test('the file holds keys and stored values only, and restores under another language',async()=>{
 await useLanguage('en');
 const local=filled(),made=await exported(local),file=JSON.parse(made.text);
 assert.deepEqual(Object.keys(file).sort(),['createdAt','format','formatVersion','game','integrity','payload']);
 assert.deepEqual(Object.keys(file.payload).sort(),['data','meta']);
 const en=(await import('../src/v03/locales/en.js')).default.ui;
 const words=Object.values(en).filter(value=>typeof value==='string'&&value.length>=8&&!value.includes('{'));
 for(const word of words)assert.equal(made.text.includes(word),false,'no UI sentence in the file: '+word);
 assert.equal(made.text.includes(slotSummary(readSlotIndex(local,edition)[0]).title),false);
 assert.equal(file.payload.meta.titleKey,'E02');assert.equal(file.payload.meta.placeKey,'warrior-v5');
 await useLanguage('ja');
 const inspected=await inspectFile(made.text,{edition});
 assert.equal(restoreInto({raw:local,edition,slot:3,inspected}).ok,true);
 assert.match(slotSummary(readSlotIndex(local,edition)[2]).title,/^第2章/);
 await useLanguage('ko');
});

test('storage-loss line and the one-time persistence request',async()=>{
 const local=memory();
 assert.equal(checkStorageLoss(local,edition),false,'a new device has nothing to miss');
 rich(local,2);assert.equal(checkStorageLoss(local,edition),false);assert.equal(local.getItem(edition+':had-saves:v1'),'1');
 wipeSlot(local,edition,2);assert.equal(checkStorageLoss(local,edition),true,'records were here and are gone');
 rich(local,1);assert.equal(checkStorageLoss(local,edition),false);
 let asked=0;const manager={persist:async()=>{asked++;return true;}};
 const first=await requestPersistence(local,edition,manager,()=>77);
 assert.deepEqual(first,{result:'granted',at:77});
 assert.deepEqual(await requestPersistence(local,edition,manager,()=>99),{result:'granted',at:77});assert.equal(asked,1);
 assert.deepEqual(persistenceRecord(local,edition),{result:'granted',at:77});
 const other=memory();rich(other,1);assert.deepEqual(await requestPersistence(other,edition,undefined,()=>5),{result:'unsupported',at:5});
 assert.equal(await requestPersistence(memory(),edition,manager),null,'never before a real save');
});

test('file names and delivery routes',()=>{
 assert.equal(saveFileName({placeKey:'warrior-v3'},new Date(2026,0,2,3,4)),'moonforest-save-warrior-v3-20260102-0304.mfsave');
 assert.equal(saveFileName({chapter:2},new Date(2026,0,2,3,4)),'moonforest-save-ch2-20260102-0304.mfsave');
 assert.equal(saveFileName({placeKey:'../<b>'},new Date(2026,0,2,3,4)),'moonforest-save-b-20260102-0304.mfsave');
 const view=(ua,{standalone=false}={})=>({navigator:{userAgent:ua,standalone},matchMedia:()=>({matches:false})});
 assert.equal(deliveryRoute(view('Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile')),'download');
 assert.equal(deliveryRoute(view('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1')),'download');
 assert.equal(deliveryRoute(view('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)',{standalone:true})),'share');
 assert.equal(deliveryRoute(view('Mozilla/5.0 (iPhone) KAKAOTALK 10.8')),'share');
 assert.equal(deliveryRoute(view('Mozilla/5.0 (Linux; Android 14; wv) Chrome/131 Instagram 300')),'share');
});

// ----- the title's slot screen -----
function dom(){return parseHTML('<html lang="ko"><body><main id="app"></main></body></html>');}
async function waitFor(find,selector){for(let i=0;i<300;i++){const node=find(selector);if(node)return node;await delay(2);}assert.fail('never appeared: '+selector);}
function click(window,node){assert.ok(node,'missing button');assert.equal(node.disabled,false);node.dispatchEvent(new window.Event('click',{bubbles:true}));}
function screen(local,view={}){
 const {document,window}=dom(),title=createTitleScreen({doc:document,wait:async()=>{}});
 const save=createSaveSession({local,session:memory(),edition});
 const transfer=createSaveTransfer({doc:document,view:{...view,navigator:view.navigator??{userAgent:'Mozilla/5.0 (X11; Linux x86_64) Chrome/131'}},save,title});
 const find=selector=>document.querySelector(selector);
 return {document,window,title,save,transfer,find,click:node=>click(window,typeof node==='string'?find(node):node)};
}

test('the slot screen offers export only on filled slots and restore only on empty ones',()=>{
 const local=filled(),{title,find,document}=screen(local);
 for(const mode of ['new','load']){
  void title.chooseSlot({mode,index:readSlotIndex(local,edition),bootSlot:3,transfer:true});
  assert.ok(find('[data-transfer="export"][data-transfer-slot="1"]'));assert.ok(find('[data-transfer="export"][data-transfer-slot="2"]'));
  assert.equal(find('[data-transfer="restore"][data-transfer-slot="1"]'),null);assert.equal(find('[data-transfer="export"][data-transfer-slot="3"]'),null);
  const restore=find('[data-transfer="restore"][data-transfer-slot="3"]');assert.ok(restore);assert.equal(restore.textContent,t('transfer.restore'));assert.equal(restore.disabled,false);
  assert.equal(find('[data-slot="3"]').disabled,mode==='load','the slot itself keeps its own rule');
  title.closePanel();
 }
 void title.chooseSlot({mode:'chapters',index:readSlotIndex(local,edition),bootSlot:3,transfer:true});
 assert.equal(document.querySelectorAll('[data-transfer]').length,0);title.closePanel();
 void title.chooseSlot({mode:'load',index:readSlotIndex(local,edition),bootSlot:3});
 assert.equal(document.querySelectorAll('[data-transfer]').length,0,'without transfer the screen is as before');title.closePanel();
});

test('cancel at the confirmation changes nothing',async()=>{
 const local=filled(),made=await exported(local),before=local.snapshot(),h=screen(local);
 const run=h.transfer.run({transfer:'restore',slot:3});
 const area=await waitFor(h.find,'.v03-transfer-paste textarea');area.value=made.text;
 h.click('[data-transfer-action="check"]');
 await waitFor(h.find,'.is-confirm .v03-panel-accept');
 assert.ok(h.find('.v03-transfer-card').textContent.includes('Lv.7'));
 h.click('.is-confirm .v03-panel-back');
 assert.equal(await run,null);assert.deepEqual(local.snapshot(),before);
 assert.deepEqual(h.transfer.notice(),{tone:'info',text:t('transfer.cancelled')});
 // Back from the file step, and Escape, change nothing either.
 const again=h.transfer.run({transfer:'restore',slot:3});await waitFor(h.find,'.v03-transfer-back');h.click('.v03-transfer-back');
 assert.equal(await again,null);assert.deepEqual(local.snapshot(),before);
});

test('restore from a picked file: errors stay on the file step, the summary is text only, then the slot fills',async()=>{
 const local=filled(),made=await exported(local);
 const forged=JSON.parse(made.text);forged.payload.meta.title='<img src=x onerror=alert(1)>';delete forged.payload.meta.titleKey;
 const evil=await resign(forged);
 let asked=0;const h=screen(local,{navigator:{userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/131',storage:{persist:async()=>{asked++;return false;}}}});
 const before=local.snapshot();
 const run=h.transfer.run({transfer:'restore',slot:3});
 const input=await waitFor(h.find,'.v03-transfer-file');
 assert.equal(input.getAttribute('accept'),'.mfsave,.json,application/json,text/plain');
 const pick=async file=>{Object.defineProperty(input,'files',{configurable:true,get:()=>[file]});input.dispatchEvent(new h.window.Event('change'));for(let i=0;i<50;i++)await turn();};
 await pick({size:MAX_FILE_BYTES+1,text:async()=>assert.fail('an oversized file is not read')});
 assert.equal(h.find('.v03-transfer-status.is-error').dataset.code,'too-large');
 assert.equal(h.find('.v03-transfer-status.is-error').textContent,t('transfer.error.too-large'));
 const at=made.text.indexOf('dapple');
 await pick({size:10,text:async()=>made.text.slice(0,at)+'dappla'+made.text.slice(at+6)});
 assert.equal(h.find('.v03-transfer-status.is-error').textContent,t('transfer.error.damaged'));
 await pick({size:10,text:async()=>'{"format":"moonforest-save","formatVersion":9}'});
 assert.equal(h.find('.v03-transfer-status.is-error').textContent,t('transfer.error.newer'));
 assert.deepEqual(local.snapshot(),before);
 await pick({size:evil.length,text:async()=>evil});
 await waitFor(h.find,'.is-confirm .v03-panel-accept');
 assert.equal(h.find('.is-confirm img'),null,'file text never becomes markup');
 assert.ok(h.find('.v03-transfer-card').textContent.includes('<img src=x onerror=alert(1)>'));
 h.click('.is-confirm .v03-panel-accept');
 assert.deepEqual(await run,{restored:3});
 assert.deepEqual(h.transfer.notice(),{tone:'info',text:t('transfer.restored',{slot:3})});
 assert.equal(readSlotIndex(local,edition)[2].used,true);assert.equal(readSlotPayload(local,edition,3).data[GOLD_LEDGER_KEY],JSON.stringify(LEDGER));
 for(let i=0;i<5;i++)await turn();
 assert.equal(asked,1);assert.equal(persistenceRecord(local,edition).result,'denied');
 // The slot is filled now: restore is refused without opening anything.
 assert.equal(await h.transfer.run({transfer:'restore',slot:3}),null);
 assert.deepEqual(h.transfer.notice(),{tone:'error',text:t('transfer.error.slot-filled')});
});

test('export: browser download, share sheet in a home-screen app, and the text box as the last way',async()=>{
 const local=filled(),before=local.snapshot();
 let blob=null,copied=null;
 const download=screen(local,{navigator:{userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/131',clipboard:{writeText:async value=>{copied=value;}}},Blob,
  URL:{createObjectURL:value=>{blob=value;return 'blob:test';},revokeObjectURL:noop},setTimeout:fn=>fn()});
 let run=download.transfer.run({transfer:'export',slot:1});
 await waitFor(download.find,'[data-transfer-action="save"]');
 download.click('[data-transfer-action="save"]');for(let i=0;i<10;i++)await turn();
 const status=download.find('.v03-transfer-status');
 assert.match(status.textContent,/moonforest-save-warrior-v5-\d{8}-\d{4}\.mfsave/);
 const text=await blob.text();assert.equal((await inspectFile(text,{edition})).ok,true);
 download.click('[data-transfer-action="copy"]');for(let i=0;i<5;i++)await turn();
 assert.equal(copied,text);assert.equal(status.textContent,t('transfer.copied'));
 download.click('.v03-transfer-back');assert.equal(await run,null);
 let shared=null;
 const ios='Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15';
 const share=screen(local,{navigator:{userAgent:ios,standalone:true,canShare:({files})=>files.length===1,share:async value=>{shared=value;}},File});
 run=share.transfer.run({transfer:'export',slot:1});await waitFor(share.find,'[data-transfer-action="save"]');
 share.click('[data-transfer-action="save"]');for(let i=0;i<10;i++)await turn();
 assert.match(shared.files[0].name,/\.mfsave$/);assert.equal((await inspectFile(await shared.files[0].text(),{edition})).ok,true);
 assert.equal(share.find('.v03-transfer-status').textContent,t('transfer.savedShare'));
 share.click('.v03-transfer-back');await run;
 const boxed=screen(local,{navigator:{userAgent:ios,standalone:true},File});
 run=boxed.transfer.run({transfer:'export',slot:1});await waitFor(boxed.find,'[data-transfer-action="save"]');
 boxed.click('[data-transfer-action="save"]');for(let i=0;i<10;i++)await turn();
 const area=boxed.find('textarea.v03-transfer-text');assert.equal(area.hidden,false);assert.equal(area.readOnly,true);
 assert.equal((await inspectFile(area.value,{edition})).ok,true);assert.equal(boxed.find('.v03-transfer-status').textContent,t('transfer.savedText'));
 boxed.click('.v03-transfer-back');await run;
 assert.deepEqual(local.snapshot(),before,'exporting writes nothing');
 // An empty slot has nothing to export.
 assert.equal(await boxed.transfer.run({transfer:'export',slot:3}),null);assert.equal(boxed.transfer.notice().tone,'error');
});

test('the title shows one calm line when this browser had records and all slots are empty now',()=>{
 const local=memory();rich(local,1);
 let h=screen(local);h.transfer.mount();assert.equal(h.find('.v03-title-notice'),null);
 wipeSlot(local,edition,1);
 h=screen(local);h.transfer.mount();
 assert.equal(h.find('.v03-title-notice').textContent,t('transfer.lostNotice'));
 rich(local,2);h.transfer.saved();assert.equal(h.find('.v03-title-notice'),null);
});

test('every transfer word exists in all five languages',async()=>{
 const ko=(await import('../src/v03/locales/ko.js')).default.ui,keys=Object.keys(ko).filter(key=>key.startsWith('transfer.'));
 assert.ok(keys.length>=40);
 for(const code of TRANSFER_ERRORS)assert.ok(keys.includes('transfer.error.'+code),'error text for '+code);
 for(const {id} of LANGUAGES){
  const pack=(await import(`../src/v03/locales/${id}.js`)).default.ui;
  for(const key of keys){assert.equal(typeof pack[key],'string',id+' '+key);assert.ok(pack[key].length>0);
   const holes=value=>(value.match(/\{[a-z]+\}/g)??[]).sort().join();assert.equal(holes(pack[key]),holes(ko[key]),id+' '+key+' placeholders');}
 }
});

// ----- the whole title: a new device restores a file and continues it -----
async function game(context,local){
 const {document,window}=parseHTML('<html><body><main id="app"><canvas id="viewport"></canvas></main></body></html>'),session=memory(),languageStore=memory();
 writeLanguage(languageStore,'ko');
 const save=createSaveSession({edition,local,session,now:()=>120});
 const wallet=new GoldLoot({storage:save.journey});
 const state={ready:true,character:'warrior-plains',mapId:'great-plains'},calls=[];
 setTypewriterEnabled(false);
 const shell=setupV03({root:document.getElementById('app'),languageStorage:languageStore,save,
  battle:{encounters:[],combat:{maxHp:500,hp:500},combatCount:0,livingCount:0,summon:async()=>true,resetBattle:noop},
  world:{camera:{alpha:1,beta:1,radius:14},scene:{isDisposed:false},terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>[]}},
  getState:()=>state,getPlayer:()=>({position:{x:0,z:0}}),getController:()=>({}),wait:async()=>{},
  input:{setSuspended:noop},actions:{move:noop,attack:noop,dodge:noop,guard:noop},
  createVisual:()=>({place:noop,dispose:noop}),createGuide:null,createMarkers:null,
  placeProps:async()=>true,resetStage:noop,startWorld:noop,stopWorld:noop,
  reloadProgress:()=>{wallet.reload();calls.push(['reload',save.slot]);return true;},
  restartProgress:()=>{wallet.reload();calls.push(['restart',save.slot]);return true;},
  travel:async character=>{state.character=character;state.mapId=({'warrior-v3':'village','warrior-v5':'witch-cave','warrior-plains':'great-plains'})[character];return true;}});
 shell.story.prepareOpeningCast=async map=>shell.story.prepare(map);
 context.after(()=>shell.dispose());
 for(let i=0;i<5;i++){await turn();shell.update(.4);}
 await turn();assert.equal(shell.screen,'title');
 const find=selector=>document.querySelector(selector);
 const press=async selector=>{click(window,find(selector));await turn();};
 const escape=async()=>{const event=new window.Event('keydown',{bubbles:true,cancelable:true});event.key='Escape';document.dispatchEvent(event);await turn();};
 return {shell,find,press,escape,save,state,calls,wallet};
}

test('a new device: restore the exported file into the empty boot slot from the title, then continue it',async context=>{
 const source=filled(),made=await exported(source);
 const local=memory(),h=await game(context,local);
 assert.equal(h.save.slot,1,'a blank device binds the page to slot 1');
 assert.equal(h.find('[data-action="load"]').disabled,true);
 await h.press('[data-action="new"]');
 assert.equal(h.find('[data-transfer="export"]'),null);
 await h.press('[data-transfer="restore"][data-transfer-slot="1"]');
 const area=await waitFor(h.find,'.v03-transfer-paste textarea');area.value=made.text;
 await h.press('[data-transfer-action="check"]');
 await waitFor(h.find,'.is-confirm .v03-panel-accept');await h.press('.is-confirm .v03-panel-accept');
 const line=await waitFor(h.find,'.v03-transfer-notice');assert.equal(line.textContent,t('transfer.restored',{slot:1}));
 assert.ok(h.find('[data-transfer="export"][data-transfer-slot="1"]'),'the restored slot now offers export');
 assert.deepEqual(readSlotPayload(local,edition,1).data,readSlotPayload(source,edition,1).data);
 await h.escape();
 assert.equal(h.find('[data-action="load"]').disabled,false,'continue opens once a record exists');
 await h.press('[data-action="load"]');await h.press('[data-slot="1"]');
 await waitFor(h.find,'[data-chapter="2"]');await h.press('[data-chapter="2"]');
 for(let i=0;i<150&&h.shell.screen!=='play';i++)await delay(4);
 assert.equal(h.shell.screen,'play');
 assert.deepEqual(h.calls,[['reload',1]],'the restored record is read again, not the empty one this page booted with');
 assert.equal(h.wallet.balance,1234);assert.deepEqual(h.wallet.town,LEDGER.town);
 assert.equal(h.state.mapId,'witch-cave');assert.equal(h.shell.story.log.quest().id,'E02');
});
