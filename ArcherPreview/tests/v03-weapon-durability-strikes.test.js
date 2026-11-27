import test from 'node:test';
import assert from 'node:assert/strict';
import {GoldLoot} from '../src/gold-loot.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {forgeCursor,forgeGain,forgeGradeWear,forgeResult,TOWN_ITEMS} from '../src/v03/town-items.js';
import {PLAYER_STRIKES} from '../src/player-strikes.js';
import {boostSwordStrike} from '../src/equipment-stats.js';
import {ChapterEnemyBrain,CHAPTER_COMBAT} from '../src/v03/chapter-enemy-brain.js';
import {setupTownServices} from '../src/v03/town-services.js';
import {createCombatTrail} from '../src/v03/combat-trail.js';
import {itemName} from '../src/v03/town-items.js';
import {t} from '../src/v03/i18n.js';
import {parseHTML} from 'linkedom';

// Astra #210 / user 09:58: a +10 blade showing attack +28 struck lower than a +14
// one in the forest and the cave. The strike adds economy.attack to each window
// (main.js strikeSampler.sample, equipment-stats boostSwordStrike); the economy's
// attack is the item's attack + its tempered bonus while the blade has durability, else 0.
// 2026-11-26: +N now counts attempts, so the same +28 blade is a +7 here (six great
// successes and one success; the dice wear 5, a great success takes none: 96 -> 91 durability.
// 2026-11-27: a great success no longer wears the maximum (FORGE_RULES.gradeWear).
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
const strike=bonus=>PLAYER_STRIKES.attack.map(window=>boostSwordStrike(window,bonus).damage);

const WEARS_FIVE={random:()=>.75};
function temperToTwenty(town){
 for(let i=0;i<6;i++)assert.equal(town.forge(forgeCursor(450)),'Perfect');
 assert.equal(town.forge(.36),'Success');
}
test('six great tempers and a success yield a +7 blade with attack +28, 91 durability and 910 distinct contacts',()=>{
 const storage=store(),gold=new GoldLoot({storage});gold.creditCumulative('forge-test',5000);
 const town=createTownEconomy(gold,{},WEARS_FIVE);
 assert.ok(town.grant('goblin-cleaver'));assert.ok(town.grant('spiked-club'));assert.ok(town.grant('iron-scrap',20));
 assert.ok(town.equip('goblin-cleaver'));
 // Six great successes (+3 each) and a success (+2): +20. Only the success wears (5): 96 -> 91.
 temperToTwenty(town);
 assert.deepEqual(town.gear(),{level:7,bonus:20,blessed:false,hp:91,max:91,attack:28,defense:0});
 assert.equal(town.attack,28);
 const forged=strike(town.attack);
 assert.ok(town.equip('spiked-club'));
 assert.deepEqual(town.gear('spiked-club'),{level:0,bonus:0,blessed:false,hp:103,max:103,attack:14,defense:0});
 const club=strike(town.attack);
 assert.deepEqual(forged,[46,48]);assert.deepEqual(club,[32,34]);
 // The bag's comparison while the club is worn: +28, change +14.
 assert.equal(town.gear('goblin-cleaver').attack-town.attack,14);
 // Contact events from multiple windows and targets share the same action id.
 assert.ok(town.equip('goblin-cleaver'));
 for(let action=1;action<910;action++){
  assert.equal(town.damageWeapon(action),action%10===0);assert.equal(town.damageWeapon(action),false,'once per action');
 }
 assert.equal(town.gear().hp,1);assert.equal(town.attack,28,'still +28 with 1 durability left');
 assert.equal(town.damageWeapon(910),true);
 assert.deepEqual(town.gear(),{level:7,bonus:20,blessed:false,hp:0,max:91,attack:0,defense:0});
 assert.equal(town.attack,0,'a broken blade adds nothing, not even its own +8');
 const broken=strike(town.attack);
 assert.deepEqual(broken,[18,20]);
 assert.ok(broken.every((damage,i)=>damage<club[i]),'the broken +28 blade now hits below the +14 club');
 // The enemy loses exactly the window damage (no map, resistance or level scaling in brain.hit).
 for(const [label,damage] of [['forged',forged[0]],['club',club[0]],['broken',broken[0]]]){
  const foe=new ChapterEnemyBrain(CHAPTER_COMBAT['goblin-archer'],{});foe.hit({damage});
  assert.equal(CHAPTER_COMBAT['goblin-archer'].hp-foe.hp,damage,label);
 }
 // The state is the saved one: a resumed game (same slot) keeps the level and the break.
 assert.ok(town.flush());
 const resumed=createTownEconomy(new GoldLoot({storage}));
 assert.deepEqual(resumed.gear('goblin-cleaver'),{level:7,bonus:20,blessed:false,hp:0,max:91,attack:0,defense:0});
 assert.equal(resumed.attack,0);
 // Repair restores the full +28.
 assert.ok(resumed.repair());assert.equal(resumed.attack,28);assert.equal(resumed.gear().hp,91);
});

