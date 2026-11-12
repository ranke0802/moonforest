// R8 clip identifiers, durations and authored event times are asset contracts.
// HP, ranges, damage and cooldown below are editable initial gameplay values.
export const WOLF_VERSION='Alpha Wolf R8 · approved 25,080 triangles';
export const WOLF_STYLE=Object.freeze({outline:true,outlineWidth:.60,internal:true,internalStrength:.25,brightness:1.20});
export const WOLF_BALANCE=Object.freeze({hp:900,radius:.65,separationRadius:.75,stopDistance:1.8,walkSpeed:.9,runSpeed:4.2,detectRange:16,attackDistance:10.8,lungeMinDistance:9.8,pinDistance:2.35,biteRange:2.8,biteContactRadius:.95,biteDamage:100,pinDamage:120,cooldown:1.1,gold:100});
export const WOLF_CLIPS=Object.freeze({rest:'Rest_Lie_R5',alert:'Alert_Lie_R5',rise:'Rise_From_Lie_R5',watch:'Circle_Watch_R5',walk:'Wolf_Walk_R5',run:'Wolf_Run_R5',lunge:'Run_Dodge_Lunge_R5',pin:'Pin_Throat_Bite_R5',hit:'Hit_Cower_R5',brace:'Knockback_Brace_R5',down:'Knockdown_Fall_R5',recover:'Get_Up_R5'});
export const WOLF_MOTIONS=Object.freeze(Object.entries(WOLF_CLIPS).map(([key,name])=>Object.freeze({name,label:{rest:'휴식',alert:'발견',rise:'일어나기',watch:'주변 경계',walk:'걷기',run:'달리기',lunge:'옆 회피·도약 물기',pin:'제압·물기',hit:'피격',brace:'앞발 버티기',down:'쓰러짐',recover:'기상'}[key],role:['lunge','pin'].includes(key)?'attack':['walk','run'].includes(key)?'move':key==='down'?'down':key==='recover'?'recover':'idle',range:key==='lunge'?WOLF_BALANCE.biteRange:WOLF_BALANCE.pinDistance,kind:'melee'})));
export const WOLF_BY_NAME=Object.fromEntries(WOLF_MOTIONS.map(m=>[m.name,m]));
export class WolfBrain{
 constructor(durations,balance=WOLF_BALANCE){this.durations=durations;this.balance=balance;this.hp=this.maxHp=balance.hp;this.state=WOLF_CLIPS.rest;this.mode='idle';this.time=0;this.serial=1;this.wait=.5;this.flash=this.stagger=0;this.visited=new Set([this.state]);this.attackCount=0;this.impacted=false;}
 start(state,mode){this.state=state;this.mode=mode;this.time=0;this.serial++;this.impacted=false;this.interrupted=false;this.visited.add(state);}
 startIfChanged(state,mode){if(this.state!==state||this.mode!==mode)this.start(state,mode);}
 configureAttacks(value={}){this.attackSettings=value;}
 hit({heavy=false,damage=14,stun=0,interruptsBoss=false,ignoreDefense=false}={}){
  if(this.hp<=0||this.defense&&!ignoreDefense)return false;this.hp=Math.max(0,this.hp-damage);this.flash=this.flashDuration=stun>0?.75:.22;
  if(this.mode==='down'||this.mode==='recover'&&this.hp>0)return true;
  if(!this.hp||heavy){this.stagger=0;this.start(WOLF_CLIPS.down,'down');}
  else if(stun>0){this.stagger=Math.max(this.stagger,stun);this.impacted=true;this.interrupted=true;}
  else if(interruptsBoss){this.start(WOLF_CLIPS.hit,'hit');}
  return true;
 }
 parry(){if(this.hp<=0||['down','recover'].includes(this.mode))return false;this.stagger=1;this.impacted=true;this.interrupted=true;this.flash=this.flashDuration=.45;return true;}
 update(dt,distance,playerAlive=true){
  dt=Math.max(0,dt);this.flash=Math.max(0,this.flash-dt);const events=[];
  if(this.stagger>0&&this.hp>0){this.stagger=Math.max(0,this.stagger-dt);if(!this.stagger){this.start(WOLF_CLIPS.brace,'hit');this.wait=this.balance.cooldown;}return {events,speed:0};}
  const previous=this.time,duration=this.durations[this.state]??1;this.time+=dt;
  if(this.mode==='down'||this.mode==='recover'){this.time=Math.min(duration,this.time);if(this.time>=duration&&this.hp>0){if(this.mode==='down')this.start(WOLF_CLIPS.recover,'recover');else{this.start(WOLF_CLIPS.watch,'idle');this.wait=this.balance.cooldown;}}return {events,speed:0};}
  if(this.mode==='attack'){
   const at=this.state===WOLF_CLIPS.lunge?2.25:.56;
   this.time=Math.min(duration,this.time);
   if(!this.impacted&&previous<=at&&this.time>=at){this.impacted=true;this.time=at;events.push({type:'attack',...WOLF_BY_NAME[this.state],capture:this.state===WOLF_CLIPS.pin});}
   else if(this.time>=duration){this.start(WOLF_CLIPS.watch,'idle');this.wait=this.balance.cooldown;}
   return {events,speed:0};
  }
  if(['alert','rise','hit'].includes(this.mode)){if(this.time>=duration){this.start(this.mode==='alert'?WOLF_CLIPS.rise:WOLF_CLIPS.watch,this.mode==='alert'?'rise':'idle');this.wait=.35;}return {events,speed:0};}
  if(!playerAlive||distance>this.balance.detectRange){this.startIfChanged(WOLF_CLIPS.rest,'idle');this.time%=this.durations[this.state];return {events,speed:0};}
  if(this.state===WOLF_CLIPS.rest){this.start(WOLF_CLIPS.alert,'alert');return {events,speed:0};}
  // The unchanged R8 lunge travels about 9.3 m before its bite. Do not launch
  // this long attack from a close target and overshoot them; close in for pin.
  if(distance>this.balance.attackDistance||(distance>this.balance.pinDistance&&distance<this.balance.lungeMinDistance)){this.startIfChanged(distance>12?WOLF_CLIPS.run:WOLF_CLIPS.walk,'move');this.time%=this.durations[this.state];return {events,speed:this.state===WOLF_CLIPS.run?this.balance.runSpeed:this.balance.walkSpeed};}
  this.startIfChanged(WOLF_CLIPS.watch,'idle');this.time%=this.durations[this.state];this.wait-=dt;
  if(this.wait<=0){this.attackCount++;this.start(distance<=this.balance.pinDistance?WOLF_CLIPS.pin:WOLF_CLIPS.lunge,'attack');}
  return {events,speed:0};
 }
 get defense(){return null;}
 get label(){return this.hp<=0?'격파':this.stagger?'경직':WOLF_BY_NAME[this.state]?.label??'우두머리 늑대';}
}
