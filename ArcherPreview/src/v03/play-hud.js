// In-game 0.3 HUD pieces: quest tracker, coaching hint, interaction prompt and
import {t} from './i18n.js';
// a short banner. Text nodes are written only when their value changes.
export function createPlayHud({doc,mount=doc.body,onInteract=()=>{}}){
 const make=(tag,className)=>{const node=doc.createElement(tag);node.className=className;return node;};
 const root=make('div','v03-hud');root.dataset.v03Hud='';
 const quest=make('section','v03-quest'),kicker=make('small','v03-quest-kicker'),title=make('strong','v03-quest-title'),objective=make('p','v03-quest-objective');
 kicker.textContent=t('hud.main');quest.append(kicker,title,objective);quest.hidden=true;
 const hint=make('div','v03-hint');hint.hidden=true;
 const prompt=make('button','v03-prompt');prompt.type='button';prompt.hidden=true;
 const banner=make('div','v03-banner');banner.hidden=true;
 // Cutscene subtitle: speaker + line, bottom centre.
 const caption=make('div','v03-caption'),captionWho=make('strong','v03-caption-who'),captionText=make('p','v03-caption-text');caption.append(captionWho,captionText);caption.hidden=true;
 const tip=make('aside','v03-tip'),tipTitle=make('strong','v03-tip-title'),tipLead=make('p','v03-tip-lead'),tipText=make('p','v03-tip-text');
 tip.append(tipTitle,tipLead,tipText);tip.hidden=true;
 // A pulsing ring over the real game button a lesson is about (touch play).
 const ring=make('div','v03-ring');ring.hidden=true;
 root.append(quest,hint,banner,tip,prompt,ring,caption);mount.append(root);
 prompt.addEventListener('click',event=>{event.preventDefault();onInteract();});
 const last={title:null,objective:null,hint:null,prompt:null,ring:null};
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
  setHint(text){if(last.hint===text)return;last.hint=text;hint.hidden=!text;hint.textContent=text??'';},
  setPrompt(text){if(last.prompt===text)return;last.prompt=text;prompt.hidden=!text;prompt.textContent=text??'';},
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
