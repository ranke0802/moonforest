import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {Vector3,Matrix} from '@babylonjs/core';
import {parseHTML} from 'linkedom';
import {WarriorV2Controller,V2_HOLD_SECONDS} from '../src/warrior-v2.js';
import {PlayerStrikeSampler,PLAYER_STRIKES} from '../src/player-strikes.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {BossBrain} from '../src/boss-spec.js';
import {WolfV02ContactGate} from '../src/wolf-v02-hurt.js';
import {GREAT_ATTACK_POSE,GREAT_ATTACK_HOLD,GREAT_ATTACK_SLOW} from '../src/v03/great-attack.js';
import {STRIKE_LUNGE} from '../src/v03/strike-approach.js';
import {createStory} from '../src/v03/story.js';

const durations={idle:2,run:1,attack:3,slash:1.5,judgment:4.33,shieldPush:2.37,dodge:2.46,knockdown:1.7,getUp:2};
const almost=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} and ${b}`);
function heavy(level){
  const c=new WarriorV2Controller({durations});
  c.greatAttackLevel=level;c.setAttackHeld(true);c.update(V2_HOLD_SECONDS);c.setAttackHeld(false);
  return c;
}

test('the learned held heavy pauses the authored crouch, resumes without a time jump and pays stamina once',()=>{
  for(const level of [0,1,5]){
    const c=heavy(level),rate=c.playbackRate('judgment');
    const first=c.update(GREAT_ATTACK_POSE/rate+.05);
    assert.equal(first.state,'judgment');assert.equal(c.stamina,70);
    if(!level){assert.equal(first.greatAttack,undefined);almost(first.clipTime,GREAT_ATTACK_POSE+.05*rate);continue;}
    const cast=first.greatAttack;assert.equal(cast.level,level);
    almost(first.clipTime,GREAT_ATTACK_POSE);almost(c.update(.1).clipTime,GREAT_ATTACK_POSE);
    const released=c.update(GREAT_ATTACK_HOLD-.15+.07);
    almost(released.clipTime,GREAT_ATTACK_POSE+.07*rate);assert.equal(cast.holdLeft,0);
    assert.equal(c.stamina,70);assert.equal(c.action.id,first.actionId);
  }
  const c=heavy(0);c.cancelAttack();c.greatAttackLevel=5;c.attack();
  assert.equal(c.action.greatAttack,undefined);
});

test('normal body contacts damage and flash through the windup without pushing it; knockdown, defense input and death end it',()=>{
  const c=heavy(3),action=c.update(.12);
  const foe=new BossEncounter({},()=>{},()=>{},(duration,options={})=>options.knockdown?c.knockdown():c.hit(duration,options));
  foe.active=true;foe.actor={position:new Vector3(0,0,1)};foe.player={position:Vector3.Zero()};
  const before=foe.playerHp;
  foe.receiveBossHit({action,damage:11,bodyContact:true,shieldContact:true});
  assert.equal(foe.playerHp,before-11);assert.ok(foe.playerReaction.flashRemaining>0);assert.equal(foe.playerReaction.remaining,0);
  assert.equal(c.staggerRemaining,0);assert.equal(c.action.greatAttack,action.greatAttack);
  foe.playerInvulnerable=0;
  foe.receiveBossHit({action,damage:13,heavy:true,bodyContact:true,shieldContact:true});
  assert.equal(foe.playerHp,before-24);assert.equal(c.knockedDown,true);assert.equal(c.action.greatAttack,undefined);
  for(const end of [actor=>actor.dodge(),actor=>actor.capture(),actor=>actor.update(.05,{alive:false}),actor=>actor.cancelAttack()]){
    const actor=heavy(2);end(actor);assert.equal(actor.action?.greatAttack,undefined);
  }
});

function actor(x,z){return {position:new Vector3(x,0,z),rotation:{y:0},computeWorldMatrix(){}};}
function opponent(player,x,z,wall=false){
  const damage=[],world={navigation:{segmentClear:()=>!wall}};
  const b=new BossEncounter(world,()=>{},(_at,n)=>damage.push(n));
  b.actor=actor(x,z);b.actor.rotation.y=Math.atan2(-x,-z);
  b.active=true;b.player=player;b.nodes={};b.brain=new BossBrain({Knock_Down_1:1});b.brain.hp=1000;
  b.prepareContactPose=()=>{b.contactPoseDirection=player.position.subtract(b.actor.position);return b.contactPoseDirection.length();};
  b.hurtCapsules=()=>[{points:[[0,0,0],[0,1,0]],radius:.5}];
  b.damageNumberPosition=()=>b.actor.position;b.dt=1/60;
  return {b,damage};
}

test('the shown circle deals one equipped, rank-scaled three-hit burst to each admitted enemy, including wolves',()=>{
  const player=actor(0,0),sword={computeWorldMatrix(){},getWorldMatrix:()=>Matrix.Identity()};
  const baseReach=1.356,bonus=5;
  for(const level of [1,2,3,4,5]){
    const c=heavy(level),cast=c.action.greatAttack,sampler=new PlayerStrikeSampler(),mult=1+.2*level;
    cast.aim(player.position,0,{x:0,y:0,z:3},1,STRIKE_LUNGE.judgment);
    assert.deepEqual(cast.center,{x:0,y:0,z:3});
    const radius=baseReach*mult;
    const guard=opponent(player,0,3);
    guard.b.brain.mode='guard';guard.b.kind='goblin';guard.b.onPlayerHit=()=>assert.fail('area guard canceled the cast for other enemies');
    const foes=[opponent(player,0,3),opponent(player,radius-.0001,3),opponent(player,radius+.0001,3),opponent(player,0,3,true),opponent(player,0,0)];
    foes[1].b.gate=new WolfV02ContactGate();
    foes[4].b.brain.mode='down'; // Native ground/blade assists must not extend the circle.
    let impacts=0;
    for(let frame=0;frame<175;frame++){
      const r=c.update(1/60);
      if(!r.greatAttack)break;
      const sample=sampler.sample(r,sword,null,true,0,bonus);
      cast.sample(r.clipTime,sample,PLAYER_STRIKES.judgment[0],bonus);
      almost(cast.radius,radius);if(cast.phase==='impact')impacts++;
      for(const {b} of [guard,...foes])c.pauseOnImpact(b.poseAndContacts(player,r,sample,null)??0);
    }
    const expected=[25,25,29].map(n=>Math.round(n*mult));
    assert.equal(impacts,1);assert.equal(guard.b.brain.hp,1000);assert.deepEqual(guard.damage,['BLOCK']);
    for(const {b,damage} of foes.slice(0,2)){assert.deepEqual(damage,expected);assert.equal(b.brain.hp,1000-expected.reduce((a,b)=>a+b,0));}
    for(const {b,damage} of foes.slice(2)){assert.deepEqual(damage,[]);assert.equal(b.brain.hp,1000);}
  }
});

test('interrupted input clears the rendered charge and camera, ordinary button release lets it finish',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const bindings=source.slice(source.indexOf('function setAttackHeld('),source.indexOf('function faceHeading('));
  const create=new Function('attackSources','attackPointerTypes','controller','world','ready','allowed','boss','elenaReview',
    bindings+';return {setAttackHeld,cancelAttackInput,show(cast){shownGreatAttack=cast;}};');
  for(const cancel of ['pointercancel','global reset','suspension','release','unrelated pointer']){
    const c=new WarriorV2Controller({durations});c.greatAttackLevel=1;
    const events=[],world={v03:{greatAttackFrame:cast=>events.push(cast),story:{cancelGreatAttackFocus:()=>events.push('focus')}}};
    const input=create(new Set(),new Map(),c,world,true,()=>true,null,null);
    const source='button:7';input.setAttackHeld(source,true,'touch');c.update(V2_HOLD_SECONDS);input.show(c.action.greatAttack);
    if(cancel==='release'){input.setAttackHeld(source,false);input.cancelAttackInput(source,{preserveCompletedCharge:true});}
    else if(cancel==='unrelated pointer')input.cancelAttackInput('mouse:52');
    else input.cancelAttackInput(cancel==='pointercancel'?source:undefined);
    const retained=cancel==='release'||cancel==='unrelated pointer';
    assert.equal(!!c.action?.greatAttack,retained);assert.deepEqual(events,retained?[]:[null,'focus']);
  }
});

test('manual and unreachable targets leave the cast in front, clipped by a blocking wall',()=>{
  const c=heavy(2),cast=c.action.greatAttack,origin={x:0,y:0,z:0},yaw=Math.PI/2;
  cast.aim(origin,yaw,{x:-20,y:0,z:0},1,STRIKE_LUNGE.judgment,{heightAt:()=>.25},{segmentClear:(_a,b)=>b.x<=1});
  assert.ok(cast.center.x>.98&&cast.center.x<=1);almost(cast.center.z,0);assert.equal(cast.center.y,.25);
});

test('windup slows the world with the selected camera zoom and restores the view on interruption and disposal',t=>{
  const {document}=parseHTML('<main id="app"></main>');
  const camera=Object.assign(Object.create({get screenArea(){return 10;}}),{fov:.85,alpha:1,beta:2,radius:8});
  const controller=heavy(1),world={mapId:'great-plains',camera},battle={encounters:[],combatCount:0};
  const save={journey:{getItem(){return null;},setItem(){}},touch(){}};
  const api={world,battle,input:{setSuspended(){}},getPlayer:()=>null,getController:()=>controller};
  const story=createStory({api,doc:document,save,content:{QUESTS:[],NPCS:[],DIALOGUES:{}},createGuide:null,createMarkers:null,
    slowFx:{value:{on:false,zoom:.2,lines:false}}});
  t.after(()=>story.dispose());
  let now=1000;t.mock.method(performance,'now',()=>now);
  story.start();const frame=()=>{now+=50;story.update(.05,{ready:true,mapId:'great-plains'});};
  frame();frame();frame();frame();almost(story.timeScale,GREAT_ATTACK_SLOW);almost(camera.fov,.85*.8);
  assert.deepEqual([camera.alpha,camera.beta,camera.radius],[1,2,8]);assert.equal(Object.hasOwn(camera,'screenArea'),true);
  controller.knockdown();story.cancelGreatAttackFocus();almost(camera.fov,.85);almost(story.timeScale,1);assert.equal(Object.hasOwn(camera,'screenArea'),false);
  controller.cancelAttack();controller.startAttack('judgment');frame();frame();story.dispose();almost(camera.fov,.85);assert.equal(Object.hasOwn(camera,'screenArea'),false);
});
