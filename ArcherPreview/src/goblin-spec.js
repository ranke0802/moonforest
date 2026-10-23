export const GOBLIN_MOTIONS=[
 {name:'Running',label:'빠른 추격',role:'move'},
 {name:'Walking',label:'근접 접근 / 대기',role:'move'},
 {name:'Sneaky_Walk_inplace',label:'조심스러운 접근',role:'move'},
 {name:'Walk_Turn_Right',label:'방향 전환',role:'turn'},
 {name:'Right_Jab_from_Guard',label:'빠른 단검 타격',role:'attack',range:1.6,impact:.36,playRate:1.5},
 {name:'Sword_Judgment',label:'도약 내려베기',role:'attack',range:1.9,impact:.46,playRate:1.55},
 {name:'Dodge_Roll',label:'회피 구르기',role:'evade'},
 {name:'Parkour_Vault_with_Roll',label:'도약 구르기',role:'evade'},
 {name:'Sword_Parry_Backward_2',label:'뒤로 물러나며 패링 / 피격 반응',role:'guard'},
 {name:'Gangnam_Groove',label:'멀리서 춤추며 도발',role:'taunt'},
 {name:'Knock_Down',label:'넉다운 / 역재생 기상',role:'down'},
 {name:'Fall_Dead_from_Abdominal_Injury',label:'사망',role:'dead'},
];
export const GOBLIN_BY_NAME=Object.fromEntries(GOBLIN_MOTIONS.map(m=>[m.name,m]));
export function goblinDamage(random=Math.random){return 15+Math.min(18,Math.floor(Math.max(0,random())*19));}
export class GoblinBrain {
 constructor(durations,random=Math.random){
  this.durations=durations;this.random=random;this.hp=this.maxHp=180;this.serial=0;this.visited=new Set();
  this.flash=this.stagger=0;this.flashDuration=.22;this.wait=.3;this.evadeCooldown=2+random()*3;this.tauntCooldown=5+random()*6;this.decision=.5;this.steps=0;this.attackCount=0;this.evades=0;this.start('Walking','idle');
 }
 start(state,mode){this.state=state;this.mode=mode;this.time=mode==='recover'?this.durations[state]:0;this.serial++;this.impacted=false;this.visited.add(state);}
 same(state,mode){if(this.state!==state||this.mode!==mode)this.start(state,mode);}
 hit({damage=18,heavy=false,stun=0}={}){
  if(this.hp<=0||this.defense)return false;stun=Math.min(stun,.5);this.hp=Math.max(0,this.hp-damage);this.flash=this.flashDuration=stun?Math.min(stun,.75):.22;
  if(!this.hp){this.stagger=0;this.start('Fall_Dead_from_Abdominal_Injury','dead');return true;}
  if(['down','recover'].includes(this.mode))return true;
  if(heavy){this.stagger=0;this.start('Knock_Down','down');}
  else{this.start('Sword_Parry_Backward_2','hit');this.stagger=Math.max(this.stagger,stun||.3);}
  return true;
 }
 parry(){if(this.hp<=0||['down','recover'].includes(this.mode))return false;this.start('Sword_Parry_Backward_2','hit');this.stagger=1;this.flash=this.flashDuration=.45;return true;}
 update(dt,distance,playerAlive=true){
  dt=Math.max(0,dt);const events=[];this.flash=Math.max(0,this.flash-dt);this.evadeCooldown-=dt;this.tauntCooldown-=dt;this.decision-=dt;
  const duration=this.durations[this.state];
  if(this.stagger>0){this.time=Math.min(duration,this.time+dt);this.stagger=Math.max(0,this.stagger-dt);if(!this.stagger){this.start('Walking','idle');this.wait=.12;}return {events,speed:0};}
  if(['down','recover','dead'].includes(this.mode)){
   this.time=Math.max(0,Math.min(duration,this.time+dt*(this.mode==='recover'?-1.8:1.3)));
   if(this.mode==='down'&&this.time>=duration)this.start('Knock_Down','recover');
   else if(this.mode==='recover'&&this.time===0){this.start('Walking','idle');this.wait=.12;}
   return {events,speed:0};
  }
  if(!playerAlive){this.same('Walking','idle');this.time=0;return {events,speed:0};}
  if(['attack','guard','evade','turn','taunt'].includes(this.mode)){
   const spec=GOBLIN_BY_NAME[this.state],rate=spec.playRate??(this.mode==='evade'?1.7:1.15);
   this.time=Math.min(duration,this.time+dt*rate);
   if(this.mode==='attack'&&!this.impacted&&this.time>=duration*spec.impact){this.impacted=true;events.push({type:'attack',...spec,damage:goblinDamage(this.random)});}
   if(this.time>=duration||(this.mode==='taunt'&&distance<4)){
    this.start('Walking','idle');this.wait=.16+this.random()*.18;
   }
   return {events,speed:this.mode==='turn'?1.3:0};
  }
  if(distance>1.2){
   if(this.decision<=0){
    this.decision=.75;this.steps++;
    if(distance>6&&this.tauntCooldown<=0&&this.random()<.28){this.tauntCooldown=10+this.random()*7;this.start('Gangnam_Groove','taunt');return {events,speed:0};}
    if(this.evadeCooldown<=0&&this.random()<.4){this.evadeCooldown=3+this.random()*3;this.start(this.evades++%2?'Parkour_Vault_with_Roll':'Dodge_Roll','evade');return {events,speed:0};}
    if(distance>3&&this.steps%9===0){this.start('Walk_Turn_Right','turn');return {events,speed:1.3};}
   }
   const state=distance>3.6?'Running':distance>2.1?'Sneaky_Walk_inplace':'Walking';this.same(state,'move');this.time=(this.time+dt*(state==='Running'?1.35:1.25))%this.durations[state];
   return {events,speed:state==='Running'?5.2:state==='Sneaky_Walk_inplace'?2.5:1.8};
  }
  this.same('Walking','idle');this.time=0;this.wait-=dt;
  if(this.wait<=0){
   this.attackCount++;
   if(this.attackCount%5===0)this.start('Sword_Parry_Backward_2','guard');
   else this.start(this.attackCount%3===0?'Sword_Judgment':'Right_Jab_from_Guard','attack');
  }
  return {events,speed:0};
 }
 get defense(){return this.mode==='evade'?'evade':this.mode==='guard'?'block':null;}
 get label(){return this.hp<=0?'격파':this.stagger>0?'경직':this.mode==='recover'?'기상':GOBLIN_BY_NAME[this.state].label;}
}
