import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createStoryboard,validateStoryboard} from '../src/storyboard-document.js';
import {createStoryboardEvents} from '../src/storyboard-events.js';
import {setupStoryboardEditor} from '../src/storyboard-editor.js';
const tick=()=>new Promise(r=>setImmediate(r));
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};}
const event=(id,trigger,mapId,options={})=>({id,title:id,trigger,mapId,targetId:'',once:true,sceneId:'',questKey:'',...options});
test('independent map and NPC events wait, use the existing player, and persist once after completion',async()=>{
 let map='great-plains',allowed=false,plays=0,stops=0;const rewards=[],store=storage(),player={state:'ready'};
 const story=createStoryboard();story.scenes=[{format:'moonforest-cinematic',cutsceneId:'intro',mapId:map}];story.events=[event('a','map-enter',map,{sceneId:'intro',questKey:'visit:junction'}),event('b','npc-interact',map,{targetId:'guard',questKey:'talk:guard'})];assert.equal(validateStoryboard(story).valid,true);
 const runtime=createStoryboardEvents({storage:store,getMap:()=>map,canStart:()=>allowed,recordQuest:k=>rewards.push(k),getCinema:async()=>({player,hide:async()=>{},load:async()=>{},execute:async({command})=>{if(command==='play'){plays++;player.state='playing';}else{stops++;player.state='ready';}}})});runtime.configure(story);runtime.emit('map-enter');runtime.update();await tick();assert.equal(plays,0);allowed=true;runtime.update();await tick();assert.equal(plays,1);assert.deepEqual(rewards,[]);player.state='completed';runtime.update();await tick();assert.deepEqual(rewards,['visit:junction']);assert.equal(stops,1);runtime.emit('map-enter');runtime.update();await tick();assert.equal(plays,1);
 runtime.emit('npc-interact',{targetId:'other'});runtime.update();await tick();assert.equal(rewards.length,1);runtime.emit('npc-interact',{targetId:'guard'});runtime.update();await tick();assert.deepEqual(rewards,['visit:junction','talk:guard']);runtime.dispose();
});
test('a scene failure does not consume the one-time event and map changes cancel pending work',async()=>{
 let map='great-plains',calls=0;const store=storage(),story=createStoryboard();story.scenes=[{format:'moonforest-cinematic',cutsceneId:'intro',mapId:map}];story.events=[event('a','map-enter',map,{sceneId:'intro'})];const runtime=createStoryboardEvents({storage:store,getMap:()=>map,canStart:()=>true,getCinema:async()=>{calls++;throw Error('failed');}});runtime.configure(story);runtime.emit('map-enter');runtime.update();await tick();runtime.emit('map-enter');runtime.update();await tick();assert.equal(calls,2);runtime.emit('map-enter');runtime.leaveMap();map='village';runtime.update();await tick();assert.equal(calls,2);runtime.dispose();
});
test('editor adds separate events and round trips them with existing cards',()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),store=storage(),root=document.querySelector('main');const api=setupStoryboardEditor({root,storage:store,getMap:()=> 'great-plains'});api.show();root.querySelector('[data-event-action=add]').dispatchEvent(new window.Event('click',{bubbles:true}));root.querySelector('[data-event-action=add]').dispatchEvent(new window.Event('click',{bubbles:true}));const doc=api.inspect().document;assert.equal(doc.events.length,2);assert.equal(doc.cards.length,8);assert.equal(validateStoryboard(store.getItem('moonforest-storyboard-draft-v1')).valid,true);api.dispose();
});

test('death events queue once and release after scene completion before a death screen can open',async()=>{
 const store=storage(),story=createStoryboard(),player={state:'ready'},calls=[];story.scenes=[{format:'moonforest-cinematic',cutsceneId:'death-scene',mapId:'great-plains'}];story.events=[event('death-event','death','great-plains',{sceneId:'death-scene'})];assert.equal(validateStoryboard(story).valid,true);const runtime=createStoryboardEvents({storage:store,getMap:()=> 'great-plains',canStart:()=>true,getCinema:async()=>({player,hide:async()=>{},load:async()=>{},execute:async({command})=>{calls.push(command);if(command==='play')player.state='playing';}})});runtime.configure(story);assert.equal(runtime.emit('death'),1);assert.equal(runtime.emit('death'),0);runtime.update();await tick();assert.equal(runtime.inspect().active,'death-event');player.state='completed';runtime.update();await tick();assert.deepEqual(runtime.inspect(),{queued:0,active:null});assert.deepEqual(calls,['play','stop']);assert.equal(runtime.emit('death'),0);runtime.dispose();
});
