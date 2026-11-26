// Title screen DOM. Opacity/transform transitions only; no per-frame work.
import {t} from './i18n.js';
import {chapterPanel,chapterWords} from './chapter-select.js';
import {createDrawingVeil} from './drawing-veil.js';
const MENU=['new','load','gallery','settings','quit'];
// Set once the title's world has been fully drawn on this browser.
export const WORLD_DRAWN_KEY='moonforest:world-drawn:v1';
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
 // While the scene is drawn behind the black: the cosmic cut seen by the pointer's light, and progress.
 // A world drawn once before (kept in the browser) is "unfolded" the next time.
 const drawnBefore=(()=>{try{return doc.defaultView?.localStorage?.getItem(WORLD_DRAWN_KEY)==='1';}catch{return false;}})();
 const veil=createDrawingVeil({doc,mount:layer,first:!drawnBefore,label:first=>t(first?'title.drawingFirst':'title.drawingAgain'),memory:()=>t('title.drawingMemory'),left:n=>t('title.drawingLeft',{n})});
 layer.insertBefore(veil.element,inner);
 // All visible words come from the language pack; relabel() reapplies them.
 function label(){
  layer.setAttribute('aria-label',t('title.aria'));layer.dataset.drawing=t('title.drawing');veil?.relabel();menu.setAttribute('aria-label',t('title.menu'));
  kicker.textContent=t('title.kicker');sub.textContent=t('title.sub');
  // 새로하기 / 불러오기 (user, 2026-11-24 21:07): both go slot → chapter.
  for(const [id,button] of buttons)button.textContent=t('menu.'+id);
 }
 label();
 let disposed=false,panelClose=null,lastFocus=null;
 // 2026-11-20 (user): no entry is boxed when the title comes up. The box and
 // its marker show once the menu is moved with the keys (arrows, or W/S; A/D
 // and left/right only wake it), and go again when the pointer takes over.
 // The layer itself holds the focus until then, so the keys reach it.
 layer.tabIndex=-1;
 const NAV={ArrowDown:1,ArrowUp:-1,KeyS:1,KeyW:-1,ArrowRight:0,ArrowLeft:0,KeyD:0,KeyA:0};
 const focusFirst=()=>{layer.classList.remove('is-keyed');layer.focus?.({preventScroll:true});};
 const unkey=()=>{if(layer.classList.contains('is-keyed'))layer.classList.remove('is-keyed');};
 layer.addEventListener('pointermove',unkey);layer.addEventListener('pointerdown',unkey);
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
 // Heard on the document: the game canvas takes the focus once the scene is
 // up (seen 2026-11-20), and the keys would never reach the layer.
 const onKey=event=>{
  if(disposed||layer.hidden||layer.classList.contains('is-leaving')||doc.querySelector('dialog[open]'))return;
  const tag=event.target?.tagName;if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA')return;
  if(event.key==='Escape'&&!panel.hidden){event.preventDefault();closePanel(null);return;}
  const step=NAV[event.code]??NAV[event.key];if(step===undefined||event.ctrlKey||event.metaKey||event.altKey)return;
  const scope=panel.hidden?menu:panel,items=[...scope.querySelectorAll('button:not([disabled])')];if(!items.length)return;
  event.preventDefault();layer.classList.add('is-keyed');
  // Nothing marked yet: the first press marks the first entry.
  const at=items.indexOf(doc.activeElement),next=(at+step+items.length)%items.length;
  items[at<0?0:next].focus?.({preventScroll:true});
 };
 doc.addEventListener('keydown',onKey);
 return {
  element:layer,
  get visible(){return !layer.hidden;},
  relabel:label,
  show(){if(disposed)return;layer.hidden=false;layer.classList.remove('is-leaving');void layer.offsetWidth;layer.classList.add('is-shown');if(!layer.classList.contains('scene-ready'))veil.start();focusFirst();},
  // The scene behind becomes visible only once it is really ready.
  setSceneReady(value){layer.classList.toggle('scene-ready',!!value);if(value){veil.setProgress(1,0);veil.stop();try{doc.defaultView?.localStorage?.setItem(WORLD_DRAWN_KEY,'1');}catch{/* told again next time */}}},
  // Preparation progress for the black title (ratio 0..1, things still being prepared).
  setProgress(ratio,remaining){veil.setProgress(ratio,remaining);},
  get veil(){return veil;},
  setEnabled(action,enabled){const button=buttons.get(action);if(button)button.disabled=!enabled;},
  // Fades the whole screen to black, then hides the layer. The caller swaps
  // the stage while it is black.
  async leave(){
   if(disposed||layer.hidden)return;closePanel(null);layer.classList.add('is-leaving');await wait(700);
  },
  hide(){layer.hidden=true;layer.classList.remove('is-shown','is-leaving');},
  chooseChapter(options){return openPanel((box,close)=>chapterPanel({doc,box,close,...options}));},
  // Returns the chosen slot number, or null. With `transfer`, filled slots
  // offer export and empty ones restore: those resolve {transfer,slot}.
  chooseSlot({mode,index,bootSlot,transfer=false,notice=null}){
   return openPanel((box,close)=>{
    box.append(el(doc,'h2','v03-panel-title',mode==='chapters'?chapterWords().menu:t(mode==='new'?'menu.new':'menu.load')));
    if(mode!=='chapters')box.append(el(doc,'p','v03-panel-note',t(mode==='new'?'panel.newNote':'panel.loadNote')));
    if(notice?.text){const line=el(doc,'p','v03-transfer-notice'+(notice.tone==='error'?' is-error':''),notice.text);line.setAttribute('role',notice.tone==='error'?'alert':'status');box.append(line);}
    const list=el(doc,'div','v03-slots');
    for(const meta of index){
     const summary=slotSummary(meta,describe),button=el(doc,'button','v03-slot');button.type='button';button.dataset.slot=String(meta.slot);
     button.disabled=mode==='load'&&!meta.used;
     button.append(el(doc,'span','v03-slot-number',String(meta.slot)),el(doc,'strong','v03-slot-title',summary.title),el(doc,'small','v03-slot-detail',mode==='load'&&!meta.used?t('slot.none'):summary.detail));
     if(meta.slot===bootSlot&&meta.used)button.classList.add('is-current');
     button.addEventListener('click',()=>close(meta.slot));
     if(transfer&&mode!=='chapters'){
      const kind=meta.used?'export':'restore',row=el(doc,'div','v03-slot-row'),act=el(doc,'button','v03-slot-transfer',t('transfer.'+kind));
      act.type='button';act.dataset.transfer=kind;act.dataset.transferSlot=String(meta.slot);act.setAttribute('aria-label',t('transfer.'+kind+'Aria',{slot:meta.slot}));
      act.addEventListener('click',()=>close({transfer:kind,slot:meta.slot}));row.append(button,act);list.append(row);
     }else list.append(button);
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
     const row=el(doc,'section','v03-gallery-row');row.dataset.category=section.id;
     row.append(el(doc,'strong','',section.label));
     if(section.note)row.append(el(doc,'small','',section.note));
     else{
      row.append(el(doc,'small','',`${section.entries.length} / ${section.total}`));
      if(section.entries.length){
       const entries=el(doc,'ul','v03-gallery-entries');
       for(const entry of section.entries){
        const item=el(doc,'li');
        if(entry.image){const image=el(doc,'img');image.alt='';image.loading='lazy';image.src=entry.image;item.append(image);}
        item.append(el(doc,'span','',entry.label));entries.append(item);
       }
       row.append(entries);
      }else row.classList.add('is-locked');
     }
     list.append(row);
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
     // Pressed, chosen state first; the reload follows a moment later.
     button.addEventListener('click',async()=>{if(language.id===current){close(null);return;}if(list.classList.contains('is-done'))return;list.classList.add('is-done');button.classList.add('is-chosen');await wait(550);close({language:language.id});});list.append(button);
    }
    const game=el(doc,'button','v03-slot v03-settings-game',t('settings.game'));game.type='button';game.addEventListener('click',()=>close({game:true}));
    const back=el(doc,'button','v03-panel-back',t('panel.back'));back.type='button';back.addEventListener('click',()=>close(null));
    box.append(list,el(doc,'p','v03-panel-note',t('settings.languageNote')),game,back);
   });
  },
  // A panel in the title's own look (save-transfer.js builds its steps here).
  panel:build=>openPanel(build),
  // One calm line under the menu (null removes it).
  setNotice(text){
   let line=inner.querySelector('.v03-title-notice');
   if(!text){line?.remove();return;}
   if(!line){line=el(doc,'p','v03-title-notice');line.setAttribute('role','status');inner.insertBefore(line,foot);}
   if(line.textContent!==text)line.textContent=text;
  },
  closePanel:()=>closePanel(null),
  dispose(){if(disposed)return;disposed=true;doc.removeEventListener('keydown',onKey);closePanel(null);veil.dispose();layer.remove();},
 };
}
