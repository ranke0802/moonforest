import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createStoryboard,createStoryboardCard,validateStoryboard,moveStoryboardCard,addStoryboardCard,removeStoryboardCard} from '../src/storyboard-document.js';
import {StoryboardRunner} from '../src/storyboard-runner.js';
import {setupStoryboardEditor} from '../src/storyboard-editor.js';
import {CinematicPlayer} from '../src/cinematic-player.js';
import {createCinematicDraft} from '../src/cinematic-document.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {setupStoryboardLive} from '../src/storyboard-live.js';
import {readStoryboardOpening,setupStoryboardOpening} from '../src/storyboard-opening.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function storage(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),values};}
function project(){const doc=createStoryboard();doc.cards=doc.cards.slice(0,4);doc.cards[0]={...createStoryboardCard('manual','one'),next:'two'};doc.cards[1]={...createStoryboardCard('zone','two'),zone:{x:3,z:4,radius:2},next:'three'};doc.cards[2]={...createStoryboardCard('cinematic','three'),sceneId:'scene-1',next:'four'};doc.cards[3]={...createStoryboardCard('bear','four'),next:null};doc.entry='one';doc.scenes=[{format:'moonforest-cinematic',cutsceneId:'scene-1',mapId:'great-plains'}];return doc;}
test('card order, links, copied IDs, deletion and data round trip are consistent',()=>{
 let doc=createStoryboard();assert.equal(validateStoryboard(JSON.stringify(doc)).valid,true);
 doc=moveStoryboardCard(doc,'card-1','card-3',true);assert.deepEqual(doc.cards.slice(0,3).map(c=>c.id),['card-2','card-3','card-1']);assert.equal(doc.entry,'card-2');assert.equal(doc.cards[1].next,'card-1');
 doc=addStoryboardCard(doc,createStoryboardCard('manual','copy'),'card-1');assert.equal(doc.cards[2].next,'copy');doc=removeStoryboardCard(doc,'copy');assert.equal(validateStoryboard(JSON.stringify(doc)).valid,true);
 const bad=structuredClone(doc);bad.cards.at(-1).next=bad.entry;assert.match(validateStoryboard(bad).errors.join(),/순환/);
});
test('live sequence waits for real location, releases the existing scene on skip, receives bear defeat once and restores completed state',async()=>{
 const saved=storage(),calls=[];const host={playScene:async s=>calls.push('play:'+s.cutsceneId),stopScene:async()=>calls.push('stop'),summonBear:async()=>calls.push('bear')};const runner=new StoryboardRunner({storage:saved,host});
 await runner.start(project());assert.equal(runner.snapshot().cardId,'one');await runner.advance();runner.update({mapId:'village',position:{x:3,z:4}});await flush();assert.equal(runner.snapshot().cardId,'two');
 runner.update({mapId:'great-plains',position:{x:3,z:4}});await flush();assert.equal(runner.snapshot().cardId,'three');runner.update({mapId:'great-plains'});await flush();assert.equal(runner.status,'scene');await runner.skip();assert.equal(runner.snapshot().cardId,'four');assert.deepEqual(calls,['play:scene-1','stop']);
 runner.update({mapId:'great-plains'});await flush();assert.equal(runner.status,'bear');assert.equal(runner.defeat('goblin'),false);assert.equal(runner.defeat('bear'),true);assert.equal(runner.defeat('bear'),false);await flush();assert.equal(runner.status,'complete');assert.equal(runner.completed.filter(x=>x==='four').length,1);
 const resumed=new StoryboardRunner({storage:saved,host});await resumed.start(project(),{resume:true});assert.equal(resumed.status,'complete');assert.equal(resumed.cardId,null);
});
test('scene failure stays retryable and stop during delayed scene acquisition does not advance',async()=>{
 let release,stop=0;const pending=new Promise(resolve=>release=resolve),host={playScene:async()=>pending,stopScene:async()=>{stop++;},summonBear:async()=>{}};const runner=new StoryboardRunner({storage:storage(),host});const p=project();p.entry='three';p.cards=p.cards.slice(2);await runner.start(p);runner.update({mapId:'great-plains'});assert.equal(runner.status,'preparing');await runner.stop();release();await flush();assert.equal(runner.status,'idle');assert.ok(stop>=1);
});
test('editor supports palette and ordered cards with copy, paste, delete and keyboard input protection',()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),s=storage(),api=setupStoryboardEditor({root,storage:s});api.show();const click=selector=>root.querySelector(selector).dispatchEvent(new window.Event('click',{bubbles:true}));
 const before=api.inspect().document.cards.length;click('[data-palette=zone]');assert.equal(api.inspect().document.cards.length,before+1);
 const send=(target,key,ctrlKey=false)=>{const e=new window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperties(e,{key:{value:key},ctrlKey:{value:ctrlKey},metaKey:{value:false}});target.dispatchEvent(e);};
 let selected=root.querySelector('[data-card][aria-selected=true]');send(selected,'c',true);send(selected,'v',true);assert.equal(api.inspect().document.cards.length,before+2);selected=root.querySelector('[data-card][aria-selected=true]');send(selected,'Delete');assert.equal(api.inspect().document.cards.length,before+1);
 const text=root.querySelector('[data-field=title]');send(text,'Delete');assert.equal(api.inspect().document.cards.length,before+1);
 const saved=JSON.parse(s.getItem('moonforest-storyboard-draft-v1'));assert.equal(validateStoryboard(saved).valid,true);api.dispose();assert.equal(root.children.length,0);
});
test('dragging a card reorders the real links and dragging a palette item inserts a card',()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),api=setupStoryboardEditor({root,storage:storage()});api.show();
 const transfer={data:'',setData(_type,value){this.data=value;},getData(){return this.data;}};
 function fire(node,type){const event=new window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:transfer});node.dispatchEvent(event);}
 fire(root.querySelector('[data-card="card-3"]'),'dragstart');fire(root.querySelector('[data-card="card-1"]'),'drop');let value=api.inspect().document;assert.equal(value.entry,'card-3');assert.equal(value.cards[0].next,'card-1');
 fire(root.querySelector('[data-palette="bear"]'),'dragstart');fire(root.querySelector('[data-card="card-1"]'),'drop');value=api.inspect().document;assert.equal(value.cards[2].type,'bear');assert.equal(value.cards[1].next,value.cards[2].id);assert.equal(validateStoryboard(value).valid,true);api.dispose();
});
test('quest completion, scene failure and bear death wait without changing game state',async()=>{
 const doc=project();doc.cards=[{...createStoryboardCard('quest','quest'),questId:'M00',next:'scene'},{...createStoryboardCard('cinematic','scene'),sceneId:'scene-1',next:'bear'},{...createStoryboardCard('bear','bear'),next:null}];doc.entry='quest';let plays=0;const runner=new StoryboardRunner({storage:storage(),host:{playScene:async()=>{if(++plays===1)throw Error('missing');},stopScene:async()=>{},summonBear:async()=>{}}});await runner.start(doc);
 runner.update({mapId:'great-plains',completedQuests:[]});assert.equal(runner.cardId,'quest');runner.update({mapId:'great-plains',completedQuests:['M00']});await flush();assert.equal(runner.cardId,'scene');runner.update({mapId:'great-plains'});await flush();assert.equal(runner.status,'error');runner.retry();runner.update({mapId:'great-plains'});await flush();assert.equal(runner.status,'scene');await runner.skip();runner.update({mapId:'great-plains'});await flush();runner.update({playerAlive:false});assert.equal(runner.status,'retry');runner.retry();runner.update({mapId:'great-plains',playerAlive:true});await flush();assert.equal(runner.status,'bear');
});
test('existing cinematic player completes and releases before storyboard advances',async()=>{
 let released=0;const cinematicHost={getMapId:()=> 'great-plains',acquire:async()=>({}),prepare:async()=>({}),sample:()=>{},release:async()=>{released++;}};
 const player=new CinematicPlayer({host:cinematicHost,references:{catalog:ASSET_CATALOG,actorDefinitions:{},audioIds:[]}});
 const scene=createCinematicDraft({catalogRevision:ASSET_CATALOG.revision,mapId:'great-plains',cutsceneId:'scene-1'});
 const doc=project();doc.entry='three';doc.cards=doc.cards.slice(2);doc.scenes=[scene];
 const runner=new StoryboardRunner({storage:storage(),host:{playScene:async s=>{await player.load(s);assert.equal(player.play(),true);},stopScene:()=>player.stop('skip'),summonBear:async()=>{}}});
 await runner.start(doc);runner.update({mapId:'great-plains'});await flush();assert.equal(runner.status,'scene');for(let i=0;i<24;i++)player.update(.25);await flush();assert.equal(player.state,'completed');runner.update({sceneState:player.state});await flush();assert.equal(runner.cardId,'four');assert.equal(released,1);
});
test('changed story content cannot silently resume an older cursor',async()=>{
 const saved=storage(),host={stopScene:async()=>{}};const runner=new StoryboardRunner({storage:saved,host}),doc=project();await runner.start(doc);await runner.advance();const changed=structuredClone(doc);changed.cards[1].title='새 구역';await assert.rejects(runner.start(changed,{resume:true}),/변경/);
});
test('editor imports an existing cinematic scene and restores the saved draft',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),saved=storage(),api=setupStoryboardEditor({root,storage:saved});api.show();root.querySelector('[data-card="card-6"]').dispatchEvent(new window.Event('click',{bubbles:true}));
 const scene=createCinematicDraft({catalogRevision:ASSET_CATALOG.revision,mapId:'great-plains',cutsceneId:'scene-1'}),bytes=new TextEncoder().encode(JSON.stringify(scene)),file={size:bytes.length,arrayBuffer:async()=>bytes.buffer},input=root.querySelector('[data-scene-import]');Object.defineProperty(input,'files',{value:[file]});input.dispatchEvent(new window.Event('change',{bubbles:true}));await flush();await flush();
 const result=api.inspect().document;assert.equal(result.cards.find(c=>c.id==='card-6').sceneId,'scene-1');assert.equal(result.scenes[0].cutsceneId,'scene-1');api.dispose();const restored=setupStoryboardEditor({root,storage:saved});restored.show();assert.equal(restored.inspect().document.scenes[0].cutsceneId,'scene-1');restored.dispose();
});
test('saved .moonstory opens in a fresh editor with cards and scene references intact',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),api=setupStoryboardEditor({root,storage:storage()});api.show();const original=project(),input=root.querySelector('[data-import]'),file={size:1000,text:async()=>JSON.stringify(original)};Object.defineProperty(input,'files',{value:[file]});input.dispatchEvent(new window.Event('change',{bubbles:true}));await flush();assert.deepEqual(api.inspect().document,original);assert.equal(api.inspect().selected,'one');api.dispose();
});
test('live integration drives the existing cinematic controller and boss without a second scene',async()=>{
 const {document}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),calls=[],cinema={player:{state:'idle'},async hide(){calls.push('hide');},async load(scene){calls.push('load:'+scene.cutsceneId);this.player.state='ready';},async execute(action){calls.push(action.command);this.player.state=action.command==='play'?'playing':'cancelled';}},battle={encounters:[],playerHp:500,async summon(){calls.push('summon');return true;}},world={mapId:'great-plains'},live=setupStoryboardLive({root,storage:storage(),world,battle,getPlayer:()=>({position:{x:0,z:0}}),getQuests:()=>({done:[]}),getCinema:async()=>cinema});
 const p=project();p.cards=p.cards.slice(2);p.entry='three';await live.start(p);live.update();await flush();assert.deepEqual(calls,['hide','load:scene-1','play']);cinema.player.state='completed';live.update();await flush();assert.equal(live.inspect().cardId,'four');live.update();await flush();assert.deepEqual(calls,['hide','load:scene-1','play','stop','summon']);live.defeat({kind:'bear'});await flush();assert.equal(live.inspect().status,'complete');live.dispose();
});

