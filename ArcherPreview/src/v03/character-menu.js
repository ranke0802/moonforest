import {bagContents,characterItems,combatSkills,SKILL_BRANCHES,SKILL_COLUMNS,SKILL_OPEN,SLOTS} from './character-menu-data.js';
import {createCharacterPortrait} from './character-menu-camera.js';
import {townItemIcon} from './town-item-art.js';
import {t,language,cloneChapter,localizeChapter} from './i18n.js';
import {COMBAT_HINTS,TIPS} from './data/chapter1.js';

// Page, filter and sort values are stable ids; the words come from t() at
// every show(), so a language change at the title applies on the next open.
const LESSONS=Object.freeze({COMBAT_HINTS,TIPS});
const SVG='http://www.w3.org/2000/svg';
// Line art for the three skill branches (the mockup's sword, shield and boot).
const BRANCH_ART=Object.freeze({
  sword:['M19 3l-9.5 9.5M9 11l4 4M5 19l3.5-3.5M19 3v3l-8 8-3-3 8-8z'],
  shield:['M12 3l7 2.5v5.5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V5.5z','M12 7v9M8.5 11h7'],
  footwork:['M9 4h5v9l5 3v4H9z','M9 16h10']
});

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
  const tabs=['Status','Inventory','Skills'];
  const tabButtons=tabs.map(name=>button('',()=>show(name)));
  const gold=make('output','mf-menu-gold'),exit=button('×',()=>dialog.close());
  function relabel(){
    dialog.setAttribute('aria-label',t('char.aria'));nav.setAttribute('aria-label',t('char.pages'));
    tabs.forEach((name,i)=>{tabButtons[i].textContent=t('char.tab.'+name);});
    exit.setAttribute('aria-label',t('dialogue.close'));exit.title=t('dialogue.close');
  }
  nav.append(...tabButtons,gold,exit);dialog.append(nav,body);root.append(dialog);
  let page='Status',filter='All',sort='Type',selected='',poseFrame=null,turn=0,zoom=1;
  let pendingDraw=0,disposed=false,portrait=null,portraitScene=null,retryDraw=0,lessons=null,lessonLang='',skillPick='';
  const lang=()=>doc.documentElement.lang||'ko';
  function invalidate(){
    if(pendingDraw||!dialog.open||!poseFrame||page!=='Status')return;
    pendingDraw=win.requestAnimationFrame(()=>{
      pendingDraw=0;
      const live=subject();
      if(!live||!dialog.open||!poseFrame||doc.hidden)return;
      if(portraitScene!==live.scene){portrait?.dispose();portrait=createCharacterPortrait(live.scene);portraitScene=live.scene;}
      if(portrait.draw({...live,frameRect:poseFrame.getBoundingClientRect(),turn,zoom}))root.dataset.characterPortrait='';
      else if(!retryDraw)retryDraw=win.setTimeout(()=>{retryDraw=0;invalidate();},100);
    });
  }
  function zoomBy(factor){zoom=Math.min(2.8,Math.max(1,zoom*factor));invalidate();}
  const icon=row=>townItemIcon(doc,row.tradeId??row.icon);
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
    stats.append(make('h2','',t('char.warrior')),details);
    stat(details,t('char.health'),Math.ceil(state.hp)+' / '+state.maxHp);
    stat(details,t('char.stamina'),Math.ceil(state.stamina)+' / '+state.maxStamina);
    stat(details,t('char.attack'),'+'+state.attackBonus);stat(details,t('char.defense'),state.defense);
    stat(details,t('char.critical'),t('char.criticalRule'));
    poseFrame=make('div','mf-menu-pose');poseFrame.tabIndex=0;poseFrame.setAttribute('role','group');
    poseFrame.setAttribute('aria-label',t('char.view'));
    attachGestures(poseFrame);
    const model=make('section','mf-menu-model'),left=make('div','mf-menu-slots'),right=make('div','mf-menu-slots');
    model.setAttribute('aria-label',t('char.worn'));
    for(const [index,slot] of SLOTS.entries()){
      const label=t('char.slot.'+slot);
      const worn=items.find(row=>row.slot===slot&&row.worn);
      const entry=worn?button('',()=>{filter='Gear';selected=worn.id;show('Inventory');}):make('div');
      entry.append(make('small','',label));
      if(worn)entry.append(icon(worn));
      entry.append(make('span','',worn?.name??'—'));
      entry.title=worn?.name??label;
      (index%2===0?left:right).append(entry);
    }
    model.append(left,poseFrame,right);body.append(stats,model);
    invalidate();
  }
  function inventory(state,items){
    const bag=make('section','mf-menu-card mf-menu-bag'),tools=make('div','mf-menu-filters');
    for(const type of ['All','Gear','Supplies',...(state.tradeBag?['Materials']:[])]){
      const item=button(t(type==='All'?'char.filter.All':'char.type.'+type),()=>{filter=type;show('Inventory');});
      item.setAttribute('aria-pressed',String(type===filter));tools.append(item);
    }
    const sorter=make('select');sorter.setAttribute('aria-label',t('char.sort'));
    for(const value of ['Type','Name']){
      const option=make('option','',t('char.sort.'+value));option.value=value;option.selected=value===sort;sorter.append(option);
    }
    sorter.onchange=()=>{sort=sorter.value;show('Inventory');};tools.append(sorter);
    const grid=make('div','mf-menu-grid');bag.append(tools,grid);
    const list=bagContents(items,filter,sort,lang()),detail=make('section','mf-menu-card mf-menu-item');
    body.append(bag,detail);
    const nodes=new Map();
    function inspect(row){
      selected=row?.id??'';detail.replaceChildren();
      for(const [id,node] of nodes)node.setAttribute('aria-pressed',String(id===selected));
      if(!row){detail.append(make('p','',t('char.empty')));return;}
      detail.append(make('small','',t('char.type.'+row.type)),icon(row),make('h2','',row.name));
      if(row.stat){
        const stats=make('dl');stat(stats,t('char.'+row.stat),'+'+row.value);
        if(!row.worn)stat(stats,t('char.change'),row.delta>0?'+'+row.delta:String(row.delta));detail.append(stats);
      }
      if(row.note)detail.append(make('p','',row.note));
      if(row.worn){detail.append(make('span','mf-menu-equipped',t('char.equipped')));return;}
      if(row.tradeId&&row.slot){detail.append(button(t('char.equip'),()=>{equipItem?.(row.tradeId);show('Inventory');}));return;}
      if(row.quick){
        if(row.registered){
          detail.append(make('small','mf-menu-equipped',t('char.quickSet')));
          const use=button(t('char.use'),()=>{if(read().canUsePotion){dialog.close();usePotion();}});use.disabled=!state.canUsePotion;detail.append(use);
        }else detail.append(button(t('char.quickAssign'),()=>{registerItem?.(row.tradeId);show('Inventory');}));
        return;
      }
      if(row.style){detail.append(button(t('char.equip'),()=>{equip(row.slot,row.style);show('Inventory');}));return;}
      if(row.id==='potion'){
        const use=button(t('char.usePotion'),()=>{if(!read().canUsePotion)return;dialog.close();usePotion();});
        use.disabled=!state.canUsePotion;detail.append(use);
      }
    }
    for(const row of list){
      const tile=button('',()=>inspect(row));tile.title=row.name;tile.setAttribute('aria-label',row.name);
      tile.append(icon(row));
      if(row.worn)tile.append(make('small','mf-menu-count','✓'));
      else if(row.quantity)tile.append(make('small','mf-menu-count',String(row.quantity)));
      nodes.set(row.id,tile);grid.append(tile);
    }
    for(let i=list.length;i<Math.ceil(list.length/6)*6;i++){const blank=make('i','mf-menu-empty');blank.setAttribute('aria-hidden','true');grid.append(blank);}
    inspect(list.find(row=>row.id===selected)??list[0]);
  }
  function vector(tag,attributes){
    const node=doc.createElementNS(SVG,tag);
    for(const key in attributes)node.setAttribute(key,attributes[key]);
    return node;
  }
  function branchIcon(branch){
    const box=make('span','mf-skill-icon'),art=vector('svg',{viewBox:'0 0 24 24','aria-hidden':'true'});
    for(const d of BRANCH_ART[branch])art.append(vector('path',{d}));
    box.append(art);return box;
  }
  // A tree that grows left to right: branch labels on the left, one grid cell
  // per skill, a line from each skill to the one it builds on, and the picked
  // skill's controls and description on the right.
  function skills(state){
    // The lesson hints in the chosen language: localized once per language.
    if(!lessons||lessonLang!==language()){lessons=localizeChapter(cloneChapter(LESSONS),LESSONS);lessonLang=language();}
    const list=combatSkills(lessons,state.touch,state.allows),byId=new Map(list.map(skill=>[skill.id,skill]));
    const rows=SKILL_BRANCHES.length*2;
    const tree=make('section','mf-menu-card mf-skill-tree'),detail=make('section','mf-menu-card mf-skill-detail');
    tree.setAttribute('aria-label',t('char.skill.tree'));
    const branches=make('div','mf-skill-branches');
    for(const branch of SKILL_BRANCHES)branches.append(make('span','',t('char.branch.'+branch)));
    const grid=make('div','mf-skill-nodes'),lines=vector('svg',{viewBox:'0 0 100 100',preserveAspectRatio:'none','aria-hidden':'true'});
    grid.style.setProperty('--mf-skill-cols',String(SKILL_COLUMNS));grid.style.setProperty('--mf-skill-rows',String(rows));
    const x=col=>(col-.5)/SKILL_COLUMNS*100,y=row=>(row-.5)/rows*100;
    for(const skill of list)for(const id of skill.need){
      const from=byId.get(id);
      const d=from.col===skill.col?`M${x(from.col)} ${y(from.row)}V${y(skill.row)}`
        :`M${x(from.col)} ${y(from.row)}H${from.col/SKILL_COLUMNS*100}V${y(skill.row)}H${x(skill.col)}`;
      lines.append(vector('path',from.available&&skill.available?{d,class:'on'}:{d}));
    }
    grid.append(lines);
    const nodes=new Map();
    function inspect(skill){
      skillPick=skill.id;detail.replaceChildren();
      for(const [id,node] of nodes)node.setAttribute('aria-pressed',String(id===skillPick));
      const head=make('div','mf-skill-head'),title=make('div'),tags=make('div','mf-skill-tags');
      for(const tag of [t('char.branch.'+skill.branch),t('char.skill.basic')])tags.append(make('i','',tag));
      title.append(make('h2','',skill.name),tags);head.append(branchIcon(skill.branch),title);
      // The current input mode first, the other one under it.
      const controls=make('dl','mf-skill-keys');
      for(const mode of state.touch?['touch','keys']:['keys','touch']){
        const pair=make('div');pair.append(make('dt','',t('guide.'+mode)),make('dd','',skill[mode]));controls.append(pair);
      }
      detail.append(head,controls,make('p','',skill.text));
      const needs=make('ul','mf-skill-needs');
      for(const id of skill.need){const from=byId.get(id);needs.append(make('li',from.available?'is-met':'',t('char.skill.needs',{name:from.name})));}
      if(!skill.available)needs.append(make('li','',t('char.locked')));
      if(needs.childElementCount)detail.append(needs);
      detail.append(make('span','mf-menu-equipped',t(skill.available?'char.skill.ready':'char.skill.lockedShort')));
    }
    for(const skill of list){
      const state=t(skill.available?'char.skill.ready':'char.skill.lockedShort');
      const node=button('',()=>inspect(skill)),label=make('span');
      node.className='mf-skill-node '+(skill.available?'is-ready':'is-locked');node.style.gridArea=skill.row+' / '+skill.col;
      node.setAttribute('aria-label',skill.name+', '+state);
      label.append(make('b','',skill.name),make('em','',state));node.append(branchIcon(skill.branch),label);
      nodes.set(skill.id,node);grid.append(node);
    }
    for(const [row,col] of SKILL_OPEN){
      const slot=make('i','mf-skill-node is-open',t('char.skill.later'));slot.style.gridArea=row+' / '+col;
      slot.setAttribute('aria-hidden','true');grid.append(slot);
    }
    tree.append(branches,grid);body.append(tree,detail);
    inspect(byId.get(skillPick)??list[0]);
  }
  function show(name){
    if(disposed)return;
    page=name;poseFrame=null;delete root.dataset.characterPortrait;relabel();
    if(!dialog.open){turn=0;zoom=1;dialog.showModal();root.dataset.characterMenu='';onPause();}
    const state=read();
    gold.textContent=state.gold.toLocaleString(lang())+' G';dialog.dataset.page=name;
    for(let i=0;i<tabs.length;i++)tabButtons[i].setAttribute('aria-pressed',String(tabs[i]===name));
    body.replaceChildren();
    if(name==='Skills')skills(state);
    else if(name==='Status')status(state,characterItems(state));
    else inventory(state,characterItems(state));
  }
  const dismiss=()=>{
    if(dialog.open)return;
    poseFrame=null;
    if(pendingDraw)win.cancelAnimationFrame(pendingDraw);pendingDraw=0;
    if(retryDraw)win.clearTimeout(retryDraw);retryDraw=0;
    delete root.dataset.characterMenu;delete root.dataset.characterPortrait;
    portrait?.dispose();portrait=portraitScene=null;
    if(!disposed)onPause();
  };
  dialog.addEventListener('close',dismiss);
  const observer=new win.ResizeObserver(()=>invalidate());observer.observe(body);
  return {show,get open(){return dialog.open;},close(){if(dialog.open)dialog.close();},dispose(){
    if(disposed)return;disposed=true;observer.disconnect();
    if(dialog.open)dialog.close();dismiss();dialog.remove();
  }};
}
