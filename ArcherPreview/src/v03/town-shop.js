import {TOWN_ITEMS,STOCK,RECIPES,FORGE_RULES,forgeCursor,itemName,itemNote,gradeLabel} from './town-items.js';
import {t} from './i18n.js';
import {townItemIcon} from './town-item-art.js';

export function createTownShop({root,economy,onChange,onPause}){
 const doc=root.ownerDocument,win=doc.defaultView,dialog=doc.createElement('dialog');
 dialog.className='mf-town-shop';root.append(dialog);
 let current=null,resolveClose=null,frame=0,started=0,hammer=null,smithTarget=null;
 const element=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 function addButton(parent,label,action,disabled=false){
  const node=element('button',label);node.type='button';node.disabled=disabled;node.onclick=action;parent.append(node);return node;
 }
 function stop(){if(frame)win.cancelAnimationFrame(frame);frame=0;hammer=null;}
 const receipt=element('p');receipt.className='mf-shop-receipt';receipt.setAttribute('role','status');
 function finish(){stop();current=null;onPause();resolveClose?.();resolveClose=null;}
 dialog.addEventListener('close',finish);
 function trade(act,success){const ok=act();receipt.textContent=ok?success:t('shop.failed');if(ok)onChange();render();}
 function render(){
  stop();dialog.replaceChildren();dialog.setAttribute('aria-label',t('shop.aria'));const state=economy.state,stock=STOCK[current],lang=doc.documentElement.lang||'ko';
  const head=element('header'),title=element('h2',t(current==='smith'?'shop.smith':'shop.herbalist'));
  head.append(title,element('strong',economy.gold.toLocaleString(lang)+' G'));addButton(head,t('dialogue.close'),()=>dialog.close());dialog.append(head);
  const scroll=element('section');scroll.className='mf-shop-scroll';dialog.append(scroll,receipt);
  const row=(parent,name,detail,id)=>{const line=element('div'),meta=element('span');meta.append(element('strong',name),element('small',detail));
   if(id)line.append(townItemIcon(doc,id));
   line.className='mf-shop-row';line.append(meta);parent.append(line);return line;};
  if(current==='smith'){
   scroll.append(element('h3',t('shop.workbench')));
   const id=smithTarget??state.equipped.sword,w=economy.gear(id),item=TOWN_ITEMS[id],name=itemName(id);
   const select=element('select');select.setAttribute('aria-label',t('shop.target'));
   for(const key of Object.keys(state.bag).filter(k=>!!TOWN_ITEMS[k].slot)){const option=element('option',itemName(key));option.value=key;option.selected=key===id;select.append(option);}
   select.onchange=()=>{smithTarget=select.value;render();};scroll.append(select);
   const box=row(scroll,name+' +'+w.level,(item.slot==='sword'?t('shop.attack',{n:w.attack}):t('shop.defense',{n:w.defense}))+' · '+t('char.durability',{hp:w.hp,max:w.max}),id);
   const cost=economy.repairCost(id);
   addButton(box,t('shop.repair',{cost}),()=>trade(()=>economy.repair(id),t('shop.repaired')),!cost||economy.gold<cost);
   const bonus=item.slot==='sword'?t('shop.attack',{n:FORGE_RULES.attackGain}):t('shop.defense',{n:FORGE_RULES.defenseGain});
   const forge=row(scroll,t('shop.temper'),t('shop.temperNote',{...FORGE_RULES,bonus}));
   addButton(forge,t('shop.forge',{cost:economy.forgeCost(id)}),()=>beginForge(id),!economy.canForge(id));
  }
  scroll.append(element('h3',t('shop.buy')));
  for(const [id,price] of Object.entries(stock)){
   const name=itemName(id),line=row(scroll,name,itemNote(id)??t('shop.inBag',{n:state.bag[id]??0}),id);
   addButton(line,price+' G',()=>trade(()=>economy.buy(current,id),t('shop.bought',{name})),economy.gold<price);
  }
  scroll.append(element('h3',t(current==='smith'?'shop.makeGear':'shop.brew')));
  for(const [id,recipe] of Object.entries(RECIPES[current])){
   const inputs=Object.entries(recipe.inputs),name=itemName(id);
   const line=row(scroll,name,inputs.map(([k,n])=>itemName(k)+' '+(state.bag[k]??0)+'/'+n).join(' · '),id);
   addButton(line,t('shop.make',{cost:recipe.gold}),()=>trade(()=>economy.craft(current,id),t('shop.made',{name})),economy.gold<recipe.gold||inputs.some(([k,n])=>(state.bag[k]??0)<n));
  }
  const materials=Object.entries(state.bag).filter(([id,n])=>n&&TOWN_ITEMS[id]?.sell);
  if(materials.length)scroll.append(element('h3',t('shop.sell')));
  for(const [id,n] of materials){const it=TOWN_ITEMS[id],name=itemName(id);addButton(row(scroll,name,t('shop.inBag',{n}),id),t('shop.sellFor',{price:it.sell}),()=>trade(()=>economy.sell(current,id),t('shop.sold',{name})));}
 }
 function beginForge(id){
  if(!economy.canForge(id))return;
  dialog.replaceChildren();receipt.textContent='';
  const head=element('header');head.append(element('h2',t('shop.temperTitle',{name:itemName(id)})));addButton(head,t('panel.back'),render);dialog.append(head);
  dialog.append(element('p',t('shop.forgeHelp',FORGE_RULES)));
  const gauge=element('div');gauge.className='mf-forge-gauge';gauge.setAttribute('role','img');gauge.setAttribute('aria-label',t('shop.gauge'));
  const mark=element('i');gauge.append(mark);dialog.append(gauge);
  started=win.performance.now();hammer=addButton(dialog,t('shop.strike'),()=>{
   if(!hammer)return;
   const grade=economy.forge(forgeCursor(win.performance.now()-started),id);stop();
   receipt.textContent=grade?gradeLabel(grade)+' · '+itemName(id)+' +'+economy.gear(id).level:t('shop.failed');
   onChange();render();
  });hammer.focus();
  function draw(now){mark.style.left=100*forgeCursor(now-started)+'%';frame=win.requestAnimationFrame(draw);}
  draw(started);
 }
 return {get open(){return dialog.open;},show(shop){
  if(!STOCK[shop]||dialog.open)return Promise.resolve();
  current=shop;smithTarget=null;receipt.textContent='';render();dialog.showModal();onPause();
  return new Promise(res=>{resolveClose=res;});
 },close(){if(dialog.open)dialog.close();},dispose(){if(dialog.open)dialog.close();finish();dialog.remove();}};
}
