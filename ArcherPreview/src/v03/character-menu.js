import {bagContents,characterItems,combatSkills,PASSIVE_CELLS,SKILL_BRANCHES,SKILL_COLUMNS,SKILL_OPEN,SLOTS} from './character-menu-data.js';
import {PASSIVE_LIMITS,SKILL_REFUND_GOLD} from './character-progression.js';
import {createCharacterPortrait,PORTRAIT_PITCH} from './character-menu-camera.js';
import {createMountPage} from './character-mount-page.js';
import {mountMenuLabels} from './character-mount-locale.js';
import {orbitCamera} from '../input.js';
import {townEquipmentIcon,townItemIcon} from './town-item-art.js';
import {t,language,cloneChapter,localizeChapter} from './i18n.js';
import {COMBAT_HINTS,TIPS} from './data/chapter1.js';

// Page, filter and sort values are stable ids; the words come from t() at
// every show(), so a language change at the title applies on the next open.
const LESSONS=Object.freeze({COMBAT_HINTS,TIPS});
const SVG='http://www.w3.org/2000/svg';
const ORBIT_KEYS=new Map([['ArrowLeft',[-36,0]],['ArrowRight',[36,0]],['ArrowUp',[0,-36]],['ArrowDown',[0,36]]]);
// Line art for the three skill branches (the mockup's sword, shield and boot).
const BRANCH_ART=Object.freeze({
  sword:['M19 3l-9.5 9.5M9 11l4 4M5 19l3.5-3.5M19 3v3l-8 8-3-3 8-8z'],
  shield:['M12 3l7 2.5v5.5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V5.5z','M12 7v9M8.5 11h7'],
  footwork:['M9 4h5v9l5 3v4H9z','M9 16h10']
});

