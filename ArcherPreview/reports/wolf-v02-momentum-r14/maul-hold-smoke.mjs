import assert from 'node:assert/strict';
import {wolfMomentumR14Fixture} from '../../tests/helpers/wolf-momentum-r14-fixture.js';
import {WOLF_V02_COMBAT_PROFILES} from '../../src/wolf-v02-spec.js';

const a=await wolfMomentumR14Fixture(),proof={scope:'Minimal native CPU maul-hold smoke for playable review.'};
const until=(predicate,limit=1200)=>{for(let i=0;i<limit&&!predicate();i++)a.step(1/60);assert.ok(predicate());};
try{
 let e=await a.summon({distance:15,sequence:['lunge']});
 until(()=>e.grab.maulHits>=4);
 assert.equal(e.grab.maulHolding,true);assert.equal(a.controller.captured,true);assert.equal(e.combat.grabOwner,e);assert.equal(e.grab.escapePrompt,'회피를 눌러 탈출하세요');
 proof.unescaped={mauls:e.grab.maulHits,cycle:e.brain.ramMaulCycle,captured:a.controller.captured,prompt:e.grab.escapePrompt,playerHp:e.playerHp};
 for(let i=0;i<5;i++){a.step(.08);assert.equal(a.f.battle.escapeGrab(),i===4);}
 assert.equal(e.grab.active,false);assert.equal(a.controller.captured,false);assert.equal(e.combat.grabOwner,null);proof.fiveTapsReleased=true;
 e=await a.summon({distance:15,sequence:['lunge']});until(()=>e.grab.maulHolding);
 for(let i=0;i<5;i++){a.step(.025);assert.equal(a.f.battle.escapeGrab(),false);assert.ok(e.grab.maulHits<2);assert.equal(a.controller.captured,true);}
 until(()=>!e.grab.maulHolding);assert.equal(e.grab.maulHits,2);assert.equal(a.controller.captured,false);proof.earlyTaps={firstTwoCompleted:e.grab.maulHits,releasedAfterSecond:true};
 e=await a.summon({distance:15,sequence:['lunge']});e.combatProfile=WOLF_V02_COMBAT_PROFILES.regularWolf;let guard=false;const hp=e.playerHp;
 for(let i=0;i<900;i++){if(!guard&&e.brain.ramStage==='charge'&&e.brain.ramLayerTime>=.16){assert.ok(a.controller.shieldPush());guard=true;}a.step(1/60);if(guard&&e.brain.mode!=='attack'&&e.brain.attackCount)break;}
 assert.ok(guard);assert.equal(e.playerHp,hp);assert.equal(e.grab.maulHolding,false);assert.equal(e.combat.grabOwner,null);proof.blockedRam={damage:0,hold:false};
 e=await a.summon({distance:15,sequence:['lunge']});until(()=>e.grab.maulHolding);a.f.battle.hide();assert.equal(e.grab.active,false);assert.equal(e.combat.grabOwner,null);assert.equal(a.controller.captured,false);proof.resetReleased=true;
 console.log(JSON.stringify({...proof,passed:true}));
}finally{await a.dispose();}