test('unlinked later scene does not block the first scene but reports an error at its card',async()=>{
 const p=project();p.cards=[{...createStoryboardCard('cinematic','opening'),sceneId:'scene-1',next:'later'},{...createStoryboardCard('cinematic','later'),next:null}];p.entry='opening';
 const calls=[],runner=new StoryboardRunner({storage:storage(),host:{playScene:async scene=>calls.push(scene.cutsceneId),stopScene:async()=>{}}});
 assert.equal(validateStoryboard(p,{requireScenes:true}).valid,false);
 await runner.start(p);runner.update({mapId:'great-plains'});await flush();assert.equal(runner.status,'scene');assert.deepEqual(calls,['scene-1']);
 await runner.skip();runner.update({mapId:'great-plains'});await flush();assert.equal(runner.status,'error');assert.match(runner.error,/later.*컷씬 파일을 연결/);
});

test('editor starts a partially linked storyboard while full connection check reports the missing scene',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),saved=storage(),p=project();
 p.cards=[{...createStoryboardCard('cinematic','opening'),sceneId:'scene-1',next:'later'},{...createStoryboardCard('cinematic','later'),next:null}];p.entry='opening';saved.setItem('moonforest-storyboard-draft-v1',JSON.stringify(p));let started=null;
 const editor=setupStoryboardEditor({root,storage:saved,onStart:async value=>{started=value;}});editor.show();
 root.querySelector('[data-action=validate]').dispatchEvent(new window.Event('click',{bubbles:true}));assert.match(root.querySelector('[data-status]').textContent,/later/);
 root.querySelector('[data-action=start]').dispatchEvent(new window.Event('click',{bubbles:true}));await flush();assert.equal(started.entry,'opening');editor.dispose();
});

