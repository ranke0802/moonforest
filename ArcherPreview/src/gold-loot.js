export const GOLD_REWARDS=Object.freeze({goblin:10,bear:100,wolf:100,'gray-wolf':25,'stylized-wolf':25,'wolf-3':25,fox:25,boar:25});
export const GOLD_STORAGE_KEY='moonforest-gold-v1';
export const GOLD_LEDGER_KEY='moonforest-gold-ledger-v1';
const STORAGE_KEY=GOLD_STORAGE_KEY,LEDGER_KEY=GOLD_LEDGER_KEY;
export class GoldLoot {
  constructor({storage,onBalance=()=>{}}={}) {
    this.storage=storage;this.onBalance=onBalance;this.drops=[];this.serial=0;this.balance=0;this.credits={};this.saveState='new';this.volatile=false;this._expectedLedger=null;this._blocked=false;
    if(!storage||storage.available===false){this.saveState='unavailable';this.volatile=true;}
    try{const value=Number(storage?.getItem(STORAGE_KEY));if(Number.isSafeInteger(value)&&value>=0)this.balance=value;}catch{this.saveState='failed';this.volatile=true;}
    try{const raw=storage?.getItem(LEDGER_KEY)??null;this._expectedLedger=raw;const ledger=JSON.parse(raw);if(raw!==null){if(ledger?.version!==1||!Number.isSafeInteger(ledger.balance)||ledger.balance<0)throw new Error('잘못된 골드 저장');this.balance=ledger.balance;for(const [k,v]of Object.entries(ledger.credits??{}))if(/^[a-zA-Z0-9:_-]{1,90}$/.test(k)&&Number.isSafeInteger(v)&&v>=0)this.credits[k]=v;this.saveState='saved';}}catch{this._blocked=true;this.saveState='corrupt';this.volatile=true;}
    this.onBalance(this.balance);
  }
  snapshot(){return {version:1,balance:this.balance,credits:{...this.credits}};}
  persist(){if(!this.storage||this.storage.available===false){this.saveState='unavailable';this.volatile=true;return false;}if(this._blocked)return false;try{if((this.storage.getItem(LEDGER_KEY)??null)!==this._expectedLedger){this.saveState='conflict';this.volatile=true;return false;}const raw=JSON.stringify(this.snapshot());this.storage.setItem(LEDGER_KEY,raw);if(this.storage.getItem(LEDGER_KEY)!==raw)throw new Error('골드 저장 확인 실패');this._expectedLedger=raw;this.saveState='saved';this.volatile=false;try{this.storage.setItem(STORAGE_KEY,String(this.balance));}catch{/* The atomic ledger is authoritative; the legacy key is only a mirror. */}return true;}catch{this.saveState='failed';this.volatile=true;return false;}}
  creditCumulative(source,total){if(!/^[a-zA-Z0-9:_-]{1,90}$/.test(source)||!Number.isSafeInteger(total)||total<0)return 0;const delta=Math.max(0,total-(this.credits[source]??0));if(!delta)return 0;const granted=Math.min(delta,Number.MAX_SAFE_INTEGER-this.balance);this.credits[source]=total;this.balance+=granted;this.persist();this.onBalance(this.balance);return granted;}
  drop(kind,position,{canLand=()=>true,heightAt=null}={}) {
    const amount=GOLD_REWARDS[kind];if(!amount)return null;
    // Bound the number of draw calls even during repeated test summons.
    let pile=this.drops.find(d=>Math.hypot((d.origin??d.position).x-position.x,(d.origin??d.position).z-position.z)<.45);
    if(!pile&&this.drops.length>=64)pile=this.drops.reduce((a,b)=>Math.hypot(a.position.x-position.x,a.position.z-position.z)<Math.hypot(b.position.x-position.x,b.position.z-position.z)?a:b);
    if(pile){pile.amount+=amount;return pile;}
    const id=++this.serial,origin={x:position.x,y:(position.y??0)+.04,z:position.z},angle=id*2.399963229728653;
    let landing={...origin};
    for(const distance of [.7,.45,.2]){const x=origin.x+Math.cos(angle)*distance,z=origin.z+Math.sin(angle)*distance;if(!canLand(origin,{x,z}))continue;const ground=heightAt?.(x,z);landing={x,y:Number.isFinite(ground)?ground+.04:origin.y,z};break;}
    pile={id,amount,origin,position:landing,age:0};this.drops.push(pile);return pile;
  }
  update(dt,player,canCollect=true,canReach=()=>true) {
    const collected=[];
    for(let i=this.drops.length-1;i>=0;i--){
      const drop=this.drops[i];drop.age+=Math.max(0,dt);
      if(!canCollect||!player||drop.age<.6||Math.hypot(player.x-drop.position.x,player.z-drop.position.z)>1.1||!canReach(player,drop.position))continue;
      this.balance=Math.min(Number.MAX_SAFE_INTEGER,this.balance+drop.amount);this.drops.splice(i,1);collected.push(drop);
    }
    if(collected.length){this.persist();this.onBalance(this.balance);}
    return collected;
  }
  clearDrops(){this.drops.length=0;}
}
