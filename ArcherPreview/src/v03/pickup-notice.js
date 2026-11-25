import {createAcquisitionRow} from '../item-acquisition-notice.js';
import {language,t} from './i18n.js';
import {townItemIcon} from './town-item-art.js';
import {itemName} from './town-items.js';

const SHOW_MS=4800,MIN_UPDATE_MS=1200;

export function createPickupNotice(root){
 const doc=root.ownerDocument,stack=doc.createElement('div');
 stack.className='acquisition-stack mf-pickup-notice';
 stack.setAttribute('role','status');stack.setAttribute('aria-live','polite');stack.setAttribute('aria-atomic','false');
 root.append(stack);
 const visible=new Map(),waiting=new Map();
 function name(id,n){
  const count=n.toLocaleString(language());
  return id==='gold'?t('reward.gold',{n:count}):itemName(id)+(n>1?' × '+count:'');
 }
 function expireAfter(id,entry,ms){
  clearTimeout(entry.timer);
  entry.expires=Date.now()+ms;
  entry.timer=setTimeout(()=>{entry.row.remove();visible.delete(id);reveal();},ms);
 }
 function reveal(){
  const limit=doc.defaultView.matchMedia?.('(max-height:500px)')?.matches?2:3;
  for(const [id,count] of waiting){
   if(visible.size>=limit)break;
   if(visible.has(id))continue;
   waiting.delete(id);
   const row=createAcquisitionRow(doc,id,name(id,count),t('pickup.received'),townItemIcon);
   const entry={row,count,timer:null,extended:false};
   visible.set(id,entry);stack.append(row);expireAfter(id,entry,SHOW_MS);
  }
 }
 function clear(){
  for(const {timer} of visible.values())clearTimeout(timer);
  visible.clear();waiting.clear();stack.replaceChildren();
 }
 return {
  show(gains){
   for(const [id,n] of Object.entries(gains)){
    if(!Number.isSafeInteger(n)||n<=0)continue;
    const entry=visible.get(id);
    const nearExpiry=entry&&entry.expires-Date.now()<MIN_UPDATE_MS;
    // Each row gets one short extension. Further late pickups take their turn in the queue.
    if(!entry||(nearExpiry&&entry.extended)){waiting.set(id,(waiting.get(id)??0)+n);continue;}
    entry.count+=n;entry.row.querySelector('strong').textContent=name(id,entry.count);
    if(nearExpiry){entry.extended=true;expireAfter(id,entry,MIN_UPDATE_MS);}
   }
   reveal();
  },
  clear,dispose(){clear();stack.remove();},
 };
}
