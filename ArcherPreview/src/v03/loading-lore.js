// What the map loading screen says (0.3, 2026-11-20, user): the name of the
// place the art shows with a line or two about it, and above the progress
// line one tip at a time: how to play, or a hint of the story. A tap on the
// tip shows the next one. The order is shuffled once per visit, so tips do
// not repeat until all were shown.
// The loading card (#loading) stays the shared one: this only adds two small
// blocks to it and follows its state (shown/hidden, which place) with one
// observer. The words wait for the picture (data-art, 2026-11-20 user: text
// came up on black before the art). Text comes from the UI locale (load.*). Only opacity and
// transform of these small blocks animate (v03.css).
export const LOAD_PLACES=Object.freeze(['village','great-plains','monster-forest','witch-cave']);
export const LOAD_TIPS=Object.freeze(['combo','justGuard','sprint','stamina','potion','guide','rest','beast','heavy','dodge']);
export const LOAD_STORIES=Object.freeze(['elena','remember','joachim','eyes','water','ledger','trust','fence']);

export function shuffled(count,random=Math.random){
 const order=Array.from({length:count},(_,i)=>i);
 for(let i=count-1;i>0;i--){const j=Math.floor(random()*(i+1)),keep=order[i];order[i]=order[j];order[j]=keep;}
 return order;
}

export function createLoadingLore({doc,t,random=Math.random,Observer=doc.defaultView?.MutationObserver}){
 const overlay=doc.getElementById('loading'),info=doc.getElementById('loading-info');
 if(!overlay||overlay.querySelector('.v03-lore'))return null;
 const make=(tag,className,text)=>{const node=doc.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
 const lore=make('section','v03-lore'),place=make('h2','v03-lore-place'),about=make('p','v03-lore-about');
 lore.append(place,about);lore.hidden=true;
 const tip=make('button','v03-loadtip'),kind=make('span','v03-loadtip-kind'),text=make('span','v03-loadtip-text'),next=make('span','v03-loadtip-next','▸');
 tip.type='button';tip.dataset.ui='';next.setAttribute('aria-hidden','true');tip.append(kind,text,next);tip.hidden=true;
 if(info)info.before(lore,tip);else overlay.append(lore,tip);
 // The deck: every tip and story hint once, in a shuffled order.
 const deck=[...LOAD_TIPS.map(id=>['tip',id]),...LOAD_STORIES.map(id=>['story',id])];
 let order=shuffled(deck.length,random),at=-1,shownPlace=null,visible=false;
 function showNext(){
  at++;if(at>=order.length){order=shuffled(deck.length,random);at=0;}
  const card=deck[order[at]];
  kind.textContent=t(card[0]==='tip'?'load.tipLabel':'load.storyLabel');text.textContent=t('load.'+card[0]+'.'+card[1]);
  tip.dataset.kind=card[0];tip.setAttribute('aria-label',t('load.next'));
  // Restart the small fade for the new line.
  tip.classList.remove('is-in');void tip.offsetWidth;tip.classList.add('is-in');
 }
 function sync(){
  const error=overlay.classList.contains('error'),id=overlay.dataset.place??null,known=id&&LOAD_PLACES.includes(id),show=!overlay.hidden&&!error&&overlay.dataset.art!=='pending';
  if(show&&known&&shownPlace!==id){shownPlace=id;place.textContent=t('load.place.'+id);about.textContent=t('load.about.'+id);lore.classList.remove('is-in');void lore.offsetWidth;lore.classList.add('is-in');}
  lore.hidden=!(show&&known);
  if(show&&!visible)showNext();
  if(!show){shownPlace=null;lore.classList.remove('is-in');tip.classList.remove('is-in');}
  tip.hidden=!show;visible=show;
 }
 const onTap=event=>{event.preventDefault();event.stopPropagation();showNext();};
 tip.addEventListener('click',onTap);
 const observer=Observer?new Observer(sync):null;
 observer?.observe(overlay,{attributes:true,attributeFilter:['hidden','class','data-place','data-art']});
 sync();
 return {
  sync,next:showNext,
  inspect:()=>({visible,place:shownPlace,card:at>=0?deck[order[at]].join(':'):null}),
  dispose(){observer?.disconnect();tip.removeEventListener('click',onTap);lore.remove();tip.remove();},
 };
}
