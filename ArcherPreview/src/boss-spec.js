// All twenty names are the original FBX clip names. No generated/retargeted clips.
export const BOSS_MOTIONS = [
  {name:'Axe_Spin_Attack',label:'회전 휩쓸기',role:'attack',range:2.7,impact:.49,kind:'spin'},
  {name:'baseball_pitching',label:'바위 던지기',role:'attack',range:10,impact:.49,kind:'rock',disabled:true},
  {name:'Flying_Fist_Kick',label:'도약 연속 타격',role:'attack',range:3.2,impact:.53,kind:'melee'},
  {name:'Left_Hook_from_Guard',label:'왼손 훅',role:'attack',range:2.3,impact:.42,kind:'melee'},
  {name:'Left_Uppercut_from_Guard',label:'왼손 올려치기',role:'attack',range:2.1,impact:.42,kind:'melee'},
  {name:'Lunge_Spin_Kick',label:'전진 회전 발차기',role:'attack',range:2.6,impact:.53,kind:'spin'},
  {name:'mage_soell_cast_6',label:'마력탄 시전',role:'attack',range:10,impact:.6,kind:'magic',disabled:true},
  {name:'Right_Jab_from_Guard',label:'오른손 잽',role:'attack',range:2.4,impact:.38,kind:'melee'},
  {name:'Rising_Flying_Kick',label:'솟구치는 발차기',role:'attack',range:2.7,impact:.5,kind:'melee'},
  {name:'Shield_Push_Left',label:'왼팔 밀치기',role:'attack',range:2.3,impact:.55,kind:'melee'},
  {name:'Skill_01',label:'포효 충격파',role:'attack',range:2.6,impact:.52,kind:'spin'},
  {name:'Skill_02',label:'다리 잡아 돌려 던지기',role:'attack',range:1.8,impact:.08,kind:'grab',playRate:.85},
  {name:'Skill_03',label:'회전 몸통치기',role:'attack',range:3,impact:.52,kind:'spin'},
  {name:'Weapon_Combo',label:'연속 휩쓸기',role:'attack',range:2.6,impact:.5,kind:'spin'},
  {name:'Walking',label:'거리 좁히기',role:'move'},
  {name:'Running',label:'추격',role:'move'},
  {name:'Block6',label:'가드 / 대기',role:'guard'},
  {name:'Backflip',label:'뒤로 회피',role:'evade'},
  {name:'Knock_Down_1',label:'강공격 넉백 / 쓰러짐',role:'down'},
  {name:'Stand_Up3',label:'다운 후 기상',role:'recover'},
];
export const BOSS_BY_NAME=Object.fromEntries(BOSS_MOTIONS.map(m=>[m.name,m]));
export const BOSS_ACTIVE_MOTIONS=BOSS_MOTIONS.filter(m=>!m.disabled);
export const BOSS_ATTACKS=BOSS_ACTIVE_MOTIONS.filter(m=>m.role==='attack');
export const bossAttackRange=spec=>(spec.range||2.5)*1.2;
// Source Stand_Up3 is upright by frame 117; its remaining two seconds are an idle tail.
export const BOSS_RECOVERY_READY_TIME=117/30;
export const BOSS_RECOVERY_WAIT=.15;
export const BOSS_GROUNDED_HIT_RANGE=2.4;
export const BOSS_GRAB_APPROACH_DISTANCE=1.9;
export const BOSS_HEAVY_ATTACKS=new Set(['Axe_Spin_Attack','Flying_Fist_Kick','Lunge_Spin_Kick','Rising_Flying_Kick','Skill_01','Skill_03','Weapon_Combo']);
export const BOSS_ADVANCING_COMBO=['Right_Jab_from_Guard','Left_Hook_from_Guard','Left_Uppercut_from_Guard'];
export const BOSS_DAMAGE={Axe_Spin_Attack:160,Flying_Fist_Kick:150,Left_Hook_from_Guard:100,Left_Uppercut_from_Guard:120,
  Lunge_Spin_Kick:150,Right_Jab_from_Guard:80,Rising_Flying_Kick:140,Shield_Push_Left:100,Skill_01:180,Skill_02:300,Skill_03:160,Weapon_Combo:180};

