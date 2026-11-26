import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {Vector3,Matrix,NullEngine,Scene} from '@babylonjs/core';
import {parseHTML} from 'linkedom';
import {WarriorV2Controller,V2_HOLD_SECONDS} from '../src/warrior-v2.js';
import {PlayerStrikeSampler,PLAYER_STRIKES} from '../src/player-strikes.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {GoblinEncounter} from '../src/goblin-encounter.js';
import {RegularWolfEncounter} from '../src/regular-wolf-encounter.js';
import {WolfV02Encounter} from '../src/wolf-v02-encounter.js';
import {BossBrain} from '../src/boss-spec.js';
import {WolfV02ContactGate} from '../src/wolf-v02-hurt.js';
import {GreatAttackCast,GREAT_ATTACK_CHARGE_SECONDS,GREAT_ATTACK_POSE,GREAT_ATTACK_SLOW} from '../src/v03/great-attack.js';
import {ChapterEnemyBrain,CHAPTER_COMBAT} from '../src/v03/chapter-enemy-brain.js';
import {TOWN_ITEMS} from '../src/v03/town-items.js';
import {createTrainingTargets} from '../src/targets.js';
import {createDamageNumbers} from '../src/damage-numbers.js';
import {WARRIOR_DIMENSIONS,playerDimensions} from '../src/player-dimensions.js';
import {ArenaNavigation} from '../src/navigation.js';
import {createCombatTarget} from '../src/v03/combat-target.js';
import {strikeLungeStep,applyStrikeTravel,STRIKE_LUNGE,STARFALL_REACH_SCALE} from '../src/v03/strike-approach.js';
import {createStory} from '../src/v03/story.js';
import {createGreatAttackFx} from '../src/v03/great-attack-fx.js';

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

test('Starfall fills in exactly three wall-clock seconds from the physical press while the game is slowed',()=>{
  assert.equal(GREAT_ATTACK_CHARGE_SECONDS,3);
  let now=9000;const start=now;
  const c=new WarriorV2Controller({durations,holdNow:()=>now});
  c.greatAttackLevel=4;c.setAttackHeld(true);
  let previous=0;
  for(const ms of [225,450,900,1500,2999,3000,9000]){
    now=start+ms;
    const r=c.update((ms-previous)/1000*GREAT_ATTACK_SLOW);
    const expected=Math.min(1,ms/3000);
    almost(r.chargeProgress,expected);
    if(ms<450){assert.equal(c.action,null);}
    else{
      const cast=r.greatAttack;
      assert.equal(cast.charging,true);almost(cast.chargeProgress,expected);
      const sample={contacts:[]};
      cast.sample(r.clipTime,sample,PLAYER_STRIKES.judgment[0],0,{x:0,y:0,z:0});
      almost(cast.progress,expected);assert.deepEqual(sample.contacts,[]);
      if(ms>=1500)almost(r.clipTime,GREAT_ATTACK_POSE);
      assert.equal(c.stamina,70);
    }
    previous=ms;
  }
  const cast=c.action.greatAttack;c.setAttackHeld(false);
  assert.equal(cast.chargeProgress,1);assert.equal(c.update(.1).greatAttack.charging,false);
  assert.equal(c.serial,1);assert.equal(c.stamina,70);
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
    almost(c.action.greatAttack.chargeProgress,.55/GREAT_ATTACK_CHARGE_SECONDS);
    assert.ok(c.update(.4).clipTime>GREAT_ATTACK_POSE);
    assert.equal(c.stamina,buffered?50:70);
  }
});

