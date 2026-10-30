// Source names intentionally retain Meshy's spelling for future VFX binding.
export const ELENA_HOME=Object.freeze({x:29,z:-27});
export const ELENA_ACTIVE_CLIPS=Object.freeze(['Elena_Idle','Walking','Running','Axe_Spin_Attack','Knock_Down','Stand_Up9','mage_soell_cast_6']);
export const ELENA_SPIN=Object.freeze({name:'Axe_Spin_Attack',label:'회전 밀쳐내기',kind:'spin',impact:.55,range:1.35,damage:22});
export const ELENA_CAST=Object.freeze({name:'mage_soell_cast_6',label:'붉은 마력선 · 임시',kind:'line',impact:.58,range:7,damage:28});
export class ElenaBrain {
  constructor(durations){this.durations=durations;this.hp=this.maxHp=1200;this.serial=0;this.stagger=0;this.flash=0;this.flashDuration=.18;this.wait=.9;this.visited=new Set();this.start('Elena_Idle','idle');}
  start(state,mode){this.state=state;this.mode=mode;this.time=0;this.serial++;this.impacted=false;this.visited.add(state);}
  get defense(){return null;}
  get label(){if(this.state===ELENA_CAST.name)return ELENA_CAST.label;return ({idle:'엘레나 · 경계',move:'엘레나 · 접근',attack:'회전 밀쳐내기',down:'쓰러짐',recover:'일어나기',dead:'엘레나 · 쓰러짐'})[this.mode]??'엘레나';}
  hit({damage=14,heavy=false,stun=0}={}){
    if(this.hp<=0)return false;
    this.hp=Math.max(0,this.hp-damage);this.flash=this.flashDuration;
    if(!this.hp)this.start('Knock_Down','dead');
    else if(heavy&&!['down','recover'].includes(this.mode)){this.stagger=0;this.start('Knock_Down','down');}
    else if(!['down','recover'].includes(this.mode)){
      this.stagger=Math.max(this.stagger,stun||.35);
      if(this.state===ELENA_CAST.name){this.start('Elena_Idle','idle');this.wait=1.2;}
    }
    return true;
  }
  parry(){this.stagger=1;this.impacted=true;if(this.state===ELENA_CAST.name){this.start('Elena_Idle','idle');this.wait=1.2;}}
  update(dt,distance,playerAlive){
    this.flash=Math.max(0,this.flash-dt);const events=[];
    if(this.stagger>0){this.stagger=Math.max(0,this.stagger-dt);return {events,speed:0};}
    this.time+=dt;
    if(this.hp<=0)return {events,speed:0};
    const duration=this.durations[this.state];
    if(this.mode==='down'){if(this.time>=duration)this.start('Stand_Up9','recover');return {events,speed:0};}
    if(this.mode==='recover'){if(this.time>=duration){this.start('Elena_Idle','idle');this.wait=.9;}return {events,speed:0};}
    if(!playerAlive){if(this.mode!=='idle')this.start('Elena_Idle','idle');return {events,speed:0};}
    if(this.mode==='attack'){
      const attack=this.state===ELENA_CAST.name?ELENA_CAST:ELENA_SPIN;
      if(!this.impacted&&this.time>=duration*attack.impact){this.impacted=true;events.push(attack);}
      if(this.time>=duration){this.start('Elena_Idle','idle');this.wait=attack===ELENA_CAST?2:1.3;}
      return {events,speed:0};
    }
    this.wait-=dt;
    if(distance>2&&distance<=ELENA_CAST.range&&this.wait<=0){this.start(ELENA_CAST.name,'attack');return {events,speed:0};}
    if(distance>1.15){const state=distance>4?'Running':'Walking';if(this.state!==state)this.start(state,'move');return {events,speed:distance>4?2.1:1.1};}
    if(this.mode!=='idle')this.start('Elena_Idle','idle');
    if(this.wait<=0)this.start(ELENA_SPIN.name,'attack');
    return {events,speed:0};
  }
}
