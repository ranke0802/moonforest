import test from 'node:test';
import assert from 'node:assert/strict';
import {GoldLoot} from '../src/gold-loot.js';
import {slotStorage} from '../src/v03/save-slots.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {CHAPTER_CAMPS} from '../src/v03/chapter-wildlife.js';
import {QUESTS,ERRANDS} from '../src/v03/data/chapter1.js';
import {MAX_TOTAL_XP,monsterExperience,questExperience,recordedQuestIds} from '../src/v03/character-progression.js';

function store(){
 const values=new Map();
 return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
}
const open=storage=>createTownEconomy(new GoldLoot({storage}));

test('real monster and quest rewards, levels and the chapter-one cap persist per slot',()=>{
 const local=store(),first=slotStorage(local,'moonforest-0.3',1),second=slotStorage(local,'moonforest-0.3',2);
 const character=open(first);
 for(const row of [...QUESTS,...ERRANDS])assert.ok(questExperience(row.id)>0,row.id);
 for(const row of Object.values(CHAPTER_CAMPS).flat())assert.ok(monsterExperience(row.kind)>0,row.kind);
 for(const id of ['gray-wolf','fox','boar','wolf','bear','elena'])assert.ok(monsterExperience(id)>0,id);
 assert.equal(monsterExperience('target-dummy'),0);
 assert.equal(character.progression.level,1);
 for(let i=0;i<4;i++)character.gainExperience(monsterExperience('fox'));
 assert.equal(character.progression.level,2);assert.equal(character.progression.xp,0);
 assert.equal(character.creditQuests(['M00','M00']),questExperience('M00'));
 assert.equal(open(first).creditQuests(['M00']),0);
 assert.ok(character.gainExperience(100000)>0);
 assert.deepEqual([character.progression.level,character.progression.points,character.progression.nextXp],[20,20,0]);
 assert.equal(character.gainExperience(10),0);assert.equal(open(first).progression.totalXp,MAX_TOTAL_XP);
 assert.equal(open(second).progression.totalXp,0);
});
test('resume grants historical main and side quest XP once, excluding replay and unknown quests',()=>{
 const slot=store(),quests={1:QUESTS,2:['E01','E02']};
 slot.setItem('v03-story-v1',JSON.stringify({quest:3,step:1,done:[]}));
 slot.setItem('v03-story-v1:errands',JSON.stringify({finished:['S01','S99']}));
 slot.setItem('v03-story-chapter-2',JSON.stringify({quest:1,step:0,done:[]}));
 slot.setItem('replay:v03-story-v1',JSON.stringify({quest:10,step:0,done:[]}));
 // An index-only chapter 1 record is read in the 11/27 order: old M03 hunt -> new M03 hunt, after M10.
 const ids=recordedQuestIds(slot,quests);assert.deepEqual(ids,['M00','M01','M10','S01','E01']);
 slot.setItem('v03-story-v1',JSON.stringify({v:2,id:'M04',quest:4,step:0,count:0,done:[]}));
 assert.deepEqual(recordedQuestIds(slot,quests).slice(0,4),['M00','M01','M10','M03']);
 slot.setItem('v03-story-v1',JSON.stringify({quest:3,step:1,done:[]}));
 const character=open(slot);assert.equal(character.creditQuests(ids),ids.reduce((a,k)=>a+questExperience(k),0));
 assert.equal(open(slot).creditQuests(ids),0);
});
test('defeat loot and XP commit together, collecting the same drop cannot recredit it',()=>{
 const slot=store(),character=open(slot),point={x:0,y:0,z:0};
 const drop={id:'foe:test:0',mapId:'monster-forest',model:'clue-satchel',origin:point,position:point,rewards:{'iron-scrap':1}};
 const amount=monsterExperience('goblin-warrior');
 assert.ok(character.scatter([drop],null,amount));const reload=open(slot);
 assert.equal(reload.progression.totalXp,amount);assert.ok(reload.collect([drop.id]));
 assert.equal(reload.collect([drop.id]),null);assert.equal(open(slot).progression.totalXp,amount);
});
test('passive effects survive reload and a refund cancels both bonuses in one payment',()=>{
 const slot=store(),wallet=new GoldLoot({storage:slot});wallet.creditCumulative('seed',100);
 const character=createTownEconomy(wallet);character.gainExperience(40);const base=character.defense;
 assert.ok(character.learnSkill('endurance'));assert.ok(character.learnSkill('guardTraining'));
 assert.equal(character.regen,1.02);assert.equal(character.defense,base+1);
 assert.equal(character.learnSkill('weaponCare'),false);assert.equal(character.learnSkill('constructor'),false);
 const reload=open(slot);assert.equal(reload.defense,base+1);assert.ok(reload.refundSkills());
 assert.equal(reload.regen,1);assert.equal(reload.defense,base);assert.equal(reload.gold,0);
 assert.equal(reload.refundSkills(),false);assert.equal(open(slot).progression.points,2);
});
