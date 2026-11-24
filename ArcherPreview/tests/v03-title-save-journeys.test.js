import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {setTimeout as delay} from 'node:timers/promises';
import {setupV03} from '../src/v03/boot.js';
import {CHAPTERS,questKey} from '../src/v03/chapter-progress.js';
import {chapterWords} from '../src/v03/chapter-select.js';
import {LANGUAGES,useLanguage,t,writeLanguage} from '../src/v03/i18n.js';
import {createSaveSession,slotStorage,writeSlotMeta} from '../src/v03/save-slots.js';
import {QUESTS} from '../src/v03/data/chapter1.js';
import {setTypewriterEnabled} from '../src/v03/typewriter.js';
import {GoldLoot,GOLD_LEDGER_KEY} from '../src/gold-loot.js';

const edition='moonforest-0.3';
const oldWallet=slot=>JSON.stringify({version:1,balance:slot*300,credits:{},town:{bag:{'bronze-blade':1,potion:slot+1},equipped:{sword:'bronze-blade'}}});
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const noop=()=>{};
function memory(){
  const data=new Map();
  return {get length(){return data.size;},key:i=>Array.from(data.keys())[i],getItem:k=>data.get(k)??null,
    setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),snapshot:()=>Object.fromEntries(data)};
}
function html(){
  return parseHTML('<html><body><main id="app"><canvas id="viewport"></canvas></main></body></html>');
}
function saved(local,slot,{cleared=false,chapter=1,quest=1,character='warrior-v3'}={}){
  writeSlotMeta(local,edition,slot,{chapter,character,playSeconds:480+slot,savedAt:27,createdAt:11});
  const progress=slotStorage(local,edition,slot);
  progress.setItem(GOLD_LEDGER_KEY,oldWallet(slot));
  progress.setItem(questKey(1),JSON.stringify({quest:cleared?QUESTS.length:quest,step:0,count:0,done:[]}));
  if(chapter===2){
    progress.setItem('v03-chapters-v1',JSON.stringify({id:2,done:[1]}));
    progress.setItem(questKey(2),JSON.stringify({quest,step:0,count:0,done:[]}));
  }
}
async function game(context,local,language='ko'){
  const {document,window}=html(),session=memory(),languageStore=memory();
  writeLanguage(languageStore,language);
  const save=createSaveSession({edition,local,session,now:()=>120});
  const wallet=new GoldLoot({storage:save.journey});
  const state={ready:true,character:'warrior-plains',mapId:'great-plains'}, calls=[];
  const player={position:{x:0,z:0}};
  const battle={encounters:[],combat:{maxHp:500,hp:500},combatCount:0,livingCount:0,
    summon:async()=>true,resetBattle:noop};
  setTypewriterEnabled(false);
  const shell=setupV03({root:document.getElementById('app'),languageStorage:languageStore,save,battle,
    world:{camera:{alpha:1,beta:1,radius:14},scene:{isDisposed:false},terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>[]}},
    getState:()=>state,getPlayer:()=>player,getController:()=>({}),wait:async()=>{},
    input:{setSuspended:noop},actions:{move:noop,attack:noop,dodge:noop,guard:noop},
    createVisual:()=>({place:noop,dispose:noop}),createGuide:null,createMarkers:null,
    placeProps:async()=>true,resetStage:noop,startWorld:noop,stopWorld:noop,
    reloadProgress:()=>{wallet.reload();calls.push(['reload',save.slot]);return true;},
    restartProgress:()=>{wallet.reload();calls.push(['restart',save.slot]);return true;},
    travel:async character=>{state.character=character;state.mapId=({'warrior-v3':'village','warrior-v5':'witch-cave','warrior-plains':'great-plains'})[character];return true;}});
  context.after(()=>shell.dispose());
  for(let i=0;i<5;i++){await turn();shell.update(.4);}
  await turn();
  assert.equal(shell.screen,'title');
  const find=selector=>document.querySelector(selector);
  const click=async selector=>{
    const button=find(selector);assert.ok(button,'expected button '+selector);
    assert.equal(button.disabled,false,'button must be usable '+selector);
    button.dispatchEvent(new window.Event('click',{bubbles:true}));await turn();
  };
  const escape=async()=>{
    const event=new window.Event('keydown',{bubbles:true,cancelable:true});event.key='Escape';
    document.dispatchEvent(event);await turn();
  };
  const playing=async()=>{
    for(let i=0;i<150&&shell.screen!=='play';i++)await delay(4);
    assert.equal(shell.screen,'play');
  };
  return {shell,find,click,escape,save,session,state,calls,playing,wallet};
}

for(const {id} of LANGUAGES){
  test('title, slot, overwrite and chapter pickers use the chosen '+id+' language',async context=>{
    await useLanguage(id);
    const local=memory();saved(local,1);
    const h=await game(context,local,id);
    for(const action of ['new','load','gallery','settings','quit']){
      const button=h.find('[data-action="'+action+'"]');
      assert.equal(button.textContent,t('menu.'+action),action+' should describe its actual action');
    }
    await h.click('[data-action="new"]');
    assert.equal(h.find('.v03-panel-title').textContent,t('menu.new'));
    await h.click('[data-slot="1"]');
    assert.equal(h.find('.v03-panel-title').textContent,t('confirm.overwriteTitle'));
    assert.equal(h.find('.v03-panel-accept').textContent,t('confirm.overwriteAccept'));
    await h.click('.v03-panel-accept');
    const words=chapterWords(id);
    assert.match(h.find('[data-chapter="1"]').textContent,new RegExp(words.chapters[0]));
    assert.ok(h.find('[data-chapter="3"]').textContent.includes(words.later));
    await h.escape();
    if(h.find('[data-slot="1"]'))await h.escape();
    await h.click('[data-action="load"]');
    assert.equal(h.find('.v03-panel-title').textContent,t('menu.load'));
    await h.click('[data-slot="1"]');
    assert.ok(h.find('[data-chapter="2"]').textContent.includes(words.locked));
  });
}

