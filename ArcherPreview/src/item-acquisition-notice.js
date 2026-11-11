import {commercialItemVisual} from './commercial-ui.js';
import {itemRarity} from './loot-rarity.js';

// A transient, non-blocking notification. It does not own or grant rewards.
export function createItemAcquisitionNotice(root,{itemName}={}){
  const doc=root.ownerDocument,stack=doc.createElement('div'),boss=doc.createElement('section');
  stack.className='acquisition-stack';stack.setAttribute('role','status');stack.setAttribute('aria-live','polite');
  boss.className='boss-acquisition';boss.setAttribute('role','status');boss.setAttribute('aria-live','polite');boss.hidden=true;
  root.append(stack,boss);
  const timers=new Set(),bossRewards=new Map();let bossTimer=null,bossOverflow=0;
  const schedule=(callback,ms)=>{const id=setTimeout(()=>{timers.delete(id);callback();},ms);timers.add(id);return id;};
  const cancel=id=>{if(id!=null){clearTimeout(id);timers.delete(id);}};
  function icon(id){const el=doc.createElement('span');el.className='acquisition-icon';el.style.setProperty('--item-color',id==='gold'?'#e9c55c':itemRarity(id).color);if(id==='gold'){el.classList.add('acquisition-gold');el.textContent='G';}else el.innerHTML=commercialItemVisual(id);return el;}
  const name=(id,count)=>id==='gold'?`골드 ${count.toLocaleString()}`:`${itemName(id)}${count>1?` × ${count}`:''}`;
  function show(rewards,{isBoss=false}={}){
    const entries=Object.entries(rewards??{}).filter(([,n])=>Number.isSafeInteger(n)&&n>0);
    if(!entries.length)return;
    if(isBoss){
      cancel(bossTimer);
      for(const [id,count] of entries){if(bossRewards.has(id)||bossRewards.size<32)bossRewards.set(id,(bossRewards.get(id)??0)+count);else bossOverflow++;}
      boss.replaceChildren();
      const title=doc.createElement('strong');title.className='boss-acquisition-title';title.textContent='보스 보상 획득';boss.append(title);
      const list=doc.createElement('div');list.className='boss-acquisition-items';
      for(const [id,count] of bossRewards){const item=doc.createElement('div');item.className='boss-acquisition-item';item.append(icon(id));const label=doc.createElement('span');label.textContent=name(id,count);item.append(label);list.append(item);}
      if(bossOverflow){const more=doc.createElement('span');more.textContent=`외 ${bossOverflow}건`;list.append(more);}
      boss.append(list);boss.hidden=false;bossTimer=schedule(()=>{boss.hidden=true;boss.replaceChildren();bossRewards.clear();bossOverflow=0;bossTimer=null;},6000);return;
    }
    for(const [id,count] of entries){
      const row=doc.createElement('div');row.className='acquisition-row';row.style.setProperty('--item-color',id==='gold'?'#e9c55c':itemRarity(id).color);row.append(icon(id));
      const label=doc.createElement('span'),emphasis=doc.createElement('strong');emphasis.textContent=name(id,count);label.append(emphasis,doc.createTextNode(' 획득하였습니다.'));row.append(label);stack.append(row);
      while(stack.children.length>4)stack.firstElementChild.remove();
      schedule(()=>row.remove(),4800);
    }
  }
  return {show,dispose(){for(const id of timers)clearTimeout(id);timers.clear();stack.remove();boss.remove();}};
}
