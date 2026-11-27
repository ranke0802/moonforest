import {TOWN_ITEMS,STOCK,RECIPES,FORGE_RULES,FORGE_MATERIALS,FORGE_WEAR_RANGE,GRADE_KEYS,forgeCursor,forgeError,forgeGradeWear,forgePulse,forgeZones,forgeGain,gearName,itemName,itemNote,gradeLabel} from './town-items.js';
import {t} from './i18n.js';
import {townEquipmentIcon,townItemIcon} from './town-item-art.js';
import {createForgeRing} from './forge-ring.js';
import {createForgeBench} from './forge-bench.js';
import {forgeSound} from './forge-sound.js';
import {reducedMotion} from './accessibility.js';

// 2026-11-26, user: every shop works the same way. Pick a quantity beside each
// item, then press the one button that stays at the bottom. The smith's bench
// (repair, temper) is its own view, reached from the conversation menu.
const GEAR_PER_TRADE=1,GOODS_PER_TRADE=99;
// sound(cue, options): the game's sound hook. stage(): {scene, camera, canvas, piece(id)}
// for the 3D smith's bench, or null (the 2D bench).
export function createTownShop({root,economy,onChange,onPause,sound=null,stage=null}){
 const doc=root.ownerDocument,win=doc.defaultView,dialog=doc.createElement('dialog');
 dialog.className='mf-town-shop';root.append(dialog);
 let current=null,mode='shop',tab='buy',cart={},cursor=0,rows=[],resolveClose=null,frame=0,started=0,smithTarget=null,forging=null,armTimer=0,sparkTimer=0;
 let bench=null,benchFor=null,benchCanvas=null;
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
 function finish(){stop();endForge();dropBench();delete root.dataset.forgeStale;current=null;onPause();resolveClose?.();resolveClose=null;}
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
  else if(code==='Enter'&&!event.target?.closest?.('button')){event.preventDefault();commit();return;}
  else return;
  event.preventDefault();focusList();
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
  cursor=Math.max(0,Math.min(rows.length-1,index));refresh();
 }
 function focusList(){
  const target=rows[cursor]?.line??dialog.querySelector('.mf-shop-tabs [aria-selected="true"]');
  target?.focus({preventScroll:true});target?.scrollIntoView?.({block:'nearest'});
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
  line.tabIndex=-1;line.setAttribute('role','group');line.setAttribute('aria-label',name);
  line.addEventListener('focusin',()=>{if(cursor!==index)select(index);});
  function stepBy(event,delta){
   cursor=index;change(id,delta);
   if(event.currentTarget.disabled)focusList();
  }
  const less=addButton(step,'−',event=>stepBy(event,-1));step.append(count);
  const more=addButton(step,'+',event=>stepBy(event,1));
  less.setAttribute('aria-label',t('shop.less',{name}));more.setAttribute('aria-label',t('shop.more',{name}));
  line.append(tag,step);rows.push({id,line,less,more,count});
 }
 function header(title){
  const head=element('header');
  head.append(element('h2',title),element('strong',price(economy.gold)));addButton(head,t('dialogue.close'),()=>dialog.close());dialog.append(head);
 }
 function render(){
  const leaving=!!forging;stop();endForge();if(leaving)onPause();rows=[];dialog.classList.remove('is-forging');dialog.replaceChildren();dialog.setAttribute('aria-label',t('shop.aria'));dialog.dataset.mode=mode;
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
  refresh();if(dialog.open)focusList();
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
  const forge=row(scroll,t('shop.temper'),t('forge.temperNote',{maxLevel:FORGE_RULES.maxLevel,minDurability:FORGE_RULES.minDurability}));
  const saved=element('small',t('shop.forgeSaved'));saved.className='mf-forge-saved';
  forge.querySelector('span').append(saved,forgeStock());
  addButton(forge,w.level>=FORGE_RULES.maxLevel?t('shop.forgeMaxed',FORGE_RULES):t('shop.forge',{cost:economy.forgeCost(id)}),()=>beginForge(id),!economy.canForge(id));
  if(economy.canForge(id))prepareBench(id);
 }
 // The temper (2026-11-27, user review: "no background sound, no effect, too plain").
 // A first-person bench: the piece on the anvil, the left hand on its grip, the hammer
 // in the right (forge-bench.js: the game's own scene and camera; a 2D bench when that
 // is unavailable or not ready). A ring centred on the piece grows and shrinks
 // (forge-ring.js); its size when struck is the grade: yellow great success, green
 // success, grey near miss, black failed. The timing is the 2026-11-26 sweep
 // (forgePulse: the ring closes when the old mark crossed the middle, faster with each
 // attempt made); +N counts attempts and each is saved at once. The result's buttons
 // wait 0.45 s so the striking tap cannot also press them.
 const ZONES=[['Perfect','perfect'],['Success','success'],['Near miss','near'],['Failed','failed']];
 // About 1.5 s of frames for the 3D bench to become ready before the 2D bench stays.
 const FLAT_AFTER_FRAMES=90;
 const signed=n=>(n>0?'+':'')+n;
 const statName=id=>t(TOWN_ITEMS[id].slot==='sword'?'char.attack':'char.defense');
 const gainText=(id,n)=>t('shop.gradeGain',{stat:statName(id),n});
 function wearText(grade){
  const low=forgeGradeWear(grade,FORGE_WEAR_RANGE.min),high=forgeGradeWear(grade,FORGE_WEAR_RANGE.max);
  return high?t('forge.wearRange',{min:low,max:high}):t('forge.noWear');
 }
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
  stat(t('shop.forgeDurability'),element('dd',w.hp+'/'+w.max));
  stat(t('shop.forgeCount'),element('dd',w.level+' / '+FORGE_RULES.maxLevel));
  const material=FORGE_MATERIALS.find(key=>economy.state.bag[key]);
  const cost=element('small',material?t('shop.forgeCost',{cost:economy.forgeCost(id),material:itemName(material),n:economy.state.bag[material]}):t('shop.forgeNeedsMaterial'));
  cost.className='mf-forge-cost';text.append(element('strong',gearName(id,w.blessed)+' +'+w.level),stats,cost,forgeStock(lastUsed));
  card.append(icon,text);return card;
 }
 // The four grades: their colour, what the stat gains and what the maximum loses.
 function forgeLegend(id){
  const legend=element('ol'),w=economy.gear(id),slot=TOWN_ITEMS[id].slot;legend.className='mf-bench-legend';
  for(const [grade,key] of ZONES){
   const line=element('li'),swatch=element('i');line.dataset.zone=key;swatch.setAttribute('aria-hidden','true');
   line.append(swatch,element('b',gradeLabel(grade)),element('span',gainText(id,forgeGain(slot,grade,w.blessed))),element('small',wearText(grade)));
   legend.append(line);
  }
  return legend;
 }
 // The 3D bench for this piece, made while the bench view is open (shaders compile
 // before the temper starts) and dropped when the shop closes or the piece changes.
 function prepareBench(id){
  if(bench&&benchFor===id)return;
  dropBench();
  let place=null;
  try{place=stage?.();}catch{place=null;}
  if(!place)return;
  try{
   bench=createForgeBench({scene:place.scene,camera:place.camera,canvas:place.canvas,piece:place.piece?.(id)??null,slot:TOWN_ITEMS[id].slot,reduced:reducedMotion});
   benchFor=id;benchCanvas=place.canvas;void bench.warm();
  }catch(error){console.warn('[Forge bench] 3D bench unavailable',error);bench=null;benchFor=null;}
 }
 function showFlat(){
  const f=forging;if(f){f.flat=true;f.area.classList.add('is-flat');}
  dialog.classList.remove('is-3d');delete root.dataset.forgeDrawn;
 }
 function dropBench(){
  if(bench){try{bench.dispose();}catch(error){console.warn('[Forge bench]',error);}}
  bench=null;benchFor=null;benchCanvas=null;showFlat();
 }
 // Where the ring sits and how big it is: read when the view opens and on resize only.
 function layoutBench(){
  const f=forging;if(!f)return;
  const area=f.area.getBoundingClientRect?.(),spot=f.focus.getBoundingClientRect?.();
  if(!area?.width||!spot?.width)return;
  const x=spot.left+spot.width/2,y=spot.top+spot.height/2;
  let radius=Math.min(spot.width,spot.height)*.46;
  if(bench&&benchCanvas){
   const pixels=bench.layout({x,y},benchCanvas.getBoundingClientRect());
   if(pixels)radius=Math.max(44,Math.min(radius*1.15,pixels*.27));
  }
  f.ring.place(x-area.left,y-area.top,radius);
  // A resize clears the canvas: draw the bench again even when it is at rest.
  if(bench&&!frame)frame=win.requestAnimationFrame(drawBench);
 }
 // Leaving the temper (back to the bench, another attempt, or closing).
 function endForge(){
  if(!forging)return;
  win.removeEventListener?.('resize',layoutBench);
  forgeSound(sound,'forge:ambience:end');
  // The paused world under the dialog still shows the bench's last frame; hide it until the shop closes.
  if(dialog.classList.contains('is-3d'))root.dataset.forgeStale='';
  forging=null;dialog.classList.remove('is-bench','is-3d');delete root.dataset.forgeBench;delete root.dataset.forgeDrawn;
  bench?.reset();
 }
 function drawBench(time){
  frame=0;const f=forging;if(!f)return;
  if(!f.struck)f.ring.set(forgePulse(time-started,f.level));
  if(bench){
   let drawn=false;
   try{drawn=bench.draw(time);}catch(error){console.warn('[Forge bench] draw failed; 2D bench',error);dropBench();}
   if(drawn&&f.flat){f.flat=false;f.area.classList.remove('is-flat');dialog.classList.add('is-3d');root.dataset.forgeDrawn='';}
   else if(!drawn&&f.flat&&++f.waits>FLAT_AFTER_FRAMES)dropBench();
  }
  if(!f.struck||(bench&&!f.flat&&time<f.until))frame=win.requestAnimationFrame(drawBench);
 }
 function beginForge(id){
  if(!economy.canForge(id))return;
  stop();endForge();rows=[];dialog.replaceChildren();dialog.classList.add('is-bench');receipt.textContent='';
  const w=economy.gear(id),level=w.level,head=element('header');
  head.append(element('h2',t('shop.temperTitle',{name:gearName(id,w.blessed)})));addButton(head,t('panel.back'),render);dialog.append(head);
  const area=element('section');area.className='mf-bench is-flat';area.tabIndex=0;area.setAttribute('aria-label',t('forge.tap'));
  // The free middle of the view: the strike point (and the ring) sit at its centre; the
  // 2D bench draws its anvil and the piece's picture there.
  const focus=element('div'),flat=element('div'),anvil=element('i'),piece=townEquipmentIcon(doc,id,level);
  focus.className='mf-bench-focus';focus.setAttribute('role','img');focus.setAttribute('aria-label',t('forge.ring'));
  flat.className='mf-bench-flat';flat.setAttribute('aria-hidden','true');anvil.className='mf-bench-anvil';piece.classList.add('mf-bench-piece');
  flat.append(anvil,piece);focus.append(flat);
  const ring=createForgeRing(doc,forgeZones(level));
  // Result effects, centred on the ring: burst (great), glow (success), smoke (near), crack (failed).
  const burst=element('div');burst.className='mf-bench-burst';
  for(const name of ['glow','rays','smoke','crack'])burst.append(Object.assign(element('i'),{className:'mf-bench-'+name}));
  ring.node.append(burst);
  const side=element('div');side.className='mf-bench-side';side.append(forgeCard(id),forgeLegend(id));
  const hint=element('p',t('forge.tap')+' · '+t('forge.speed',{n:Math.round(100*(1+FORGE_RULES.speedPerLevel*level))}));hint.className='mf-bench-hint';
  const saved=element('p',t('shop.forgeSaved'));saved.className='mf-bench-saved';
  const foot=element('div');foot.className='mf-bench-foot';foot.append(hint,saved);
  const result=element('div');result.className='mf-bench-result';result.hidden=true;result.setAttribute('role','status');
  area.append(focus,ring.node,side,foot,result);dialog.append(area);
  forging={id,level,area,focus,ring,burst,hint,foot,result,side,struck:false,flat:true,waits:0,until:0};
  root.dataset.forgeBench='';
  prepareBench(id);bench?.reset();
  ring.set(1);started=win.performance.now();
  layoutBench();win.addEventListener?.('resize',layoutBench);
  forgeSound(sound,'forge:ambience');onPause();
  if(!frame)frame=win.requestAnimationFrame(drawBench);area.focus?.({preventScroll:true});
 }
 // The 2D bench's sparks (the 3D bench throws its own).
 function flatSparks(burst,grade){
  const count=reducedMotion()?0:{Perfect:14,Success:8,'Near miss':4}[grade]??0;
  for(let i=0;i<count;i++){
   const spark=element('i');spark.className='mf-bench-spark';
   const angle=Math.PI*(1.05+.9*i/Math.max(1,count-1)),reach=2.2+1.6*((i*7)%5)/4;
   spark.style.setProperty('--dx',(Math.cos(angle)*reach).toFixed(2)+'rem');spark.style.setProperty('--dy',(Math.sin(angle)*reach).toFixed(2)+'rem');
   burst.append(spark);
  }
  if(count)sparkTimer=win.setTimeout(()=>{sparkTimer=0;for(const spark of [...burst.querySelectorAll('.mf-bench-spark')])spark.remove();},900);
 }
 function strike(){
  const f=forging;if(!f||f.struck)return;
  f.struck=true;
  const time=win.performance.now(),position=forgeCursor(time-started,f.level);
  f.ring.set(forgeError(position));
  if(frame&&(!bench||f.flat)){win.cancelAnimationFrame(frame);frame=0;}
  const before=economy.gear(f.id),paid=FORGE_MATERIALS.find(id=>economy.state.bag[id]),grade=economy.forge(position,f.id);
  if(grade)onChange();
  const w=economy.gear(f.id),key=grade?GRADE_KEYS[grade]:'failed',name=gearName(f.id,w.blessed)+' +'+w.level;
  receipt.textContent=grade?gradeLabel(grade)+' · '+name:t('shop.failed');
  f.area.classList.add('is-struck');f.area.dataset.grade=key;f.burst.dataset.grade=key;
  forgeSound(sound,'forge:strike:'+key);if(grade)forgeSound(sound,'forge:result:'+key);
  if(bench&&!f.flat){bench.strike(grade??'Failed',time);f.until=time+1600;}
  else flatSparks(f.burst,grade);
  f.side.replaceChildren(forgeCard(f.id,grade?paid:null),forgeLegend(f.id));f.foot.hidden=true;
  const actions=element('div');actions.className='mf-bench-actions';
  const again=addButton(actions,w.level>=FORGE_RULES.maxLevel?t('shop.forgeMaxed',FORGE_RULES):t('shop.forgeAgain',{cost:economy.forgeCost(f.id)}),()=>beginForge(f.id),true);
  const back=addButton(actions,t('panel.back'),render,true);
  const change=element('dl');change.className='mf-bench-change';
  const pair=(label,from,to,note)=>{
   const line=element('div'),value=element('dd');value.append(from+' → ',element('b',to));
   if(note)value.append(' ',element('small',note));line.append(element('dt',label),value);change.append(line);
  };
  if(grade){
   const stat=TOWN_ITEMS[f.id].slot==='sword'?'attack':'defense';
   pair(t('shop.forgeCount'),'+'+before.level,'+'+w.level);
   pair(statName(f.id),signed(before[stat]),signed(w[stat]),gainText(f.id,w.bonus-before.bonus));
   pair(t('forge.maxDurability'),String(before.max),String(w.max),before.max===w.max?t('forge.kept'):t('shop.forgeWore',{d:before.max-w.max}));
  }
  f.result.replaceChildren(element('strong',grade?gradeLabel(grade):t('shop.failed')),change,element('span',grade?name+' · '+t('char.durability',{hp:w.hp,max:w.max}):''),actions);
  f.result.hidden=false;
  armTimer=win.setTimeout(()=>{armTimer=0;again.disabled=!economy.canForge(f.id);back.disabled=false;(again.disabled?back:again).focus?.({preventScroll:true});},450);
 }
 // view: 'shop' (buy, sell, make) or 'forge' (the smith's bench).
 return {get open(){return dialog.open;},get forging(){return !!forging;},show(shop,view='shop'){
  if(!STOCK[shop]||dialog.open)return Promise.resolve();
  current=shop;mode=view==='forge'&&shop==='smith'?'forge':'shop';tab='buy';cart={};cursor=0;smithTarget=null;receipt.textContent='';render();dialog.showModal();onPause();
  if(mode==='shop')focusList();
  return new Promise(res=>{resolveClose=res;});
 },close(){if(dialog.open)dialog.close();},dispose(){if(dialog.open)dialog.close();finish();dialog.remove();}};
}
