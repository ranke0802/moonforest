// Tekken-style health for 0.3 (player and monsters).
// Part of every hit is "recoverable": shown in red between the remaining health
// and the lost part, it flows back quickly once the fighter has not been hit
// for a moment. A pale trail marks the health just lost, then drains away.
// Pure logic: it reads the real hp each frame and tells the caller how much to
// heal; nothing here touches the engine or the DOM.
export const VITALITY=Object.freeze({
 player:Object.freeze({ratio:.4,delay:2.2,rate:.16}),
 foe:Object.freeze({ratio:.3,delay:2.8,rate:.12}),
 TRAIL_HOLD:.45,TRAIL_SPEED:.9,
});
export function createVitality({ratio,delay,rate}=VITALITY.player){
 const state={hp:null,max:1,recoverable:0,trail:0,hold:0,since:0};
 return {
  // Feed the actual hp; returns the hp to add this frame (0 when none).
  step(dt,hp,max,alive=true){
   max=max>0?max:1;
   if(state.hp===null){Object.assign(state,{hp,max,recoverable:0,trail:hp,hold:0,since:99});return 0;}
   state.max=max;
   if(!alive||hp<=0){state.hp=Math.max(0,hp);state.recoverable=0;state.since=0;drainTrail(dt);return 0;}
   const change=hp-state.hp;
   if(change<-1e-6){
    // A hit: part of it can come back. The trail shows the whole loss.
    state.recoverable=Math.min(max-hp,state.recoverable-change*ratio);
    state.trail=Math.max(state.trail,state.hp);state.hold=VITALITY.TRAIL_HOLD;state.since=0;
   }else if(change>1e-6){
    // Healing from elsewhere (potion, rest) fills the recoverable part first.
    state.recoverable=Math.max(0,Math.min(max-hp,state.recoverable-change));
   }
   state.hp=hp;state.since+=dt;
   let heal=0;
   if(state.recoverable>0&&state.since>=delay){heal=Math.min(state.recoverable,rate*max*dt,max-hp);state.recoverable-=heal;}
   drainTrail(dt);
   return heal;
  },
  // Fractions 0..1 for drawing: health, health+recoverable, trail.
  view(){
   const max=state.max,hp=Math.max(0,state.hp??0),top=Math.min(max,hp+state.recoverable);
   return {hp:hp/max,recoverable:top/max,trail:Math.max(top,Math.min(max,state.trail))/max};
  },
  // The caller wrote this much healing into the real hp (not a new heal).
  applied(amount){if(state.hp!==null)state.hp+=amount;},
  get recoverable(){return state.recoverable;},
 };
 function drainTrail(dt){
  const floor=Math.min(state.max,(state.hp??0)+state.recoverable);
  if(state.trail<floor){state.trail=floor;return;}
  if(state.hold>0){state.hold-=dt;return;}
  state.trail=Math.max(floor,state.trail-VITALITY.TRAIL_SPEED*state.max*dt);
 }
}
// A layered bar: trail (pale) ⟶ recoverable (ember) ⟶ health (green), with
// tick marks. Only transform: scaleX changes per frame, and only on change.
export function createVitalBar(doc,className='v03-vital'){
 const root=doc.createElement('div');root.className=className;root.setAttribute('aria-hidden','true');
 const make=name=>{const node=doc.createElement('i');node.className=name;root.append(node);return node;};
 const trail=make('v03-vital-trail'),recover=make('v03-vital-recover'),fill=make('v03-vital-fill');make('v03-vital-ticks');
 const last={hp:-1,recoverable:-1,trail:-1};
 const set=(node,key,value)=>{const v=Math.round(value*1000)/1000;if(last[key]===v)return;last[key]=v;node.style.transform=`scaleX(${v})`;};
 return {element:root,draw(view){set(fill,'hp',view.hp);set(recover,'recoverable',view.recoverable);set(trail,'trail',view.trail);}};
}