export function createCharacterMenu({root,read,equip,equipItem,registerItem,usePotion,subject,mount,onPause,learnSkill,refundSkills}){
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
  const tabs=['Status','Inventory','Skills','Mount'];
  const tabButtons=tabs.map(name=>button('',()=>show(name)));
  const gold=make('output','mf-menu-gold'),exit=button('×',requestClose);
  function relabel(){
    dialog.setAttribute('aria-label',t('char.aria'));nav.setAttribute('aria-label',t('char.pages'));
    tabs.forEach((name,i)=>{tabButtons[i].textContent=name==='Mount'?mountMenuLabels(language()).tab:t('char.tab.'+name);});
    exit.setAttribute('aria-label',t('dialogue.close'));exit.title=t('dialogue.close');
  }
  nav.append(...tabButtons,gold,exit);dialog.append(nav,body);root.append(dialog);
  const warriorView={alpha:0,beta:PORTRAIT_PITCH,zoom:1},horseView={alpha:-Math.PI*.37,beta:PORTRAIT_PITCH,zoom:1};
  let orbit=warriorView,mountPage=null,mountModel=null;
  let page='Status',filter='All',sort='Type',selected='',poseFrame=null;
  let pendingDraw=0,disposed=false,portrait=null,portraitScene=null,retryDraw=0,lessons=null,lessonLang='',skillPick='';
  const lang=()=>doc.documentElement.lang||'ko';
  function invalidate(){
    if(pendingDraw||!dialog.open||!poseFrame||(page!=='Status'&&page!=='Mount')||(page==='Mount'&&!mountModel))return;
    pendingDraw=win.requestAnimationFrame(()=>{
      pendingDraw=0;
      const live=subject();
      if(!live||!dialog.open||!poseFrame||doc.hidden)return;
      if(portraitScene!==live.scene){portrait?.dispose();portrait=createCharacterPortrait(live.scene);portraitScene=live.scene;}
      const model=page==='Mount'?mountModel:live;
      if(!model)return;
      let drawn;
      try{drawn=portrait.draw({camera:live.camera,canvasRect:live.canvasRect,actor:model.actor,meshes:model.meshes,height:model.height,width:model.width,
        frameRect:poseFrame.getBoundingClientRect(),turn:orbit.alpha,pitch:orbit.beta,zoom:orbit.zoom});}
      catch(error){if(page!=='Mount')throw error;mountPage?.fail();return;}
      if(drawn){root.dataset.characterPortrait='';mountPage?.drawn();}
      else if(!retryDraw){mountPage?.waiting();retryDraw=win.setTimeout(()=>{retryDraw=0;invalidate();},100);}
    });
  }
  function zoomBy(factor){orbit.zoom=Math.min(2.8,Math.max(1,orbit.zoom*factor));invalidate();}
  const icon=row=>townItemIcon(doc,row.tradeId??row.icon);
  function stat(list,label,value){
    const pair=make('div');pair.append(make('dt','',label),make('dd','',String(value)));list.append(pair);
  }
  function rotate(dx,dy){orbitCamera(orbit,dx,dy);invalidate();}
  function attachGestures(view){
    const touches=new Map();
    const camera=subject()?.camera;
    orbit.lowerBetaLimit=camera?.lowerBetaLimit;
    orbit.upperBetaLimit=camera?.upperBetaLimit;
    const span=()=>{const [a,b]=touches.values();return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};
    view.addEventListener('pointerdown',e=>{
      if(e.button!==0&&!(e.pointerType==='mouse'&&e.button===2))return;
      e.preventDefault();
      view.setPointerCapture(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    });
    view.addEventListener('contextmenu',e=>e.preventDefault());
    view.addEventListener('pointermove',e=>{
      const point=touches.get(e.pointerId);if(!point)return;
      const gap=span(),dx=e.clientX-point.x,dy=e.clientY-point.y;
      point.x=e.clientX;point.y=e.clientY;
      if(touches.size===1)rotate(dx,dy);
      else if(gap>5){const distance=span();if(distance>5)zoomBy(distance/gap);}
    });
    const end=e=>touches.delete(e.pointerId);
    for(const key of ['pointerup','pointercancel','lostpointercapture'])view.addEventListener(key,end);
    view.addEventListener('wheel',e=>{e.preventDefault();zoomBy(Math.exp(Math.max(-.3,Math.min(.3,-e.deltaY*.002))));},{passive:false});
    view.addEventListener('keydown',e=>{
      const delta=ORBIT_KEYS.get(e.key);
      if(delta){e.preventDefault();rotate(...delta);}
      else if(['+','=','-'].includes(e.key)){e.preventDefault();zoomBy(e.key==='-'?.86:1.16);}
    });
  }
  function portraitFrame(label){
    const frame=make('div','mf-menu-pose');frame.tabIndex=0;frame.setAttribute('role','group');frame.setAttribute('aria-label',label);
    attachGestures(frame);return frame;
  }
  function status(state,items){
    const stats=make('section','mf-menu-card mf-menu-stats'),details=make('dl');
    stats.append(make('h2','',t('char.warrior')),details);
    const progress=state.progression;
    if(progress){
      stat(details,t('char.progressLevel'),progress.level>=progress.cap?progress.level+' (MAX)':progress.level);
      stat(details,t('char.progressXp'),progress.level>=progress.cap?'MAX':progress.xp+' / '+progress.nextXp);
    }
    stat(details,t('char.health'),Math.ceil(state.hp)+' / '+state.maxHp);
    stat(details,t('char.stamina'),Math.ceil(state.stamina)+' / '+state.maxStamina);
    stat(details,t('char.attack'),'+'+state.attackBonus);stat(details,t('char.defense'),state.defense);
    stat(details,t('char.critical'),t('char.criticalRule'));
    poseFrame=portraitFrame(t('char.view'));
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
    const bagIcon=row=>row.level===undefined?icon(row):townEquipmentIcon(doc,row.tradeId,row.level);
    function inspect(row){
      selected=row?.id??'';detail.replaceChildren();
      for(const [id,node] of nodes)node.setAttribute('aria-pressed',String(id===selected));
      if(!row){detail.append(make('p','',t('char.empty')));return;}
      const category=make('small','',t('char.type.'+row.type)),title=make('h2','',row.name);
      const amount=row.quantity?make('small','mf-menu-quantity',t('shop.inBag',{n:row.quantity})):null;
      if(row.level!==undefined){
        const header=make('div','mf-equipment-card'),description=make('div');
        description.append(category,title);if(amount)description.append(amount);
        header.append(bagIcon(row),description);detail.append(header);
      }else{
        detail.append(category,bagIcon(row),title);if(amount)detail.append(amount);
      }
      if(row.broken)detail.append(make('p','mf-menu-break-note',t('char.repairAtSmith')));
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
      const tile=button('',()=>inspect(row));
      const labels=[row.level===0?row.name+' +0':row.name];
      if(row.worn)labels.push(t('char.equipped'));
      if(row.broken)labels.push(t('char.gearBroken'));
      if(row.quantity>1)labels.push(t('shop.inBag',{n:row.quantity}));
      tile.title=row.broken?row.name+' · '+t('char.gearBroken'):row.name;
      tile.setAttribute('aria-label',labels.join(' · '));
      if(row.broken)tile.dataset.broken='';
      if(row.level!==undefined)tile.className='mf-menu-gear-tile';
      tile.append(bagIcon(row));
      if(row.worn)tile.append(make('small','mf-menu-worn','✓'));
      if(row.quantity&&(!row.worn||row.quantity>1)){
        const count=make('small','mf-menu-count',String(row.quantity));
        if(row.level!==undefined&&row.quantity>99)count.classList.add('is-large');
        tile.append(count);
      }
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
    const list=combatSkills(lessons,state.touch,state.allows),progress=state.progression;
    if(progress)for(const passive of PASSIVE_CELLS){
      const rank=progress.skills[passive.id],limit=PASSIVE_LIMITS[passive.id];
      list.push({...passive,name:t('char.skill.'+passive.id),rank,limit,need:[],available:rank>0});
    }
    const byId=new Map(list.map(skill=>[skill.id,skill]));
    const rows=SKILL_BRANCHES.length*2;
    const tree=make('section','mf-menu-card mf-skill-tree'),detail=make('section','mf-menu-card mf-skill-detail');
    tree.setAttribute('aria-label',t('char.skill.tree'));
    const branches=make('div','mf-skill-branches');
    for(const branch of SKILL_BRANCHES)branches.append(make('span','',t('char.branch.'+branch)));
    if(progress){
      const bar=make('div','mf-skill-training');
      const points=make('output','',t('char.skill.points',{n:progress.points}));
      const reset=button(t('char.skill.reset',{gold:SKILL_REFUND_GOLD}),()=>{
        if(!bar.isConnected||reset.disabled)return;
        const confirm=button(t('confirm.ok'),()=>{
          if(!confirm.isConnected||confirm.disabled||!dialog.open)return;
          confirm.disabled=true;
          const saved=refundSkills();
          show('Skills');
          if(!saved)trainingMessage(t('toast.failed'));
          treeFocus();
        });
        const cancel=button(t('confirm.cancel'),()=>{bar.replaceChildren(points,reset);reset.focus();});
        bar.replaceChildren(make('span','',t('char.skill.refundConfirm',{n:progress.spent,gold:SKILL_REFUND_GOLD})),confirm,cancel);
        cancel.focus();
      });
      reset.disabled=!refundSkills||progress.spent===0||state.gold<SKILL_REFUND_GOLD;
      bar.append(points,reset);tree.classList.add('has-training');tree.append(bar);
    }
    function treeFocus(){
      body.querySelector('.mf-skill-node[aria-pressed=true]')?.focus();
    }
    function trainingMessage(message){
      const notice=make('p','',message);notice.setAttribute('role','status');body.querySelector('.mf-skill-detail')?.append(notice);
    }
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
      const passive=skill.rank!==undefined;
      for(const tag of [t('char.branch.'+skill.branch),t(passive?'char.skill.passive':'char.skill.basic')])tags.append(make('i','',tag));
      title.append(make('h2','',skill.name),tags);head.append(branchIcon(skill.branch),title);
      if(passive){
        const rank=make('p','mf-skill-rank',t('char.skill.rank',{rank:skill.rank,max:skill.limit}));
        const effect=make('p','',t('char.skillText.'+skill.id));
        const learn=button(t(skill.rank>=skill.limit?'char.skill.mastered':'char.skill.invest'),()=>{
          if(!learn.isConnected||learn.disabled||!dialog.open)return;
          learn.disabled=true;
          const saved=learnSkill(skill.id);
          show('Skills');
          if(!saved)trainingMessage(t('toast.failed'));
          const next=body.querySelector('.mf-skill-invest');
          if(next&&!next.disabled)next.focus();else treeFocus();
        });
        learn.className='mf-skill-invest';
        learn.disabled=!learnSkill||skill.rank>=skill.limit||progress.points<1;
        detail.append(head,rank,effect,learn);
        return;
      }
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
      const state=skill.rank!==undefined?t('char.skill.rank',{rank:skill.rank,max:skill.limit}):t(skill.available?'char.skill.ready':'char.skill.lockedShort');
      const node=button('',()=>inspect(skill)),label=make('span');
      node.className='mf-skill-node '+(skill.available?'is-ready':skill.rank!==undefined?'is-trainable':'is-locked');node.style.gridArea=skill.row+' / '+skill.col;
      node.setAttribute('aria-label',skill.name+', '+state);
      label.append(make('b','',skill.name),make('em','',state));node.append(branchIcon(skill.branch),label);
      nodes.set(skill.id,node);grid.append(node);
    }
    for(const [row,col] of SKILL_OPEN){
      if(progress&&PASSIVE_CELLS.some(skill=>skill.row===row&&skill.col===col))continue;
      const slot=make('i','mf-skill-node is-open',t('char.skill.later'));slot.style.gridArea=row+' / '+col;
      slot.setAttribute('aria-hidden','true');grid.append(slot);
    }
    tree.append(branches,grid);body.append(tree,detail);
    inspect(byId.get(skillPick)??byId.get('weaponCare')??list[0]);
  }
  function show(name){
    if(disposed)return;
    clearMount();page=name;poseFrame=null;delete root.dataset.characterPortrait;relabel();
    if(!dialog.open){
      filter='All';Object.assign(warriorView,{alpha:0,beta:PORTRAIT_PITCH,zoom:1});
      Object.assign(horseView,{alpha:-Math.PI*.37,beta:PORTRAIT_PITCH,zoom:1});dialog.showModal();root.dataset.characterMenu='';onPause();
    }
    orbit=name==='Mount'?horseView:warriorView;
    const state=read();
    gold.textContent=state.gold.toLocaleString(lang())+' G';dialog.dataset.page=name;
    for(let i=0;i<tabs.length;i++)tabButtons[i].setAttribute('aria-pressed',String(tabs[i]===name));
    body.replaceChildren();
    if(name==='Skills')skills(state);
    else if(name==='Status')status(state,characterItems(state));
    else if(name==='Mount'){
      const labels=mountMenuLabels(language());poseFrame=portraitFrame(labels.view);
      mountPage=createMountPage({body,dialog,wardrobe:mount?.(),make,button,stat,frame:poseFrame,labels,locale:lang(),
        scene:subject()?.scene,onSceneEnd:requestClose,rotate,zoomBy,onPreview:model=>{
          mountModel=model;
          if(model)invalidate();
          else{delete root.dataset.characterPortrait;portrait?.dispose();portrait=portraitScene=null;}
        },invalidate,retry:()=>show('Mount')});
    }else inventory(state,characterItems(state));
  }
  function clearMount(){
    if(!mountPage)return;
    const previous=mountPage;mountPage=null;mountModel=null;poseFrame=null;
    if(pendingDraw)win.cancelAnimationFrame(pendingDraw);pendingDraw=0;
    if(retryDraw)win.clearTimeout(retryDraw);retryDraw=0;
    previous.close();portrait?.dispose();portrait=portraitScene=null;
  }
  function requestClose(){clearMount();if(dialog.open)dialog.close();}
  dialog.addEventListener('cancel',e=>{if(e.target===dialog)clearMount();});
  const dismiss=()=>{
    if(dialog.open)return;
    clearMount();poseFrame=null;
    if(pendingDraw)win.cancelAnimationFrame(pendingDraw);pendingDraw=0;
    if(retryDraw)win.clearTimeout(retryDraw);retryDraw=0;
    delete root.dataset.characterMenu;delete root.dataset.characterPortrait;
    portrait?.dispose();portrait=portraitScene=null;
    if(!disposed)onPause();
  };
  dialog.addEventListener('close',dismiss);
  const observer=new win.ResizeObserver(()=>invalidate());observer.observe(body);
  return {show,get open(){return dialog.open;},close:requestClose,dispose(){
    if(disposed)return;disposed=true;observer.disconnect();
    requestClose();dismiss();dialog.remove();
  }};
}
