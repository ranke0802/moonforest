export const GOLD_REWARDS=Object.freeze({goblin:10,bear:100});
const STORAGE_KEY='moonforest-gold-v1';
const LEDGER_KEY='moonforest-gold-ledger-v1';
export class GoldLoot {
  constructor({storage,onBalance=()=>{}}={}) {
    this.storage=storage;this.onBalance=onBalance;this.drops=[];this.serial=0;this.balance=0;this.credits={};
    try{const value=Number(storage?.getItem(STORAGE_KEY));if(Number.isSafeInteger(value)&&value>=0)this.balance=value;}catch{/* Session-only when storage is unavailable. */}
    try{const ledger=JSON.parse(storage?.getItem(LEDGER_KEY)??'null');if(ledger?.version===1&&Number.isSafeInteger(ledger.balance)&&ledger.balance>=0){this.balance=ledger.balance;for(const [k,v]of Object.entries(ledger.credits??{}))if(Number.isSafeInteger(v)&&v>=0)this.credits[k]=v;}}catch{}
    this.onBalance(this.balance);
  }
  persist(){try{this.storage?.setItem(LEDGER_KEY,JSON.stringify({version:1,balance:this.balance,credits:this.credits}));this.storage?.setItem(STORAGE_KEY,String(this.balance));}catch{}}
  creditCumulative(source,total){if(!Number.isSafeInteger(total)||total<0)return 0;const delta=Math.max(0,total-(this.credits[source]??0));if(!delta)return 0;this.credits[source]=total;this.balance+=delta;this.persist();this.onBalance(this.balance);return delta;}
  drop(kind,position) {
    const amount=GOLD_REWARDS[kind];if(!amount)return null;
    // Bound the number of draw calls even during repeated test summons.
    let pile=this.drops.find(d=>Math.hypot(d.position.x-position.x,d.position.z-position.z)<.45);
    if(!pile&&this.drops.length>=64)pile=this.drops.reduce((a,b)=>Math.hypot(a.position.x-position.x,a.position.z-position.z)<Math.hypot(b.position.x-position.x,b.position.z-position.z)?a:b);
    if(pile){pile.amount+=amount;return pile;}
    pile={id:++this.serial,amount,position:{x:position.x,y:(position.y??0)+.04,z:position.z},age:0};this.drops.push(pile);return pile;
  }
  update(dt,player,canCollect=true,canReach=()=>true) {
    const collected=[];
    for(let i=this.drops.length-1;i>=0;i--){
      const drop=this.drops[i];drop.age+=Math.max(0,dt);
      if(!canCollect||!player||drop.age<.6||Math.hypot(player.x-drop.position.x,player.z-drop.position.z)>1.1||!canReach(player,drop.position))continue;
      this.balance+=drop.amount;this.drops.splice(i,1);collected.push(drop);
    }
    if(collected.length){this.persist();this.onBalance(this.balance);}
    return collected;
  }
  clearDrops(){this.drops.length=0;}
}
