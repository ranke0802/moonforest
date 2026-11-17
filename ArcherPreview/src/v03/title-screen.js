// Title screen DOM. Opacity/transform transitions only; no per-frame work.
const MENU=[['new','새로하기'],['load','불러오기'],['gallery','갤러리'],['settings','설정'],['quit','끝내기']];
const el=(doc,tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
export function formatPlayTime(seconds){
 const total=Math.max(0,Math.floor(Number(seconds)||0)),h=Math.floor(total/3600),m=Math.floor(total%3600/60);
 return h?`${h}시간 ${m}분`:`${m}분`;
}
export function slotSummary(meta){
 if(!meta?.used)return {title:'빈 기록',detail:'새로운 여정을 시작합니다'};
 return {title:`${meta.chapter||1}장 · ${meta.title||'여정'}`,detail:[meta.place,`Lv.${meta.level||1}`,formatPlayTime(meta.playSeconds)].filter(Boolean).join(' · ')};
}
export function createTitleScreen({doc,mount=doc.body,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onAction=()=>{},version='MoonForest 0.3'}){
 const layer=el(doc,'section','v03-title');layer.hidden=true;layer.dataset.v03Layer='title';layer.setAttribute('aria-label','MoonForest 시작 화면');
 const shade=el(doc,'div','v03-title-shade'),inner=el(doc,'div','v03-title-inner');
 const head=el(doc,'header','v03-title-head');
 head.append(el(doc,'p','v03-title-kicker','비탄의 마녀'),el(doc,'h1','v03-title-logo','MOONFOREST'),el(doc,'p','v03-title-sub','인연의 식탁 · 제1막'));
 const menu=el(doc,'nav','v03-menu');menu.setAttribute('aria-label','시작 메뉴');
 const buttons=new Map();
 for(const [id,label] of MENU){const button=el(doc,'button','v03-menu-item',label);button.type='button';button.dataset.action=id;menu.append(button);buttons.set(id,button);}
 const foot=el(doc,'footer','v03-title-foot',`${version} · HYProduct`);
 inner.append(head,menu,foot);
 const panel=el(doc,'div','v03-panel');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 const black=el(doc,'div','v03-title-black');
 layer.append(shade,inner,panel,black);mount.append(layer);
 let disposed=false,panelClose=null,lastFocus=null;
 const focusFirst=()=>{const target=[...buttons.values()].find(button=>!button.disabled);target?.focus?.({preventScroll:true});};
 function closePanel(result=null){
  if(panel.hidden)return;panel.hidden=true;panel.replaceChildren();layer.classList.remove('has-panel');
  const done=panelClose;panelClose=null;lastFocus?.focus?.({preventScroll:true});lastFocus=null;done?.(result);
 }
 function openPanel(build){
  closePanel(null);
  return new Promise(resolve=>{
   panelClose=resolve;lastFocus=doc.activeElement;panel.replaceChildren();
   const box=el(doc,'div','v03-panel-box');build(box,closePanel);panel.append(box);panel.hidden=false;layer.classList.add('has-panel');
   box.querySelector('button:not([disabled])')?.focus?.({preventScroll:true});
  });
 }
 menu.addEventListener('click',event=>{
  const button=event.target.closest?.('button[data-action]');
  if(!button||button.disabled||disposed||!panel.hidden||layer.classList.contains('is-leaving'))return;
  onAction(button.dataset.action);
 });
 layer.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!panel.hidden){event.preventDefault();closePanel(null);return;}
  if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
  const scope=panel.hidden?menu:panel,items=[...scope.querySelectorAll('button:not([disabled])')];if(!items.length)return;
  event.preventDefault();const at=items.indexOf(doc.activeElement),next=(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
  items[at<0?0:next].focus?.({preventScroll:true});
 });
 return {
  element:layer,
  get visible(){return !layer.hidden;},
  show(){if(disposed)return;layer.hidden=false;layer.classList.remove('is-leaving');void layer.offsetWidth;layer.classList.add('is-shown');focusFirst();},
  // The scene behind becomes visible only once it is really ready.
  setSceneReady(value){layer.classList.toggle('scene-ready',!!value);},
  setEnabled(action,enabled){const button=buttons.get(action);if(button)button.disabled=!enabled;},
  // Fades the whole screen to black, then hides the layer. The caller swaps
  // the stage while it is black.
  async leave(){
   if(disposed||layer.hidden)return;closePanel(null);layer.classList.add('is-leaving');await wait(700);
  },
  hide(){layer.hidden=true;layer.classList.remove('is-shown','is-leaving');},
  // Returns the chosen slot number, or null.
  chooseSlot({mode,index,bootSlot}){
   return openPanel((box,close)=>{
    box.append(el(doc,'h2','v03-panel-title',mode==='new'?'새로하기':'불러오기'));
    box.append(el(doc,'p','v03-panel-note',mode==='new'?'기록할 자리를 고르세요.':'이어서 할 기록을 고르세요.'));
    const list=el(doc,'div','v03-slots');
    for(const meta of index){
     const summary=slotSummary(meta),button=el(doc,'button','v03-slot');button.type='button';button.dataset.slot=String(meta.slot);
     button.disabled=mode==='load'&&!meta.used;
     button.append(el(doc,'span','v03-slot-number',String(meta.slot)),el(doc,'strong','v03-slot-title',summary.title),el(doc,'small','v03-slot-detail',summary.detail));
     if(meta.slot===bootSlot&&meta.used)button.classList.add('is-current');
     button.addEventListener('click',()=>close(meta.slot));list.append(button);
    }
    const back=el(doc,'button','v03-panel-back','돌아가기');back.type='button';back.addEventListener('click',()=>close(null));
    box.append(list,back);
   });
  },
  confirm({title,message,accept='확인',cancel='취소'}){
   return openPanel((box,close)=>{
    box.classList.add('is-confirm');box.append(el(doc,'h2','v03-panel-title',title),el(doc,'p','v03-panel-note',message));
    const row=el(doc,'div','v03-panel-actions'),no=el(doc,'button','v03-panel-back',cancel),yes=el(doc,'button','v03-panel-accept',accept);
    no.type=yes.type='button';no.addEventListener('click',()=>close(false));yes.addEventListener('click',()=>close(true));row.append(yes,no);box.append(row);
   }).then(value=>value===true);
  },
  showGallery({sections}){
   return openPanel((box,close)=>{
    box.append(el(doc,'h2','v03-panel-title','갤러리'));
    const list=el(doc,'div','v03-gallery');
    for(const section of sections){
     const row=el(doc,'div','v03-gallery-row');row.append(el(doc,'strong','',section.label),el(doc,'small','',`${section.unlocked} / ${section.total}`));
     if(!section.unlocked)row.classList.add('is-locked');list.append(row);
    }
    box.append(list,el(doc,'p','v03-panel-note','여정에서 본 장면과 만난 존재가 이곳에 기록됩니다.'));
    const back=el(doc,'button','v03-panel-back','돌아가기');back.type='button';back.addEventListener('click',()=>close(null));box.append(back);
   });
  },
  closePanel:()=>closePanel(null),
  dispose(){if(disposed)return;disposed=true;closePanel(null);layer.remove();},
 };
}
