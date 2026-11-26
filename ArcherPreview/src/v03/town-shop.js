import {TOWN_ITEMS,STOCK,RECIPES,FORGE_RULES,FORGE_MATERIALS,FORGE_WEAR_RANGE,forgeCursor,forgeZones,forgeGain,gearName,itemName,itemNote,gradeLabel} from './town-items.js';
import {t} from './i18n.js';
import {townEquipmentIcon,townItemIcon} from './town-item-art.js';

// 2026-11-26, user: every shop works the same way. Pick a quantity beside each
// item, then press the one button that stays at the bottom. The smith's bench
// (repair, temper) is its own view, reached from the conversation menu.
const GEAR_PER_TRADE=1,GOODS_PER_TRADE=99;
export function createTownShop({root,economy,onChange,onPause}){
 const doc=root.ownerDocument,win=doc.defaultView,dialog=doc.createElement('dialog');
 dialog.className='mf-town-shop';root.append(dialog);
 let current=null,mode='shop',tab='buy',cart={},cursor=0,rows=[],resolveClose=null,frame=0,started=0,smithTarget=null,forging=null,armTimer=0,sparkTimer=0;
 const element=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 function addButton(parent,label,action,disabled=false){
  const node=element('button',label);node.type='button';node.disabled=disabled;node.onclick=action;parent.append(node);return node;
 }
 function stop(){
  if(frame)win.cancelAnimationFrame(frame);frame=0;
  if(armTimer)win.clearTimeout(armTimer);armTimer=0;
  if(sparkTimer)win.clearTimeout(sparkTimer);sparkTimer=0;
 }
 const receipt=element('p');receipt.className='mf-shop-receipt';receipt.setAttribute('role','status');
 // The bar under the list: what the chosen quantities come to, and the one button.
 const bar=element('footer'),sum=element('strong'),act=element('button');
 bar.className='mf-shop-bar';act.type='button';act.className='mf-shop-act';act.onclick=()=>commit();bar.append(sum,act);
 function finish(){stop();forging=null;current=null;onPause();resolveClose?.();resolveClose=null;}
 dialog.addEventListener('close',finish);
 // The temper strikes on a tap or click anywhere on the dialog (its backdrop
 // included) or Space/Enter, never on its own buttons (2026-11-25, user).
 const outsideControls=target=>!target?.closest?.('button,select');
 dialog.addEventListener('pointerdown',event=>{if(forging&&!forging.struck&&outsideControls(event.target)){event.preventDefault?.();strike();}});
 dialog.addEventListener('keydown',event=>{
  if(forging){
   if(forging.struck||event.repeat||(event.code!=='Space'&&event.code!=='Enter')||!outsideControls(event.target))return;
   event.preventDefault();strike();return;
  }
  // Keyboard on the lists: W/S or the arrows move between items, A/D change the
  // quantity, Enter presses the bottom button.
  if(mode!=='shop'||!rows.length||event.target?.closest?.('select'))return;
  const code=event.code;
  if(code==='KeyW'||code==='ArrowUp')select(cursor-1);
  else if(code==='KeyS'||code==='ArrowDown')select(cursor+1);
  else if(code==='KeyA'||code==='ArrowLeft')change(rows[cursor].id,-1);
  else if(code==='KeyD'||code==='ArrowRight')change(rows[cursor].id,1);
  else if(code==='Enter'&&!event.target?.closest?.('button'))commit();
  else return;
  event.preventDefault();
 });
 const lang=()=>doc.documentElement.lang||'ko';
 const price=n=>n.toLocaleString(lang())+' G';
 const limit=id=>TOWN_ITEMS[id].slot?GEAR_PER_TRADE:GOODS_PER_TRADE;
 // Whether the bag and the purse cover this cart on the open tab.
 function fits(next){
  const state=economy.state,entries=Object.entries(next);
  if(tab==='sell')return entries.every(([id,n])=>n<=(state.bag[id]??0));
  if(entries.some(([id,n])=>n>limit(id)))return false;
  if(tab==='buy')return entries.reduce((total,[id,n])=>total+STOCK[current][id]*n,0)<=economy.gold;
  const need={};let gold=0;
  for(const [id,n] of entries){const recipe=RECIPES[current][id];gold+=recipe.gold*n;for(const [key,each] of Object.entries(recipe.inputs))need[key]=(need[key]??0)+each*n;}
  return gold<=economy.gold&&Object.entries(need).every(([key,n])=>(state.bag[key]??0)>=n);
 }
 const unit=id=>tab==='buy'?STOCK[current][id]:tab==='sell'?TOWN_ITEMS[id].sell:RECIPES[current][id].gold;
 const total=()=>Object.entries(cart).reduce((all,[id,n])=>all+unit(id)*n,0);
 function change(id,delta){
  const next={...cart,[id]:(cart[id]??0)+delta};
  if(next[id]<=0)delete next[id];
  if(delta>0&&!fits(next))return;
  cart=next;refresh();
 }
 function select(index){
  if(!rows.length)return;
  cursor=Math.max(0,Math.min(rows.length-1,index));rows[cursor].line.scrollIntoView?.({block:'nearest'});refresh();
 }
 const makeLabel=()=>t(current==='smith'?'shop.makeAction':'shop.brew');
 function refresh(){
  rows.forEach((row,index)=>{
   const n=cart[row.id]??0;
   row.count.textContent=String(n);row.less.disabled=!n;row.more.disabled=!fits({...cart,[row.id]:n+1});
   row.line.classList.toggle('is-selected',index===cursor);row.line.classList.toggle('is-picked',n>0);
  });
  sum.textContent=t(tab==='sell'?'shop.totalGain':'shop.total',{n:total().toLocaleString(lang())});
  act.textContent=tab==='buy'?t('shop.buy'):tab==='sell'?t('shop.sell'):makeLabel();
  act.disabled=!Object.keys(cart).length||!fits(cart);
 }
 function commit(){
  const entries=Object.entries(cart);if(mode!=='shop'||!entries.length)return;
  const items=entries.map(([id,n])=>itemName(id)+' ×'+n).join(', ');
  let ok,text;
  if(tab==='buy'){ok=economy.buyAll(current,cart);text=t('shop.boughtItems',{items});}
  else if(tab==='sell'){ok=economy.sellAll(current,cart);text=t('shop.soldItems',{items});}
  else{
   const made=economy.craftAll(current,cart);ok=!!made;text=t('shop.madeItems',{items});
   if(made?.blessed.length)text+=' '+t('shop.blessedMade',{name:made.blessed.map(id=>gearName(id,true)).join(', ')});
  }
  receipt.textContent=ok?text:t('shop.failed');
  if(ok){cart={};onChange();}
  render();
 }
 const row=(parent,name,detail,id)=>{const line=element('div'),meta=element('span');meta.append(element('strong',name),element('small',detail));
  if(id)line.append(townItemIcon(doc,id));
  line.className='mf-shop-row';line.append(meta);parent.append(line);return line;};
 // A list row with its price and a quantity stepper.
 function stepRow(parent,id,name,detail,cost){
  const line=row(parent,name,detail,id),index=rows.length,tag=element('b',cost),step=element('div'),count=element('output','0');
  line.dataset.item=id;tag.className='mf-shop-price';step.className='mf-shop-step';
  const less=addButton(step,'−',()=>{cursor=index;change(id,-1);});step.append(count);
  const more=addButton(step,'+',()=>{cursor=index;change(id,1);});
  less.setAttribute('aria-label',t('shop.less',{name}));more.setAttribute('aria-label',t('shop.more',{name}));
  line.append(tag,step);rows.push({id,line,less,more,count});
 }
 function header(title){
  const head=element('header');
  head.append(element('h2',title),element('strong',price(economy.gold)));addButton(head,t('dialogue.close'),()=>dialog.close());dialog.append(head);
 }
 function render(){
  stop();forging=null;rows=[];dialog.classList.remove('is-forging');dialog.replaceChildren();dialog.setAttribute('aria-label',t('shop.aria'));dialog.dataset.mode=mode;
  const state=economy.state;
  if(mode==='forge'){renderBench(state);return;}
  header(t(current==='smith'?'shop.smith':'shop.herbalist'));
  const tabs=element('nav');tabs.className='mf-shop-tabs';tabs.setAttribute('role','tablist');
  for(const [key,label] of [['buy',t('shop.buy')],['sell',t('shop.sell')],['make',t(current==='smith'?'shop.makeGear':'shop.brew')]]){
   const button=addButton(tabs,label,()=>{if(tab===key)return;tab=key;cart={};cursor=0;receipt.textContent='';render();});
   button.setAttribute('role','tab');button.setAttribute('aria-selected',String(tab===key));
  }
  const scroll=element('section');scroll.className='mf-shop-scroll';dialog.append(tabs,scroll,receipt,bar);
  if(tab==='buy')for(const [id,cost] of Object.entries(STOCK[current]))stepRow(scroll,id,itemName(id),itemNote(id)??t('shop.inBag',{n:state.bag[id]??0}),price(cost));
  else if(tab==='sell'){
   for(const [id,n] of Object.entries(state.bag))if(n&&TOWN_ITEMS[id]?.sell)stepRow(scroll,id,itemName(id),t('shop.inBag',{n}),price(TOWN_ITEMS[id].sell));
   if(!rows.length)scroll.append(element('p',t('shop.nothingToSell')));
  }else for(const [id,recipe] of Object.entries(RECIPES[current])){
   const item=TOWN_ITEMS[id],details=Object.entries(recipe.inputs).map(([key,n])=>itemName(key)+' '+(state.bag[key]??0)+'/'+n);
   if(item.attack)details.unshift(t('shop.attack',{n:item.attack}));
   if(item.defense)details.unshift(t('shop.defense',{n:item.defense}));
   stepRow(scroll,id,itemName(id),details.join(' · '),price(recipe.gold));
  }
  cursor=Math.min(cursor,Math.max(0,rows.length-1));
  for(const id of Object.keys(cart))if(!rows.some(line=>line.id===id))delete cart[id];
  refresh();
 }
 // The smith's bench: choose a piece, repair it, temper it.
 function renderBench(state){
  header(t('shop.workbench'));
  const scroll=element('section');scroll.className='mf-shop-scroll';dialog.append(scroll,receipt);
  const id=smithTarget??state.equipped.sword,w=economy.gear(id),item=TOWN_ITEMS[id],name=gearName(id,w.blessed);
  const select=element('select');select.setAttribute('aria-label',t('shop.target'));
  for(const key of Object.keys(state.bag).filter(k=>!!TOWN_ITEMS[k].slot)){const option=element('option',gearName(key,economy.gear(key).blessed));option.value=key;option.selected=key===id;select.append(option);}
  select.onchange=()=>{smithTarget=select.value;render();};scroll.append(select);
  const box=row(scroll,name+' +'+w.level,(item.slot==='sword'?t('shop.attack',{n:w.attack}):t('shop.defense',{n:w.defense}))+' · '+t('char.durability',{hp:w.hp,max:w.max}),id);
  const cost=economy.repairCost(id);
  addButton(box,t('shop.repair',{cost}),()=>{const ok=economy.repair(id);receipt.textContent=ok?t('shop.repaired'):t('shop.failed');if(ok)onChange();render();},!cost||economy.gold<cost);
  const forge=row(scroll,t('shop.temper'),t('shop.temperNote',{maxLevel:FORGE_RULES.maxLevel,minDurability:FORGE_RULES.minDurability,...FORGE_WEAR_RANGE}));
  const saved=element('small',t('shop.forgeSaved'));saved.className='mf-forge-saved';
  forge.querySelector('span').append(saved,forgeStock());
  addButton(forge,w.level>=FORGE_RULES.maxLevel?t('shop.forgeMaxed',FORGE_RULES):t('shop.forge',{cost:economy.forgeCost(id)}),()=>beginForge(id),!economy.canForge(id));
 }
 // The temper (2026-11-25, user: the screen was bare; 2026-11-26: "+N" is the number
 // of attempts, the grade decides the gain, every attempt is saved). The item and what
 // an attempt changes, the four zones and their gain, a gradient gauge whose hammer
 // speeds up with the attempts made, and the result on the same view. Its buttons wait
 // a moment, so the tap that struck cannot also press them.
 const ZONES=[['Perfect','perfect'],['Success','success'],['Near miss','near'],['Failed','failed']];
 const signed=n=>(n>0?'+':'')+n;
 const statName=id=>t(TOWN_ITEMS[id].slot==='sword'?'char.attack':'char.defense');
 const gainText=(id,n)=>t('shop.gradeGain',{stat:statName(id),n});
 function forgeStock(lastUsed){
  const bag=economy.state.bag;
  const items=FORGE_MATERIALS.filter(id=>bag[id]||id===lastUsed).map(id=>itemName(id)+' ×'+(bag[id]??0));
  const stock=element('small',t('shop.forgeStock',{items:items.join(' · ')||'0'}));
  stock.className='mf-forge-stock';
  return stock;
 }
 function forgeCard(id,lastUsed){
  const item=TOWN_ITEMS[id],w=economy.gear(id),attack=item.slot==='sword',now=attack?w.attack:w.defense;
  const card=element('div'),icon=townEquipmentIcon(doc,id,w.level),text=element('div'),stats=element('dl');
  card.className='mf-forge-item mf-equipment-card';icon.classList.add('mf-forge-icon');
  const stat=(label,value)=>{const pair=element('div');pair.append(element('dt',label),value);stats.append(pair);};
  const change=element('dd');change.append(signed(now)+' → ',element('strong',signed(now+forgeGain(item.slot,'Success',w.blessed))));
  change.append(' ',element('small',t('shop.forgeOnPerfect',{value:signed(now+forgeGain(item.slot,'Perfect',w.blessed))})));
  stat(statName(id),change);
  stat(t('shop.forgeDurability'),element('dd',w.hp+'/'+w.max+' · '+t('shop.forgeWear',FORGE_WEAR_RANGE)));
  stat(t('shop.forgeCount'),element('dd',w.level+' / '+FORGE_RULES.maxLevel));
  const material=FORGE_MATERIALS.find(key=>economy.state.bag[key]);
  const cost=element('small',material?t('shop.forgeCost',{cost:economy.forgeCost(id),material:itemName(material),n:economy.state.bag[material]}):t('shop.forgeNeedsMaterial'));
  cost.className='mf-forge-cost';text.append(element('strong',gearName(id,w.blessed)+' +'+w.level),stats,cost,forgeStock(lastUsed));
  card.append(icon,text);return card;
 }
 function forgeLegend(id){
  const legend=element('ol'),w=economy.gear(id),slot=TOWN_ITEMS[id].slot;legend.className='mf-forge-legend';
  for(const [grade,key] of ZONES){
   const line=element('li');line.dataset.zone=key;
   line.append(element('b',gradeLabel(grade)),element('span',gainText(id,forgeGain(slot,grade,w.blessed))));
   legend.append(line);
  }
  return legend;
 }
 // The gauge's picture (10:49, user): yellow at the centre through green into black,
 // blending with no hard edge; black from the fair edge outward, where a strike fails.
 function gaugeArt(){
  const zone=forgeZones(),pct=edge=>(50-edge*50).toFixed(2)+'%',far=edge=>(50+edge*50).toFixed(2)+'%';
  return 'linear-gradient(to right,#000 0 '+pct(zone.near)+',#5b9a3a '+pct(zone.success)+',#f5c842 '+pct(zone.perfect)+
   ',#ffe873 50%,#f5c842 '+far(zone.perfect)+',#5b9a3a '+far(zone.success)+',#000 '+far(zone.near)+' 100%)';
 }
 function beginForge(id){
  if(!economy.canForge(id))return;
  stop();rows=[];dialog.replaceChildren();dialog.classList.add('is-forging');receipt.textContent='';
  const w=economy.gear(id),head=element('header');head.append(element('h2',t('shop.temperTitle',{name:gearName(id,w.blessed)})));addButton(head,t('panel.back'),render);dialog.append(head);
  const level=w.level,area=element('section'),gauge=element('div'),rail=element('div'),glow=element('i');
  area.className='mf-forge';area.tabIndex=0;area.setAttribute('aria-label',t('shop.forgeTap'));
  gauge.className='mf-forge-gauge';gauge.setAttribute('role','img');gauge.setAttribute('aria-label',t('shop.gauge'));
  glow.className='mf-forge-glow';rail.className='mf-forge-rail';
  const zone=forgeZones();gauge.style.setProperty('--mf-forge-art',gaugeArt());
  glow.style.left=(50-zone.perfect*50).toFixed(2)+'%';glow.style.width=(zone.perfect*100).toFixed(2)+'%';
  const hammer=element('span');hammer.className='mf-forge-hammer';hammer.setAttribute('aria-hidden','true');
  const mark=element('i');mark.className='mf-forge-mark';rail.append(hammer,mark);gauge.append(glow,rail);
  const hint=element('p',t('shop.forgeTap')+' · '+t('shop.forgeSpeed',{n:Math.round(100*(1+FORGE_RULES.speedPerLevel*level))}));hint.className='mf-forge-hint';
  const saved=element('p',t('shop.forgeSaved'));saved.className='mf-forge-saved';
  const result=element('div');result.className='mf-forge-result';result.hidden=true;result.setAttribute('role','status');
  const side=element('div');side.className='mf-forge-side';side.append(forgeCard(id),forgeLegend(id));
  const track=element('div');track.className='mf-forge-track';track.append(gauge);
  const play=element('div');play.className='mf-forge-play';play.append(track,hint,saved,result);
  area.append(side,play);dialog.append(area);
  forging={id,level,area,rail,mark,hint,result,side,struck:false};
  started=win.performance.now();
  const draw=time=>{moveHammer(rail,forgeCursor(time-started,level));frame=win.requestAnimationFrame(draw);};
  draw(started);area.focus?.({preventScroll:true});
 }
 function moveHammer(rail,position){rail.style.transform='translateX('+(100*position).toFixed(2)+'cqw)';}
 function sparks(mark,grade){
  const count={Perfect:10,Success:6,'Near miss':3}[grade]??0;
  for(let i=0;i<count;i++){
   const spark=element('i');spark.className='mf-forge-spark';
   const angle=Math.PI*(1.1+.8*i/Math.max(1,count-1)),reach=1.2+.9*((i*7)%5)/4;
   spark.style.setProperty('--dx',(Math.cos(angle)*reach).toFixed(2)+'rem');spark.style.setProperty('--dy',(Math.sin(angle)*reach).toFixed(2)+'rem');
   mark.append(spark);
  }
  if(count)sparkTimer=win.setTimeout(()=>{sparkTimer=0;for(const spark of [...mark.querySelectorAll('.mf-forge-spark')])spark.remove();},700);
 }
 function strike(){
  const f=forging;if(!f||f.struck)return;
  f.struck=true;
  const position=forgeCursor(win.performance.now()-started,f.level);
  if(frame)win.cancelAnimationFrame(frame);frame=0;
  moveHammer(f.rail,position);
  const before=economy.gear(f.id),paid=FORGE_MATERIALS.find(id=>economy.state.bag[id]),grade=economy.forge(position,f.id);
  if(grade)onChange();
  const w=economy.gear(f.id),key=grade?ZONES.find(([value])=>value===grade)[1]:'failed',name=gearName(f.id,w.blessed)+' +'+w.level;
  receipt.textContent=grade?gradeLabel(grade)+' · '+name:t('shop.failed');
  f.area.classList.add('is-struck');f.area.dataset.grade=key;sparks(f.mark,grade);
  f.side.replaceChildren(forgeCard(f.id,grade?paid:null),forgeLegend(f.id));f.hint.hidden=true;
  const actions=element('div');actions.className='mf-forge-actions';
  const again=addButton(actions,w.level>=FORGE_RULES.maxLevel?t('shop.forgeMaxed',FORGE_RULES):t('shop.forgeAgain',{cost:economy.forgeCost(f.id)}),()=>beginForge(f.id),true);
  const back=addButton(actions,t('panel.back'),render,true);
  f.result.replaceChildren(element('strong',grade?gradeLabel(grade):t('shop.failed')),
   element('span',grade?gainText(f.id,w.bonus-before.bonus)+' · '+t('shop.forgeWore',{d:before.max-w.max})+' · '+name+' · '+w.hp+'/'+w.max:''),actions);
  f.result.hidden=false;
  armTimer=win.setTimeout(()=>{armTimer=0;again.disabled=!economy.canForge(f.id);back.disabled=false;(again.disabled?back:again).focus?.({preventScroll:true});},450);
 }
 // view: 'shop' (buy, sell, make) or 'forge' (the smith's bench).
 return {get open(){return dialog.open;},show(shop,view='shop'){
  if(!STOCK[shop]||dialog.open)return Promise.resolve();
  current=shop;mode=view==='forge'&&shop==='smith'?'forge':'shop';tab='buy';cart={};cursor=0;smithTarget=null;receipt.textContent='';render();dialog.showModal();onPause();
  return new Promise(res=>{resolveClose=res;});
 },close(){if(dialog.open)dialog.close();},dispose(){if(dialog.open)dialog.close();finish();dialog.remove();}};
}
