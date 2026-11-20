// Which foe the warrior is fighting (0.3, 2026-11-20, user request).
// 1. The foe whose attack reached the warrior, or the foe the warrior's hit
//    landed on, becomes the target.
// 2. An attack, a heavy attack, the guard or a shield push pressed without a
//    direction turns to that foe (main.js asks aim() when the action starts).
//    With a direction held, the direction wins as before.
// 3. A chain (three hits, then the heavy one) keeps the foe of its first
//    swing: later swings face it and step toward it even when another foe
//    is nearer, and a foe that strikes in between does not pull it away.
// The target is let go when it dies, gets TARGET_FAR away, or nothing has
// landed either way for TARGET_IDLE seconds; the game's own "nearest foe"
// rule applies again then.
// One reference each for the target and the chain and a few numbers: no
// lists, nothing allocated, a couple of comparisons per frame.
export const TARGET_REACH=9,TARGET_FAR=16,TARGET_IDLE=8,CHAIN_HOLD=1.6;
const ATTACKS=new Set(['attack','slash','judgment','moveAttack','shieldPush']);
const alive=foe=>!!foe&&foe.active!==false&&foe.brain?.hp>0&&!!foe.actor?.position;
const within=(foe,position,limit)=>{const p=foe.actor.position,dx=p.x-position.x,dz=p.z-position.z;return dx*dx+dz*dz<=limit*limit;};

export function createCombatTarget(){
 let foe=null,chain=null,idle=0,chainLeft=0,reach=0,map=null;
 return {
  get foe(){return alive(foe)?foe:null;},
  // The foe the running chain is aimed at (null between chains).
  get chainFoe(){return chainLeft>0&&alive(chain)?chain:null;},
  // How far the foe returned by the last aim() may be for the action to turn
  // to it (0: the game's own distance applies).
  get reach(){return reach;},
  // kind 'enemy': the warrior's hit landed on that foe. 'player' or 'block':
  // that foe's attack reached the warrior (taken or blocked).
  note(kind,from){
   if(!alive(from)||(kind!=='enemy'&&kind!=='player'&&kind!=='block'))return;
   if(kind!=='enemy'&&chainLeft>0&&alive(chain)&&chain!==from){if(foe===chain)idle=0;return;}
   foe=from;idle=0;
  },
  // The foe an action that starts now should face. nearest: the game's own
  // pick. starts: an attack (it begins or continues a chain); false for the
  // guard, which only turns.
  aim(position,nearest,starts=true){
   const pick=chainLeft>0&&alive(chain)&&within(chain,position,TARGET_REACH)?chain:alive(foe)&&within(foe,position,TARGET_REACH)?foe:null;
   reach=pick?TARGET_REACH:0;
   if(starts){chain=pick??(alive(nearest)?nearest:null);chainLeft=chain?CHAIN_HOLD:0;}
   return pick??nearest??null;
  },
  // Every frame. state: the warrior's action; mapId: a new map drops both
  // references (foes belong to the map that was left).
  update(dt,state,position,mapId){
   if(mapId!==map){map=mapId;foe=null;chain=null;chainLeft=0;reach=0;return;}
   if(chainLeft>0){if(ATTACKS.has(state))chainLeft=CHAIN_HOLD;else if((chainLeft-=dt)<=0||!alive(chain)){chainLeft=0;chain=null;}}
   if(foe){idle+=dt;if(idle>TARGET_IDLE||!alive(foe)||(position&&!within(foe,position,TARGET_FAR)))foe=null;}
  },
  reset(){foe=null;chain=null;chainLeft=0;reach=0;idle=0;},
  inspect:()=>({target:alive(foe)?foe.id??true:null,chain:chainLeft>0&&alive(chain)?chain.id??true:null,idle:+idle.toFixed(2)}),
 };
}
