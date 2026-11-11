import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoryNpcSettings,STORY_NPC_STORAGE_KEY} from '../src/story-npc-settings.js';

test('story NPC delete and restore persists independently of quest facts and hides only its matching actor',()=>{
 const data=new Map([['moonforest-chapter-one-v1','original quest progress']]),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const actor=()=>({enabled:true,isDisposed:()=>false,isEnabled(){return this.enabled;},setEnabled(v){this.enabled=v;}});
 const guard={actor:actor(),storyNpcId:'guard'},elder={actor:actor(),storyNpcId:'elder'};
 const world={mapId:'village',battle:{encounters:[guard,elder]}},settings=createStoryNpcSettings({world,storage});
 settings.setRemoved(['guard']);assert.equal(guard.actor.enabled,false);assert.equal(elder.actor.enabled,true);assert.equal(data.get('moonforest-chapter-one-v1'),'original quest progress');
 const reloaded=createStoryNpcSettings({world,storage});assert.equal(reloaded.isRemoved('guard'),true);reloaded.setRemoved([]);assert.equal(guard.actor.enabled,true);assert.equal(reloaded.isRemoved('guard'),false);
 assert.deepEqual(JSON.parse(data.get(STORY_NPC_STORAGE_KEY)).removed,[]);assert.throws(()=>reloaded.setRemoved(['unknown']),/목록/);
});

test('an initially disabled actor stays disabled after its story NPC is restored',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},actor={enabled:false,isDisposed:()=>false,isEnabled(){return this.enabled;},setEnabled(v){this.enabled=v;}},encounter={actor,storyNpcId:'guard'},world={mapId:'village',battle:{encounters:[encounter]}};
 const settings=createStoryNpcSettings({world,storage});settings.setRemoved(['guard']);settings.setRemoved([]);assert.equal(actor.enabled,false);
});
