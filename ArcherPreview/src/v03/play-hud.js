// In-game 0.3 HUD pieces: quest tracker, coaching hint, interaction prompt and
import {t} from './i18n.js';
// a short banner. Text nodes are written only when their value changes.
export function createPlayHud({doc,mount=doc.body,onInteract=()=>{}}){
 const make=(tag,className)=>{const node=doc.createElement(tag);node.className=className;return node;};
 const root=make('div','v03-hud');root.dataset.v03Hud='';
 const quest=make('section','v03-quest'),kicker=make('small','v03-quest-kicker'),title=make('strong','v03-quest-title'),objective=make('p','v03-quest-objective');
 kicker.textContent=t('hud.main');quest.append(kicker,title,objective);quest.hidden=true;
 // Two lines at most: what to do, then how (keys or touch control), each on one line.
 const hint=make('div','v03-hint'),hintWhat=make('strong','v03-hint-what'),hintHow=make('span','v03-hint-how');hint.append(hintWhat,hintHow);hint.hidden=true;
 // Interaction plate: key cap · name · action. The whole plate is the touch target.
 const prompt=make('button','v03-prompt');prompt.type='button';prompt.hidden=true;
 const promptKey=make('span','v03-prompt-key'),promptMark=make('span','v03-prompt-mark'),promptName=make('strong','v03-prompt-name'),promptAction=make('span','v03-prompt-action');
 const promptText=make('span','v03-prompt-text');promptText.append(promptName,promptAction);prompt.append(promptKey,promptText,promptMark);
 const banner=make('div','v03-banner');banner.hidden=true;
 // The banner is one-shot: once its animation ends it is hidden, so hiding
 // and showing the HUD (map loading) cannot replay the last message.
 banner.addEventListener('animationend',()=>{banner.classList.remove('is-shown');banner.hidden=true;});
 // Cutscene subtitle: speaker + line, bottom centre.
 const caption=make('div','v03-caption'),captionWho=make('strong','v03-caption-who'),captionText=make('p','v03-caption-text');caption.append(captionWho,captionText);caption.hidden=true;
 const tip=make('aside','v03-tip'),tipTitle=make('strong','v03-tip-title'),tipLead=make('p','v03-tip-lead'),tipText=make('p','v03-tip-text');
 tip.append(tipTitle,tipLead,tipText);tip.hidden=true;
 // A pulsing ring over the real game button a lesson is about (touch play).
 const ring=make('div','v03-ring');ring.hidden=true;
 root.append(quest,hint,banner,tip,prompt,ring,caption);mount.append(root);
 prompt.addEventListener('click',event=>{event.preventDefault();onInteract();});
 const last={title:null,objective:null,hint:null,hintHow:null,prompt:null,ring:null};
 return {
  element:root,
  setQuest(nextTitle,nextObjective){
   if(last.title===nextTitle&&last.objective===nextObjective)return;
   const changedStep=last.objective!==null&&last.objective!==nextObjective;
   last.title=nextTitle;last.objective=nextObjective;quest.hidden=!nextTitle;kicker.textContent=t('hud.main');title.textContent=nextTitle??'';objective.textContent=nextObjective??'';
   if(changedStep){quest.classList.remove('is-updated');void quest.offsetWidth;quest.classList.add('is-updated');}
  },
  setCaption(value){
   if(!value){caption.classList.remove('is-in');caption.hidden=true;return;}
   captionWho.textContent=value.who??'';captionWho.hidden=!value.who;captionText.textContent=value.text;caption.hidden=false;caption.classList.remove('is-in');void caption.offsetWidth;caption.classList.add('is-in');
  },
  // A new step pops in (scale + fade, compositor only). Called every frame:
  // two arguments, no joined string, DOM written only when either changes.
  setHint(text,how=null){
   if(last.hint===text&&last.hintHow===how)return;
   const fresh=last.hint!==text;last.hint=text;last.hintHow=how;hint.hidden=!text;hintWhat.textContent=text??'';hintHow.textContent=text&&how?how:'';hintHow.hidden=!(text&&how);
   if(text&&fresh)try{hint.animate?.([{opacity:0,transform:'translateX(-50%) scale(.86)'},{opacity:1,transform:'translateX(-50%) scale(1.06)',offset:.6},{opacity:1,transform:'translateX(-50%) scale(1)'}],{duration:420,easing:'ease-out'});}catch{}
  },
  // value: null | {key,name,action,label,mark:'?'|'!'|null}
  setPrompt(value){
   const id=value?`${value.key}|${value.name}|${value.action}|${value.mark}`:null;if(last.prompt===id)return;last.prompt=id;
   if(!value){prompt.classList.remove('is-in');prompt.hidden=true;return;}
   promptKey.textContent=value.key??'';promptKey.hidden=!value.key;promptName.textContent=value.name;promptAction.textContent=value.action;
   promptMark.textContent=value.mark??'';promptMark.hidden=!value.mark;promptMark.dataset.mark=value.mark??'';
   prompt.setAttribute('aria-label',value.label??`${value.name} ${value.action}`);
   prompt.hidden=false;prompt.classList.remove('is-in');void prompt.offsetWidth;prompt.classList.add('is-in');
  },
  // One-shot message (quest complete, saved). CSS runs the whole animation.
  flash(text){banner.textContent=text;banner.hidden=false;banner.classList.remove('is-shown');void banner.offsetWidth;banner.classList.add('is-shown');},
  // One-time tutorial card; pass null to hide it.
  setTip(value){
   if(!value){tip.hidden=true;tip.classList.remove('is-shown');return;}
   tipTitle.textContent=value.title;tipLead.textContent=value.lead;tipText.textContent=value.text??'';tip.hidden=false;tip.classList.remove('is-shown');void tip.offsetWidth;tip.classList.add('is-shown');
  },
  // Points at a game control. Layout is read once here, never per frame.
  setRing(selector){
   if(last.ring===selector)return;last.ring=selector;
   const target=selector?doc.querySelector(selector):null,box=target&&!target.hidden?target.getBoundingClientRect?.():null;
   if(!box||!box.width){ring.hidden=true;return;}
   const size=Math.max(box.width,box.height)+18;
   ring.style.width=ring.style.height=size+'px';ring.style.left=box.left+box.width/2-size/2+'px';ring.style.top=box.top+box.height/2-size/2+'px';ring.hidden=false;
  },
  dispose(){root.remove();},
 };
}
