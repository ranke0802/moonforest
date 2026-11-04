import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {authoringCharacter,authoringUrl,setupAuthoringNavigation,AUTHORING_MAPS} from '../src/authoring-navigation.js';
import {travelUrl,mapForCharacter} from '../src/map-route.js';

test('all four authoring map IDs produce valid in-game travel, preserve release and leave obsolete tool flags behind',()=>{
 for(const row of AUTHORING_MAPS){assert.equal(mapForCharacter(authoringCharacter(row.mapId)),row.mapId);const travel=travelUrl('https://game.test/index.html?character=warrior-v3&release=moonforest-0.1',authoringCharacter(row.mapId));assert.equal(new URL(travel).searchParams.get('character'),row.character);const next=new URL(authoringUrl('https://game.test/index.html?character=warrior-v5&actorLab=1&cinematicPreview=1&rev=latest',{mode:'map',mapId:row.mapId}));assert.equal(next.searchParams.get('developer'),'1');assert.equal(next.searchParams.get('character'),row.character);assert.equal(next.searchParams.get('release'),'moonforest-0.1');assert.equal(next.searchParams.has('actorLab'),false);assert.equal(next.searchParams.has('cinematicPreview'),false);}
 assert.throws(()=>authoringCharacter('missing'));const saved=new URL(authoringUrl('https://game.test/index.html',{mode:'cinematic',mapId:'witch-cave',sceneId:'my:scene'}));assert.equal(saved.searchParams.get('scene'),'my:scene');
});
test('visible menu exposes tools and follows the current map after an in-document map change',async()=>{
 const {document,window}=parseHTML('<main id="app"></main>'),root=document.querySelector('main'),state={ready:true,mapId:'village'},visited=[];
 const api=setupAuthoringNavigation({root,href:'https://game.test/index.html?release=moonforest-0.1&developer=1&character=warrior-v3',mapId:'village',getState:()=>state,onMapChange:async id=>{visited.push(id);state.mapId=id;}});
 assert.match(root.textContent,/게임하기/);assert.match(root.textContent,/컷씬 만들기/);const select=root.querySelector('select');Object.defineProperty(select,'value',{value:'monster-forest',writable:true});select.dispatchEvent(new window.Event('change'));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(visited,['monster-forest']);assert.equal(new URL(root.querySelector('[data-create-mode="game"]').href).searchParams.get('character'),'warrior-v4');api.dispose();assert.equal(root.children.length,0);
});