test('automatic opening plays the linked first card, stops at title, and returns to the original map',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),saved=storage(),p=project();
 p.cards=[{...createStoryboardCard('cinematic','opening'),sceneId:'scene-1',next:'later'},{...createStoryboardCard('cinematic','later'),next:null}];p.entry='opening';saved.setItem('moonforest-storyboard-draft-v1',JSON.stringify(p));assert.equal(readStoryboardOpening(saved).entry,'opening');
 const world={mapId:'village'},calls=[],input={suspended:false,reset(){},setSuspended(value){this.suspended=value;}},cinema={player:{state:'idle'},async hide(){},async load(){this.player.state='ready';},async execute({command}){calls.push(command);this.player.state=command==='play'?'playing':'cancelled';}},battle={encounters:[],playerHp:500};
 const live=setupStoryboardLive({root,storage:saved,world,battle,getPlayer:()=>({position:{x:0,z:0}}),getCinema:async()=>cinema});
 const opening=setupStoryboardOpening({root,document:p,live,world,input,isReady:()=>true,travel:async map=>{calls.push(map);world.mapId=map;return true;}});
 opening.update();await flush();assert.equal(world.mapId,'great-plains');live.update();await flush();opening.update();assert.equal(opening.inspect().stage,'active');assert.equal(root.querySelector('[data-opening=skip]').hidden,false);assert.equal(input.suspended,true);
 cinema.player.state='completed';live.update();await flush();opening.update();assert.equal(opening.inspect().stage,'title');assert.equal(live.inspect().cardId,'later');assert.equal(opening.blocksStoryboard,true);
 root.querySelector('[data-opening=start]').dispatchEvent(new window.Event('click',{bubbles:true}));await flush();assert.equal(opening.inspect().stage,'started');assert.equal(world.mapId,'village');assert.equal(input.suspended,false);assert.deepEqual(calls,['great-plains','play','stop','village']);opening.dispose();live.dispose();
});

