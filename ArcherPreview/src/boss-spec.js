// All twenty names are the original FBX clip names. No generated/retargeted clips.
export const BOSS_MOTIONS = [
  {name:'Axe_Spin_Attack',label:'회전 휩쓸기',role:'attack',range:2.7,impact:.49,kind:'spin'},
  {name:'baseball_pitching',label:'바위 던지기',role:'attack',range:10,impact:.49,kind:'rock'},
  {name:'Flying_Fist_Kick',label:'도약 연속 타격',role:'attack',range:3.2,impact:.53,kind:'melee'},
  {name:'Left_Hook_from_Guard',label:'왼손 훅',role:'attack',range:2.3,impact:.42,kind:'melee'},
  {name:'Left_Uppercut_from_Guard',label:'왼손 올려치기',role:'attack',range:2.1,impact:.42,kind:'melee'},
  {name:'Lunge_Spin_Kick',label:'전진 회전 발차기',role:'attack',range:2.6,impact:.53,kind:'spin'},
  {name:'mage_soell_cast_6',label:'마력탄 시전',role:'attack',range:10,impact:.6,kind:'magic'},
  {name:'Right_Jab_from_Guard',label:'오른손 잽',role:'attack',range:2.4,impact:.38,kind:'melee'},
  {name:'Rising_Flying_Kick',label:'솟구치는 발차기',role:'attack',range:2.7,impact:.5,kind:'melee'},
  {name:'Shield_Push_Left',label:'왼팔 밀치기',role:'attack',range:2.3,impact:.55,kind:'melee'},
  {name:'Skill_01',label:'포효 충격파',role:'attack',range:2.6,impact:.52,kind:'spin'},
  {name:'Skill_02',label:'양팔 휩쓸기',role:'attack',range:2.6,impact:.52,kind:'melee'},
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
export const BOSS_ATTACKS=BOSS_MOTIONS.filter(m=>m.role==='attack');

export class BossBrain {
  constructor(durations,random=Math.random){
    this.durations=durations;this.random=random;this.hp=this.maxHp=900;
    this.state='Block6';this.mode='idle';this.time=0;this.serial=1;this.wait=1.2;
    this.stagger=0;this.flash=0;this.bag=[];this.attackCount=0;this.visited=new Set([this.state]);this.impacted=false;
  }
  start(state,mode){this.state=state;this.mode=mode;this.time=0;this.serial++;this.impacted=false;this.visited.add(state);}
  nextAttack(){
    if(!this.bag.length){
      this.bag=BOSS_ATTACKS.map(a=>a.name);
      for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
    }
    return this.bag.pop();
  }
  hit({heavy=false,damage=14,stun=0}={}){
    if(this.hp<=0||this.mode==='down')return false;
    this.hp=Math.max(0,this.hp-damage);this.flash=.22;
    if(heavy||!this.hp){this.stagger=0;this.start('Knock_Down_1','down');}
    else this.stagger=Math.max(this.stagger,stun||.18);
    return true;
  }
  parry(){if(this.hp>0&&!['down','recover'].includes(this.mode)){this.stagger=Math.max(this.stagger,.25);this.flash=.16;return true;}return false;}
  update(dt,distance,playerAlive=true){
    const events=[];dt=Math.max(0,dt);this.flash=Math.max(0,this.flash-dt);
    if(this.stagger>0){this.stagger=Math.max(0,this.stagger-dt);return {events,speed:0};}
    const duration=this.durations[this.state];
    if(this.mode==='down'||this.mode==='recover'){
      this.time=Math.min(duration,this.time+dt);
      if(this.time>=duration){
        if(this.mode==='down'&&this.hp>0)this.start('Stand_Up3','recover');
        else if(this.mode==='recover'){this.start('Block6','idle');this.wait=.7;}
      }
      return {events,speed:0};
    }
    if(!playerAlive){this.startIfChanged('Block6','idle');return {events,speed:0};}
    if(['attack','guard','evade'].includes(this.mode)){
      this.time=Math.min(duration,this.time+dt);
      const spec=BOSS_BY_NAME[this.state];
      if(this.mode==='attack'&&!this.impacted&&this.time>=duration*spec.impact){this.impacted=true;events.push({type:'attack',...spec});}
      if(this.time>=duration){this.start('Block6','idle');this.wait=.65;}
      return {events,speed:0};
    }
    if(distance>2.25){
      this.startIfChanged(distance>4.5?'Running':'Walking','move');
      this.time=(this.time+dt)%this.durations[this.state];
      return {events,speed:distance>4.5?2.65:1.05};
    }
    this.startIfChanged('Block6','idle');this.wait-=dt;
    if(this.wait<=0){
      this.attackCount++;
      if(this.attackCount%7===0)this.start('Backflip','evade');
      else if(this.attackCount%5===0)this.start('Block6','guard');
      else this.start(this.nextAttack(),'attack');
    }
    return {events,speed:0};
  }
  startIfChanged(state,mode){if(this.state!==state||this.mode!==mode)this.start(state,mode);}
  get label(){return this.hp<=0?'격파':this.stagger>.3?'강한 경직':this.stagger>0?'경직':this.mode==='idle'?'가드 대기':BOSS_BY_NAME[this.state].label;}
}
