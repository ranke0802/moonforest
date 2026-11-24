import {TOWN_ITEMS,STOCK,RECIPES,forgeCursor,POTION_NOTES} from './town-items.js';

export function createTownShop({root,economy,onChange,onPause}){
 const doc=root.ownerDocument,win=doc.defaultView,dialog=doc.createElement('dialog');
 dialog.className='mf-town-shop';dialog.lang='en';dialog.setAttribute('aria-label','Village services');root.append(dialog);
 let current=null,resolveClose=null,frame=0,started=0,hammer=null,smithTarget=null;
 const element=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 function addButton(parent,label,action,disabled=false){
  const node=element('button',label);node.type='button';node.disabled=disabled;node.onclick=action;parent.append(node);return node;
 }
 function stop(){if(frame)win.cancelAnimationFrame(frame);frame=0;hammer=null;}
 const receipt=element('p');receipt.className='mf-shop-receipt';receipt.setAttribute('role','status');
 function finish(){stop();current=null;onPause();resolveClose?.();resolveClose=null;}
 dialog.addEventListener('close',finish);
 function trade(act,success){const ok=act();receipt.textContent=ok?success:'Could not complete the transaction.';if(ok)onChange();render();}
 function render(){
  stop();dialog.replaceChildren();const state=economy.state,stock=STOCK[current];
  const head=element('header'),title=element('h2',current==='smith'?'Blacksmith':'Herbalist');
  head.append(title,element('strong',economy.gold.toLocaleString('en')+' G'));addButton(head,'Close',()=>dialog.close());dialog.append(head);
  const scroll=element('section');scroll.className='mf-shop-scroll';dialog.append(scroll,receipt);
  const row=(parent,name,detail)=>{const line=element('div'),meta=element('span');meta.append(element('strong',name),element('small',detail));
   line.className='mf-shop-row';line.append(meta);parent.append(line);return line;};
  if(current==='smith'){
   scroll.append(element('h3','Workbench'));
   const id=smithTarget??state.equipped.sword,w=economy.gear(id),item=TOWN_ITEMS[id],name=item.name;
   const select=element('select');select.setAttribute('aria-label','Equipment to work on');
   for(const key of Object.keys(state.bag).filter(k=>!!TOWN_ITEMS[k].slot)){const option=element('option',TOWN_ITEMS[key].name);option.value=key;option.selected=key===id;select.append(option);}
   select.onchange=()=>{smithTarget=select.value;render();};scroll.append(select);
   const box=row(scroll,name+' +'+w.level,(item.slot==='sword'?'Strike +'+w.attack:'Defense +'+w.defense)+' · Durability '+w.hp+'/'+w.max);
   const cost=economy.repairCost(id);
   addButton(box,'Repair · '+cost+' G',()=>trade(()=>economy.repair(id),'Equipment repaired.'),!cost||economy.gold<cost);
   const forge=row(scroll,'Temper equipment','One trophy or iron scrap. Each level adds 2 strike or 1 defense and costs 7 maximum durability. Perfect raises two levels.');
   addButton(forge,'Forge · '+economy.forgeCost(id)+' G',()=>beginForge(id),!economy.canForge(id));
  }
  scroll.append(element('h3','Buy'));
  for(const [id,price] of Object.entries(stock)){
   const item=TOWN_ITEMS[id],line=row(scroll,item.name,POTION_NOTES[id]??('In bag · '+(state.bag[id]??0)));
   addButton(line,price+' G',()=>trade(()=>economy.buy(current,id),'Purchased '+item.name+'.'),economy.gold<price);
  }
  scroll.append(element('h3',current==='smith'?'Make equipment':'Brew'));
  for(const [id,recipe] of Object.entries(RECIPES[current])){
   const inputs=Object.entries(recipe.inputs),name=TOWN_ITEMS[id].name;
   const line=row(scroll,name,inputs.map(([k,n])=>TOWN_ITEMS[k].name+' '+(state.bag[k]??0)+'/'+n).join(' · '));
   addButton(line,'Make · '+recipe.gold+' G',()=>trade(()=>economy.craft(current,id),'Made '+name+'.'),economy.gold<recipe.gold||inputs.some(([k,n])=>(state.bag[k]??0)<n));
  }
  const materials=Object.entries(state.bag).filter(([id,n])=>n&&TOWN_ITEMS[id]?.sell);
  if(materials.length)scroll.append(element('h3','Sell'));
  for(const [id,n] of materials){const it=TOWN_ITEMS[id];addButton(row(scroll,it.name,'In bag · '+n),'Sell · '+it.sell+' G',()=>trade(()=>economy.sell(current,id),'Sold '+it.name+'.'));}
 }
 function beginForge(id){
  if(!economy.canForge(id))return;
  dialog.replaceChildren();receipt.textContent='';
  const head=element('header');head.append(element('h2','Temper '+TOWN_ITEMS[id].name));addButton(head,'Back',render);dialog.append(head);
  dialog.append(element('p','Strike when the marker crosses the center line. A near miss keeps the level. A failed strike wears the edge.'));
  const gauge=element('div');gauge.className='mf-forge-gauge';gauge.setAttribute('role','img');gauge.setAttribute('aria-label','Timing meter with center target');
  const mark=element('i');gauge.append(mark);dialog.append(gauge);
  started=win.performance.now();hammer=addButton(dialog,'Strike',()=>{
   if(!hammer)return;
   const grade=economy.forge(forgeCursor(win.performance.now()-started),id);stop();
   receipt.textContent=grade?grade+' · '+TOWN_ITEMS[id].name+' +'+economy.gear(id).level:'Could not complete the transaction.';
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