test('opening skip and missing or invalid local draft are safe',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),saved=storage();assert.equal(readStoryboardOpening(saved),null);saved.setItem('moonforest-storyboard-draft-v1','{');assert.equal(readStoryboardOpening(saved),null);
 const p=project();p.cards=[{...createStoryboardCard('cinematic','opening'),sceneId:'scene-1',next:null}];p.entry='opening';saved.setItem('moonforest-storyboard-draft-v1',JSON.stringify(p));let state={status:'scene',cardId:'opening'},skips=0;
 const live={start:async()=>{},inspect:()=>state,skip:async()=>{skips++;state={status:'complete',cardId:null};}},opening=setupStoryboardOpening({root,document:p,live,world:{mapId:'great-plains'},input:{setSuspended(){},reset(){}},isReady:()=>true,travel:async()=>true});
 opening.update();await flush();opening.update();root.querySelector('[data-opening=skip]').dispatchEvent(new window.Event('click',{bubbles:true}));await flush();opening.update();assert.equal(skips,1);assert.equal(opening.inspect().stage,'title');opening.dispose();
});

test('opening observes real cinematic completion before allowing the next storyboard card',async()=>{
 const {document}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),saved=storage(),world={mapId:'great-plains'};let released=0;
 const player=new CinematicPlayer({host:{getMapId:()=>world.mapId,acquire:async()=>({}),prepare:async()=>({}),sample:()=>{},release:async()=>{released++;}},references:{catalog:ASSET_CATALOG,actorDefinitions:{},audioIds:[]}});
 const scene=createCinematicDraft({catalogRevision:ASSET_CATALOG.revision,mapId:'great-plains',cutsceneId:'scene-1'}),p=project();p.cards=[{...createStoryboardCard('cinematic','opening'),sceneId:'scene-1',next:'later'},{...createStoryboardCard('cinematic','later'),next:null}];p.entry='opening';p.scenes=[scene];
 const cinema={player,hide:async()=>{},load:value=>player.load(value),execute:async({command})=>command==='play'?player.play():player.stop('skip')};
 const live=setupStoryboardLive({root,storage:saved,world,battle:{playerHp:500,encounters:[]},getPlayer:()=>({position:{x:0,z:0}}),getCinema:async()=>cinema});
 const opening=setupStoryboardOpening({root,document:p,live,world,input:{reset(){},setSuspended(){}},isReady:()=>true,travel:async()=>true});
 opening.update();await flush();live.update();await flush();opening.update();assert.equal(live.inspect().status,'scene');for(let i=0;i<24;i++)player.update(.25);await flush();live.update();await flush();opening.update();assert.equal(released,1);assert.equal(opening.inspect().stage,'title');assert.equal(live.inspect().cardId,'later');opening.dispose();live.dispose();
});

