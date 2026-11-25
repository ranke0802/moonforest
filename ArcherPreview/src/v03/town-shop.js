import {TOWN_ITEMS,STOCK,RECIPES,FORGE_RULES,FORGE_MATERIALS,forgeCursor,forgeZones,forgeResult,itemName,itemNote,gradeLabel} from './town-items.js';
import {t} from './i18n.js';
import {townEquipmentIcon,townItemIcon} from './town-item-art.js';

export function createTownShop({root,economy,onChange,onPause}){
 const doc=root.ownerDocument,win=doc.defaultView,dialog=doc.createElement('dialog');
 dialog.className='mf-town-shop';root.append(dialog);
 let current=null,resolveClose=null,frame=0,started=0,smithTarget=null,forging=null,armTimer=0,sparkTimer=0;
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
 function finish(){stop();forging=null;current=null;onPause();resolveClose?.();resolveClose=null;}
 dialog.addEventListener('close',finish);
 // The temper strikes on a tap or click anywhere on the dialog (its backdrop
 // included) or Space/Enter, never on its own buttons (2026-11-25, user).
 const outsideControls=target=>!target?.closest?.('button,select');
 dialog.addEventListener('pointerdown',event=>{if(forging&&!forging.struck&&outsideControls(event.target)){event.preventDefault?.();strike();}});
 dialog.addEventListener('keydown',event=>{
  if(!forging||forging.struck||event.repeat||(event.code!=='Space'&&event.code!=='Enter')||!outsideControls(event.target))return;
  event.preventDefault();strike();
 });
 function trade(act,success){const ok=act();receipt.textContent=ok?success:t('shop.failed');if(ok)onChange();render();}
 function render(){
  stop();forging=null;dialog.classList.remove('is-forging');dialog.replaceChildren();dialog.setAttribute('aria-label',t('shop.aria'));const state=economy.state,stock=STOCK[current],lang=doc.documentElement.lang||'ko';
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
   forge.querySelector('span').append(forgeStock());
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
   const item=TOWN_ITEMS[id],details=inputs.map(([k,n])=>itemName(k)+' '+(state.bag[k]??0)+'/'+n);
   if(item.attack)details.unshift(t('shop.attack',{n:item.attack}));
   if(item.defense)details.unshift(t('shop.defense',{n:item.defense}));
   const line=row(scroll,name,details.join(' · '),id);
   addButton(line,t('shop.make',{cost:recipe.gold}),()=>trade(()=>economy.craft(current,id),t('shop.made',{name})),economy.gold<recipe.gold||inputs.some(([k,n])=>(state.bag[k]??0)<n));
  }
  const materials=Object.entries(state.bag).filter(([id,n])=>n&&TOWN_ITEMS[id]?.sell);
  if(materials.length)scroll.append(element('h3',t('shop.sell')));
  for(const [id,n] of materials){const it=TOWN_ITEMS[id],name=itemName(id);addButton(row(scroll,name,t('shop.inBag',{n}),id),t('shop.sellFor',{price:it.sell}),()=>trade(()=>economy.sell(current,id),t('shop.sold',{name})));}
 }
 // The temper (2026-11-25, user: the screen was bare). The item and what a
 // strike changes, the four zones and their outcome, a gradient gauge whose
 // zones narrow a little at each level (same hammer speed; failed is plain
 // black, 10:43), and the result on the same view. Its buttons wait a moment,
 // so the tap that struck cannot also press them.
 const ZONES=[['Perfect','perfect'],['Success','success'],['Near miss','near'],['Failed','failed']];
 const signed=n=>(n>0?'+':'')+n;
 // What each grade does to this piece (11:14, user): levels gained, maximum lost;
 // durability is never restored, it only follows a maximum below it.
 const gradeEffect=(key,n,d)=>!n&&!d?t('shop.gradeEffect.near'):!n?t('shop.gradeEffect.failed',{d}):
  d?t('shop.gradeEffect.'+key,{n,d}):t('shop.gradeEffect.level',{n});
 const outcome=(w,grade)=>{const next=forgeResult(w.level,w.max,grade);return {n:next.level-w.level,d:w.max-next.max,level:next.level,max:next.max,hp:Math.min(w.hp,next.max)};};
 function forgePreview(id){
  const item=TOWN_ITEMS[id],w=economy.gear(id),attack=item.slot==='sword',gain=attack?FORGE_RULES.attackGain:FORGE_RULES.defenseGain,base=attack?item.attack:item.defense;
  const success=outcome(w,'Success'),perfect=outcome(w,'Perfect'),value=level=>base+level*gain;
  return {w,attack,now:attack?w.attack:w.defense,success:{...success,value:value(success.level)},perfect:{...perfect,value:value(perfect.level)},bestLevel:perfect.level,
   material:FORGE_MATERIALS.find(key=>economy.state.bag[key]),cost:economy.forgeCost(id)};
 }
 function forgeStock(lastUsed){
  const bag=economy.state.bag;
  const items=FORGE_MATERIALS.filter(id=>bag[id]||id===lastUsed).map(id=>itemName(id)+' ×'+(bag[id]??0));
  const stock=element('small',t('shop.forgeStock',{items:items.join(' · ')||'0'}));
  stock.className='mf-forge-stock';
  return stock;
 }
 function forgeCard(id,lastUsed){
  const view=forgePreview(id),card=element('div'),icon=townEquipmentIcon(doc,id,view.w.level),text=element('div'),stats=element('dl');
  card.className='mf-forge-item mf-equipment-card';icon.classList.add('mf-forge-icon');
  const stat=(label,value)=>{const pair=element('div');pair.append(element('dt',label),value);stats.append(pair);};
  const change=element('dd');change.append(signed(view.now)+' → ',element('strong',signed(view.success.value)));
  if(view.bestLevel>view.w.level+1)change.append(' ',element('small',t('shop.forgeOnPerfect',{value:signed(view.perfect.value)})));
  stat(t(view.attack?'char.attack':'char.defense'),change);
  stat(t('shop.forgeDurability'),element('dd',view.w.hp+'/'+view.w.max+' → '+view.success.hp+'/'+view.success.max));
  const cost=element('small',view.material?t('shop.forgeCost',{cost:view.cost,material:itemName(view.material),n:economy.state.bag[view.material]}):t('shop.forgeNeedsMaterial'));
  cost.className='mf-forge-cost';text.append(element('strong',itemName(id)+' +'+view.w.level),stats,cost,forgeStock(lastUsed));
  card.append(icon,text);return card;
 }
 function forgeLegend(id){
  const legend=element('ol'),w=economy.gear(id);legend.className='mf-forge-legend';
  for(const [grade,key] of ZONES){
   const row=element('li'),next=outcome(w,grade);row.dataset.zone=key;
   row.append(element('b',gradeLabel(grade)),element('span',gradeEffect(key,next.n,next.d)));
   legend.append(row);
  }
  return legend;
 }
 // The gauge's picture for this level, set once per view (10:49, user): yellow at
 // the centre through green into black, blending with no hard edge; black from
 // the near-miss edge outward, where a strike fails.
 function gaugeArt(level){
  const zone=forgeZones(level),pct=edge=>(50-edge*50).toFixed(2)+'%',far=edge=>(50+edge*50).toFixed(2)+'%';
  return 'linear-gradient(to right,#000 0 '+pct(zone.near)+',#5b9a3a '+pct(zone.success)+',#f5c842 '+pct(zone.perfect)+
   ',#ffe873 50%,#f5c842 '+far(zone.perfect)+',#5b9a3a '+far(zone.success)+',#000 '+far(zone.near)+' 100%)';
 }
 function beginForge(id){
  if(!economy.canForge(id))return;
  stop();dialog.replaceChildren();dialog.classList.add('is-forging');receipt.textContent='';
  const head=element('header');head.append(element('h2',t('shop.temperTitle',{name:itemName(id)})));addButton(head,t('panel.back'),render);dialog.append(head);
  const level=economy.gear(id).level,area=element('section'),gauge=element('div'),rail=element('div'),glow=element('i');
  area.className='mf-forge';area.tabIndex=0;area.setAttribute('aria-label',t('shop.forgeTap'));
  gauge.className='mf-forge-gauge';gauge.setAttribute('role','img');gauge.setAttribute('aria-label',t('shop.gauge'));
  glow.className='mf-forge-glow';rail.className='mf-forge-rail';
  const zone=forgeZones(level);gauge.style.setProperty('--mf-forge-art',gaugeArt(level));
  glow.style.left=(50-zone.perfect*50).toFixed(2)+'%';glow.style.width=(zone.perfect*100).toFixed(2)+'%';
  const hammer=element('span');hammer.className='mf-forge-hammer';hammer.setAttribute('aria-hidden','true');
  const mark=element('i');mark.className='mf-forge-mark';rail.append(hammer,mark);gauge.append(glow,rail);
  const hint=element('p',t('shop.forgeTap')+' · '+t('shop.forgeZone',{n:Math.round(zone.scale*100)}));hint.className='mf-forge-hint';
  const result=element('div');result.className='mf-forge-result';result.hidden=true;result.setAttribute('role','status');
  const side=element('div');side.className='mf-forge-side';side.append(forgeCard(id),forgeLegend(id));
  const track=element('div');track.className='mf-forge-track';track.append(gauge);
  const play=element('div');play.className='mf-forge-play';play.append(track,hint,result);
  area.append(side,play);dialog.append(area);
  forging={id,level,area,rail,mark,hint,result,side,struck:false};
  started=win.performance.now();
  const draw=time=>{moveHammer(rail,forgeCursor(time-started));frame=win.requestAnimationFrame(draw);};
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
  const position=forgeCursor(win.performance.now()-started);
  if(frame)win.cancelAnimationFrame(frame);frame=0;
  moveHammer(f.rail,position);
  const before=economy.gear(f.id),paid=FORGE_MATERIALS.find(id=>economy.state.bag[id]),grade=economy.forge(position,f.id);
  if(grade)onChange();
  const w=economy.gear(f.id),key=grade?ZONES.find(([value])=>value===grade)[1]:'failed';
  receipt.textContent=grade?gradeLabel(grade)+' · '+itemName(f.id)+' +'+w.level:t('shop.failed');
  f.area.classList.add('is-struck');f.area.dataset.grade=key;sparks(f.mark,grade);
  f.side.replaceChildren(forgeCard(f.id,grade?paid:null),forgeLegend(f.id));f.hint.hidden=true;
  const actions=element('div');actions.className='mf-forge-actions';
  const again=addButton(actions,economy.canForge(f.id)?t('shop.forgeAgain',{cost:economy.forgeCost(f.id)}):w.level>=FORGE_RULES.maxLevel?t('shop.forgeMaxed',FORGE_RULES):t('shop.forgeAgain',{cost:economy.forgeCost(f.id)}),()=>beginForge(f.id),true);
  const back=addButton(actions,t('panel.back'),render,true);
  f.result.replaceChildren(element('strong',grade?gradeLabel(grade):t('shop.failed')),element('span',grade?gradeEffect(key,w.level-before.level,before.max-w.max)+' · '+itemName(f.id)+' +'+w.level+' · '+w.hp+'/'+w.max:''),actions);
  f.result.hidden=false;
  armTimer=win.setTimeout(()=>{armTimer=0;again.disabled=!economy.canForge(f.id);back.disabled=false;(again.disabled?back:again).focus?.({preventScroll:true});},450);
 }
 return {get open(){return dialog.open;},show(shop){
  if(!STOCK[shop]||dialog.open)return Promise.resolve();
  current=shop;smithTarget=null;receipt.textContent='';render();dialog.showModal();onPause();
  return new Promise(res=>{resolveClose=res;});
 },close(){if(dialog.open)dialog.close();},dispose(){if(dialog.open)dialog.close();finish();dialog.remove();}};
}
