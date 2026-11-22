import test from 'node:test';
import assert from 'node:assert/strict';
import {WolfV02Brain,WOLF_V02_TACTICS} from '../src/wolf-v02-spec.js';

const durations=new Proxy({},{get:()=>1});
const STEP=1/60,NEAR=3.0;
function awake(){
 const brain=new WolfV02Brain(durations,undefined,()=>.5);
 for(let t=0;t<12&&!['flank','position','observe'].includes(brain.behavior);t+=STEP)brain.update(STEP,NEAR,true);
 assert.ok(['flank','position','observe'].includes(brain.behavior),'the wolf is up and stalking: '+brain.behavior);
 return brain;
}
const run=(brain,seconds,until=()=>false)=>{for(let t=0;t<seconds;t+=STEP){brain.update(STEP,NEAR,true);if(until())return t;}return null;};
const blow={damage:20,stun:.2};

test('a flinched wolf attacks as soon as the flinch ends, without retreating or circling first',()=>{
 const brain=awake(),started=brain.attackCount;
 assert.equal(brain.hit(blow),true);assert.equal(brain.mode,'hit');assert.equal(brain.retaliatePending,true);assert.equal(brain.retreatPending,null);
 const waited=run(brain,1.2,()=>brain.mode==='attack');
 assert.notEqual(waited,null,'the counter starts within the flinch (0.63 s) plus a moment; the circle alone used to take 2-3 s');
 assert.equal(brain.attackCount,started+1);assert.equal(brain.actionId,'quick-bite');assert.equal(brain.unflinching,false,'an ordinary counter can still be interrupted');
});

test('flinched three times without getting an attack out: the counter is no longer flinched away, a heavy blow still knocks the wolf down',()=>{
 const brain=awake();
 brain.hit(blow);assert.notEqual(run(brain,1.2,()=>brain.mode==='attack'),null);
 brain.hit(blow);assert.equal(brain.mode,'hit','second blow breaks the counter');assert.equal(brain.pressure,2);
 assert.notEqual(run(brain,1.2,()=>brain.mode==='attack'),null,'and it comes again');
 const winding=brain.actionId;brain.hit(blow);
 assert.equal(brain.mode,'attack','the third blow no longer breaks the counter that is winding up');assert.equal(brain.actionId,winding);
 assert.equal(brain.unflinching,true);assert.equal(brain.pressure,0);
 const action=brain.actionId,hp=brain.hp;
 assert.equal(brain.hit(blow),true);assert.equal(brain.hp,hp-20,'the blow still hurts');
 assert.equal(brain.mode,'attack');assert.equal(brain.actionId,action,'but does not turn this counter away');
 assert.equal(brain.hit({damage:20,heavy:true}),true);
 assert.equal(brain.mode,'down');assert.equal(brain.unflinching,false);
});

test('once an attack gets out the count starts again',()=>{
 const brain=awake();
 brain.hit(blow);assert.notEqual(run(brain,1.2,()=>brain.mode==='attack'),null);
 assert.notEqual(run(brain,6,()=>brain.behavior==='recovery'),null,'the attack finishes');
 assert.equal(brain.pressure,0);assert.equal(brain.retaliation,null);
 brain.hit(blow);assert.equal(brain.mode,'hit');assert.equal(brain.pressure,1);
});

test('flinches spread wider than the window do not add up to an armoured counter',()=>{
 const brain=awake();
 brain.hit(blow);brain.retaliatePending=false;run(brain,.1);brain.pressureClock=brain.combatClock-WOLF_V02_TACTICS.retaliateSeconds-1;
 brain.hit(blow);assert.equal(brain.pressure,1);assert.equal(brain.retaliateArmored,false);
});

test('a counter that cannot reach the player is given up',()=>{
 const brain=awake();
 brain.hit(blow);
 for(let t=0;t<1.2&&brain.retaliation!=='closing';t+=STEP)brain.update(STEP,40,true);
 assert.equal(brain.retaliation,'closing');
 for(let t=0;t<WOLF_V02_TACTICS.retaliateGiveUp+.5&&brain.retaliation;t+=STEP){brain.sightBlocked=true;brain.update(STEP,40,true);}
 assert.equal(brain.retaliation,null);
});

test('blows that do not flinch the wolf (0.2 ordinary hits) never start a counter',()=>{
 const brain=awake();
 for(let i=0;i<6;i++){brain.hit({damage:20});run(brain,.2);}
 assert.equal(brain.pressure,0);assert.equal(brain.retaliatePending,false);assert.equal(brain.retaliation,null);assert.equal(brain.unflinching,false);
});
