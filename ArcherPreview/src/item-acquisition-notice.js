import {commercialItemVisual} from './commercial-ui.js';
import {itemRarity} from './loot-rarity.js';

// A transient, non-blocking notification. It does not own or grant rewards.
export function createItemAcquisitionNotice(root,{itemName}={}){
  const doc=root.ownerDocument,stack=doc.createElement('div'),boss=doc.createElement('section');
  stack.className='acquisition-stack';stack.setAttribute('role','status');stack.setAttribute('aria-live','polite');
  boss.className='boss-acquisition';boss.setAttribute('role','status');boss.setAttribute('aria-live','polite');boss.hidden=true;
  root.append(stack,boss);
  const timers=new Set(),bossQueue=[];
  const schedule=(callback,ms)=>{const id=setTimeout(()=>{timers.delete(id);callback();},ms);timers.add(id);return id;};
  function icon(id){const el=doc.createElement('span');el.className='acquisition-icon';el.style.setProperty('--item-color',id==='gold'?'#e9c55c':itemRarity(id).color);if(id==='gold'){el.classList.add('acquisition-gold');el.textContent='G';}else el.innerHTML=commercialItemVisual(id);return el;}
  const name=(id,count)=>id==='gold'?`골드 ${count.toLocaleString()}`:`${itemName(id)}${count>1?` × ${count}`:''}`;
  function renderBoss(){
    boss.replaceChildren();const result=bossQueue[0];if(!result){boss.hidden=true;return;}
    const title=doc.createElement('strong'),bossName=doc.createElement('span');title.className='boss-acquisition-title';bossName.className='boss-acquisition-name';bossName.textContent=result.name;title.append(bossName,doc.createTextNode(' 클리어'));boss.append(title);
    const list=doc.createElement('div');list.className='boss-acquisition-items';
    for(const [id,count] of result.rewards){const item=doc.createElement('div');item.className='boss-acquisition-item';item.append(icon(id));const label=doc.createElement('span');label.textContent=name(id,count);item.append(label);list.append(item);}
    if(!result.rewards.size){const empty=doc.createElement('span');empty.textContent='획득한 보상이 없습니다.';list.append(empty);}
    boss.append(list);const close=doc.createElement('button');close.type='button';close.className='boss-acquisition-close';close.textContent='닫기';close.addEventListener('click',()=>{bossQueue.shift();renderBoss();});boss.append(close);boss.hidden=false;
  }
  function showBoss(bossName,rewards){
    const label=String(bossName||'보스'),existing=bossQueue.find(result=>result.name===label);
    const result=existing??{name:label,rewards:new Map()};
    for(const [id,count] of Object.entries(rewards??{}))if(Number.isSafeInteger(count)&&count>0)result.rewards.set(id,(result.rewards.get(id)??0)+count);
    if(!existing)bossQueue.push(result);renderBoss();
  }
  function show(rewards){
    const entries=Object.entries(rewards??{}).filter(([,n])=>Number.isSafeInteger(n)&&n>0);
    if(!entries.length)return;
    for(const [id,count] of entries){
      const row=doc.createElement('div');row.className='acquisition-row';row.style.setProperty('--item-color',id==='gold'?'#e9c55c':itemRarity(id).color);row.append(icon(id));
      const label=doc.createElement('span'),emphasis=doc.createElement('strong');emphasis.textContent=name(id,count);label.append(emphasis,doc.createTextNode(' 획득하였습니다.'));row.append(label);stack.append(row);
      while(stack.children.length>4)stack.firstElementChild.remove();
      schedule(()=>row.remove(),4800);
    }
  }
  return {show,showBoss,dispose(){for(const id of timers)clearTimeout(id);timers.clear();bossQueue.length=0;stack.remove();boss.remove();}};
}