test('first visit can start chapter one in empty slot three without creating a record in the boot slot',async context=>{
  const local=memory(), h=await game(context,local);
  await h.click('[data-action="new"]');
  assert.ok(h.find('[data-slot="3"]'),'even an entirely empty device must show the slot picker first');
  await h.click('[data-slot="3"]');
  assert.equal(h.find('[data-chapter="1"]').disabled,false);
  assert.equal(h.find('[data-chapter="2"]').disabled,true);
  assert.ok(h.save.index().every(meta=>!meta.used),'previewing a chapter creates no save');
  await h.click('[data-chapter="1"]');await h.playing();
  assert.equal(h.save.slot,3);
  assert.deepEqual(h.save.index().map(meta=>meta.used),[false,false,true]);
  assert.equal(h.shell.story.log.quest().id,'M00');
});

test('rejecting overwrite and cancelling after accepting both leave every old slot byte-for-byte intact',async context=>{
  const local=memory();saved(local,1,{cleared:true});saved(local,2);
  const h=await game(context,local), before=local.snapshot();
  await h.click('[data-action="new"]');await h.click('[data-slot="1"]');
  assert.ok(h.find('.v03-panel-accept'),'overwrite is confirmed before choosing the new chapter');
  await h.click('.is-confirm .v03-panel-back');
  assert.deepEqual(local.snapshot(),before);assert.equal(h.save.slot,3);
  // Either returning to title or stepping back one level is safe.
  if(!h.find('[data-slot="1"]'))await h.click('[data-action="new"]');
  await h.click('[data-slot="1"]');await h.click('.v03-panel-accept');
  assert.ok(h.find('[data-chapter="1"]'));
  await h.escape();
  assert.deepEqual(local.snapshot(),before);assert.equal(h.save.slot,3);
  assert.deepEqual(h.session.snapshot(),{});assert.deepEqual(h.calls,[]);
});

test('confirmed overwrite starts fresh in precisely the selected slot, preserving the neighbouring save',async context=>{
  const local=memory();saved(local,1,{quest:3});saved(local,2);
  const h=await game(context,local), neighbour=h.save.index()[1];
  await h.click('[data-action="new"]');await h.click('[data-slot="1"]');await h.click('.v03-panel-accept');
  assert.equal(h.save.inspectSlot(1).getItem(GOLD_LEDGER_KEY),oldWallet(1));
  await h.click('[data-chapter="1"]');await h.playing();
  assert.equal(h.save.slot,1);assert.equal(h.shell.story.log.quest().id,'M00');
  assert.equal(h.save.journey.getItem(GOLD_LEDGER_KEY),null);assert.equal(h.wallet.balance,0);
  assert.deepEqual(h.save.index()[1],neighbour);
  assert.equal(h.save.inspectSlot(2).getItem(GOLD_LEDGER_KEY),oldWallet(2));
  assert.equal(h.save.index()[2].used,false);
});

test('load previews the selected slot, can cancel, and opens the actual second-chapter journal in its saved region',async context=>{
  const local=memory();saved(local,1,{quest:2});saved(local,2,{cleared:true,chapter:2,quest:1,character:'warrior-v5'});
  const h=await game(context,local), before=local.snapshot();
  await h.click('[data-action="load"]');
  assert.equal(h.find('[data-slot="3"]').disabled,true);
  await h.click('[data-slot="1"]');
  const second=h.find('[data-chapter="2"]');
  assert.ok(second,'load must show the selected slot’s chapter picker before binding');
  assert.equal(second.disabled,true);
  await h.escape();assert.deepEqual(local.snapshot(),before);assert.equal(h.save.slot,3);
  if(!h.find('[data-slot="2"]'))await h.click('[data-action="load"]');
  await h.click('[data-slot="2"]');
  assert.equal(h.find('[data-chapter="2"]').disabled,false);
  for(const row of CHAPTERS.filter(row=>!row.entry))assert.equal(h.find('[data-chapter="'+row.id+'"]').disabled,true);
  assert.equal(h.save.slot,3);assert.deepEqual(local.snapshot(),before);
  await h.click('[data-chapter="2"]');await h.playing();await turn();
  assert.equal(h.save.slot,2);assert.equal(h.save.meta().chapter,2);
  assert.equal(h.shell.story.log.quest().id,'E02');
  assert.equal(h.state.mapId,'witch-cave');assert.deepEqual(h.calls,[['reload',2]]);
  assert.equal(h.save.journey.getItem(GOLD_LEDGER_KEY),oldWallet(2));assert.equal(h.wallet.balance,600);
  assert.equal(h.wallet.town.equipped.sword,'bronze-blade');
  assert.equal(h.save.inspectSlot(1).getItem(GOLD_LEDGER_KEY),oldWallet(1));
});