test('reaching the same +18 with great successes takes fewer attempts and keeps more contacts than successes or fair strikes',()=>{
 const base=TOWN_ITEMS['goblin-cleaver'].max;
 // At the usual wear of 4: [attempts, contacts left on a full blade].
 const life=grade=>{
  let piece={level:0,max:base},bonus=0;
  while(bonus<18){piece=forgeResult(piece.level,piece.max,forgeGradeWear(grade,4));bonus+=forgeGain('sword',grade);}
  return [piece.level,10*piece.max];
 };
 assert.deepEqual(life('Perfect'),[6,960],'a great success keeps the whole maximum (2026-11-27)');
 assert.deepEqual(life('Success'),[9,600]);
 assert.deepEqual(life('Near miss'),[18,600],'a near miss wears half (2 of 4)');
});

test('each blade keeps its fractional wear through swaps and resume, then repairs or retires cleanly',()=>{
 const storage=store(),gold=new GoldLoot({storage});gold.creditCumulative('wear-test',1000);
 let town=createTownEconomy(gold);const sword='goblin-cleaver',club='spiked-club';
 for(const id of [sword,club])town.grant(id);
 let serial=0;
 const hit=n=>{for(let i=0;i<n;i++){const id=++serial;town.damageWeapon(id);town.damageWeapon(id);}};
 town.equip(sword);hit(9);town.equip(club);hit(4);town.flush();
 town=createTownEconomy(new GoldLoot({storage}));
 assert.equal(town.gear(sword).hp,96);assert.equal(town.gear(club).hp,103);
 town.equip(sword);hit(1);assert.equal(town.gear().hp,95);
 hit(9);town.repair(sword);hit(1);assert.equal(town.gear().hp,96);
 town.equip(club);hit(5);assert.equal(town.gear().hp,103);hit(1);assert.equal(town.gear().hp,102);
 assert.ok(town.spend(sword));assert.ok(town.grant(sword));town.equip(sword);hit(9);
 assert.equal(town.gear().hp,96,'a newly acquired sword has a fresh contact count');
});

test('skill rank changes preserve fractional wear, including the fraction carried past the first full point',()=>{
 const gold=new GoldLoot({storage:store()});gold.creditCumulative('test-reset-cost',100);
 const town=createTownEconomy(gold);
 const start=town.gear().hp;let id=0;
 const hit=n=>{for(let i=0;i<n;i++)town.damageWeapon(++id);};
 hit(9);assert.ok(town.learnSkill('weaponCare'));
 hit(1);assert.equal(town.gear().hp,start,'9/10 + 1/15 is still below one');
 hit(1);assert.equal(town.gear().hp,start-1);
 assert.equal(town.state.condition['field-sword'].wearUnits,70,'1/30 remains');
 hit(14);assert.equal(town.gear().hp,start-1);
 hit(1);assert.equal(town.gear().hp,start-2);
 assert.ok(town.refundSkills());
 hit(9);assert.equal(town.gear().hp,start-2);hit(1);assert.equal(town.gear().hp,start-3);
 for(const [rank,interval] of [[2,20],[3,25],[4,30],[5,35]]){
  const fresh=createTownEconomy(new GoldLoot({storage:store()}));fresh.gainExperience(1000);
  for(let step=0;step<rank;step++)assert.ok(fresh.learnSkill('weaponCare'));
  const max=fresh.gear().hp;
  for(let i=1;i<interval;i++)fresh.damageWeapon(i);
  assert.equal(fresh.gear().hp,max);fresh.damageWeapon(interval);assert.equal(fresh.gear().hp,max-1);
 }
});

