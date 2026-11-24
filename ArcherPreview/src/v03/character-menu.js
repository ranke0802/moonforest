import {bagContents,characterItems,combatSkills,SLOTS} from './character-menu-data.js';
import {drawCharacterPose} from './character-menu-camera.js';

export function createCharacterMenu({root,read,equip,equipItem,registerItem,usePotion,subject,onPause}){
  const doc=root.ownerDocument,win=doc.defaultView;
  const make=(tag,cls='',text='')=>{
    const node=doc.createElement(tag);
    if(cls)node.className=cls;
    if(text)node.textContent=text;
    return node;
  };
  function button(text,fn){
    const node=make('button','',text);
    node.type='button';node.addEventListener('click',fn);
    return node;
  }
  const dialog=make('dialog','mf-character-menu'),nav=make('nav'),body=make('div','mf-menu-body');
  dialog.lang='en';dialog.setAttribute('aria-label','Character menu');
  nav.setAttribute('aria-label','Character pages');
  const tabs=['Status','Inventory','Skills'];
  const tabButtons=tabs.map(name=>button(name,()=>show(name)));
  const gold=make('output','mf-menu-gold'),exit=button('×',()=>dialog.close());
  exit.setAttribute('aria-label','Close');exit.title='Close';
  nav.append(...tabButtons,gold,exit);dialog.append(nav,body);root.append(dialog);
  let page='Status',filter='All',sort='Type',selected='',poseFrame=null,turn=0,zoom=1;
  let pendingDraw=0,disposed=false,presentation=0;
  function invalidate(){
    if(pendingDraw||!dialog.open||!poseFrame||page!=='Status')return;
    pendingDraw=win.requestAnimationFrame(()=>{
      pendingDraw=0;
      const live=subject();
      if(!live||!dialog.open||!poseFrame||doc.hidden)return;
      drawCharacterPose({...live,frameRect:poseFrame.getBoundingClientRect(),turn,zoom});
    });
  }
  function zoomBy(factor){zoom=Math.min(2.8,Math.max(1,zoom*factor));invalidate();}
  const icon=kind=>{
    const node=make('i',kind?'commercial-icon commercial-icon-'+kind:'mf-menu-blank',kind?'':'◇');
    node.setAttribute('aria-hidden','true');return node;
  };
  function stat(list,label,value){
    const pair=make('div');pair.append(make('dt','',label),make('dd','',String(value)));list.append(pair);
  }
  function attachGestures(view){
    const touches=new Map();
    const span=()=>{const [a,b]=touches.values();return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};
    view.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;e.preventDefault();
      view.setPointerCapture(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    });
    view.addEventListener('pointermove',e=>{
      const point=touches.get(e.pointerId);if(!point)return;
      const gap=span(),dx=e.clientX-point.x;
      point.x=e.clientX;point.y=e.clientY;
      if(touches.size===1){turn-=dx*.013;invalidate();}
      else if(gap>2)zoomBy(span()/gap);
    });
    const end=e=>touches.delete(e.pointerId);
    for(const key of ['pointerup','pointercancel','lostpointercapture'])view.addEventListener(key,end);
    view.addEventListener('wheel',e=>{e.preventDefault();zoomBy(Math.exp(Math.max(-.3,Math.min(.3,-e.deltaY*.002))));},{passive:false});
    view.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','+','=','-'].includes(e.key))return;e.preventDefault();
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){turn+=(e.key==='ArrowLeft'?1:-1)*.18;invalidate();}
      else zoomBy(e.key==='-'?.86:1.16);
    });
  }
  function status(state,items){
    const stats=make('section','mf-menu-card mf-menu-stats'),details=make('dl');
    stats.append(make('h2','','Warrior'),details);
    stat(details,'Health',Math.ceil(state.hp)+' / '+state.maxHp);
    stat(details,'Stamina',Math.ceil(state.stamina)+' / '+state.maxStamina);
    stat(details,'Strike bonus','+'+state.attackBonus);stat(details,'Defense',state.defense);
    stat(details,'Critical hit','Rear strike');
    poseFrame=make('div','mf-menu-pose');poseFrame.tabIndex=0;poseFrame.setAttribute('role','group');
    poseFrame.setAttribute('aria-label','Warrior view. Drag to rotate, pinch or scroll to zoom. Keyboard: arrows and plus or minus.');
    attachGestures(poseFrame);
    const gear=make('div','mf-menu-gear');
    stats.append(make('h2','mf-menu-gear-title','Available gear'),gear);
    for(const row of items.filter(row=>row.type==='Gear')){
      const pick=button(row.name,()=>{filter='Gear';selected=row.id;show('Inventory');});
      gear.append(pick);
    }
    const model=make('section','mf-menu-model'),left=make('div','mf-menu-slots'),right=make('div','mf-menu-slots');
    model.setAttribute('aria-label','Equipped gear');
    for(const [index,[slot,label]] of SLOTS.entries()){
      const worn=items.find(row=>row.slot===slot&&row.worn);
      const entry=worn?button('',()=>{filter='Gear';selected=worn.id;show('Inventory');}):make('div');
      entry.append(make('small','',label),make('span','',worn?.name??'—'));
      entry.title=worn?.name??label;
      (index%2===0?left:right).append(entry);
    }
    model.append(left,poseFrame,right);body.append(stats,model);
    invalidate();
  }
  function inventory(state,items){
    const bag=make('section','mf-menu-card mf-menu-bag'),tools=make('div','mf-menu-filters');
    for(const type of ['All','Gear','Supplies',...(state.tradeBag?['Materials']:[])]){
      const item=button(type,()=>{filter=type;show('Inventory');});
      item.setAttribute('aria-pressed',String(type===filter));tools.append(item);
    }
    const sorter=make('select');sorter.setAttribute('aria-label','Sort inventory');
    for(const value of ['Type','Name']){
      const option=make('option','','By '+value.toLowerCase());option.value=value;option.selected=value===sort;sorter.append(option);
    }
    sorter.onchange=()=>{sort=sorter.value;show('Inventory');};tools.append(sorter);
    const grid=make('div','mf-menu-grid');bag.append(tools,grid);
    const list=bagContents(items,filter,sort),detail=make('section','mf-menu-card mf-menu-item');
    body.append(bag,detail);
    const nodes=new Map();
    function inspect(row){
      selected=row?.id??'';detail.replaceChildren();
      for(const [id,node] of nodes)node.setAttribute('aria-pressed',String(id===selected));
      if(!row){detail.append(make('p','','No items'));return;}
      detail.append(make('small','',row.type),icon(row.icon),make('h2','',row.name));
      if(row.stat){
        const stats=make('dl');stat(stats,row.stat,'+'+row.value);
        if(!row.worn)stat(stats,'Change',row.delta>0?'+'+row.delta:String(row.delta));detail.append(stats);
      }
      if(row.note)detail.append(make('p','',row.note));
      if(row.worn){detail.append(make('span','mf-menu-equipped','Equipped'));return;}
      if(row.tradeId&&row.slot){detail.append(button('Equip',()=>{equipItem?.(row.tradeId);show('Inventory');}));return;}
      if(row.quick){
        if(row.registered){
          detail.append(make('small','mf-menu-equipped','In quick slot'));
          const use=button('Use',()=>{if(read().canUsePotion){dialog.close();usePotion();}});use.disabled=!state.canUsePotion;detail.append(use);
        }else detail.append(button('Assign to quick slot',()=>{registerItem?.(row.tradeId);show('Inventory');}));
        return;
      }
      if(row.style){detail.append(button('Equip',()=>{equip(row.slot,row.style);show('Inventory');}));return;}
      if(row.id==='potion'){
        const use=button('Use potion',()=>{if(!read().canUsePotion)return;dialog.close();usePotion();});
        use.disabled=!state.canUsePotion;detail.append(use);
      }
    }
    for(const row of list){
      const tile=button('',()=>inspect(row));tile.title=row.name;tile.setAttribute('aria-label',row.name);
      tile.append(icon(row.icon));
      if(row.worn)tile.append(make('small','mf-menu-count','✓'));
      else if(row.quantity)tile.append(make('small','mf-menu-count',String(row.quantity)));
      nodes.set(row.id,tile);grid.append(tile);
    }
    for(let i=list.length;i<30;i++){const blank=make('i','mf-menu-empty');blank.setAttribute('aria-hidden','true');grid.append(blank);}
    inspect(list.find(row=>row.id===selected)??list[0]);
  }
  async function skills(state,id){
    const card=make('section','mf-menu-card mf-menu-skills');
    body.append(card);
    try{
      const {default:en}=await import('./locales/en.js');
      if(disposed||!dialog.open||id!==presentation)return;
      const rows=make('dl');card.append(make('h2','','Combat skills'),rows);
      for(const skill of combatSkills(en,state.touch,state.allows)){
        const row=make('div');row.append(make('dt','',skill.name),make('dd','',skill.control));
        if(!skill.available)row.append(make('small','','Unavailable during this lesson'));
        rows.append(row);
      }
    }catch{
      if(!disposed&&dialog.open&&id===presentation)card.replaceChildren(button('Retry',()=>show('Skills')));
    }
  }
  function show(name){
    if(disposed)return;
    const id=++presentation;page=name;poseFrame=null;
    if(!dialog.open){turn=0;zoom=1;dialog.showModal();root.dataset.characterMenu='';onPause();}
    const state=read();
    gold.textContent=state.gold.toLocaleString('en')+' G';dialog.dataset.page=name;
    for(let i=0;i<tabs.length;i++)tabButtons[i].setAttribute('aria-pressed',String(tabs[i]===name));
    body.replaceChildren();
    if(name==='Skills')void skills(state,id);
    else if(name==='Status')status(state,characterItems(state));
    else inventory(state,characterItems(state));
  }
  const dismiss=()=>{
    poseFrame=null;++presentation;
    if(pendingDraw)win.cancelAnimationFrame(pendingDraw);pendingDraw=0;
    delete root.dataset.characterMenu;
    if(!disposed)onPause();
  };
  dialog.addEventListener('close',dismiss);
  const observer=new win.ResizeObserver(()=>invalidate());observer.observe(body);
  return {show,get open(){return dialog.open;},close(){if(dialog.open)dialog.close();},dispose(){
    if(disposed)return;disposed=true;observer.disconnect();
    if(dialog.open)dialog.close();dismiss();dialog.remove();
  }};
}
