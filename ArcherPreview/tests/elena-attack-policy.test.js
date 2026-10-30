import test from 'node:test';
import assert from 'node:assert/strict';
import {ElenaBrain,MOURNING_CAST_RATE,spellImpact} from '../src/elena-spec.js';
import {BossBrain} from '../src/boss-spec.js';
import {readFileSync} from 'node:fs';
const config=name=>JSON.parse(readFileSync(new URL('../public/assets/'+name+'.json',import.meta.url)));
const durations=name=>Object.fromEntries(config(name).catalog.map(c=>[c.name,c.duration]));

test('all boss phases take normal damage and white flash without resetting pose, cast or movement clocks',()=>{
  for(const [brain,states] of [
    [new BossBrain(durations('guardian-bear')),[['Block6','idle'],['Walking','move'],['Left_Hook_from_Guard','attack']]],
    [new ElenaBrain(durations('elena')),[['Elena_Idle','idle'],['Walking','move'],['mage_soell_cast_6','attack']]],
    [new ElenaBrain({idle:2.4,walk:2.4,cast:3,dead:2.4},{mourning:true}),[['idle','idle'],['walk','move'],['cast','attack']]],
  ])for(const [state,mode] of states){
    if(brain.mourning&&mode==='attack')brain.cast();else brain.start(state,mode);
    brain.time=.4;const serial=brain.serial,hp=brain.hp;
    for(let hit=0;hit<3;hit++){assert.equal(brain.hit({damage:10}),true);assert.equal(brain.stagger,0);assert.equal(brain.serial,serial);assert.equal(brain.state,state);assert.equal(brain.time,.4);assert.ok(brain.flash>0);}
    assert.equal(brain.hp,hp-30);
  }
});

test('shield stun, strong strikes, and lethal hits still interrupt Elena while ordinary hits do not',()=>{
  for(const mourning of [false,true]){
    const b=new ElenaBrain(mourning?{idle:2.4,walk:2.4,cast:3,dead:2.4}:durations('elena'),{mourning});
    b.cast();b.hit({damage:10,stun:1.5});assert.equal(b.stagger,1.5);assert.notEqual(b.mode,'attack');
    b.stagger=0;b.cast();b.hit({damage:50,heavy:true});assert.notEqual(b.mode,'attack');
    b.stagger=0;b.cast();b.hit({damage:9999});assert.equal(b.hp,0);assert.equal(b.mode,'dead');
  }
});

test('phase-two 1.6x cast keeps source corrective time and releases exactly once after a full one-second warning',()=>{
  const b=new ElenaBrain({idle:2.4,walk:2.4,cast:3,dead:2.4},{mourning:true});b.cast();
  assert.equal(b.attackPlaybackRate,1.6);let elapsed=0,releases=0,releaseAt;
  while(b.mode==='attack'&&elapsed<3){elapsed+=.001;const r=b.update(.001,4,true);if(r.events.length){releaseAt=elapsed;releases+=r.events.length;}if(b.mode==='attack')assert.ok(Math.abs(b.time-elapsed*MOURNING_CAST_RATE)<1e-9);}
  assert.equal(releases,1);assert.ok(Math.abs(releaseAt-1.65/1.6)<=.0011);assert.ok(releaseAt>=1);assert.ok(Math.abs(elapsed-3/1.6)<=.0011);
  assert.ok(Math.abs(spellImpact(b.spells[0],3)-1.65)<1e-9);assert.equal(b.durations.cast,3,'source clip and corrective keys are not retimed');
});

test('a shield stun or parry cancels a charge rather than resuming an old path without warning',()=>{
  for(const interrupt of [b=>b.hit({damage:10,stun:1.5}),b=>b.parry()]){
    const b=new ElenaBrain({idle:2.4,walk:2.4,cast:3,dead:2.4},{mourning:true});b.movementTurn=3;b.reposition();b.time=1.2;interrupt(b);
    assert.equal(b.repositioning,false);assert.equal(b.mode,'idle');b.update(2,4,true);b.update(.02,4,true);assert.equal(b.moveKind,'walk');assert.equal(b.repositioning,true);
  }
});
