// 2026-11-27, user: "빛무리가 메인퀘스트만 따라감. 기본은 메인의뢰에 메인 의뢰 선택하면 메인의뢰
// 안내하고 선택의뢰 선택하면 선택의뢰 안내하게 해줘." The guide light leads to the current
// step of the page the quest panel shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createStory} from '../src/v03/story.js';
import {QUESTS,NPCS,DIALOGUES,ERRANDS,ROUTES} from '../src/v03/data/chapter1.js';
import {setPack} from '../src/v03/i18n.js';
import ko from '../src/v03/locales/ko.js';

const EXTRA=[
 {id:'T-buy-potion',giver:'elder',title:'a',steps:[{id:'buy',text:'a',type:'town',action:'buy',item:'potion'}]},
 {id:'T-buy-shield',giver:'elder',title:'b',steps:[{id:'buy',text:'b',type:'town',action:'buy',item:'oak-shield'}]},
 {id:'T-craft-blade',giver:'elder',title:'c',steps:[{id:'make',text:'c',type:'town',action:'craft',item:'wolf-blade'}]},
 {id:'T-repair',giver:'elder',title:'d',steps:[{id:'fix',text:'d',type:'town',action:'repair'}]},
 {id:'T-odd',giver:'chief',title:'e',steps:[{id:'odd',text:'e',type:'town',action:'pray'}]},
 {id:'T-far',giver:'youth',title:'f',steps:[{id:'hunt',text:'f',type:'defeat',map:'nowhere',count:1}]},
];
function run({active,page,quest='M07',step=0,items={}}){
 setPack('ko',ko);
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
 const values=new Map(),journey={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 // Format 2 (2026-11-27): the cursor is read by quest id.
 journey.setItem('v03-story-v1',JSON.stringify({v:2,id:quest==='done'?'#end':quest,quest:quest==='done'?QUESTS.length:QUESTS.findIndex(row=>row.id===quest),step,count:0,done:[]}));
 journey.setItem('v03-errands-v1',JSON.stringify({active,finished:[]}));
 if(page)journey.setItem('v03-quest-page-v1',page);
 const player={position:{x:0,z:0}},shown=[];
 const world={scene:{isDisposed:false},mapId:'village',terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>null}};
 const api={world,battle:{encounters:[],combatCount:0},input:{setSuspended(){}},getPlayer:()=>player,getController:()=>null,creditGold:(_s,n)=>n,addPotions:n=>n,toast(){},itemCount:id=>items[id]??0};
 const story=createStory({api,doc:document,save:{journey,touch:()=>true},content:{QUESTS,NPCS,DIALOGUES,ERRANDS:[...ERRANDS,...EXTRA],ROUTES},
  createVisual:()=>({place(x,y,z){this.position={x,y,z};},dispose(){}}),
  createGuide:()=>({show(x,y,z){shown.push({x,z});},hide(){},dispose(){}})});
 story.start();
 const at=(map,frames=3)=>{const character=map==='village'?'warrior-v3':map==='great-plains'?'warrior-plains':'warrior-v4';for(let i=0;i<frames;i++)story.update(1/60,{ready:true,mapId:map,character});return story.inspect().guide;};
 return {story,values,player,shown,at,document,items};
}
const ALL={S01:{step:0,count:0},S02:{step:0,count:0},S03:{step:0,count:0},S04:{step:0,count:0}};

test('the main quest by default; each errand page leads to its own step',()=>{
 const r=run({active:ALL});
 try{
  assert.equal(r.story.questPage,null);
  assert.equal(r.at('village'),'exit:monster-forest','main: M07 into the forest');
  r.story.selectPage('S04');assert.equal(r.at('village'),'npc:smith','forge: the smith');
  r.story.selectPage('S02');assert.equal(r.at('village'),'npc:herbalist','craft: the herbalist');
  // 2026-11-27 (1127-chapter): without the meat the light goes where boars drop it, with it to the elder.
  r.story.selectPage('S03');assert.equal(r.at('village'),'exit:great-plains','deliver, bag empty: out to where it drops');
  r.items['boar-meat']=1;assert.equal(r.at('village'),'npc:elder','deliver: the one to hand it to');delete r.items['boar-meat'];
  r.story.selectPage('S01');assert.equal(r.at('village'),'exit:great-plains','defeat on another map: its way out');
  assert.ok(r.shown.length>0,'the light is shown');
  r.story.selectPage(null);assert.equal(r.at('village'),'exit:monster-forest','back to main');
 }finally{r.story.dispose();}
});

