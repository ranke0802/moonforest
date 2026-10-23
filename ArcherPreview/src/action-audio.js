import { BOSS_BY_NAME } from './boss-spec.js';
const attacks={slash:[[.30,'slash']],attack:[[.48,'slash'],[1.04,'slash']],judgment:[[.2,'jump'],[.86,'slash_heavy'],[1.42,'land']],shieldPush:[[0,'shield_up'],[1.0,'slash_heavy']]};
export class ActionAudio {
  constructor(audio){this.audio=audio;this.reset();}
  reset(){this.playerKey=null;this.playerTime=0;this.bossStates=new WeakMap();this.footDistance=0;this.foot=0;this.charged=false;this.bossDefeated=false;}
  player(result,dt,{character,position,duration=1,clipTime=result.clipTime??0}){
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
          for(const [at,name] of attacks[result.state]??[])cue(at,name);
        }
        if(result.state==='dodge'){cue(0,'roll');cue(duration*.75,'land',{volume:.4});}
      }
      if(archer&&changed&&result.state==='death')this.audio.play('death');
      if(result.moving){this.footDistance+=result.speed*(result.movementDt??dt);if(this.footDistance>=.85){this.footDistance%=.85;this.audio.play(`foot_${this.foot++%3}`,{position});}}
      else this.footDistance=0;
    }
    if(result.chargeProgress>=1&&!this.charged)this.audio.play('charge_ready');
    this.charged=result.chargeProgress>=1;this.playerKey=key;this.playerTime=clipTime;
  }
  boss(encounter,dt){
    const bosses=encounter?.encounters??(encounter?[encounter]:[]);
    const living=bosses.some(boss=>boss.active&&boss.brain.hp>0);
    this.audio.setBossMusic?.(!!encounter?.active&&bosses.some(b=>b.kind!=='goblin'&&b.active&&b.brain.hp>0)&&encounter.playerHp>0);
    if(!encounter?.active)return;
    for(const boss of bosses)if(boss.active)this.bossMotion(boss,dt);
    if(bosses.length&&!living&&!this.bossDefeated){this.audio.play('victory');this.bossDefeated=true;}
    if(living)this.bossDefeated=false;
  }
  bossMotion(encounter,dt){
    let memory=this.bossStates.get(encounter);
    if(!memory){memory={key:null,time:0,feet:0};this.bossStates.set(encounter,memory);}
    const b=encounter.brain,position=encounter.actor.position,key=b.serial,changed=key!==memory.key,previous=changed?-1:memory.time;
    const duration=b.durations[b.state],phase=b.time/duration;
    if(changed){
      if(b.mode==='evade')this.audio.play('roll',{position,rate:.8});
      if(b.mode==='guard')this.audio.play('shield_up',{position,rate:.8});
      if(b.mode==='attack'&&/Skill|Flying|Spin/.test(b.state))this.audio.play('boss_warning',{position});
    }
    if(b.mode==='attack'&&!b.stagger){
      const at=Math.max(0,duration*((encounter.motionSpec?.(b.state)??BOSS_BY_NAME[b.state])?.impact??.45)-.10);
      if(previous<at&&b.time>=at)this.audio.play(encounter.kind==='goblin'?'slash':'slash_heavy',{position,rate:encounter.kind==='goblin'?1.12:.72,volume:encounter.kind==='goblin'?.45:.8});
      if(b.state==='Skill_02'&&encounter.grab?.holding)for(const phase of [.3,.55,.78])if(previous<duration*phase&&b.time>=duration*phase)this.audio.play('slash_heavy',{position,rate:.65,volume:.6});
    }
    if(['move','approach'].includes(b.mode)){memory.feet+=dt;if(memory.feet>.38){memory.feet%=.38;this.audio.play(`foot_${this.foot++%3}`,{position,volume:encounter.kind==='goblin'?.4:1.7,rate:encounter.kind==='goblin'?1.15:.65});}}
    else memory.feet=0;
    if(b.mode==='down'&&previous<duration*.45&&phase>=.45)this.audio.play('land',{position,rate:.65});
    if(b.mode==='recover'&&previous<duration*.4&&phase>=.4)this.audio.play('equip',{position,rate:.7,volume:.6});
    memory.key=key;memory.time=b.time;
  }
  damage(position,damage,heavy=false,kind='enemy',burstIndex=0,critical=false){
    const name=kind==='heal'?'heal_tick':kind==='block'?'block':kind==='evade'?null:kind==='player'?'player_hit':heavy?'land':'boss_hit';
    if(name)this.audio.play(name,{position,rate:heavy?.8:1});
    if(critical)this.audio.play('critical',{position});
  }
}
