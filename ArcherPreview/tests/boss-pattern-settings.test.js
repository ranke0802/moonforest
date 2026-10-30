import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {BossPatternSettings,BOSS_PATTERN_CATALOG,normalizeBossPatterns,setupBossPatternPanel} from '../src/boss-pattern-settings.js';
import {ElenaBrain,ELENA_SPELLS,MOURNING_SPELLS,spellImpact} from '../src/elena-spec.js';
import {BossBrain,BOSS_ATTACKS} from '../src/boss-spec.js';
import {setupSettingsPanel} from '../src/settings-panel.js';
import {setupSummonPanel} from '../src/summon-panel.js';
const durations=name=>Object.fromEntries(JSON.parse(readFileSync(new URL('../public/assets/'+name+'.json',import.meta.url))).catalog.map(c=>[c.name,c.duration]));
const storage=()=>({value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}});

test('pattern JSON rejects unknown attacks, bounds stack/speed and survives storage failures',()=>{
  const s=storage(),prefs=new BossPatternSettings(s);
  const sequence=['invalid',...Array(20).fill('corridor')];prefs.set('mourning-elena',{custom:true,sequence,speed:99});
  assert.equal(prefs.value['mourning-elena'].sequence.length,12);assert.equal(prefs.value['mourning-elena'].speed,2);
  assert.deepEqual(new BossPatternSettings(s).value,prefs.value);prefs.set('elena',{custom:true,sequence:[],speed:'NaN'});assert.equal(prefs.value.elena.custom,false);assert.equal(prefs.value.elena.speed,1);
  assert.doesNotThrow(()=>new BossPatternSettings({getItem(){throw Error();},setItem(){throw Error();}}).reset('bear'));
  assert.equal(normalizeBossPatterns(null).bear.speed,1);
});
test('both Elena phases repeat chosen spells including duplicates and leave movement order intact',()=>{
  for(const mourning of [false,true]){
    const spells=mourning?MOURNING_SPELLS:ELENA_SPELLS,b=new ElenaBrain(mourning?{cast:3,walk:2.4,idle:2.4}:durations('elena'),{mourning});
    const ids=[spells[2],spells[0],spells[2]].map(s=>mourning?s.pattern:s.name);b.configureAttacks({custom:true,sequence:ids,speed:1});
    assert.deepEqual(Array.from({length:9},()=>{const spell=b.cast();b.reposition();return mourning?spell.pattern:spell.name;}),[...ids,...ids,...ids]);
    if(mourning)assert.equal(b.movementTurn,9);
  }
});
test('0.5x through 2x spell warning, authored pose and actual release share one clock; mid-cast changes wait',()=>{
  for(const mourning of [false,true])for(const speed of [.5,1,2]){
    const b=new ElenaBrain(mourning?{cast:3,walk:2.4,idle:2.4}:durations('elena'),{mourning});b.configureAttacks({speed});b.cast();
    const rate=b.attackPlaybackRate,warning=b.castWarningDuration,serial=b.serial;let hits=0,elapsed=0,at;
    while(elapsed<warning+.1){const result=b.update(.001,4,true,{manual:true});elapsed+=.001;if(elapsed>.1)b.configureAttacks({speed:2.5-speed});if(result.events.length){hits+=result.events.length;at=elapsed;}}
    assert.equal(hits,1);assert.ok(Math.abs(at-warning)<.0011);assert.equal(b.serial,serial);assert.equal(b.attackPlaybackRate,rate);assert.ok(b.time>=spellImpact(b.spell,b.durations[b.state]));
    b.cast();assert.notEqual(b.attackPlaybackRate,rate);
  }
});
test('bear custom stack excludes automatic combos/defence choices; source attack clocks retain hit once',()=>{
  const b=new BossBrain(durations('guardian-bear')),sequence=['Left_Hook_from_Guard','Right_Jab_from_Guard'];b.configureAttacks({custom:true,sequence,speed:1.5});
  const attacks=[];for(let frame=0;frame<20000&&attacks.length<10;frame++)for(const event of b.update(.01,1.5,true).events)attacks.push(event.name);
  assert.deepEqual(attacks,Array.from({length:10},(_,i)=>sequence[i%2]));
  assert.equal(b.visited.has('Backflip'),false);assert.equal(BOSS_PATTERN_CATALOG.bear.patterns.length,BOSS_ATTACKS.length);
});

function dom(t){
  const {document,window}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8'));const previous=globalThis.document;globalThis.document=document;t.after(()=>{globalThis.document=previous;});
  // linkedom models DOM/events, not a renderer or native dialog top layer.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(value){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.getAttribute('value')===String(value));}});
  window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
  const q=s=>document.querySelector(s),click=s=>q(s).dispatchEvent(new window.Event('click',{bubbles:true}));
  return {q,click,window,document};
}
test('summon controls move intact inside fullscreen root; settings remain reachable and modal events work',t=>{
  const d=dom(t),button=d.q('#summon-boss');let calls=0;button.addEventListener('click',()=>calls++);setupSettingsPanel();setupSummonPanel();
  assert.equal(d.q('#summon-boss'),button);assert.equal(button.closest('dialog').id,'summon-dialog');assert.equal(button.closest('#app').id,'app');
  assert.equal(d.q('#fullscreen-button').parentNode.className,'top-actions');assert.equal(d.q('#combat-feedback').closest('dialog').id,'motion-speed-dialog');
  d.click('#open-summon');assert.ok(d.q('#summon-dialog').hasAttribute('open'));button.disabled=false;d.click('#summon-boss');assert.equal(calls,1);d.click('#close-summon');assert.equal(d.q('#summon-dialog').hasAttribute('open'),false);
});
test('pattern modal adds, reorders, removes, stores and resets real control events without browser automation',t=>{
  const d=dom(t);setupSettingsPanel();const s=storage();let calls=0;const panel=setupBossPatternPanel({storage:s,onChange:()=>calls++});
  d.click('#open-boss-patterns');assert.ok(panel.dialog.hasAttribute('open'));d.q('#pattern-boss-kind').value='mourning-elena';d.q('#pattern-boss-kind').dispatchEvent(new d.window.Event('change'));
  d.q('#pattern-add-kind').value='ring';d.click('#pattern-add');d.q('#pattern-add-kind').value='fan';d.click('#pattern-add');
  assert.deepEqual(panel.settings.value['mourning-elena'].sequence,['ring','fan']);d.click('#pattern-stack button[data-action="down"]');assert.deepEqual(panel.settings.value['mourning-elena'].sequence,['fan','ring']);
  d.click('#pattern-stack button[data-action="remove"]');assert.deepEqual(panel.settings.value['mourning-elena'].sequence,['ring']);
  d.q('#boss-attack-speed').value='1.7';d.q('#boss-attack-speed').dispatchEvent(new d.window.Event('input'));assert.equal(panel.settings.value['mourning-elena'].speed,1.7);
  assert.equal(new BossPatternSettings(s).value['mourning-elena'].speed,1.7);d.click('#reset-boss-patterns');assert.equal(panel.settings.value['mourning-elena'].custom,false);assert.ok(calls>=6);
});
