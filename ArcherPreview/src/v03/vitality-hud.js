// Draws and drives Tekken-style health for the player HUD and monster bars
// (0.3). Called once per play frame from boot; monster bars are decorated
// from the shared BossHealthBars update.
import {createVitality,createVitalBar,VITALITY} from './vitality.js';

export function createVitalityHud({doc,battle}){
 const player={life:createVitality(VITALITY.player),bar:createVitalBar(doc,'v03-vital v03-vital-player'),owed:0};
 const foes=new WeakMap();
 let mounted=false,presented=false;
 function mount(){
  const hud=doc.getElementById('player-hud');if(!hud)return;
  hud.insertBefore(player.bar.element,hud.firstChild);doc.documentElement.dataset.v03Vital='';mounted=true;
 }
 // Heal in whole points so the hp text never shows fractions.
 function settle(row,heal,read,write,max){
  row.owed+=heal;const whole=Math.min(Math.floor(row.owed),max-read());if(whole<=0)return;row.owed-=whole;write(read()+whole);row.life.applied(whole);
 }
 function foeRow(foe){
  let row=foes.get(foe);
  if(!row){row={life:createVitality(VITALITY.foe),bar:createVitalBar(doc,'v03-vital v03-vital-foe'),owed:0};foes.set(foe,row);}
  return row;
 }
 return {
  // A story scene does not run the health, but the bar must already be the
  // 0.3 one (user, 2026-11-21: the old moon HUD showed from the wake until the
  // first lesson, because the bar was mounted by the first update()).
  present(){
   if(!mounted)mount();if(!mounted||presented)return;
   const combat=battle.combat;if(!(combat&&combat.maxHp>0))return;
   player.life.step(0,combat.hp,combat.maxHp,combat.hp>0);player.bar.draw(player.life.view());presented=true;
  },
  update(dt){
   if(!mounted)mount();
   const combat=battle.combat;
   if(combat&&combat.maxHp>0){
    const heal=player.life.step(dt,combat.hp,combat.maxHp,combat.hp>0);
    if(heal>0)settle(player,heal,()=>combat.hp,value=>{combat.hp=value;},combat.maxHp);
    player.bar.draw(player.life.view());
   }
   for(const foe of battle.encounters??[]){
    const brain=foe.brain;if(!foe.active||!brain||!(brain.maxHp>0))continue;
    const row=foeRow(foe),heal=row.life.step(dt,brain.hp,brain.maxHp,brain.hp>0);
    if(heal>0)settle(row,heal,()=>brain.hp,value=>{brain.hp=value;},brain.maxHp);
   }
  },
  // BossHealthBars hook: put the layered bar in the monster's bar once, then redraw.
  decorate(element,foe){
   if(!foe?.brain)return;
   const row=foeRow(foe);
   if(row.bar.element.parentElement!==element){
    // A cloned or reused boss HUD may already contain another encounter's bar.
    const previous=element.querySelector('.v03-vital-foe');
    if(previous)previous.replaceWith(row.bar.element);
    else (element.querySelector('progress')??element.firstChild)?.after?.(row.bar.element);
    element.dataset.v03Vital='';
   }
   row.bar.draw(row.life.view());
  },
  dispose(){player.bar.element.remove();delete doc.documentElement.dataset.v03Vital;},
 };
}
