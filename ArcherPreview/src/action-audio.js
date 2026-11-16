import { BOSS_BY_NAME } from './boss-spec.js';
import { encounterInCombat } from './combat-readability.js';
const attacks={slash:[[.30,'slash']],attack:[[.48,'slash'],[1.04,'slash']],judgment:[[.2,'jump'],[.86,'slash_heavy'],[1.42,'land']],shieldPush:[[0,'shield_up'],[1.0,'slash_heavy']]};
export class ActionAudio {
  constructor(audio){this.audio=audio;this.reset();}
  reset(){this.playerKey=null;this.playerTime=0;this.bossStates=new WeakMap();this.footDistance=0;this.foot=0;this.charged=false;this.bossDefeated=false;this.combatHold=0;this.heldBoss=false;this.lowHealth=false;}
  player(result,dt,{character,position,duration=1,clipTime=result.clipTime??0,strideScale=1}){
    this.audio.listener=position;
    const archer=character==='archer',key=`${character}:${result.actionId??result.state}`;
    const changed=key!==this.playerKey,previous=changed?-1:this.playerTime;
    const cue=(at,name,options)=>{if(previous<at&&clipTime>=at)this.audio.play(name,{position,...options});};
    if(result.knockedDown){if(result.state==='knockdown')cue(.8,'land');else cue(0,'equip',{volume:.5});}
    if(!result.captured&&!result.staggered){
      if(result.actionId!=null){
        if(archer){if(changed&&['attack','moveAttack'].includes(result.state))this.audio.play('bow_draw',{position});if(changed&&result.state==='hit')this.audio.play('player_hit',{position});}
        else {
          if(changed&&result.state==='judgment'&&!this.charged)this.audio.play('charge_ready');
          const holdingShield=result.state==='shieldPush'&&(result.shieldPending||result.guarding);
          for(const [at,name] of attacks[result.state]??[])if(!holdingShield||name==='shield_up')cue(at,name);
        }
        if(result.state==='dodge'){cue(0,'roll');cue(duration*.75,'land',{volume:.4});}
      }
      if(archer&&changed&&result.state==='death')this.audio.play('death');
      if(result.moving){const stride=.85*strideScale;this.footDistance+=result.speed*(result.movementDt??dt);if(this.footDistance>=stride){this.footDistance%=stride;const surface=character==='warrior-v5'?'cave_':character==='warrior-v4'?'forest_':'';this.audio.play(`foot_${surface}${this.foot++%3}`,{position});}}
      else this.footDistance=0;
    }
    if(result.chargeProgress>=1&&!this.charged)this.audio.play('charge_ready');
    this.charged=result.chargeProgress>=1;this.playerKey=key;this.playerTime=clipTime;
  }
  boss(encounter,dt){
    const bosses=(encounter?.encounters??(encounter?[encounter]:[])).filter(b=>b.kind!=='elena'||b.engaged||(!b.corpseGone&&b.brain?.hp<=0));
    const living=bosses.some(boss=>boss.active&&boss.brain.hp>0&&encounterInCombat(boss));
    const surviving=bosses.some(boss=>boss.active&&boss.brain.hp>0);
    const alive=!encounter?.active||encounter.playerHp>0,bossAlive=bosses.some(b=>b.kind!=='goblin'&&!b.regularWolfId&&b.active&&b.brain.hp>0&&encounterInCombat(b));
    if(encounter?.active&&living){this.combatHold=2.5;this.heldBoss=bossAlive;}else this.combatHold=Math.max(0,this.combatHold-dt);
    if(this.audio.setCombat)this.audio.setCombat({active:!!encounter?.active&&this.combatHold>0,boss:this.heldBoss,alive});
    else this.audio.setBossMusic?.(!!encounter?.active&&bossAlive&&alive);
    const health=(encounter?.playerHp??1)/(encounter?.playerMaxHp||1);
    if(encounter?.active&&alive&&health<=.25&&!this.lowHealth){this.audio.play('low_health');this.lowHealth=true;}
    if(health>.3||!alive)this.lowHealth=false;
    if(!encounter?.active)return;
    for(const boss of bosses)if(boss.active)this.bossMotion(boss,dt);
    if(bosses.length&&!surviving&&alive&&!this.bossDefeated){this.audio.play('victory');this.bossDefeated=true;}
    if(surviving)this.bossDefeated=false;
  }
  bossMotion(encounter,dt){
    const position=encounter.actor.position;
    let memory=this.bossStates.get(encounter);
    if(!memory){memory={key:null,time:0,contactTime:0,feet:0,hp:encounter.brain.hp,engaged:false,x:position.x,z:position.z};this.bossStates.set(encounter,memory);}
    const b=encounter.brain,key=b.serial,changed=key!==memory.key,previous=changed?-1:memory.time;
    const moved=Math.hypot(position.x-memory.x,position.z-memory.z)>1e-5;
    memory.x=position.x;memory.z=position.z;
    // Neutral cues only: no borrowed monster voices or magic audio before VFX approval.
    if(encounter.kind==='elena'){
      if(changed&&b.mode==='attack')this.audio.play('equip',{position,volume:.3});
      if(b.mode==='move'){memory.feet+=dt;if(memory.feet>.45){memory.feet%=.45;this.audio.play(`foot_cave_${this.foot++%3}`,{position,volume:.35});}}
      else memory.feet=0;
      memory.key=key;memory.time=b.time;memory.hp=b.hp;return;
    }
    const clipDuration=b.durations?.[b.state],duration=Number.isFinite(clipDuration)&&clipDuration>0?clipDuration:Number.isFinite(b.action?.clipEnd)&&b.action.clipEnd>0?b.action.clipEnd:1,phase=b.time/duration;
    const kind=encounter.kind==='goblin'?'goblin':encounter.regularWolfId==='fox'?'fox':encounter.regularWolfId==='boar'?'boar':encounter.kind==='wolf'?'wolf':'bear';
    const engaged=encounter.active!==false&&b.hp>0&&encounterInCombat(encounter);
    if(kind!=='goblin'&&engaged&&!memory.engaged)this.audio.play(kind+'_alert',{position});
    memory.engaged=engaged;
    if(b.hp<memory.hp)this.audio.play(`${kind}_${b.hp<=0?'death':'hurt'}`,{position});
    memory.hp=b.hp;
    if(b.hp<=0){memory.key=key;memory.time=b.time;return;}
    if(changed){
      if(b.mode==='attack')this.audio.play(kind+'_attack',{position});
      if(b.mode==='evade')this.audio.play('roll',{position,rate:.8});
      if(b.mode==='guard')this.audio.play('shield_up',{position,rate:.8});
      if(b.mode==='attack'&&/Skill|Flying|Spin/.test(b.state))this.audio.play('boss_warning',{position});
    }
    if(b.mode==='attack'&&!b.stagger){
      // V02 actions use absolute source seconds; legacy motion specs use a fraction.
      const contactTime=b.action?.momentumRam?(b.ramContactTime??b.time):b.time,priorContact=changed?-1:memory.contactTime;
      const impact=(at)=>{if(priorContact<at&&contactTime>=at)this.audio.play(kind==='goblin'?'slash':kind+'_impact',{position,rate:kind==='goblin'?1.12:1,volume:kind==='goblin'?.45:.8});};
      if(b.action?.ramPhases){for(const contact of b.action.ramPhases)if(Number.isFinite(contact.impact))impact(contact.impact);}
      else impact(b.action&&Number.isFinite(b.action.impact)?b.action.impact:Math.max(0,duration*((encounter.motionSpec?.(b.state)??BOSS_BY_NAME[b.state])?.impact??.45)-.10));
      if(b.state==='Skill_02'&&encounter.grab?.holding)for(const phase of [.3,.55,.78])if(previous<duration*phase&&b.time>=duration*phase)this.audio.play(kind==='goblin'?'slash_heavy':kind+'_impact',{position,rate:kind==='goblin'?.65:1,volume:.6});
    }
    if(['move','approach'].includes(b.mode)&&(kind==='goblin'||moved)){memory.feet+=dt;if(memory.feet>.38){memory.feet%=.38;this.audio.play(kind==='goblin'?`foot_${this.foot++%3}`:kind+'_step',{position,volume:kind==='goblin'?.4:1,rate:kind==='goblin'?1.15:1});}}
    else memory.feet=0;
    if(b.mode==='down'&&previous<duration*.45&&phase>=.45)this.audio.play('land',{position,rate:.65});
    if(b.mode==='recover'&&previous<duration*.4&&phase>=.4)this.audio.play('equip',{position,rate:.7,volume:.6});
    memory.key=key;memory.time=b.time;memory.contactTime=b.action?.momentumRam?(b.ramContactTime??b.time):b.time;
  }
  damage(position,damage,heavy=false,kind='enemy',burstIndex=0,critical=false){
    if(kind==='guard-break')return; // The confirmed hit already plays its impact sound.
    const name=kind==='heal'?'heal_tick':kind==='block'?'block':kind==='evade'?'evade_success':kind==='player'?'player_hit':heavy?'land':'boss_hit';
    if(name)this.audio.play(name,{position,rate:heavy?.8:1});
    if(critical)this.audio.play('critical',{position});
  }
}
