// Keep the authored clip names, including Meshy's original spelling.
export const ELENA_HOME=Object.freeze({x:29,z:-25.5});
// The authored body is 2.7 m; the manifest's 3.2 m includes the halo.
// Keep the packed rig untouched and apply this one ratio to world dimensions.
export const MOURNING_SIZE_SCALE=5.7/2.7;
export const MOURNING_SIZE=Object.freeze({
  bodyHeight:5.7,sourceBodyHeight:2.7,radius:.9*MOURNING_SIZE_SCALE,
  separationRadius:1.1*MOURNING_SIZE_SCALE,stopDistance:3*MOURNING_SIZE_SCALE,
  contactScale:3*MOURNING_SIZE_SCALE,renderRangePadding:3*MOURNING_SIZE_SCALE,
  homeRadius:9.5,engagementRange:8+.9*(MOURNING_SIZE_SCALE-1),homeDetectionRange:12+.9*(MOURNING_SIZE_SCALE-1),
});
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
].map(([pattern,label,range,damage])=>Object.freeze({name:'cast',label,pattern,range:Math.min(14,range*MOURNING_SIZE_SCALE),damage,kind:'ground',impact:.55})));
export function spellImpact(spec,duration){return Math.min(Math.max(1,duration*spec.impact),duration-.25);}
export const MOURNING_CAST_RATE=1.6;
// Give the enlarged floor patterns a readable lead-in, then play the authored
// cast at the requested 1.6x speed. Release still matches its 1.65 s pose.
export const MOURNING_CAST_LEAD_IN=.65;
export const MOURNING_MOVEMENT=Object.freeze({walkSpeed:1.05,skitterSpeed:3.6,chargeSpeed:5.4,chargeWarning:.9,chargeDamage:42,gaitCap:8});
const MOURNING_MOVE_ORDER=['walk','skitter','walk','charge'];