test('releasing between frames keeps the exact partial charge for the blade effect',()=>{
  let now=1000;const c=new WarriorV2Controller({durations,holdNow:()=>now});
  c.greatAttackLevel=2;c.setAttackHeld(true);now+=500;c.update(.1);
  const cast=c.action.greatAttack;almost(cast.chargeProgress,1/6);
  now+=700;c.setAttackHeld(false);
  almost(cast.chargeProgress,.4);assert.equal(cast.charging,false);
  const r=c.update(.3),sample={contacts:[]};
  cast.sample(r.clipTime,sample,PLAYER_STRIKES.judgment[0],0,{x:0,y:0,z:0});
  almost(cast.chargeProgress,.4);assert.equal(cast.phase,'release');
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

test('each displayed Starfall hit removes its equipped, rank- and release-scaled damage from chapter HP',()=>{
  const player=actor(0,0),sword={computeWorldMatrix(){},getWorldMatrix:()=>Matrix.Identity()};
  const cases=[
    // The zero-charge lower bound can also be sampled without a physical hold.
    {ms:0,rank:5,gear:'oathblade',kind:'goblin-shaman',hits:[25,25,29]},
    {ms:450,rank:5,gear:'oathblade',kind:'hobgoblin-boss',hits:[29,29,33]},
    {ms:1500,rank:1,gear:'oathblade',kind:'hobgoblin-boss',hits:[28,28,32]},
    {ms:1500,rank:3,gear:'oathblade',kind:'hobgoblin-boss',hits:[33,33,38]},
    {ms:1500,rank:5,gear:'oathblade',kind:'hobgoblin-boss',hits:[38,38,44]},
    {ms:3000,rank:5,gear:'oathblade',kind:'ghoul-warrior',hits:[50,50,58]},
    {ms:8000,rank:5,gear:'bronze-blade',kind:'ghoul-warrior',hits:[58,58,66]},
    {ms:1500,rank:1,gear:'oathblade',kind:'hobgoblin-boss',buffered:true,rear:true,hits:[36,36,41]},
  ];
  for(const {ms,rank,gear,kind,buffered,rear,hits} of cases){
    let now=0;
    const c=new WarriorV2Controller({durations,holdNow:()=>now});c.greatAttackLevel=rank;
    if(ms===0)c.startAttack('judgment');
    else{
      if(buffered)c.shieldPush();
      c.setAttackHeld(true);now=450;c.update(.45);
      if(ms>3000){now=3000;c.update(1);}
      now=ms;c.setAttackHeld(false); // The release can arrive before the next frame.
      if(buffered)c.update(durations.shieldPush-.45+.01);
    }
    const cast=c.action.greatAttack,sampler=new PlayerStrikeSampler(),bonus=TOWN_ITEMS[gear].attack;
    const {b,damage}=opponent(player,0,1.25);
    b.kind=kind;b.brain=new ChapterEnemyBrain(CHAPTER_COMBAT[kind],{},kind);
    if(rear)b.actor.rotation.y=0;
    const startHp=b.brain.hp;let previousHp=startHp;
    b.onDamage=(_position,amount)=>{
      damage.push(amount);assert.equal(previousHp-b.brain.hp,amount,kind+' HP and floating damage');
      previousHp=b.brain.hp;
    };
    almost(cast.radius,1.25*(1+.2*rank));
    for(let frame=0;frame<180;frame++){
      const r=c.update(1/60);if(!r.greatAttack)break;
      const sample=sampler.sample(r,sword,null,true,0,bonus);
      cast.sample(r.clipTime,sample,PLAYER_STRIKES.judgment[0],bonus,player.position,b.world);
      c.pauseOnImpact(b.poseAndContacts(player,r,sample,null)??0);
    }
    assert.deepEqual(damage,hits,kind+' release at '+ms+'ms');
    assert.equal(b.brain.hp,startHp-hits.reduce((sum,value)=>sum+value,0));
  }
});

test('release clamps charge and later samples or a duplicate release cannot change the damage or radius',()=>{
  for(const [progress,scale] of [[-.2,1],[.5,1.5],[1.2,2]]){
    for(const buffered of [false,true]){
      const cast=new GreatAttackCast(1,5,!buffered,progress);
      cast.release();cast.chargeProgress=1-progress;cast.release();
      const sample={contacts:[]};
      cast.sample(1.1,sample,PLAYER_STRIKES.judgment[0],0,{x:0,y:0,z:0});
      const expected=[20,20,24].map(value=>value*scale);
      assert.deepEqual(sample.contacts[0].window.burst,expected);
      assert.equal(sample.contacts[0].window.damage,64*scale);
      assert.equal(cast.radius,2.5);
    }
  }
});

test('the practice dummy displays three rounded Starfall numbers at ranks one, three and five',t=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  const previous=globalThis.document,{document}=parseHTML('<main></main>');globalThis.document=document;
  const host=document.querySelector('main'),numbers=createDamageNumbers(scene,host);
  const training=createTrainingTargets(scene,null,(...args)=>numbers.show(...args));
  t.after(()=>{
    training.dispose();numbers.dispose();scene.dispose();engine.dispose();
    if(previous===undefined)delete globalThis.document;else globalThis.document=previous;
  });
  const target=training.targets[0],feet=target.position.clone();feet.z-=1.25;
  const blade=[feet.asArray(),target.position.asArray()];
  let id=0;
  for(const [rank,expected] of [[1,[28,28,32]],[3,[33,33,38]],[5,[38,38,44]]]){
    const cast=new GreatAttackCast(++id,rank,false,.5);
    for(const elapsed of [0,.055,.11,.5]){
      const sample={actionId:id,elapsed,blade,contacts:[]};
      cast.sample(1.1+elapsed,sample,PLAYER_STRIKES.judgment[0],TOWN_ITEMS.oathblade.attack,feet);
      training.melee(sample);
    }
    assert.deepEqual([...host.children].map(element=>element.textContent),expected.map(String));
    assert.equal(target.hits,id*3);
    numbers.update(1.2);
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
  const distances={near:6,moving:5.3,wall:5.8,manual:5.8,far:6.01,tracked:13.5,personal:7.5,outsidePersonal:7.51};
  for(const scene of ['empty','near','moving','wall','manual','far','tracked','personal','outsidePersonal','dead','despawned','escaped','ledge']){
    const c=heavy(1,{held:true}),cast=c.action.greatAttack,player=actor(0,0),ledger={},aim=createCombatTarget();
    const wall=scene==='wall'?[{id:'wall',x:0,z:.8,radius:.20,height:2}]:[];
    const world={navigation:new ArenaNavigation(wall),terrain:{heightAt:(x,z)=>scene==='ledge'&&z>1.3?2.5:0}};
    const makeFoe=(x,z)=>({actor:actor(x,z),active:true,brain:{hp:20},radius:.3});
    const foe=scene==='empty'?null:makeFoe(0,distances[scene]??3.2);
    if(scene==='personal'||scene==='outsidePersonal')foe.meleeAimDistance=5;
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
        aim.aim(player.position,other??foe,true,STARFALL_REACH_SCALE);
      }
      const action=c.update(dt);
      if(!action.greatAttack)break;
      const step=strikeLungeStep(ledger,player,action,STRIKE_LUNGE.judgment,aim.chainFoe,null,manual,WARRIOR_DIMENSIONS.ratio,durations.judgment,dt,true,aim.reach);
      applyStrikeTravel(player,action,player.rotation.y,step,world,encounters,48,WARRIOR_DIMENSIONS);
      if(frame<60){assert.equal(step,0);assert.deepEqual(player.position.asArray(),[0,0,0]);}
      if(frame===63){
        if(scene==='moving')foe.actor.position.x=.55;
        if(scene==='dead')foe.brain.hp=0;
        if(scene==='despawned')foe.active=false;
        if(scene==='escaped')foe.actor.position.z=14;
      }
      if(scene==='moving'&&!cast.charging&&!cast.impacted)foe.actor.position.z+=2*dt;
      if(action.clipTime>=1.10&&!cast.impacted&&scene==='moving')foe.actor.position.x+=.055; // Enemy's update runs before sampling.
      const p=player.position,yaw=player.rotation.y,dx=Math.sin(yaw),dz=Math.cos(yaw);
      const tip=[p.x+dx+.65*dz,p.y,p.z+dz-.65*dx];
      const sample={blade:[p.asArray(),tip],contacts:[]};
      cast.sample(action.clipTime,sample,PLAYER_STRIKES.judgment[0],0,p,world,yaw);
      if(cast.phase!=='impact')continue;
      hits++;
      if(['near','moving','tracked','personal'].includes(scene)){
        const target=foe.actor.position;
        assert.deepEqual(cast.center,{x:target.x,y:target.y,z:target.z},scene);
        assert.equal(cast.clearRadius,foe.radius,scene);
        assert.ok(Vector3.Distance(player.position,target)>1&&player.position.z>1,scene+' dash stops at melee clearance');
        assert.ok(cast.contains(target,world.navigation));
        if(other)assert.ok(!cast.contains(other.actor.position,world.navigation));
      }else{
        assert.equal(cast.clearRadius,0,scene);
        if(scene==='wall'){
          assert.ok(p.z<.4&&cast.center.z<.6,'wall blocks both player and impact');
          assert.ok(!cast.contains(foe.actor.position,world.navigation));
        }else if(scene==='ledge'){
          assert.ok(p.z<=1.3&&cast.center.z<=1.3,'the cliff keeps travel and impact on the near ground');
          assert.ok(!cast.contains(new Vector3(cast.center.x,2.5,cast.center.z),world.navigation));
        }else{
          almost(cast.center.x,p.x+dx);almost(cast.center.z,p.z+dz);
          if(manual)assert.ok(p.x>.7&&Math.abs(p.z)<.001);
          if(['escaped','far','outsidePersonal'].includes(scene))assert.ok(!cast.contains(foe.actor.position,world.navigation));
        }
      }
    }
    assert.equal(hits,1,scene+' has exactly one impact');
  }
});

