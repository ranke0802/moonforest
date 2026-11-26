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
import {GREAT_ATTACK_POSE,GREAT_ATTACK_SLOW} from '../src/v03/great-attack.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {ArenaNavigation} from '../src/navigation.js';
import {createCombatTarget} from '../src/v03/combat-target.js';
import {strikeLungeStep,applyStrikeTravel,STRIKE_LUNGE} from '../src/v03/strike-approach.js';
import {createStory} from '../src/v03/story.js';

const durations={idle:2,run:1,attack:3,slash:1.5,judgment:4.33,shieldPush:2.37,dodge:2.46,knockdown:1.7,getUp:2};
const almost=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} and ${b}`);
function heavy(level,{held=false}={}){
  const c=new WarriorV2Controller({durations});
  c.greatAttackLevel=level;c.setAttackHeld(true);c.update(V2_HOLD_SECONDS);
  if(!held)c.setAttackHeld(false);
  return c;
}

test('the learned held heavy pauses the authored crouch, resumes without a time jump and pays stamina once',()=>{
  for(const level of [0,1,5]){
    const c=heavy(level,{held:true}),rate=c.playbackRate('judgment');
    const first=c.update(GREAT_ATTACK_POSE/rate+.05);
    assert.equal(first.state,'judgment');assert.equal(c.stamina,70);
    if(!level){assert.equal(first.greatAttack,undefined);almost(first.clipTime,GREAT_ATTACK_POSE+.05*rate);continue;}
    const cast=first.greatAttack;assert.equal(cast.level,level);
    almost(first.clipTime,GREAT_ATTACK_POSE);
    const hold=c.update(60),sample={contacts:[]};
    cast.sample(hold.clipTime,sample,PLAYER_STRIKES.judgment[0],0,{x:0,y:0,z:0});
    almost(hold.clipTime,GREAT_ATTACK_POSE);almost(cast.progress,1);
    assert.equal(cast.charging,true);assert.equal(cast.phase,'windup');assert.deepEqual(sample.contacts,[]);
    c.setAttackHeld(false);c.setAttackHeld(false);
    const released=c.update(.07);
    almost(released.clipTime,GREAT_ATTACK_POSE+.07*rate);assert.equal(cast.charging,false);assert.equal(cast.phase,'release');
    assert.equal(c.stamina,70);assert.equal(c.action.id,first.actionId);
  }
  const c=new WarriorV2Controller({durations});c.greatAttackLevel=5;
  c.setAttackHeld(true);c.update(.1);c.setAttackHeld(false);
  assert.equal(c.action.state,'slash');assert.equal(c.action.greatAttack,undefined);
});

test('normal body contacts damage and flash through the windup without pushing it; knockdown, defense input and death end it',()=>{
  const c=heavy(3,{held:true}),action=c.update(.12);
  const foe=new BossEncounter({},()=>{},()=>{},(duration,options={})=>options.knockdown?c.knockdown():c.hit(duration,options));
  foe.active=true;foe.actor={position:new Vector3(0,0,1)};foe.player={position:Vector3.Zero()};
  const before=foe.playerHp;
  foe.receiveBossHit({action,damage:11,bodyContact:true,shieldContact:true});
  assert.equal(foe.playerHp,before-11);assert.ok(foe.playerReaction.flashRemaining>0);assert.equal(foe.playerReaction.remaining,0);
  assert.equal(c.staggerRemaining,0);assert.equal(c.action.greatAttack,action.greatAttack);
  foe.playerInvulnerable=0;
  foe.receiveBossHit({action,damage:13,heavy:true,bodyContact:true,shieldContact:true});
  assert.equal(foe.playerHp,before-24);assert.equal(c.knockedDown,true);assert.equal(c.action.greatAttack,undefined);
  for(const end of [actor=>actor.dodge(),actor=>actor.setShieldHeld(true),actor=>actor.capture(),actor=>actor.update(.05,{alive:false}),actor=>actor.cancelAttackInput()]){
    const actor=heavy(2,{held:true});end(actor);actor.setAttackHeld(false);assert.equal(actor.action?.greatAttack,undefined);
    actor.update(1);assert.equal(actor.action?.greatAttack,undefined);
  }
});

test('a physical release before a frame or during shield recovery is remembered when Starfall starts',()=>{
  for(const buffered of [false,true]){
    let now=0;const c=new WarriorV2Controller({durations,holdNow:()=>now});
    c.greatAttackLevel=1;if(buffered)c.shieldPush();
    c.setAttackHeld(true);now=550;c.setAttackHeld(false);
    assert.equal(c.queuedAttack,'judgment');
    c.update(buffered?durations.shieldPush:0);
    assert.equal(c.action.greatAttack.charging,false);
    assert.ok(c.update(.4).clipTime>GREAT_ATTACK_POSE);
    assert.equal(c.stamina,buffered?50:70);
  }
});

function actor(x,z){return {position:new Vector3(x,0,z),rotation:{y:0},computeWorldMatrix(){}};}
function opponent(player,x,z,wall=false){
  const damage=[],world={v03:{playing:true},navigation:{segmentClear:()=>!wall}};
  const b=new BossEncounter(world,()=>{},(_at,n)=>damage.push(n));
  b.actor=actor(x,z);b.actor.rotation.y=Math.atan2(-x,-z);
  b.active=true;b.player=player;b.nodes={};b.brain=new BossBrain({Knock_Down_1:1});b.brain.hp=1000;
  b.prepareContactPose=()=>{b.contactPoseDirection=player.position.subtract(b.actor.position);return b.contactPoseDirection.length();};
  b.hurtCapsules=()=>[{points:[[0,0,0],[0,1,0]],radius:.5}];
  b.damageNumberPosition=()=>b.actor.position;b.dt=1/60;
  return {b,damage};
}

test('the target-centred blast deals one equipped, rank-scaled three-hit burst to each admitted enemy, including wolves',()=>{
  const player=actor(0,1.75),sword={computeWorldMatrix(){},getWorldMatrix:()=>Matrix.Identity()};
  const baseRadius=1.25,bonus=5;
  for(const level of [1,2,3,4,5]){
    const c=heavy(level,{held:true}),cast=c.action.greatAttack,sampler=new PlayerStrikeSampler(),mult=1+.2*level;
    const radius=baseRadius*mult;
    const guard=opponent(player,0,3);
    guard.b.brain.mode='guard';guard.b.kind='goblin';guard.b.onPlayerHit=()=>assert.fail('area guard canceled the cast for other enemies');
    const foes=[opponent(player,0,3),opponent(player,radius-.0001,3),opponent(player,radius+.0001,3),opponent(player,0,3,true),opponent(player,0,0)];
    foes[1].b.gate=new WolfV02ContactGate();
    foes[4].b.brain.mode='down'; // Native ground/blade assists must not extend the circle.
    let impacts=0;
    c.update(20);c.setAttackHeld(false);
    for(let frame=0;frame<175;frame++){
      const r=c.update(1/60);
      if(!r.greatAttack)break;
      strikeLungeStep({},player,r,STRIKE_LUNGE.judgment,foes[0].b,null,false,1,durations.judgment,1/60);
      const sample=sampler.sample(r,sword,null,true,0,bonus);
      cast.sample(r.clipTime,sample,PLAYER_STRIKES.judgment[0],bonus,player.position);
      almost(cast.radius,radius);if(cast.phase==='impact')impacts++;
      for(const {b} of [guard,...foes])c.pauseOnImpact(b.poseAndContacts(player,r,sample,null)??0);
    }
    const expected=[25,25,29].map(n=>Math.round(n*mult));
    assert.equal(impacts,1);
    assert.deepEqual(cast.center,{x:0,y:0,z:3});
    assert.equal(guard.b.brain.hp,1000-expected.reduce((a,b)=>a+b,0));assert.deepEqual(guard.damage,['BREAK',...expected]);
    for(const {b,damage} of foes.slice(0,2)){assert.deepEqual(damage,expected);assert.equal(b.brain.hp,1000-expected.reduce((a,b)=>a+b,0));}
    for(const {b,damage} of foes.slice(2)){assert.deepEqual(damage,[]);assert.equal(b.brain.hp,1000);}
  }
});

test('interrupted input clears the rendered charge and camera, ordinary button release lets it finish',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const bindings=source.slice(source.indexOf('function setAttackHeld('),source.indexOf('function faceHeading('));
  const create=new Function('attackSources','attackPointerTypes','controller','world','ready','allowed','boss','elenaReview',
    bindings+';return {setAttackHeld,cancelAttackInput,show(cast){shownGreatAttack=cast;}};');
  for(const cancel of ['pointercancel','lostpointercapture','global reset','release','unrelated pointer']){
    const c=new WarriorV2Controller({durations});c.greatAttackLevel=1;
    const events=[],world={v03:{greatAttackFrame:cast=>events.push(cast),story:{cancelGreatAttackFocus:()=>events.push('focus')}}};
    const input=create(new Set(),new Map(),c,world,true,()=>true,null,null);
    const source='button:7';input.setAttackHeld(source,true,'touch');c.update(V2_HOLD_SECONDS);input.show(c.action.greatAttack);
    if(cancel==='release'){input.setAttackHeld(source,false);input.cancelAttackInput(source,{preserveCompletedCharge:true});}
    else if(cancel==='lostpointercapture')input.cancelAttackInput(source,{preserveCompletedCharge:true});
    else if(cancel==='unrelated pointer')input.cancelAttackInput('mouse:52');
    else input.cancelAttackInput(cancel==='pointercancel'?source:undefined);
    const retained=cancel==='release'||cancel==='unrelated pointer';
    assert.equal(!!c.action?.greatAttack,retained);assert.deepEqual(events,retained?[]:[null,'focus']);
    if(retained)assert.equal(c.action.greatAttack.charging,cancel==='unrelated pointer');
  }
});

test('release locks the combat target and hits its current ground position after a collision-limited dash',()=>{
  for(const scene of ['empty','near','moving','wall','manual','far','tracked','dead','escaped','ledge']){
    const c=heavy(1,{held:true}),cast=c.action.greatAttack,player=actor(0,0),ledger={},aim=createCombatTarget();
    const wall=scene==='wall'?[{id:'wall',x:0,z:.8,radius:.20,height:2}]:[];
    const world={navigation:new ArenaNavigation(wall),terrain:{heightAt:(x,z)=>scene==='ledge'&&z>1.3?2.5:0}};
    const makeFoe=(x,z)=>({actor:actor(x,z),active:true,brain:{hp:20},radius:.3});
    const foe=scene==='empty'?null:makeFoe(0,scene==='far'||scene==='tracked'?8:3.2);
    if(foe)foe.actor.position.y=world.terrain.heightAt(foe.actor.position.x,foe.actor.position.z);
    const other=scene==='tracked'?makeFoe(1,0):null;
    if(other)aim.note('enemy',foe);
    const encounters=[foe,other].filter(Boolean);
    const dt=1/60,manual=scene==='manual';
    if(manual)player.rotation.y=Math.PI/2;
    let hits=0;
    for(let frame=0;frame<150;frame++){
      if(frame===60){
        c.setAttackHeld(false);
        aim.aim(player.position,other??foe);
      }
      const action=c.update(dt);
      if(!action.greatAttack)break;
      const step=strikeLungeStep(ledger,player,action,STRIKE_LUNGE.judgment,aim.chainFoe,null,manual,WARRIOR_DIMENSIONS.ratio,durations.judgment,dt,true,aim.reach);
      applyStrikeTravel(player,action,player.rotation.y,step,world,encounters,48,WARRIOR_DIMENSIONS);
      if(frame<60){assert.equal(step,0);assert.deepEqual(player.position.asArray(),[0,0,0]);}
      if(frame===63){
        if(scene==='moving')foe.actor.position.x=.55;
        if(scene==='dead')foe.brain.hp=0;
        if(scene==='escaped')foe.actor.position.z=14;
      }
      if(scene==='moving'&&!cast.charging&&!cast.impacted)foe.actor.position.z+=2*dt;
      if(action.clipTime>=1.10&&!cast.impacted&&scene==='moving')foe.actor.position.x+=.055; // Enemy's update runs before sampling.
      const p=player.position,tip=[p.x+Math.sin(player.rotation.y),p.y,p.z+Math.cos(player.rotation.y)];
      const sample={blade:[p.asArray(),tip],contacts:[]};
      cast.sample(action.clipTime,sample,PLAYER_STRIKES.judgment[0],0,p,world);
      if(cast.phase!=='impact')continue;
      hits++;
      if(['near','moving','tracked'].includes(scene)){
        const target=foe.actor.position;
        assert.deepEqual(cast.center,{x:target.x,y:target.y,z:target.z},scene);
        assert.ok(Vector3.Distance(player.position,target)>1&&player.position.z>1,scene+' dash stops at melee clearance');
        assert.ok(cast.contains(target,world.navigation));
        if(other)assert.ok(!cast.contains(other.actor.position,world.navigation));
      }else{
        if(scene==='wall'){
          assert.ok(p.z<.4&&cast.center.z<.6,'wall blocks both player and impact');
          assert.ok(!cast.contains(foe.actor.position,world.navigation));
        }else if(scene==='ledge'){
          assert.ok(p.z<=1.3&&cast.center.z<=1.3,'the cliff keeps travel and impact on the near ground');
          assert.ok(!cast.contains(new Vector3(cast.center.x,2.5,cast.center.z),world.navigation));
        }else{
          almost(cast.center.x,tip[0]);almost(cast.center.z,tip[2]);
          if(manual)assert.ok(p.x>.7&&Math.abs(p.z)<.001);
          if(scene==='escaped'||scene==='far')assert.ok(!cast.contains(foe.actor.position,world.navigation));
        }
      }
    }
    assert.equal(hits,1,scene+' has exactly one impact');
  }
});

test('an untrained heavy breaks a guard on contact in 0.3; a light hit is blocked and an evade still consumes the swing',()=>{
  const player=actor(0,0),sword={computeWorldMatrix(){},getWorldMatrix:()=>Matrix.Identity()};
  for(const [state,mode,playing,expected] of [
    ['judgment','guard',true,['BREAK',25,25,29]],['slash','guard',true,['BLOCK']],
    ['judgment','evade',true,['Dodge']],['judgment','guard',false,['BLOCK']]
  ]){
    const {b,damage}=opponent(player,0,2);b.brain.mode=mode;b.world.v03.playing=playing;
    let groggy=0;b.onPlayerHit=(_duration,options)=>{if(options.reason==='blocked')groggy++;};
    const sampler=new PlayerStrikeSampler();const start=PLAYER_STRIKES[state][0].from;
    for(let i=0;i<12;i++){
      const r={state,actionId:7,clipTime:start+i/60,actionElapsed:i/60};
      b.poseAndContacts(player,r,sampler.sample(r,sword,null,true,0,5),null);
    }
    assert.deepEqual(damage,expected);assert.equal(groggy,Number(expected[0]==='BLOCK'));
    assert.equal(b.brain.hp,expected[0]==='BREAK'?921:1000);
  }
});

test('windup slows the world with the selected camera zoom and restores the view on interruption and disposal',t=>{
  const {document}=parseHTML('<main id="app"></main>');
  const camera=Object.assign(Object.create({get screenArea(){return 10;}}),{fov:.85,alpha:1,beta:2,radius:8});
  let controller=heavy(1,{held:true});
  const world={mapId:'great-plains',camera},battle={encounters:[],combatCount:0};
  const save={journey:{getItem(){return null;},setItem(){}},touch(){}};
  const api={world,battle,input:{setSuspended(){}},getPlayer:()=>null,getController:()=>controller};
  const story=createStory({api,doc:document,save,content:{QUESTS:[],NPCS:[],DIALOGUES:{}},createGuide:null,createMarkers:null,
    slowFx:{value:{on:false,zoom:.2,lines:false}}});
  t.after(()=>story.dispose());
  let now=1000;t.mock.method(performance,'now',()=>now);
  story.start();const frame=()=>{now+=50;story.update(.05,{ready:true,mapId:'great-plains'});};
  for(let i=0;i<8;i++)frame();almost(story.timeScale,GREAT_ATTACK_SLOW);almost(camera.fov,.85*.8*.66);
  assert.deepEqual([camera.alpha,camera.beta,camera.radius],[1,2,8]);assert.equal(Object.hasOwn(camera,'screenArea'),true);
  controller.knockdown();story.cancelGreatAttackFocus();almost(camera.fov,.85);almost(story.timeScale,1);assert.equal(Object.hasOwn(camera,'screenArea'),false);
  controller=heavy(1,{held:true});
  for(let i=0;i<8;i++)frame();
  controller.setAttackHeld(false);frame();
  almost(story.timeScale,1);assert.ok(camera.fov>.85*.8*.66&&camera.fov<.85);
  for(let i=0;i<12;i++)frame();
  almost(camera.fov,.85);assert.equal(Object.hasOwn(camera,'screenArea'),false);
  story.dispose();
});
