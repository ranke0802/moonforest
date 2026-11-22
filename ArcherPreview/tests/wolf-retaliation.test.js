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

test('two hits flinch the wolf as before; the third within the window brings a counter that is not flinched away',()=>{
 const brain=awake(),started=brain.attackCount;
 assert.equal(brain.hit(blow),true);assert.equal(brain.mode,'hit');run(brain,.3);
 assert.equal(brain.hit(blow),true);assert.equal(brain.retaliatePending,false);assert.equal(brain.retaliation,null);
 run(brain,.3);
 assert.equal(brain.hit(blow),true);assert.equal(brain.retaliatePending,true,'third hit in a row');
 const waited=run(brain,1.5,()=>brain.mode==='attack');
 assert.notEqual(waited,null,'it strikes back within 1.5 s of the third hit (the circle alone used to take 2-3 s)');
 assert.equal(brain.attackCount,started+1);assert.equal(brain.retaliation,'striking');assert.equal(brain.pressure,0);assert.equal(brain.unflinching,true);
 const action=brain.actionId,hp=brain.hp;
 assert.equal(brain.hit(blow),true);assert.equal(brain.hp,hp-20,'the blow still hurts');
 assert.equal(brain.mode,'attack');assert.equal(brain.actionId,action,'but does not turn the counter away');
 assert.equal(brain.hit({damage:20,heavy:true}),true);
 assert.equal(brain.mode,'down','a heavy blow still knocks it down');assert.equal(brain.retaliation,null);
});

test('the counter ends with its attack: afterwards a hit flinches the wolf again',()=>{
 const brain=awake();
 for(let i=0;i<3;i++){brain.hit(blow);run(brain,.25);}
 assert.notEqual(run(brain,1.5,()=>brain.mode==='attack'),null);
 assert.notEqual(run(brain,6,()=>brain.mode!=='attack'),null,'the attack finishes');
 assert.equal(brain.retaliation,null);
 brain.hit(blow);assert.equal(brain.mode,'hit','back to ordinary flinching');assert.equal(brain.retaliatePending,false);
});

test('hits spread wider than the window do not add up',()=>{
 const brain=awake();
 brain.hit(blow);run(brain,WOLF_V02_TACTICS.retaliateSeconds+1);
 brain.hit(blow);run(brain,.3);brain.hit(blow);
 assert.equal(brain.retaliatePending,false);assert.equal(brain.pressure,2);
});

test('a counter that cannot reach the player is given up',()=>{
 const brain=awake();
 for(let i=0;i<3;i++){brain.hit(blow);run(brain,.25);}
 for(let t=0;t<1.2&&brain.retaliation!=='closing';t+=STEP)brain.update(STEP,NEAR,true);
 assert.equal(brain.retaliation,'closing');
 for(let t=0;t<WOLF_V02_TACTICS.retaliateGiveUp+.5&&brain.retaliation;t+=STEP){brain.sightBlocked=true;brain.update(STEP,40,true);}
 assert.equal(brain.retaliation,null);
});

test('blows that do not flinch the wolf (0.2 ordinary hits) never start a counter',()=>{
 const brain=awake();
 for(let i=0;i<6;i++){brain.hit({damage:20});run(brain,.2);}
 assert.equal(brain.pressure,0);assert.equal(brain.retaliatePending,false);assert.equal(brain.retaliation,null);assert.equal(brain.unflinching,false);
});
