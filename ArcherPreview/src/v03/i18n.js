// Languages for MoonForest 0.3.
// Korean is the source language. Player-facing text lives in three places:
//  - ui keys (locales/<lang>.js `ui`), read with t('key',{params})
//  - story text: Korean in data/chapter*.js, other languages in `story` of
//    each locale, laid over the Korean by localizeChapter()
//  - text the shared 0.2 game shows, keyed by its Korean source (`legacy`),
//    read with tr(text); untranslated text simply stays Korean
// Only the chosen language is downloaded (dynamic import per locale).
import ko from './locales/ko.js';

export const LANGUAGES=Object.freeze([
 {id:'ko',label:'한국어',html:'ko'},
 {id:'en',label:'English',html:'en'},
 {id:'ja',label:'日本語',html:'ja'},
 {id:'vi',label:'Tiếng Việt',html:'vi'},
 {id:'zh',label:'简体中文',html:'zh-Hans'},
]);
// Shared with the inline splash script in moonforest-0.3.html.
export const LANG_KEY='moonforest:lang:v1';
const LOADERS={en:()=>import('./locales/en.js'),ja:()=>import('./locales/ja.js'),vi:()=>import('./locales/vi.js'),zh:()=>import('./locales/zh.js')};
const known=id=>LANGUAGES.some(row=>row.id===id);
let current='ko',pack=ko;

export function readLanguage(storage){try{const value=storage?.getItem(LANG_KEY);return known(value)?value:null;}catch{return null;}}
export function writeLanguage(storage,id){if(!known(id))return false;try{storage?.setItem(LANG_KEY,id);return true;}catch{return false;}}
export const language=()=>current;
// Loads a language (Korean is built in). Falls back to Korean on failure.
export async function useLanguage(id,{doc=null}={}){
 let next=known(id)?id:'ko',loaded=ko;
 if(next!=='ko'){try{loaded=(await LOADERS[next]()).default;}catch(error){console.warn('[MoonForest 0.3] language unavailable',next,error);next='ko';loaded=ko;}}
 current=next;pack=loaded;
 if(doc){const html=doc.documentElement;html.lang=LANGUAGES.find(row=>row.id===next).html;html.dataset.lang=next;}
 return next;
}
// Test hook: install a pack directly.
export function setPack(id,value){current=id;pack=value??ko;}

const fill=(text,params)=>params?text.replace(/\{(\w+)\}/g,(match,key)=>params[key]??match):text;
export function t(key,params){
 const value=pack.ui?.[key]??ko.ui[key];
 if(value===undefined)return key;
 return typeof value==='function'?value(params??{}):fill(value,params);
}
// Shared-game text keyed by its Korean source.
export function tr(text){
 if(current==='ko'||typeof text!=='string'||!text)return text;
 const table=pack.legacy??{};
 if(table[text]!==undefined)return table[text];
 const trimmed=text.trim();
 if(trimmed!==text&&table[trimmed]!==undefined)return text.replace(trimmed,table[trimmed]);
 for(const [pattern,out] of pack.legacyPatterns??[])if(pattern.test(text))return text.replace(pattern,out);
 return text;
}
export const speaker=name=>pack.story?.speakers?.[name]??name;

// Plain deep copy of chapter data so translations can be laid over it in
// place (the quest log keeps references to the same objects).
export function cloneChapter(chapter){
 const copy=value=>Array.isArray(value)?value.map(copy):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,copy(item)])):value;
 return copy({...chapter});
}
// Writes the current language's story text into `target` (a cloneChapter
// copy of `source`). Missing entries keep the Korean source text.
export function localizeChapter(target,source){
 const story=current==='ko'?{}:pack.story??{};
 for(const [id,lines] of Object.entries(source.DIALOGUES??{})){
  const out=story.dialogues?.[id];
  lines.forEach((line,index)=>{target.DIALOGUES[id][index].text=out?.[index]??line.text;});
 }
 source.QUESTS?.forEach((quest,qi)=>{
  const out=story.quests?.[quest.id],copy=target.QUESTS[qi];
  copy.title=out?.title??quest.title;
  quest.steps.forEach((step,si)=>{
   copy.steps[si].text=out?.steps?.[step.id]??step.text;
   if(step.arrival)copy.steps[si].arrival=out?.arrivals?.[step.id]??step.arrival;
  });
 });
 if('CHAPTER_END_NOTE' in source)target.CHAPTER_END_NOTE=story.endNote??source.CHAPTER_END_NOTE;
 source.COMBAT_HINTS?.forEach((hint,index)=>{const out=story.hints?.[hint.id];for(const key of ['text','keys','touch'])target.COMBAT_HINTS[index][key]=out?.[key]??hint[key];});
 source.TIPS?.forEach((tip,index)=>{const out=story.tips?.[tip.id];for(const key of ['title','keys','touch','text'])target.TIPS[index][key]=out?.[key]??tip[key];});
 return target;
}
// One pass over static markup of the shared game (text nodes and labels).
export function translateTree(root){
 if(current==='ko'||!root)return;
 const doc=root.ownerDocument,walker=doc.createTreeWalker(root,4);
 for(let node=walker.nextNode();node;node=walker.nextNode()){const next=tr(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next;}
 for(const element of root.querySelectorAll('[title],[aria-label],[placeholder]'))for(const name of ['title','aria-label','placeholder']){const value=element.getAttribute(name);if(value){const next=tr(value);if(next!==value)element.setAttribute(name,next);}}
}
