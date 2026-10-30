// Keep the authored clip names, including Meshy's original spelling.
export const ELENA_HOME=Object.freeze({x:29,z:-27});
export const ELENA_SPELLS=Object.freeze([
  {name:'mage_soell_cast_6',label:'붉은 마력로',pattern:'corridor',impact:.58,range:10,damage:28},
  {name:'mage_soell_cast_2',label:'타락의 부채',pattern:'fan',impact:.60,range:8,damage:26},
  {name:'mage_soell_cast_3',label:'금단의 고리',pattern:'ring',impact:.58,range:7,damage:30},
  {name:'mage_soell_cast_4',label:'교차하는 저주',pattern:'cross',impact:.58,range:9,damage:26},
  {name:'mage_soell_cast_5',label:'추모의 의식',pattern:'cluster',impact:.58,range:9,damage:34},
  {name:'mage_soell_cast_7',label:'성역의 균열',pattern:'fan',impact:.58,range:10,damage:30},
  {name:'Axe_Spin_Attack',label:'붉은 환상진',pattern:'ring',impact:.60,range:5,damage:25},
].map(s=>Object.freeze({...s,kind:'ground'})));
export const ELENA_CAST=ELENA_SPELLS[0];
export const ELENA_SPIN=ELENA_SPELLS.at(-1); // Animation only; now an area spell.
export const ELENA_ACTIVE_CLIPS=Object.freeze(['Elena_Idle','Walking','Running','Knock_Down','Stand_Up9',...ELENA_SPELLS.map(s=>s.name)]);
export const MOURNING_SPELLS=Object.freeze([
  ['corridor','비탄의 격류',13,38],['fan','절규의 부채',11,36],['ring','상실의 고리',10,40],
  ['cross','갈라진 성역',12,36],['cluster','추모의 낙인',10,38],
].map(([pattern,label,range,damage])=>Object.freeze({name:'cast',label,pattern,range,damage,kind:'ground',impact:.55})));
export function spellImpact(spec,duration){return Math.min(Math.max(1,duration*spec.impact),duration-.25);}

export class ElenaBrain {
  constructor(durations,{mourning=false}={}){
    this.durations=durations;this.mourning=mourning;this.spells=mourning?MOURNING_SPELLS:ELENA_SPELLS;
    this.idle=mourning?'idle':'Elena_Idle';this.walk=mourning?'walk':'Walking';
    this.hp=this.maxHp=mourning?1800:1200;this.serial=0;this.stagger=0;this.flash=0;this.flashDuration=.18;
    this.wait=1.2;this.nextSpell=0;this.visited=new Set();this.start(this.idle,'idle');
  }
  start(state,mode){this.state=state;this.mode=mode;this.time=0;this.serial++;this.impacted=false;this.visited.add(state);if(mode==='attack'&&!this.mourning)this.spell=this.spells.find(s=>s.name===state);}
  cast(){this.spell=this.spells[this.nextSpell++%this.spells.length];this.start(this.spell.name,'attack');return this.spell;}
  get defense(){return null;}
  get label(){return this.mode==='attack'?this.spell?.label:({idle:'경계',move:'접근',down:'쓰러짐',recover:'일어나기',dead:this.mourning?'비탄의 끝':'광폭화'})[this.mode]??'경계';}
  hit({damage=14,heavy=false,stun=0}={}){
    if(this.hp<=0)return false;
    this.hp=Math.max(0,this.hp-damage);this.flash=this.flashDuration;
    if(!this.hp){this.stagger=0;this.start(this.mourning?'dead':'Knock_Down','dead');}
    else if(heavy&&!this.mourning&&!['down','recover'].includes(this.mode)){this.stagger=0;this.start('Knock_Down','down');}
    else if(!['down','recover'].includes(this.mode)){
      this.stagger=Math.max(this.stagger,stun||.35);
      if(this.mode==='attack'){this.start(this.idle,'idle');this.wait=1.2;}
    }
    return true;
  }
  parry(){this.stagger=1;this.impacted=true;if(this.mode==='attack'){this.start(this.idle,'idle');this.wait=1.2;}}
  update(dt,distance,playerAlive,{manual=false}={}){
    this.flash=Math.max(0,this.flash-dt);const events=[];
    if(this.stagger>0){this.stagger=Math.max(0,this.stagger-dt);return {events,speed:0};}
    this.time+=dt;if(this.hp<=0)return {events,speed:0};
    const duration=this.durations[this.state];
    if(this.mode==='down'){if(this.time>=duration)this.start('Stand_Up9','recover');return {events,speed:0};}
    if(this.mode==='recover'){if(this.time>=duration){this.start(this.idle,'idle');this.wait=.9;}return {events,speed:0};}
    if(!playerAlive){if(this.mode!=='idle')this.start(this.idle,'idle');return {events,speed:0};}
    if(this.mode==='attack'){
      const attack=this.spell;
      if(!this.impacted&&this.time>=spellImpact(attack,duration)){this.impacted=true;events.push(attack);}
      // Keep the release event even when a long frame crosses the clip's end.
      if(this.time>=duration&&!events.length){this.start(this.idle,'idle');this.wait=this.mourning?1.5:1.8;}
      return {events,speed:0};
    }
    if(manual)return {events,speed:0};
    this.wait-=dt;
    if(distance<=10&&this.wait<=0){this.cast();return {events,speed:0};}
    if(distance>5){const state=this.mourning?'walk':distance>7?'Running':'Walking';if(this.state!==state)this.start(state,'move');return {events,speed:this.mourning?.673:distance>7?2.1:1.1};}
    if(this.mode!=='idle')this.start(this.idle,'idle');
    return {events,speed:0};
  }
}