test('a landed Starfall exposes only the target body radius to FX at every learned rank',()=>{
  const world={},player=actor(0,0),dimensions=playerDimensions(player);
  const foes=[new GoblinEncounter(world,()=>{}),
    new RegularWolfEncounter(world,()=>{},undefined,undefined,{regularWolfId:'fox'}),
    new WolfV02Encounter(world,()=>{})];
  for(const foe of foes){
    foe.active=true;foe.brain={hp:100};
    foe.actor=actor(0,Math.max(STRIKE_LUNGE.judgment.stop,foe.radius+dimensions.standingClearance));
    assert.notEqual(foe.radius,foe.separationRadius);
    for(const rank of [1,2,3,4,5]){
      const cast=new GreatAttackCast(1,rank,false,.5),action={state:'judgment',clipTime:1.1,greatAttack:cast};
      strikeLungeStep({},player,action,STRIKE_LUNGE.judgment,foe,null,false,dimensions.ratio,durations.judgment,1/60);
      assert.equal(cast.clearRadius,0);
      const sample={contacts:[]};
      cast.sample(action.clipTime,sample,PLAYER_STRIKES.judgment[0],0,player.position,world);
      assert.equal(cast.clearRadius,foe.radius);assert.equal(cast.target,null);
      assert.deepEqual(cast.center,{x:0,y:0,z:foe.actor.position.z});
      almost(cast.radius,1.25*(1+.2*rank));
      assert.ok(cast.contains(foe.actor.position));
      assert.equal(cast.contains({x:cast.radius+.01,y:0,z:cast.center.z}),false);
      assert.equal(sample.contacts.length,1);
    }
  }
});

