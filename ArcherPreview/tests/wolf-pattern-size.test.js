import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {WolfBrain,WOLF_CLIPS,WOLF_BALANCE,WOLF_SCALE} from '../src/wolf-spec.js';
import {WolfGrab} from '../src/wolf-grab.js';
import {BossPatternSettings,BOSS_PATTERN_CATALOG,setupBossPatternPanel} from '../src/boss-pattern-settings.js';
const config=JSON.parse(fs.readFileSync(new URL('../public/assets/alpha-wolf.json',import.meta.url))),durations=Object.fromEntries(config.catalog.map(c=>[c.name,c.duration]));
const storage=()=>({value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}});
test('wolf pattern catalog exposes both attacks and saved wolf edits preserve every other boss profile',()=>{
 assert.deepEqual(BOSS_PATTERN_CATALOG.wolf.patterns.map(p=>p.id),[WOLF_CLIPS.lunge,WOLF_CLIPS.pin]);const saved=storage(),prefs=new BossPatternSettings(saved);
 prefs.set('bear',{custom:true,sequence:['Right_Jab_from_Guard'],speed:1.3});const before=structuredClone(prefs.value.bear);
 prefs.set('wolf',{custom:true,sequence:[WOLF_CLIPS.pin,WOLF_CLIPS.lunge,WOLF_CLIPS.pin],speed:1.7});assert.deepEqual(prefs.value.bear,before);assert.deepEqual(new BossPatternSettings(saved).value,prefs.value);
 prefs.reset('wolf');assert.deepEqual(prefs.value.bear,before);assert.deepEqual(prefs.value.wolf,{custom:false,sequence:[],speed:1});
});
test('custom wolf order repeats duplicates; speed-only or unrelated edits retain the next pattern',()=>{
 const b=new WolfBrain(durations),sequence=[WOLF_CLIPS.pin,WOLF_CLIPS.lunge,WOLF_CLIPS.pin];b.configureAttacks({custom:true,sequence,speed:1});b.start(WOLF_CLIPS.watch,'idle');const played=[];
 for(let i=0;i<9;i++){
  b.wait=0;const desired=sequence[i%sequence.length],distance=desired===WOLF_CLIPS.pin?WOLF_BALANCE.pinDistance:WOLF_BALANCE.lungeDistance;b.update(.01,distance);assert.equal(b.mode,'attack');played.push(b.state);
  b.configureAttacks({custom:true,sequence:[...sequence],speed:i%2?2:.5});for(let n=0;n<5&&b.mode==='attack';n++)b.update(100,distance);assert.equal(b.mode,'idle');
 }
 assert.deepEqual(played,[...sequence,...sequence,...sequence]);
 const bad=new WolfBrain(durations);bad.configureAttacks({custom:true,sequence:['missing'],speed:99});assert.equal(bad.attackSettings.custom,false);assert.equal(bad.attackSettings.speed,2);
});
test('wolf speed .5/1/2 changes bite wall time, locks during attack and never duplicates skipped events',()=>{
 for(const fps of [30,60])for(const speed of [.5,1,2]){
  const b=new WolfBrain(durations);b.configureAttacks({speed});b.start(WOLF_CLIPS.lunge,'attack');let elapsed=0,at=null,hits=0;
  while(elapsed<2.25/speed+.2){const result=b.update(1/fps,WOLF_BALANCE.lungeDistance);elapsed+=1/fps;if(elapsed>.1)b.configureAttacks({speed:2.5-speed});for(const event of result.events){hits++;at=elapsed;assert.equal(event.name,WOLF_CLIPS.lunge);assert.equal(b.time,2.25);}}
  assert.equal(hits,1);assert.ok(Math.abs(at-2.25/speed)<=1/fps+1e-7);assert.equal(b.castSpeed,speed);b.start(WOLF_CLIPS.pin,'attack');assert.equal(b.castSpeed,2.5-speed);
 }
 const b=new WolfBrain(durations);b.start(WOLF_CLIPS.pin,'attack');const g=new WolfGrab(()=>{},()=>hits++);let hits=0;assert.equal(b.update(100,2).events.length,1);g.start({},null,b.serial);b.update(100,2);assert.equal(b.time,1.85);g.update(.1,{state:b.state,serial:b.serial,clipTime:b.time});b.update(100,2);g.update(.1,{state:b.state,serial:b.serial,clipTime:b.time});assert.equal(hits,1);assert.equal(g.active,false);
});
test('selected pin approaches and selected lunge backs away to its authored range without consuming the pattern',()=>{
 const b=new WolfBrain(durations);b.configureAttacks({custom:true,sequence:[WOLF_CLIPS.lunge,WOLF_CLIPS.pin]});b.start(WOLF_CLIPS.watch,'idle');b.wait=0;
 assert.equal(b.update(.01,3).retreat,true);assert.equal(b.customAttackIndex,0);b.update(.01,WOLF_BALANCE.lungeDistance);assert.equal(b.state,WOLF_CLIPS.lunge);assert.equal(b.customAttackIndex,1);
 for(let i=0;i<4&&b.mode==='attack';i++)b.update(100,26);b.wait=0;const result=b.update(.01,26);assert.equal(result.retreat,false);assert.equal(b.mode,'move');assert.equal(b.customAttackIndex,1);
 b.update(.01,WOLF_BALANCE.pinDistance);assert.equal(b.state,WOLF_CLIPS.pin);
});
test('2.5x world size keeps source files/texture and movement speed, with gait cadence matched to the larger stride',()=>{
 assert.equal(config.scale,2.5);assert.equal(config.height,3.75);assert.equal(WOLF_SCALE,2.5);assert.equal(config.balance.radius,1.625);assert.equal(config.balance.separationRadius,1.875);assert.equal(config.balance.hp,900);assert.equal(config.balance.biteDamage,100);assert.equal(config.balance.pinDamage,120);
 assert.equal(config.sourceSha256,'38057d9820c296c883a5545fc7528bffdda88e78387b9b5b1fe117b89cb09bce');assert.equal(config.texture.runtimeSha256,'445fbd01f773332c1b5a01bf2381ddd417b3c49fd3358c093d6807b2a50f819a');assert.equal(config.model,'./content/e3e18718e561fb963b7c18d54a515f69e22da58bf271e0ebfe3c5c97decc6a63.gltf');
 const b=new WolfBrain(durations);b.start(WOLF_CLIPS.run,'move');const r=b.update(.1,35);assert.equal(r.speed,4.2);assert.ok(Math.abs(b.time-.04)<1e-8);assert.equal(b.balance.walkSpeed,.9);
});
test('actual pattern controls select wolf, add/reorder/remove, persist speed and reset only wolf',t=>{
 const {document,window}=parseHTML('<main id="app"><button id="open-boss-patterns">patterns</button></main>'),old=globalThis.document;globalThis.document=document;t.after(()=>globalThis.document=old);
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.getAttribute('value')===String(v));}});
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
 const q=s=>document.querySelector(s),event=(s,name)=>q(s).dispatchEvent(new window.Event(name,{bubbles:true})),saved=storage(),panel=setupBossPatternPanel({storage:saved});q('#pattern-boss-kind').value='wolf';event('#pattern-boss-kind','change');
 assert.equal(q('#pattern-add-kind').querySelectorAll('option').length,2);q('#pattern-add-kind').value=WOLF_CLIPS.pin;event('#pattern-add','click');q('#pattern-add-kind').value=WOLF_CLIPS.lunge;event('#pattern-add','click');event('#pattern-stack button[data-action="down"]','click');assert.deepEqual(panel.settings.value.wolf.sequence,[WOLF_CLIPS.lunge,WOLF_CLIPS.pin]);event('#pattern-stack button[data-action="remove"]','click');assert.deepEqual(panel.settings.value.wolf.sequence,[WOLF_CLIPS.pin]);
 q('#boss-attack-speed').value='1.6';event('#boss-attack-speed','input');assert.equal(new BossPatternSettings(saved).value.wolf.speed,1.6);const others=structuredClone(panel.settings.value.bear);event('#reset-boss-patterns','click');assert.deepEqual(panel.settings.value.wolf,{custom:false,sequence:[],speed:1});assert.deepEqual(panel.settings.value.bear,others);
});
