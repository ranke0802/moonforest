// In-game 0.3 HUD pieces: quest tracker, coaching hint, interaction prompt and
import {t} from './i18n.js';
import {createInteractButton} from './interact-button.js';
import {releaseFocusAfterPointer} from './hud-focus.js';
import {createQuestPager,writeStep} from './quest-pages.js';
// a short banner. Text nodes are written only when their value changes.
// The focus-line picture: FOCUS_LINES wedges with their points toward the
// middle, in a fixed pseudo-random order (the same picture every visit).
// k: distance from the middle as a share of the way to the screen's edge.
const FOCUS_LINES=84;
// Seconds of calm after a fight before the folded quest panel opens again (setCombat).
export const COMBAT_CALM=1.6;
export function paintFocus(canvas){
 const ctx=canvas.getContext?.('2d');if(!ctx)return false;
 const w=canvas.width,h=canvas.height,cx=w/2,cy=h/2;let seed=20261120;
 const rand=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
 ctx.clearRect(0,0,w,h);
 for(let i=0;i<FOCUS_LINES;i++){
  const angle=(i+rand()*.9)/FOCUS_LINES*Math.PI*2,half=.0025+rand()*rand()*.016,tip=.6+rand()*.34,out=1.7;
  const ax=Math.cos(angle),ay=Math.sin(angle),bx=Math.cos(angle-half),by=Math.sin(angle-half),dx=Math.cos(angle+half),dy=Math.sin(angle+half);
  ctx.fillStyle='rgba(255,244,214,'+(.45+rand()*.5).toFixed(2)+')';
  ctx.beginPath();ctx.moveTo(cx+ax*cx*tip,cy+ay*cy*tip);ctx.lineTo(cx+bx*cx*out,cy+by*cy*out);ctx.lineTo(cx+dx*cx*out,cy+dy*cy*out);ctx.closePath();ctx.fill();
 }
 return true;
}
export function createPlayHud({doc,mount=doc.body,onInteract=()=>{},onQuestPage=()=>{}}){
 const make=(tag,className)=>{const node=doc.createElement(tag);node.className=className;return node;};
 const root=make('div','v03-hud');root.dataset.v03Hud='';
 const quest=make('section','v03-quest'),kicker=make('small','v03-quest-kicker'),title=make('strong','v03-quest-title'),objective=make('p','v03-quest-objective');
 kicker.textContent=t('hud.main');quest.hidden=true;
 // Pages (2026-11-27): the main quest, then each accepted errand (quest-pages.js).
 const mainPage=make('div','is-main');mainPage.append(kicker,title,objective);
 const pager=createQuestPager({doc,host:quest,mainPage,onPage:id=>onQuestPage(id)});
 // Why the target ahead does not open (a fight holds it, setPrompt blocked): one line under
 // the objective, where the player looks for what to do next (2026-11-27 player review).
 const held=make('p','v03-quest-held');held.hidden=true;quest.append(held);
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
 // Title plus one body paragraph clamped to two lines (v03.css): a guide card stays within three lines.
 const tip=make('aside','v03-tip'),tipTitle=make('strong','v03-tip-title'),tipBody=make('p','v03-tip-body'),tipLead=make('span','v03-tip-lead'),tipText=make('span','v03-tip-text');
 // The control line and the explanation each hold one line (2026-11-23, user: a bright line running
 // straight into the dim one looked uneven). Copy is written to fit one line each.
 tipBody.append(tipLead,tipText);tip.append(tipTitle,tipBody);tip.hidden=true;
 // Its one-shot animation over, the card is gone (the lesson line it stood in for comes back, v03.css).
 tip.addEventListener('animationend',event=>{if(event.target!==tip)return;tip.classList.remove('is-shown');tip.hidden=true;});
 // A pulsing ring over the real game button a lesson is about (touch play).
 const ring=make('div','v03-ring');ring.hidden=true;
 // A speech bubble over a speaker in the world (the driver's shouts). One
 // element, reused; the story moves it with the speaker (transform only).
 const bubble=make('div','v03-bubble'),bubbleBody=make('span','v03-bubble-body');bubble.append(bubbleBody);bubble.hidden=true;
 // Focus lines for the slow-motion beat (2026-11-20, user: light, a little
 // like a comic). One small canvas drawn once here, stretched over the screen:
 // wedges from the edge toward the middle, the middle left clear. Showing it
 // is a class: opacity and mirrored transforms only (v03.css), no frame work.
 const focus=make('canvas','v03-focus');focus.width=640;focus.height=360;focus.setAttribute('aria-hidden','true');paintFocus(focus);
 // The name of the place on arrival: one line between two ruled ornaments,
 // one-shot like the banner (opacity and transform only, v03.css).
 const place=make('div','v03-place'),placeName=make('strong','v03-place-name');place.append(make('i','v03-place-rule'),placeName,make('i','v03-place-rule'));place.hidden=true;
 place.addEventListener('animationend',event=>{if(event.target!==place)return;place.classList.remove('is-shown');place.hidden=true;});
 root.append(focus,quest,hint,banner,place,tip,prompt,ring,caption,bubble);mount.append(root);
 prompt.addEventListener('click',event=>{event.preventDefault();if(prompt.classList.contains('is-blocked'))return;onInteract();});
 // The prompt lives on <body> beside the game: a tap or click leaves no focus behind (hud-focus.js).
 const releasePrompt=releaseFocusAfterPointer(prompt);
 // Touch: the attack button stands in for the prompt while one can be acted on (interact-button.js).
 const interactButton=createInteractButton({doc,onInteract});
 const last={title:null,objective:null,hint:null,hintHow:null,prompt:null,ring:null,bubble:null,bubbleX:NaN,bubbleY:NaN};
 // Combat (2026-11-27 player review, 844×390: health, stamina, the quest and hit numbers
 // crowded the left side in a fight). Engaged, the quest folds to its one objective line
 // and the page strip steps aside (v03.css "Combat HUD"). It folds at once and opens again
 // COMBAT_CALM seconds after the last foe lets go, so a fight between two foes does not
 // flicker. One attribute on <html>, written only when it changes.
 const combat={on:false,calm:0},html=doc.documentElement;
 function writeCombat(on){combat.on=on;if(on)html.dataset.v03Combat='';else delete html.dataset.v03Combat;}
 return {
  element:root,
  setQuest(nextTitle,nextObjective){
   if(last.title===nextTitle&&last.objective===nextObjective)return;
   const changedStep=last.objective!==null&&last.objective!==nextObjective;
   last.title=nextTitle;last.objective=nextObjective;quest.hidden=!nextTitle;kicker.textContent=t('hud.main');title.textContent=nextTitle??'';writeStep(objective,nextObjective);
   if(changedStep){quest.classList.remove('is-updated');void quest.offsetWidth;quest.classList.add('is-updated');}
  },
  // The errand pages ([{id,title,step}] in accepted order, null: none) and the page
  // shown (an errand id, null: main). Returns the page actually shown.
  setQuestPages(errands,page=null){return pager.set(errands,page);},
  // A new errand was taken: the count line lights up, the page stays.
  pulseErrands(){pager.pulse();},
  get questPage(){return pager.page;},
  // Called every play frame: engaged (a foe is fighting the player), dt in seconds.
  setCombat(engaged,dt=0){
   if(engaged){combat.calm=COMBAT_CALM;if(!combat.on)writeCombat(true);return;}
   if(!combat.on)return;combat.calm-=dt;if(combat.calm<=0)writeCombat(false);
  },
  get combat(){return combat.on;},
  setCaption(value){
   // The prompt moves up out of a caption's way (v03.css).
   root.classList.toggle('has-caption',!!value);
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
  setFocus(on){on=!!on;if(last.focus===on)return;last.focus=on;focus.classList.toggle('is-on',on);},
  // The bubble's line (null hides it). A new line pops in.
  setBubble(text){
   if(last.bubble===text)return;last.bubble=text;bubble.hidden=!text;bubbleBody.textContent=text??'';
   if(!text){last.bubbleX=last.bubbleY=NaN;return;}
   try{bubbleBody.animate?.([{opacity:0,transform:'scale(.8)'},{opacity:1,transform:'scale(1.05)',offset:.6},{opacity:1,transform:'scale(1)'}],{duration:260,easing:'ease-out'});}catch{}
  },
  // Where the speaker's head is on screen (CSS pixels), kept inside the view
  // (width, height). Written only when it moved.
  moveBubble(x,y,width,height){
   const px=Math.round(Math.max(90,Math.min(width-90,x))),py=Math.round(Math.max(64,Math.min(height-40,y)));
   if(px===last.bubbleX&&py===last.bubbleY)return;last.bubbleX=px;last.bubbleY=py;
   bubble.style.transform=`translate3d(${px}px,${py}px,0)`;
  },
  // value: null | {key,name,action,label,mark:'?'|'!'|null,act:'talk'|'push'|null,blocked}
  // act: what a press does now (null: shown only, like waiting for the driver).
  // blocked: the target is there but a fight holds it (story.js, prompt.clearFoes): the
  // plate reads as shut (v03.css .is-blocked) and a press does nothing.
  setPrompt(value){
   const id=value?`${value.key}|${value.name}|${value.action}|${value.mark}|${value.act??''}|${value.blocked?1:''}`:null;if(last.prompt===id)return;last.prompt=id;
   interactButton.sync(value);
   if(!value){prompt.classList.remove('is-in');prompt.hidden=true;held.hidden=true;return;}
   const blocked=value.blocked===true;prompt.classList.toggle('is-blocked',blocked);
   held.hidden=!blocked;held.textContent=blocked?value.action:'';
   if(blocked)prompt.setAttribute('aria-disabled','true');else prompt.removeAttribute('aria-disabled');
   promptKey.textContent=value.key??'';promptKey.hidden=!value.key;promptName.textContent=value.name;promptAction.textContent=value.action;
   promptMark.textContent=value.mark??'';promptMark.hidden=!value.mark;promptMark.dataset.mark=value.mark??'';
   prompt.setAttribute('aria-label',value.label??`${value.name} ${value.action}`);
   prompt.hidden=false;prompt.classList.remove('is-in');void prompt.offsetWidth;prompt.classList.add('is-in');
  },
  // One-shot message (quest complete, saved). CSS runs the whole animation.
  flash(text){banner.textContent=text;banner.hidden=false;banner.classList.remove('is-shown');void banner.offsetWidth;banner.classList.add('is-shown');},
  showPlace(name){placeName.textContent=name;place.hidden=false;place.classList.remove('is-shown');void place.offsetWidth;place.classList.add('is-shown');},
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
  dispose(){if(combat.on)writeCombat(false);releasePrompt();interactButton.dispose();pager.dispose();root.remove();},
 };
}