test('a failed opening map change exposes the game loading recovery instead of hiding it',async()=>{
 const {document}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),p=project(),world={mapId:'village'};p.cards=[{...createStoryboardCard('cinematic','opening'),sceneId:'scene-1',next:null}];p.entry='opening';let stopped=0,suspended=false;
 const opening=setupStoryboardOpening({root,document:p,live:{stop:async()=>{stopped++;}},world,input:{reset(){},setSuspended(value){suspended=value;}},isReady:()=>true,isFailed:()=>true,travel:async()=>false});
 opening.update();await flush();assert.equal(opening.inspect().stage,'started');assert.equal(root.querySelector('.story-opening').hidden,true);assert.equal(suspended,false);assert.equal(stopped,1);opening.dispose();
});

test('the title screen start button completes the immediately following manual start card',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main'),world={mapId:'great-plains'},p=project();p.cards=[{...createStoryboardCard('cinematic','opening'),sceneId:'scene-1',next:'start'},{...createStoryboardCard('manual','start'),next:'zone'},{...createStoryboardCard('zone','zone'),next:null}];p.entry='opening';
 const cinema={player:{state:'idle'},hide:async()=>{},async load(){this.player.state='ready';},async execute({command}){this.player.state=command==='play'?'playing':'cancelled';}};
 const live=setupStoryboardLive({root,storage:storage(),world,battle:{playerHp:500,encounters:[]},getPlayer:()=>({position:{x:0,z:0}}),getCinema:async()=>cinema});
 const opening=setupStoryboardOpening({root,document:p,live,world,input:{reset(){},setSuspended(){}},isReady:()=>true,travel:async()=>true});opening.update();await flush();live.update();await flush();cinema.player.state='completed';live.update();await flush();opening.update();assert.equal(live.inspect().cardId,'start');
 root.querySelector('[data-opening=start]').dispatchEvent(new window.Event('click',{bubbles:true}));await flush();assert.equal(live.inspect().cardId,'zone');assert.equal(opening.inspect().stage,'started');opening.dispose();live.dispose();
});