export class BossBrain {
  constructor(durations,random=Math.random){
    this.durations=durations;this.random=random;this.hp=this.maxHp=900;
    this.state='Block6';this.mode='idle';this.time=0;this.serial=1;this.wait=.65;
    this.stagger=0;this.flash=0;this.bag=[];this.attackCount=0;this.visited=new Set([this.state]);this.impacted=false;this.comboStep=0;
  }
  configureAttacks(config={}){const old=this.attackSettings;if(old?.custom!==config.custom||old?.sequence?.join('|')!==config.sequence?.join('|'))this.customAttackIndex=0;this.attackSettings=config;}
  start(state,mode){this.state=state;this.mode=mode;this.time=0;this.serial++;this.impacted=false;this.interrupted=false;this.visited.add(state);if(mode!=='attack')this.comboStep=0;else this.castSpeed=Number.isFinite(this.attackSettings?.speed)?Math.max(.5,Math.min(2,this.attackSettings.speed)):1;}
  startCombo(){this.comboStep=1;this.start(BOSS_ADVANCING_COMBO[0],'attack');}
  nextAttack(){
    const sequence=this.attackSettings?.custom&&this.attackSettings.sequence;
    if(sequence?.length){const id=sequence[(this.customAttackIndex??0)%sequence.length];this.customAttackIndex=(this.customAttackIndex??0)+1;if(BOSS_ATTACKS.some(s=>s.name===id))return id;}
    if(!this.bag.length){
      this.bag=BOSS_ATTACKS.map(a=>a.name);
      for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
    }
    return this.bag.pop();
  }
  hit({heavy=false,damage=14,stun=0,interruptsBoss=false}={}){
    if(this.hp<=0||this.defense)return false;
    this.hp=Math.max(0,this.hp-damage);
    const flashDuration=stun>0?.75:.22;
    if(flashDuration>=this.flash){this.flash=flashDuration;this.flashDuration=flashDuration;}
    // Grounded targets still take damage. Further hits must not restart the fall
    // or indefinitely delay getting up, including another judgment burst.
    if(this.mode==='down'||(this.mode==='recover'&&this.hp>0))return true;
    // Normal sword cuts damage/flash the boss without staggering any state,
    // including movement and idle. Shield stun and heavy knockdown
    // retain priority, and a lethal hit must still end the attack.
    if(this.hp>0&&!interruptsBoss&&!heavy&&!stun)return true;
    if(!this.hp||(heavy&&this.mode!=='recover')){this.stagger=0;this.start('Knock_Down_1','down');}
    else {this.stagger=Math.max(this.stagger,stun||.2);this.interrupted=this.mode==='attack';if(this.interrupted){this.impacted=true;this.comboStep=0;}}
    return true;
  }
  parry(){
    if(this.hp<=0||['down','recover'].includes(this.mode))return false;
    this.stagger=1;this.interrupted=true;this.impacted=true;this.comboStep=0;this.flash=this.flashDuration=.45;return true;
  }
  update(dt,distance,playerAlive=true){
    const events=[];dt=Math.max(0,dt);this.flash=Math.max(0,this.flash-dt);
    if(this.stagger>0){
      this.stagger=Math.max(0,this.stagger-dt);
      if(!this.stagger&&this.interrupted){this.interrupted=false;this.start('Block6','idle');this.wait=.3;}
      return {events,speed:0};
    }
    const duration=this.durations[this.state];
    if(this.mode==='down'||this.mode==='recover'){
      const end=this.mode==='recover'?Math.min(duration,BOSS_RECOVERY_READY_TIME):duration;
      this.time=Math.min(end,this.time+dt);
      if(this.time>=end){
        if(this.mode==='down'&&this.hp>0)this.start('Stand_Up3','recover');
        else if(this.mode==='recover'){this.start('Block6','idle');this.wait=BOSS_RECOVERY_WAIT;}
      }
      return {events,speed:0};
    }
    if(!playerAlive){this.startIfChanged('Block6','idle');return {events,speed:0};}
    if(this.mode==='approach'){
      if(distance<=BOSS_GRAB_APPROACH_DISTANCE)this.start('Skill_02','attack');
      else {this.time=(this.time+dt)%duration;return {events,speed:3.25};}
      return {events,speed:0};
    }
    if(['attack','guard','evade'].includes(this.mode)){
      const spec=BOSS_BY_NAME[this.state];
      this.time=Math.min(duration,this.time+dt*(this.mode==='attack'?(spec.playRate||1.12)*(this.castSpeed??1):1));
      const speed=this.comboStep&&this.time<duration*spec.impact?1.8:0;
      if(this.mode==='attack'&&!this.impacted&&this.time>=duration*spec.impact){this.impacted=true;events.push({type:'attack',...spec,comboStep:this.comboStep});}
      if(this.time>=duration){
        if(this.comboStep&&this.comboStep<BOSS_ADVANCING_COMBO.length)this.start(BOSS_ADVANCING_COMBO[this.comboStep++],'attack');
        else {this.start('Block6','idle');this.wait=.3;}
      }
      return {events,speed};
    }
    if(distance>2.65){
      this.startIfChanged(distance>3.8?'Running':'Walking','move');
      this.time=(this.time+dt)%this.durations[this.state];
      return {events,speed:distance>3.8?3.25:1.65};
    }
    this.startIfChanged('Block6','idle');this.wait-=dt;
    if(this.wait<=0){
      this.attackCount++;
      if(this.attackSettings?.custom&&this.attackSettings.sequence?.length){const next=this.nextAttack();this.start(next==='Skill_02'?'Running':next,next==='Skill_02'?'approach':'attack');}
      else if(this.attackCount%7===0)this.start('Backflip','evade');
      else if(this.attackCount%5===0)this.start('Block6','guard');
      else if(this.attackCount%4===0)this.startCombo();
      else {const next=this.nextAttack();this.start(next==='Skill_02'?'Running':next,next==='Skill_02'?'approach':'attack');}
    }
    return {events,speed:0};
  }
  startIfChanged(state,mode){if(this.state!==state||this.mode!==mode)this.start(state,mode);}
  get defense(){return this.mode==='evade'?'evade':this.mode==='guard'?'block':null;}
  get label(){return this.hp<=0?'격파':this.stagger>.3?'강한 경직':this.stagger>0?'경직':this.comboStep?`전진 3연타 · ${this.comboStep}타`:this.mode==='approach'?'잡기 접근':this.mode==='idle'?'가드 대기':BOSS_BY_NAME[this.state].label;}
}