test('an off-centre sword places free-swing damage and the ground crack directly ahead in all four directions',t=>{
  const engine=new NullEngine(),scene=new Scene(engine),{document}=parseHTML('<main></main>');
  const terrain={heightAt:(x,z)=>(x+z)/8};
  const fx=createGreatAttackFx({scene,root:document.querySelector('main'),ground:terrain.heightAt});
  t.after(()=>{fx.dispose();scene.dispose();engine.dispose();});
  const feet=new Vector3(8,terrain.heightAt(8,-16),-16);
  for(const heading of [0,Math.PI/2,-Math.PI/2,Math.PI]){
    const dx=Math.sin(heading),dz=Math.cos(heading),c=heavy(1,{held:true});
    c.update(2);c.setAttackHeld(false);const cast=c.action.greatAttack;
    const blade=[feet.asArray(),[feet.x+dx*1.5+dz*.66,feet.y+.3,feet.z+dz*1.5-dx*.66]];
    const sample={blade,contacts:[]};
    cast.sample(1.1,sample,PLAYER_STRIKES.judgment[0],0,feet,{terrain},heading);
    assert.equal(sample.contacts.length,1);assert.equal(sample.radialAttack,cast);
    const x=cast.center.x-feet.x,z=cast.center.z-feet.z;
    almost(x*dz-z*dx,0);almost(x*dx+z*dz,1.5);
    almost(cast.center.y,terrain.heightAt(cast.center.x,cast.center.z));
    fx.reset();fx.update(cast,blade,feet);
    const anchors=scene.getMeshByName('v03-starfall-ground').material._vectors4Arrays.anchors;
    almost(anchors[0],cast.center.x);almost(anchors[1],cast.center.y);almost(anchors[2],cast.center.z);
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
  for(let i=0;i<8;i++)frame();almost(story.timeScale,GREAT_ATTACK_SLOW);almost(camera.fov,.85*.8*.90);
  assert.deepEqual([camera.alpha,camera.beta,camera.radius],[1,2,8]);assert.equal(Object.hasOwn(camera,'screenArea'),true);
  controller.knockdown();story.cancelGreatAttackFocus();almost(camera.fov,.85);almost(story.timeScale,1);assert.equal(Object.hasOwn(camera,'screenArea'),false);
  controller=heavy(1,{held:true});
  for(let i=0;i<8;i++)frame();
  controller.action.greatAttack.chargeProgress=1;frame();
  almost(story.timeScale,1);almost(camera.fov,.85*.8*.90);
  controller.setAttackHeld(false);frame();
  almost(story.timeScale,1);assert.ok(camera.fov>.85*.8*.90&&camera.fov<.85);
  for(let i=0;i<12;i++)frame();
  almost(camera.fov,.85);assert.equal(Object.hasOwn(camera,'screenArea'),false);
  story.dispose();
});
