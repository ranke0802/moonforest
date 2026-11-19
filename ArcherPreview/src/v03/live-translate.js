// Shared-game panels that build their text after the language pack arrives
// (the settings dialog fills in sections, options and status lines later), so
// the one translateTree pass at boot misses them. While a watched dialog is
// open, newly added nodes are translated as they appear; when it opens, the
// whole dialog gets one pass. Korean does nothing. Only childList and the
// `open` attribute are observed: writing a translation (characterData,
// title/aria-label) never re-triggers the observer.
import {language,translateTree,tr} from './i18n.js';

const LABEL_ATTRIBUTES=['title','aria-label','placeholder'];
function translateElement(element){
 translateTree(element);
 for(const name of LABEL_ATTRIBUTES){const value=element.getAttribute?.(name);if(value){const next=tr(value);if(next!==value)element.setAttribute(name,next);}}
}
// Top-bar captions are drawn by CSS from data-commercial-label.
export function translateLabels(root){
 if(language()==='ko'||!root)return;
 for(const element of root.querySelectorAll('[data-commercial-label]')){const value=element.dataset.commercialLabel,next=tr(value);if(next!==value)element.dataset.commercialLabel=next;}
}
export function watchTranslations(doc,{selectors=['#motion-speed-dialog']}={}){
 const Observer=doc?.defaultView?.MutationObserver??globalThis.MutationObserver;
 if(language()==='ko'||!Observer)return {dispose(){}};
 const observers=[];
 for(const selector of selectors){
  const dialog=doc.querySelector(selector);if(!dialog)continue;
  translateElement(dialog);
  const observer=new Observer(records=>{
   if(!dialog.hasAttribute('open'))return;
   for(const record of records){
    if(record.type==='attributes'){translateElement(dialog);continue;}
    for(const node of record.addedNodes){
     if(node.nodeType===1)translateElement(node);
     else if(node.nodeType===3){const next=tr(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next;}
    }
   }
  });
  observer.observe(dialog,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
  observers.push(observer);
 }
 return {dispose(){for(const observer of observers)observer.disconnect();observers.length=0;}};
}