test('a report step leads to the giver; on the hunting map the den or the player; elsewhere the way back',()=>{
 const r=run({active:{S01:{step:1,count:0},S04:{step:0,count:0}},page:'S01'});
 try{
  assert.equal(r.at('village'),'npc:youth','turn in: the giver');
  r.story.selectPage('S04');assert.equal(r.at('great-plains'),'exit:village','the smith is in the village');
 }finally{r.story.dispose();}
 const h=run({active:{S01:{step:0,count:0}},page:'S01'});
 try{
  h.player.position={x:-60,z:-30};
  assert.match(h.at('great-plains'),/^den:/,'no beast awake: the nearest den, as for the main hunt');
 }finally{h.story.dispose();}
});

test('village steps: buy where it is sold, craft where the recipe is, repair at the smith; no place of its own: the giver',()=>{
 const rows=[['T-buy-potion','npc:herbalist'],['T-buy-shield','npc:smith'],['T-craft-blade','npc:smith'],['T-repair','npc:smith'],['T-odd','npc:chief'],['T-far','npc:youth']];
 const r=run({active:Object.fromEntries(rows.map(([id])=>[id,{step:0,count:0}]))});
 try{for(const [id,key] of rows){r.story.selectPage(id);assert.equal(r.at('village'),key,id);}}
 finally{r.story.dispose();}
});

test('the driver\u2019s alpha errand (M06, 2026-11-27): out to the plains, the spot, then back to the driver',()=>{
 const r=run({active:{M06:{step:0,count:0}},page:'M06'});
 try{
  assert.equal(r.at('village'),'exit:great-plains','the alpha is on the plains');
  r.player.position={x:-60,z:-30};assert.equal(r.at('great-plains'),'spot:alpha','its ground in the middle of the grassland');
 }finally{r.story.dispose();}
 const h=run({active:{M06:{step:1,count:0}},page:'M06'});
 try{assert.equal(h.at('village'),'exit:great-plains','the driver waits by his wagon');assert.equal(h.at('great-plains'),'npc:driver');}finally{h.story.dispose();}
});

test('with the chapter done, an errand page still has its light',()=>{
 const r=run({active:{S04:{step:0,count:0}},page:'S04',quest:'done'});
 try{assert.equal(r.story.log.step(),null);assert.equal(r.at('village'),'npc:smith');}finally{r.story.dispose();}
});

test('deliver errands without the item (1127-chapter): S03 to the boars on the plains, S06 into the cave for the ghoul',()=>{
 const r=run({active:{S03:{step:0,count:0},S06:{step:0,count:0}},page:'S03'});
 try{
  r.player.position={x:-60,z:-30};
  assert.equal(r.at('great-plains'),'spot:S03-boar','on the plains: the boar bank');
  r.player.position={x:66,z:-12};assert.equal(r.at('great-plains'),null,'at the bank: the light circles the player');
  r.items['boar-meat']=1;assert.equal(r.at('great-plains'),'exit:village','with the meat: back to the elder');
  r.story.selectPage('S06');assert.equal(r.at('village'),'exit:witch-cave','the ghoul mail: the way to the cave');
  r.player.position={x:0,z:46};assert.equal(r.at('monster-forest'),'exit:witch-cave','through the forest');
  r.items['ghoul-mail']=1;assert.equal(r.at('monster-forest'),'exit:village','with the link: back to the smith');
 }finally{r.story.dispose();}
});
