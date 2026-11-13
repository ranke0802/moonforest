import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {wolfMomentumR14Fixture} from '../../tests/helpers/wolf-momentum-r14-fixture.js';

const a=await wolfMomentumR14Fixture(),result={scope:'Minimal native CPU smoke for playable 0.2 review; not device FPS/GPU or exhaustive validation.'};
try{
 let e=await a.summon({distance:15,sequence:['lunge']}),hp=e.playerHp,hits=[],speed=0,arc=0;
 for(let i=0;i<900&&hits.length<3;i++){a.step(1/60);arc=Math.max(arc,e.combat.v02Impact.height);if(e.playerHp<hp){hits.push(hp-e.playerHp);if(hits.length===1)speed=e.brain.ramActualSpeed;hp=e.playerHp;}}
 assert.deepEqual(hits,[38,28,28]);assert.ok(speed>=6.5);assert.ok(Math.abs(e.combat.v02Impact.travelled-2.6)<1e-6);assert.ok(e.brain.ramPawBraced);result.combo={hits,ramSpeed:speed,throwDistance:e.combat.v02Impact.travelled,arc,pawBrace:true};
 e=await a.summon({distance:15,sequence:['lunge']});let guard=false;hp=e.playerHp;
 for(let i=0;i<840;i++){if(!guard&&e.brain.ramStage==='charge'&&e.brain.ramLayerTime>=.16){assert.ok(a.controller.shieldPush());guard=true;}a.step(1/60);if(guard&&e.brain.mode!=='attack'&&e.brain.attackCount)break;}
 assert.ok(guard);assert.equal(e.playerHp,hp);assert.equal(e.combat.v02Impact.active,false);result.guard={damage:0,flight:false};
 e=await a.summon({distance:2.5});a.watch(e);hp=e.brain.hp;a.controller.shieldPush();let start=null,time=0,maxArc=0,firstHead=null,lastHead=null;
 for(let i=0;i<180;i++){a.step(1/60);if(e.brain.hp<hp&&!start){start=e.actor.position.clone();time=a.elapsed;}if(start){maxArc=Math.max(maxArc,e.v14Air.height);firstHead??=e.nodes.head.getAbsolutePosition().clone();lastHead=e.nodes.head.getAbsolutePosition().clone();if(a.elapsed-time>.60)break;}}
 assert.ok(start);const away=Vector3.Distance(start,e.actor.position);assert.ok(Math.abs(away-1.65)<1e-5);assert.ok(maxArc>.44);assert.ok(Vector3.Distance(firstHead,lastHead)>.5);result.wolfImpact={damage:hp-e.brain.hp,distance:away,arc:maxArc,continuousHeadMotion:Vector3.Distance(firstHead,lastHead),yaw:e.v14Air.targetYaw-e.v14Air.startYaw};
 e=await a.summon({distance:15,sequence:['lunge']});for(let i=0;i<840&&!e.combat.v02Impact.active;i++)a.step(1/60);assert.ok(e.combat.v02Impact.active);a.step(.1);a.f.battle.hide();const p=a.f.player.position.clone();for(let i=0;i<10;i++)a.step(.1);
 assert.equal(e.combat.v02Impact.active,false);assert.equal(e.combat.v02Impact.owner,null);assert.equal(a.impactCarrier.position.y,0);assert.ok(Vector3.Distance(p,a.f.player.position)<1e-8);result.reset={flight:false,owner:null,carrierY:0,drift:Vector3.Distance(p,a.f.player.position)};
 result.whip=[];for(const[id,d]of[['quick-bite',3],['paw-swipe',3.1],['pin',9.1]]){e=await a.summon({distance:d,sequence:[id]});hp=e.playerHp;for(let i=0;i<840&&e.playerHp===hp;i++)a.step(1/60);const damage=hp-e.playerHp;assert.ok(damage>0);result.whip.push({id,damage,captured:e.grab.active});}
 console.log(JSON.stringify({...result,passed:true}));
}finally{await a.dispose();}
