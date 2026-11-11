import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {CHEST_REWARD_CHOICES,normalizeChestItems,resolveChestRewards} from '../src/chest-reward-data.js';
import {createChestRewardEditor} from '../src/chest-reward-editor.js';
import {ChapterJourney} from '../src/chapter-quest-state.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {createBasePlacementManifest,createEmptyPlacementDocument,validatePlacementDocument,PlacementHistory} from '../src/placement-document.js';

const pose={origin:{x:0,y:.5,z:0},position:{x:1,y:.04,z:0}},point={id:'items-test',key:'chest:items-test',tier:3,map:'great-plains'};
const memory=()=>{const data=new Map();let writes=0;return {getItem:k=>data.get(k),setItem(k,v){data.set(k,v);writes++;},get writes(){return writes;}};};

test('explicit chest lists split item models, preserve quantities and claim the complete batch in one durable write',()=>{
 const storage=memory(),j=new ChapterJourney(storage),chest={...point,chestItems:[{id:'apple',count:3},{id:'locket',count:2},{id:'gold',count:70}]},poses=[pose,{origin:pose.origin,position:{x:-1,y:.04,z:0}}];
 assert.ok(j.openChest(chest,{...pose,poses}));assert.equal(storage.writes,1);assert.equal(j.value.pendingDrops.length,5);assert.deepEqual(j.value.pendingDrops.map(d=>d.model),['apple','apple','apple','memory-locket','memory-locket']);assert.deepEqual(j.value.pendingDrops.map(d=>d.rewards),[{apple:1,gold:70},{apple:1},{apple:1},{locket:1},{locket:1}]);assert.deepEqual(j.value.pendingDrops[1].position,poses[1].position);assert.equal(j.value.bag.apple,undefined);
 const next=new ChapterJourney(storage);assert.equal(next.openChest(chest,pose),null);for(const drop of [...next.value.pendingDrops])assert.ok(next.collectDrop(drop.id));assert.equal(next.value.bag.gold,70);assert.equal(next.value.bag.apple,3);assert.equal(next.value.bag.locket,2);assert.equal(next.collectDrop('chest:items-test'),null);assert.equal(next.value.pendingDrops.length,0);
});

test('a configured empty chest opens once without inventing rewards; legacy and special rewards remain intact',()=>{
 const j=new ChapterJourney(memory());assert.equal(j.openChest({...point,chestItems:[]},pose).empty,true);assert.equal(j.value.pendingDrops.length,0);assert.deepEqual(j.value.bag,{});assert.equal(j.openChest({...point,chestItems:[]},pose),null);
 assert.deepEqual(resolveChestRewards({tier:1,id:'lookout-chest',dropAssetId:'apple'}),{'travel-tonic':1,gold:15,'equipment-voucher':1,apple:1});assert.deepEqual(resolveChestRewards({tier:1,id:'lookout-chest',chestItems:[{id:'pie',count:2}]}),{pie:2});
});

test('batch capacity, invalid inventory IDs and forged counts cannot consume chest ownership or partially award items',()=>{
 const j=new ChapterJourney(memory());for(let i=0;i<127;i++)assert.ok(j.addMonsterDrop({id:'existing-'+i,mapId:point.map,model:'apple',...pose,rewards:{apple:1}}));
 const before=JSON.stringify(j.value);assert.equal(j.openChest({...point,chestItems:[{id:'apple',count:1},{id:'pie',count:1}]},pose),null);assert.equal(JSON.stringify(j.value),before);assert.equal(j.seen.has('point:'+point.id),false);
 for(const items of [[{id:'unregistered-sword',count:1}],[{id:'apple',count:10000}],[{id:'apple',count:0}],[{id:'apple',count:1.2}],[{id:'apple',count:1},{id:'apple',count:2}],CHEST_REWARD_CHOICES.slice(0,17).map(item=>({id:item.id,count:1}))]){assert.throws(()=>normalizeChestItems(items));assert.equal(j.openChest({...point,chestItems:items},pose),null);assert.equal(JSON.stringify(j.value),before);}
});

test('multi-item settings roundtrip through moonmap and undo/redo including an explicitly empty list',()=>{
 const base=createBasePlacementManifest('great-plains',{catalog:ASSET_CATALOG}),options={catalog:ASSET_CATALOG,baseManifest:base},asset=ASSET_CATALOG.entries.find(v=>v.assetId==='chest-common'),row={instanceId:'custom-chest',assetId:asset.assetId,assetVersion:asset.version,transform:{position:[0,0,0],rotation:[0,0,0,1],scale:1},attachment:{surface:'ground',normal:[0,1,0],offset:0,supportId:'terrain'},collision:'none',chest:{tier:4,item:'',items:[{id:'pie',count:3},{id:'gold',count:55}]}},doc={...createEmptyPlacementDocument(base),instances:[row]},history=new PlacementHistory(doc,options);
 assert.deepEqual(validatePlacementDocument(JSON.parse(JSON.stringify(doc)),options).instances[0].chest,row.chest);const empty=history.document;empty.instances[0].chest.items=[];history.commit(empty);assert.deepEqual(history.document.instances[0].chest.items,[]);assert.deepEqual(history.undo().instances[0].chest.items,row.chest.items);assert.deepEqual(history.redo().instances[0].chest.items,[]);
 const bad=structuredClone(doc);bad.instances[0].chest.items[0].id='fake';assert.throws(()=>validatePlacementDocument(bad,options));
});

test('reward editor shows defaults, adds quantities, removes actual reward entries and restores grade defaults',async t=>{
 const {document,window}=parseHTML('<main></main>'),host=document.querySelector('main');Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===String(value));}});
 let current={...point},changes=0;const editor=createChestRewardEditor(host,{getPoint:()=>current,onChange:items=>{changes++;current={...current,chestItems:items};}});t.after(()=>editor.dispose());editor.render(current);
 const click=async selector=>{host.querySelector(selector).click();await new Promise(r=>setImmediate(r));},ids=()=>[...host.querySelectorAll('[data-chest-reward-item]')].map(row=>row.dataset.chestRewardItem);
 assert.deepEqual(ids(),['refined-tonic','gold']);assert.equal(host.querySelectorAll('[data-chest-reward-choice] option').length,CHEST_REWARD_CHOICES.length);
 host.querySelector('[data-chest-reward-choice]').value='apple';host.querySelector('[data-chest-reward-count]').value='2';await click('[data-chest-reward-action=add]');assert.equal(current.chestItems.find(item=>item.id==='apple').count,2);await click('[data-chest-reward-remove="refined-tonic"]');await click('[data-chest-reward-remove="gold"]');assert.deepEqual(current.chestItems,[{id:'apple',count:2}]);await click('[data-chest-reward-action=add]');assert.deepEqual(current.chestItems,[{id:'apple',count:4}]);await click('[data-chest-reward-remove="apple"]');assert.deepEqual(current.chestItems,[]);assert.match(host.textContent,/빈 상자로 열립니다/);
 editor.setDisabled(true);await click('[data-chest-reward-action=add]');assert.deepEqual(current.chestItems,[]);editor.setDisabled(false);await click('[data-chest-reward-action=defaults]');assert.equal(current.chestItems,undefined);assert.deepEqual(ids(),['refined-tonic','gold']);assert.equal(changes,6);
});
