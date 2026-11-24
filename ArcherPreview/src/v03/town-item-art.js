import {TOWN_ITEMS} from './town-items.js';

const enabled=new URLSearchParams(globalThis.location?.search??'').get('itemIcons')!=='0';
let stylesheet;

export function townItemIcon(doc,id){
 const el=doc.createElement('span');
 el.setAttribute('aria-hidden','true');
 const item=TOWN_ITEMS[id];
 if(!enabled||!item){
  const glyph=item?.slot==='sword'?'sword':item?.slot==='shield'?'shield':item?.quick?'potion':null;
  el.className=glyph?'commercial-icon commercial-icon-'+glyph:'mf-menu-blank';
  if(!glyph)el.textContent='◇';
  return el;
 }
 el.className='mf-town-item-icon';
 el.dataset.itemIcon=id;
 if(typeof document!=='undefined'&&!stylesheet){
  stylesheet=import('./town-item-icons.css').catch(error=>{
   stylesheet=null;
   console.warn('[MoonForest 0.3] item artwork unavailable',error);
  });
 }
 return el;
}
