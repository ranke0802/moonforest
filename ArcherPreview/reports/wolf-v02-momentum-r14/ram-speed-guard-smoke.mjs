import assert from 'node:assert/strict';
import {wolfMomentumR14Fixture} from '../../tests/helpers/wolf-momentum-r14-fixture.js';
import {WOLF_V02_COMBAT_PROFILES,ramChargeMultiplier} from '../../src/wolf-v02-spec.js';

const a=await wolfMomentumR14Fixture(),proof={scope:'Native CPU contact/controller smoke; visual feel and device GPU not certified.',cases:[]};
try{
 assert.equal(ramChargeMultiplier(0),1.5);assert.equal(ramChargeMultiplier(.34),2);
 for(const [name,hz,defense,regular] of [['alpha-open',60,null,false],['alpha-held-guard',60,'hold',false],['alpha-shield-push',30,'push',false],['regular-held-guard',60,'hold',true],['alpha-dodge',60,'dodge',false]]){
  const e=await a.summon({distance:15,sequence:['lunge']}),hp=e.playerHp;let input=false,guardSeen=false,hitSpeed=0,initialSpeed=0,peakSpeed=0,hit=null,guardBroken=false;
  e.combatProfile=regular?WOLF_V02_COMBAT_PROFILES.regularWolf:WOLF_V02_COMBAT_PROFILES.alphaWolf;
  if(defense==='hold'){assert.ok(a.controller.setShieldHeld(true));input=true;}
  for(let i=0;i<hz*14;i++){
   const b=e.brain;
   if(!input&&defense&&b.ramStage==='charge'&&b.ramLayerTime>=.16){assert.ok(defense==='push'?a.controller.shieldPush():a.controller.dodge());input=true;}
   guardSeen||=a.controller.guarding;
   a.step(1/hz);
   if(b.ramStage==='charge'){initialSpeed||=b.ramActualSpeed;peakSpeed=Math.max(peakSpeed,b.ramActualSpeed);}
   if(hit===null&&e.playerHp<hp){hit=hp-e.playerHp;hitSpeed=b.ramActualSpeed;guardBroken=a.controller.knockedDown;}
   if(!regular&&defense!=='dodge'&&hit!==null&&e.grab.maulHolding&&e.grab.maulHits>=2)break;
   if((regular||defense==='dodge')&&b.attackCount&&b.mode!=='attack')break;
  }
  if(hit===null&&!(regular||defense==='dodge'))console.log(JSON.stringify({failure:name,ram:e.v02Ram.inspect(),outcome:e.v02LastOutcome,contact:e.v02LastContact,state:a.result,brain:{mode:e.brain.mode,state:e.brain.state,stage:e.brain.ramStage},positions:[e.actor.position.asArray(),a.f.player.position.asArray()]}));
  if(regular||defense==='dodge'){assert.equal(e.playerHp,hp,name);assert.ok(!a.controller.captured);}
  else{assert.equal(hit,38,name);assert.equal(guardBroken,true,name);assert.ok(hitSpeed>12,name+' speed');assert.ok(e.grab.maulHits>=2,name+' two mauls');}
  if(defense==='hold')assert.ok(guardSeen,name+' real guard');
  proof.cases.push({name,hz,guardSeen,initialSpeed,peakSpeed,hitSpeed,ramDamage:hit??0,knockdown:guardBroken,mauls:hit===null?0:e.grab.maulHits});
  a.f.battle.hide();assert.ok(!a.controller.captured);assert.equal(e.combat.grabOwner,null);assert.equal(a.impactCarrier.position.y,0);
 }
 console.log(JSON.stringify({...proof,resetReleased:true,passed:true}));
}finally{await a.dispose();}
