export const GOLD_REWARDS=Object.freeze({goblin:10,bear:100,wolf:100,'gray-wolf':25,'stylized-wolf':25,'wolf-3':25,fox:25,boar:25});
// Chapter 1 animals drop materials. Quest payouts are credited separately.
export const CHAPTER_ONE_COIN_DROPS=Object.freeze({goblin:GOLD_REWARDS.goblin});
export const GOLD_STORAGE_KEY='moonforest-gold-v1';
export const GOLD_LEDGER_KEY='moonforest-gold-ledger-v1';
const STORAGE_KEY=GOLD_STORAGE_KEY,LEDGER_KEY=GOLD_LEDGER_KEY;
const PICKUP_RETRY_SECONDS=2;
export class GoldLoot {
  constructor({storage,onBalance=()=>{},onPickup=()=>{},coinDrops=GOLD_REWARDS}={}) {
    this.coinDrops=coinDrops;
    this.storage=storage;this.onBalance=onBalance;this.onPickup=onPickup;this.drops=[];this.serial=0;this.balance=0;this.credits={};this.saveState='new';this.volatile=false;this._expectedLedger=null;this._blocked=false;
    this._pickupMemoryOnly=!storage||storage.available===false;
    this._unverifiedLedger=null;
    if(this._pickupMemoryOnly){this.saveState='unavailable';this.volatile=true;}
    try{const value=Number(storage?.getItem(STORAGE_KEY));if(Number.isSafeInteger(value)&&value>=0)this.balance=value;}catch{this.saveState='failed';this.volatile=true;}
    let raw=null;
    try{raw=storage?.getItem(LEDGER_KEY)??null;}catch{this._pickupMemoryOnly=true;this._blocked=true;this.saveState='unavailable';this.volatile=true;}
    try{this._expectedLedger=raw;const ledger=JSON.parse(raw);if(raw!==null){if(ledger?.version!==1||!Number.isSafeInteger(ledger.balance)||ledger.balance<0)throw new Error('잘못된 골드 저장');this.balance=ledger.balance;if(ledger.town&&typeof ledger.town==='object')this.town=ledger.town;for(const [k,v]of Object.entries(ledger.credits??{}))if(/^[a-zA-Z0-9:_-]{1,90}$/.test(k)&&Number.isSafeInteger(v)&&v>=0)this.credits[k]=v;this.saveState='saved';}}catch{this._blocked=true;this.saveState='corrupt';this.volatile=true;}
    this.onBalance(this.balance);
  }
  // Re-reads the balance from storage (0.3: a new game in another slot without a reload).
  reload(){const fresh=new GoldLoot({storage:this.storage});for(const key of ['balance','credits','town','saveState','volatile','_expectedLedger','_blocked','_pickupMemoryOnly','_unverifiedLedger'])this[key]=fresh[key];this.drops.length=0;this.onBalance(this.balance);}
  snapshot(){return {version:1,balance:this.balance,credits:{...this.credits},...(this.town?{town:this.town}:{})};}
  persist(){
    if(!this.storage||this.storage.available===false){this.saveState='unavailable';this.volatile=true;return false;}
    if(this._blocked)return false;
    try{
      const stored=this.storage.getItem(LEDGER_KEY)??null,raw=JSON.stringify(this.snapshot());
      if(stored!==this._expectedLedger){
        // setItem may have succeeded before its readback failed. Confirm only our exact retry.
        if(stored!==this._unverifiedLedger||stored!==raw){this.saveState='conflict';this.volatile=true;return false;}
      }else{
        this.storage.setItem(LEDGER_KEY,raw);
        this._unverifiedLedger=raw;
        if(this.storage.getItem(LEDGER_KEY)!==raw)throw new Error('골드 저장 확인 실패');
      }
      this._expectedLedger=raw;this._unverifiedLedger=null;this.saveState='saved';this.volatile=false;
      try{this.storage.setItem(STORAGE_KEY,String(this.balance));}catch{/* The ledger is authoritative; this is a legacy mirror. */}
      return true;
    }catch{this.saveState='failed';this.volatile=true;return false;}
  }
  creditCumulative(source,total){if(!/^[a-zA-Z0-9:_-]{1,90}$/.test(source)||!Number.isSafeInteger(total)||total<0)return 0;const delta=Math.max(0,total-(this.credits[source]??0));if(!delta)return 0;const granted=Math.min(delta,Number.MAX_SAFE_INTEGER-this.balance);this.credits[source]=total;this.balance+=granted;this.persist();this.onBalance(this.balance);return granted;}
  drop(kind,position,{canLand=()=>true,heightAt=null}={}) {
    const amount=this.coinDrops[kind];if(!Number.isSafeInteger(amount)||amount<=0)return null;
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
    const collected=[],previous=this.balance;
    for(let i=this.drops.length-1;i>=0;i--){
      const drop=this.drops[i];drop.age+=Math.max(0,dt);
      if(!canCollect||!player||drop.age<.6)continue;
      if(Math.hypot(player.x-drop.position.x,player.z-drop.position.z)>1.1){if(drop.retryAt!==undefined)delete drop.retryAt;continue;}
      if(drop.age<(drop.retryAt??0)||!canReach(player,drop.position))continue;
      collected.push(drop);
    }
    if(!collected.length)return collected;
    this.balance=collected.reduce((balance,drop)=>Math.min(Number.MAX_SAFE_INTEGER,balance+drop.amount),previous);
    if(!this._pickupMemoryOnly&&!this.persist()){
      this.balance=previous;
      // Retry once while stationary. A fresh approach re-arms a transient failure.
      for(const drop of collected)drop.retryAt=drop.retryAt===undefined&&this.saveState==='failed'?drop.age+PICKUP_RETRY_SECONDS:Infinity;
      return [];
    }
    const picked=new Set(collected);
    for(let i=this.drops.length-1;i>=0;i--)if(picked.has(this.drops[i]))this.drops.splice(i,1);
    this.onBalance(this.balance);if(this.balance>previous)this.onPickup(this.balance-previous);
    return collected;
  }
  // Purchases, ground pickups and chest markers commit in the same ledger entry as the gold debit.
  tradeTown(delta, town){
    if(!Number.isSafeInteger(delta)||!Number.isSafeInteger(this.balance+delta)||this.balance+delta<0)return false;
    const before=this.town,balance=this.balance;
    this.town=town;this.balance+=delta;
    if(this.storage?.available!==false&&this.storage&&!this.persist()){
      this.town=before;this.balance=balance;return false;
    }
    if(delta)this.onBalance(this.balance);
    return true;
  }
  clearDrops(){this.drops.length=0;}
}