export class ElenaBrain {
  constructor(durations,{mourning=false}={}){
    this.durations=durations;this.mourning=mourning;this.spells=mourning?MOURNING_SPELLS:ELENA_SPELLS;
    this.idle=mourning?'idle':'Elena_Idle';this.walk=mourning?'walk':'Walking';
    this.hp=this.maxHp=mourning?1800:1200;this.serial=0;this.stagger=0;this.flash=0;this.flashDuration=.18;
    this.wait=1.2;this.nextSpell=0;this.movementTurn=0;this.moveKind=null;this.visited=new Set();this.start(this.idle,'idle');
  }
  start(state,mode){this.state=state;this.mode=mode;this.time=0;this.serial++;this.impacted=false;this.castLeadInRemaining=mode==='attack'&&this.mourning?MOURNING_CAST_LEAD_IN:0;this.visited.add(state);if(mode!=='move')this.repositioning=false;if(mode==='attack'&&!this.mourning)this.spell=this.spells.find(s=>s.name===state);}
  cast(){this.spell=this.spells[this.nextSpell++%this.spells.length];this.start(this.spell.name,'attack');return this.spell;}
  reposition(){
    this.start(this.walk,'move');this.repositioning=true;
    if(this.mourning){this.moveKind=MOURNING_MOVE_ORDER[this.movementTurn++%MOURNING_MOVE_ORDER.length];this.repositionRemaining=this.moveKind==='charge'?2.2:this.moveKind==='skitter'?1.45:2.3;}
    else this.repositionRemaining=2.2+(this.nextSpell%3)*.25;
  }
  finishReposition(){this.repositionRemaining=0;if(this.mourning)this.cast();else{this.start(this.idle,'idle');this.wait=.4;}}
  redirectMovement(kind='walk'){
    this.start(this.walk,'move');this.repositioning=true;this.moveKind=kind;
    this.repositionRemaining=kind==='skitter'?1.45:2.3;
  }
  cancelCast(){if(this.mode!=='attack')return false;this.start(this.idle,'idle');this.wait=1.2;return true;}
  cancelMovement(){if(!this.repositioning)return false;this.start(this.idle,'idle');this.repositionRemaining=0;this.moveKind=null;return true;}
  get defense(){return null;}
  get attackPlaybackRate(){return this.mourning?MOURNING_CAST_RATE:1;}
  get castWarningDuration(){return (this.mourning?MOURNING_CAST_LEAD_IN:0)+spellImpact(this.spell,this.durations[this.state])/this.attackPlaybackRate;}
  get castWarningElapsed(){return (this.mourning?MOURNING_CAST_LEAD_IN-this.castLeadInRemaining:0)+this.time/this.attackPlaybackRate;}
  get label(){return this.mode==='attack'?this.spell?.label:this.repositioning?(this.mourning?this.moveKind==='charge'?(this.time<MOURNING_MOVEMENT.chargeWarning?'돌진 예고':'비탄의 돌진'):this.moveKind==='skitter'?'급속 횡이동':'끊임없는 배회':'자리 바꾸기'):({idle:'경계',move:'접근',down:'쓰러짐',recover:'일어나기',dead:this.mourning?'비탄의 끝':'광폭화'})[this.mode]??'경계';}
  hit({damage=14,heavy=false,stun=0,interruptsBoss=false}={}){
    if(this.hp<=0)return false;
    this.hp=Math.max(0,this.hp-damage);this.flash=this.flashDuration;
    if(!this.hp){this.stagger=0;this.start(this.mourning?'dead':'Knock_Down','dead');}
    else if(heavy&&!this.mourning&&!['down','recover'].includes(this.mode)){this.stagger=0;this.start('Knock_Down','down');}
    else if((heavy||stun||interruptsBoss)&&!['down','recover'].includes(this.mode)){
      this.stagger=Math.max(this.stagger,stun||.35);
      if(this.mode==='attack'||(this.mourning&&this.repositioning&&this.moveKind==='charge')){this.start(this.idle,'idle');this.wait=1.2;}
    }
    return true;
  }
  parry(){this.stagger=1;this.impacted=true;if(this.mode==='attack'||(this.mourning&&this.repositioning&&this.moveKind==='charge')){this.start(this.idle,'idle');this.wait=1.2;}}
  update(dt,distance,playerAlive,{manual=false}={}){
    this.flash=Math.max(0,this.flash-dt);const events=[];
    if(this.stagger>0){this.stagger=Math.max(0,this.stagger-dt);return {events,speed:0};}
    // time stays in authored clip seconds: pose, corrective morphs, telegraph
    // progress and release all use this same accelerated cast clock.
    const lead=this.mode==='attack'?Math.min(dt,this.castLeadInRemaining):0;
    this.castLeadInRemaining-=lead;
    this.time+=(dt-lead)*(this.mode==='attack'?this.attackPlaybackRate:1);if(this.hp<=0)return {events,speed:0};
    const duration=this.durations[this.state];
    if(this.mode==='down'){if(this.time>=duration)this.start('Stand_Up9','recover');return {events,speed:0};}
    if(this.mode==='recover'){if(this.time>=duration){this.start(this.idle,'idle');this.wait=.9;}return {events,speed:0};}
    if(!playerAlive){if(this.mode!=='idle')this.start(this.idle,'idle');return {events,speed:0};}
    if(this.mode==='attack'){
      const attack=this.spell;
      if(!this.impacted&&this.time>=spellImpact(attack,duration)){this.impacted=true;events.push(attack);}
      // Keep the release event even when a long frame crosses the clip's end.
      if(this.time>=duration&&!events.length){if(manual){this.start(this.idle,'idle');this.wait=1.2;}else this.reposition();}
      return {events,speed:0};
    }
    if(manual)return {events,speed:0};
    if(this.repositioning){
      this.repositionRemaining-=dt;
      if(this.repositionRemaining<=0){this.finishReposition();return {events,speed:0};}
      if(!this.mourning)return {events,speed:1.1};
      const speed=this.moveKind==='charge'?(this.time<MOURNING_MOVEMENT.chargeWarning?0:MOURNING_MOVEMENT.chargeSpeed):this.moveKind==='skitter'?MOURNING_MOVEMENT.skitterSpeed:MOURNING_MOVEMENT.walkSpeed;
      return {events,speed};
    }
    // Phase two has no idle gap. Each movement action leads to a fresh cast,
    // preserving frame-zero aim locking and the full ground-spell warning.
    if(this.mourning){this.reposition();return {events,speed:0};}
    this.wait-=dt;
    if(distance<=10&&this.wait<=0){this.cast();return {events,speed:0};}
    if(distance>5){const state=this.mourning?'walk':distance>7?'Running':'Walking';if(this.state!==state)this.start(state,'move');return {events,speed:this.mourning?.673:distance>7?2.1:1.1};}
    if(this.mode!=='idle')this.start(this.idle,'idle');
    return {events,speed:0};
  }
}
