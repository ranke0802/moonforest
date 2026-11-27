import {language,t} from './i18n.js';
import {townItemIcon} from './town-item-art.js';

// Level-up banner and quest-reward chips (2026-11-27). DOM is built once; a show writes
// text and two CSS variables, the CSS animations do the rest (transform/opacity only).
// Counting numbers write a text node only when the shown integer changes.
export const REWARD_CHIP_LIMIT=4;
export const COUNT_SECONDS=.7;
const ARMOR_ICON=Object.freeze({leather:'leather-coat'});

export function createRewardHud({doc,mount=doc.body,icon=townItemIcon}){
 const make=(tag,className,parent)=>{const node=doc.createElement(tag);if(className)node.className=className;parent?.append(node);return node;};
 const root=make('div','v03-reward-fx');root.dataset.v03RewardFx='';
 const edge=make('div','v03-lvup-edge',root);edge.hidden=true;edge.setAttribute('aria-hidden','true');
 const banner=make('section','v03-lvup',root);banner.hidden=true;
 banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
 const rays=make('div','v03-lvup-rays',banner);rays.setAttribute('aria-hidden','true');
 const title=make('strong','v03-lvup-title',banner),level=make('span','v03-lvup-level',banner);
 const bar=make('div','v03-lvup-bar',banner),fill=make('i','v03-lvup-fill',bar);make('i','v03-lvup-flare',bar);
 bar.setAttribute('aria-hidden','true');
 const stats=make('ul','v03-lvup-stats',banner),statRows=[make('li','',stats),make('li','',stats),make('li','',stats)];
 const hint=make('small','v03-lvup-hint',banner);
 const strip=make('section','v03-reward',root);strip.hidden=true;strip.setAttribute('aria-hidden','true');
 make('div','v03-reward-rays',strip);
 const chipList=make('ul','v03-reward-chips',strip),chips=[];
 for(let i=0;i<REWARD_CHIP_LIMIT;i++){
  const li=make('li','v03-reward-chip',chipList),art=make('span','v03-reward-icon',li),value=make('b','v03-reward-value',li);
  li.style.setProperty('--i',String(i));li.hidden=true;
  chips.push({li,art,value,artKey:null,target:0,shown:-1,format:null,text:''});
 }
 mount.append(root);
 const write=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
 const number=n=>n.toLocaleString(language());
 let ratioFrom=-1,ratioTo=-1,countAge=0,counting=false;

 // hp, attack: what the reached levels added (1127-combat); a row only for a value that rose.
 function setLevel({level:value,points=0,cap=20,ratio=0,fromRatio=0,hp=0,attack=0}){
  write(title,t('levelup.title'));
  write(level,t('levelup.level',{level:value}));
  const rows=[];
  if(hp>0&&attack>0)rows.push(t('levelup.growth',{hp,attack}));else if(hp>0)rows.push(t('levelup.hp',{n:hp}));else if(attack>0)rows.push(t('levelup.attack',{n:attack}));
  if(points>0)rows.push(t('levelup.points',{n:points}));
  if(value>=cap)rows.push(t('levelup.max'));
  for(let i=0;i<statRows.length;i++){const text=rows[i]??'';write(statRows[i],text);statRows[i].hidden=!text;}
  write(hint,points>0?t('levelup.hint'):'');hint.hidden=!(points>0);
  const from=value>=cap?1:Math.max(0,Math.min(1,fromRatio)),to=value>=cap?1:Math.max(0,Math.min(1,ratio));
  if(from!==ratioFrom){ratioFrom=from;bar.style.setProperty('--lv-from',from.toFixed(3));}
  if(to!==ratioTo){ratioTo=to;bar.style.setProperty('--lv-to',to.toFixed(3));}
  fill.dataset.full=value>=cap?'1':'0';
 }
 function setArt(chip,key){
  if(chip.artKey===key)return;chip.artKey=key;
  if(key==='gold'){chip.art.replaceChildren();chip.art.className='v03-reward-icon is-gold';chip.art.textContent='G';}
  else if(key==='xp'){chip.art.replaceChildren();chip.art.className='v03-reward-icon is-xp';chip.art.textContent='✦';}
  else{chip.art.className='v03-reward-icon is-item';chip.art.replaceChildren(icon(doc,key));}
 }
 function paint(chip,value){
  if(chip.shown===value)return;chip.shown=value;
  write(chip.value,chip.format?chip.format(value):chip.text);
 }
 return {root,banner,edge,strip,chips,
  // A level reached; reduced: the CSS reads html[data-mf-motion].
  showLevel(event){setLevel(event);edge.hidden=false;banner.hidden=false;},
  // More levels during the first moments of a banner: the text follows, the animation does not restart.
  updateLevel(event){setLevel(event);},
  hideLevel(){banner.hidden=true;edge.hidden=true;},
  // summary: {gold,xp,potions,armor}. Gold and experience count up; items pop in.
  showReward({gold=0,xp=0,potions=0,armor=null}={}){
   const rows=[];
   if(gold>0)rows.push(['gold',gold,n=>'+'+t('reward.gold',{n:number(n)})]);
   if(xp>0)rows.push(['xp',xp,n=>t('reward.xp',{n:number(n)})]);
   if(potions>0)rows.push(['potion',0,null,t('reward.potions',{n:potions})]);
   if(armor&&ARMOR_ICON[armor])rows.push([ARMOR_ICON[armor],0,null,t('reward.armor.'+armor)]);
   if(!rows.length)return false;
   for(let i=0;i<chips.length;i++){
    const chip=chips[i],row=rows[i];chip.li.hidden=!row;if(!row)continue;
    setArt(chip,row[0]);chip.target=row[1];chip.format=row[2];chip.text=row[3]??'';chip.shown=-1;paint(chip,chip.format?0:chip.target);
   }
   countAge=0;counting=true;strip.hidden=false;return true;
  },
  hideReward(){strip.hidden=true;counting=false;},
  tick(dt){
   if(!counting)return;
   countAge+=dt;const k=Math.min(1,countAge/COUNT_SECONDS),ease=1-(1-k)*(1-k)*(1-k);
   for(const chip of chips)if(!chip.li.hidden&&chip.format)paint(chip,Math.round(chip.target*ease));
   if(k>=1)counting=false;
  },
  get counting(){return counting;},
  dispose(){root.remove();},
 };
}
