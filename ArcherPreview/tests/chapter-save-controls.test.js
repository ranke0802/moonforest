import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {ChapterJourney,CHAPTER_SAVE} from '../src/chapter-quest-state.js';
import {chapterSaveStatus,createChapterSaveControls} from '../src/chapter-save-controls.js';

const memory=()=>{const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
function fixture(t,journey,extra={}){
 const {document,window}=parseHTML('<html><body><dialog open></dialog></body></html>'),blobs=new Map(),revoked=[];
 const urlApi={createObjectURL:blob=>{const url='blob:progress-'+blobs.size;blobs.set(url,blob);return url;},revokeObjectURL:url=>revoked.push(url)};
 const doc={createElement:document.createElement.bind(document),defaultView:{URL:urlApi,Blob}};
 const view=createChapterSaveControls({document:doc,journey,...extra});document.querySelector('dialog').append(view.element);t.after(()=>view.dispose());
 return {document,window,view,blobs,revoked,find:s=>view.element.querySelector(s),click:name=>view.element.querySelector('[data-save='+name+']').click()};
}

test('unavailable storage is explained without claiming a successful automatic save',t=>{
 const journey=new ChapterJourney(undefined),f=fixture(t,journey);
 assert.match(f.find('[data-save-status]').textContent,/브라우저 저장 불가/);
 assert.doesNotMatch(f.find('[data-save-status]').textContent,/자동 저장됨/);
 assert.equal(f.find('[data-save-import-label]').hidden,true);
 assert.equal(f.find('[data-save=backup]').hidden,true);
 assert.match(f.find('[data-save-scope]').textContent,/현재 골드 잔액·정산 원장/);
 assert.match(f.find('[data-save-scope]').textContent,/전체 게임 세이브 가져오기는 지원하지 않습니다/);
});

test('retry reflects a confirmed write and does not hide an independent wallet failure',t=>{
 const storage=memory();let blocked=true;const write=storage.setItem;storage.setItem=(key,value)=>{if(blocked)throw Error('quota');write(key,value);};
 const journey=new ChapterJourney(storage);journey.collect('apple',2,'harvest');
 const f=fixture(t,journey,{getWalletState:()=> 'failed'});assert.match(f.find('[data-save-status]').textContent,/저장 실패/);
 blocked=false;f.click('retry');assert.equal(journey.saveState,'saved');assert.equal(JSON.parse(storage.getItem(CHAPTER_SAVE)).bag.apple,2);
 assert.match(f.find('[data-save-status]').textContent,/골드 저장: 저장 실패/);
 assert.match(chapterSaveStatus(journey,'conflict'),/다른 창/);
});

test('download stays within the active dialog, contains the preserved source and releases on disposal',async t=>{
 const storage=memory();storage.setItem(CHAPTER_SAVE,'{broken');const journey=new ChapterJourney(storage),f=fixture(t,journey);
 let downloads=0;f.find('[data-save-link]').click=()=>{downloads++;assert.ok(f.find('[data-save-link]').closest('dialog[open]'));};
 f.click('export');assert.equal(downloads,1);assert.equal(f.find('[data-save-link]').hidden,false);
 const text=await [...f.blobs.values()][0].text();assert.equal(JSON.parse(text).preservedOriginal,'{broken');assert.equal(storage.getItem(CHAPTER_SAVE),'{broken');
 assert.match(f.find('[data-save-feedback]').textContent,/다운로드를 요청/);assert.equal(f.revoked.length,0);
 f.view.dispose();assert.equal(f.revoked.length,1);
});

test('default controls never call partial import or rollback even if hidden elements are activated',t=>{
 const journey=new ChapterJourney(memory());let imports=0,restores=0;journey.importSave=()=>{imports++;};journey.recoverBackup=()=>{restores++;};
 const f=fixture(t,journey);f.click('backup');f.click('import');assert.equal(imports,0);assert.equal(restores,0);assert.equal(f.find('[data-save-confirm]').hidden,true);
});