test('the breaking hit still lands at +28, the next one at base, and the break is told once (not again on swaps)',()=>{
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
 const storage=store(),gold=new GoldLoot({storage});gold.creditCumulative('forge-test',5000);
 const notes=[];
 const services=setupTownServices({root:document.getElementById('app'),world:{v03:{playing:true},mapId:'monster-forest'},wallet:gold,legacy:()=>({}),
  player:()=>null,battle:()=>null,controls:()=>null,appearance:()=>null,canInteract:()=>false,onPause(){},notify:message=>notes.push(message),sound(){},...WEARS_FIVE});
 const town=services.economy;
 try{
  town.grant('goblin-cleaver');town.grant('spiked-club');town.grant('iron-scrap',20);town.equip('goblin-cleaver');
  temperToTwenty(town);
  // main.js order: the strike reads economy.attack, the enemy takes it, then the blade wears.
  const land=action=>{const damage=strike(town.attack)[0];services.weaponHit(action);return damage;};
  for(let action=1;action<910;action++)land(action);
  assert.deepEqual(services.weaponMark(),{id:'goblin-cleaver',level:7,hp:1,max:91,attack:28});
  assert.equal(notes.length,0);
  assert.equal(land(910),46,'the hit that breaks it still carries +28');
  assert.deepEqual(notes,[t('shop.weaponBroken',{name:itemName('goblin-cleaver')})]);
  assert.deepEqual(services.weaponMark(),{id:'goblin-cleaver',level:7,hp:0,max:91,attack:0});
  assert.equal(land(911),18,'the next hit has no bonus at all');
  assert.equal(services.weaponHit(912),false,'a broken blade does not wear further');
  // Swapping to the +14 club and back: the club hits higher; no repeated notice.
  assert.ok(services.equip('spiked-club'));assert.equal(land(913),32);
  assert.ok(services.equip('goblin-cleaver'));assert.equal(land(914),18);
  assert.equal(notes.length,1,'told once per break');
  // Repaired, it breaks again only after another 910 actions, and is told again.
  assert.ok(town.repair());assert.equal(strike(town.attack)[0],46);
  for(let action=1000;action<1910;action++)land(action);
  assert.equal(notes.length,2);
 }finally{services.dispose();}
});

test('with diagnostics on, the combat trail keeps the damage and the worn blade on each enemy hit',()=>{
 const local=store(),session=store();let clock=1000;
 const trail=createCombatTrail({local,session,now:()=>clock});
 const foe={kind:'goblin-archer',id:'camp-east-1',brain:{hp:58,mode:'hit',state:'hit'}};
 trail.hit('witch-cave','enemy',foe,420,{damage:34,weapon:{id:'spiked-club',level:0,hp:96,max:103,attack:14}});
 clock+=10;trail.hit('witch-cave','enemy',foe,420);
 const [marked,plain]=trail.current.events;
 assert.deepEqual(marked.detail,{damage:34,weapon:{id:'spiked-club',level:0,hp:96,max:103,attack:14}});
 assert.equal(marked.opponent.hp,58);assert.equal(marked.event,'hit-enemy');
 assert.equal('detail' in plain,false,'diagnostics off: the event is unchanged');
});
