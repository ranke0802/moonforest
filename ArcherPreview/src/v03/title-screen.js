// Title screen DOM. Opacity/transform transitions only; no per-frame work.
import {t} from './i18n.js';
const MENU=['new','load','gallery','settings','quit'];
const el=(doc,tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
export function formatPlayTime(seconds){
 const total=Math.max(0,Math.floor(Number(seconds)||0)),h=Math.floor(total/3600),m=Math.floor(total%3600/60);
 return h?t('time.hm',{h,m}):t('time.m',{m});
}
// describe(meta) → {title,place} in the current language (saved records keep
// language-free keys; the Korean text stored beside them is the fallback).
export function slotSummary(meta,describe=null){
 if(!meta?.used)return {title:t('slot.empty'),detail:t('slot.emptyDetail')};
 const text=describe?.(meta)??{};
 return {title:t('slot.title',{chapter:meta.chapter||1,title:text.title||meta.title||t('slot.journey')}),detail:[text.place??meta.place,`Lv.${meta.level||1}`,formatPlayTime(meta.playSeconds)].filter(Boolean).join(' · ')};
}
export function createTitleScreen({doc,mount=doc.body,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onAction=()=>{},version='MoonForest 0.3',describe=null}){
 const layer=el(doc,'section','v03-title');layer.hidden=true;layer.dataset.v03Layer='title';
 const shade=el(doc,'div','v03-title-shade'),inner=el(doc,'div','v03-title-inner');
 const head=el(doc,'header','v03-title-head');
 const kicker=el(doc,'p','v03-title-kicker'),sub=el(doc,'p','v03-title-sub');
 head.append(kicker,el(doc,'h1','v03-title-logo','MOONFOREST'),sub);
 const menu=el(doc,'nav','v03-menu');
 const buttons=new Map();
 for(const id of MENU){const button=el(doc,'button','v03-menu-item');button.type='button';button.dataset.action=id;menu.append(button);buttons.set(id,button);}
 const foot=el(doc,'footer','v03-title-foot',`${version} · HYProduct`);
 inner.append(head,menu,foot);
 const panel=el(doc,'div','v03-panel');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 const black=el(doc,'div','v03-title-black');
 layer.append(shade,inner,panel,black);mount.append(layer);
 // All visible words come from the language pack; relabel() reapplies them.
 function label(){
  layer.setAttribute('aria-label',t('title.aria'));layer.dataset.drawing=t('title.drawing');menu.setAttribute('aria-label',t('title.menu'));
  kicker.textContent=t('title.kicker');sub.textContent=t('title.sub');
  for(const [id,button] of buttons)button.textContent=t('menu.'+id);
 }
 label();
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
  relabel:label,
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
    box.append(el(doc,'h2','v03-panel-title',t(mode==='new'?'menu.new':'menu.load')));
    box.append(el(doc,'p','v03-panel-note',t(mode==='new'?'panel.newNote':'panel.loadNote')));
    const list=el(doc,'div','v03-slots');
    for(const meta of index){
     const summary=slotSummary(meta,describe),button=el(doc,'button','v03-slot');button.type='button';button.dataset.slot=String(meta.slot);
     button.disabled=mode==='load'&&!meta.used;
     button.append(el(doc,'span','v03-slot-number',String(meta.slot)),el(doc,'strong','v03-slot-title',summary.title),el(doc,'small','v03-slot-detail',summary.detail));
     if(meta.slot===bootSlot&&meta.used)button.classList.add('is-current');
     button.addEventListener('click',()=>close(meta.slot));list.append(button);
    }
    const back=el(doc,'button','v03-panel-back',t('panel.back'));back.type='button';back.addEventListener('click',()=>close(null));
    box.append(list,back);
   });
  },
  confirm({title,message,accept=t('confirm.ok'),cancel=t('confirm.cancel')}){
   return openPanel((box,close)=>{
    box.classList.add('is-confirm');box.append(el(doc,'h2','v03-panel-title',title),el(doc,'p','v03-panel-note',message));
    const row=el(doc,'div','v03-panel-actions'),no=el(doc,'button','v03-panel-back',cancel),yes=el(doc,'button','v03-panel-accept',accept);
    no.type=yes.type='button';no.addEventListener('click',()=>close(false));yes.addEventListener('click',()=>close(true));row.append(yes,no);box.append(row);
   }).then(value=>value===true);
  },
  showGallery({sections}){
   return openPanel((box,close)=>{
    box.append(el(doc,'h2','v03-panel-title',t('gallery.title')));
    const list=el(doc,'div','v03-gallery');
    for(const section of sections){
     const row=el(doc,'div','v03-gallery-row');row.append(el(doc,'strong','',section.label),el(doc,'small','',`${section.unlocked} / ${section.total}`));
     if(!section.unlocked)row.classList.add('is-locked');list.append(row);
    }
    box.append(list,el(doc,'p','v03-panel-note',t('gallery.note')));
    const back=el(doc,'button','v03-panel-back',t('panel.back'));back.type='button';back.addEventListener('click',()=>close(null));box.append(back);
   });
  },
  // Settings: language list (current one marked) and the game's own settings.
  // Resolves {language:id} | {game:true} | null.
  showSettings({languages,current}){
   return openPanel((box,close)=>{
    box.append(el(doc,'h2','v03-panel-title',t('settings.title')),el(doc,'p','v03-panel-note',t('settings.language')));
    const list=el(doc,'div','v03-slots v03-languages');
    for(const language of languages){
     const button=el(doc,'button','v03-slot v03-language',language.label);button.type='button';button.lang=language.html;button.dataset.language=language.id;
     if(language.id===current){button.classList.add('is-current');button.setAttribute('aria-current','true');}
     button.addEventListener('click',()=>close(language.id===current?null:{language:language.id}));list.append(button);
    }
    const game=el(doc,'button','v03-slot v03-settings-game',t('settings.game'));game.type='button';game.addEventListener('click',()=>close({game:true}));
    const back=el(doc,'button','v03-panel-back',t('panel.back'));back.type='button';back.addEventListener('click',()=>close(null));
    box.append(list,el(doc,'p','v03-panel-note',t('settings.languageNote')),game,back);
   });
  },
  closePanel:()=>closePanel(null),
  dispose(){if(disposed)return;disposed=true;closePanel(null);layer.remove();},
 };
}
