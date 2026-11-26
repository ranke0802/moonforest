// Developer-only controls of the 0.3 page (DESIGN.md: shown only with ?dev=1).
// The page keeps them in <template data-dev-only> elements, which are not part
// of the document; here they are put in place only in the dev server
// (import.meta.env.DEV) or with ?dev=1. Imported first by main.js, so the
// elements exist before the game looks them up. Pages without such templates
// (0.2) are untouched.
export function devToolsWanted(view=globalThis){
 try{if(import.meta.env?.DEV)return true;}catch{/* no bundler */}
 try{return new URLSearchParams(view?.location?.search??'').get('dev')==='1';}catch{return false;}
}
// True on a public 0.3 page (it has dev-only templates and they were left out):
// controls the shared code builds itself (the summon button) are not built either.
let hidden=false;
export const devControlsHidden=()=>hidden;
export function mountDevControls(doc=globalThis.document,view=doc?.defaultView??globalThis){
 const templates=[...(doc?.querySelectorAll?.('template[data-dev-only]')??[])];
 if(!templates.length)return 0;
 const wanted=devToolsWanted(view);hidden=!wanted;
 for(const template of templates){
  if(wanted)template.replaceWith(template.content.cloneNode(true));
  else template.remove();
 }
 return wanted?templates.length:0;
}
if(typeof document!=='undefined')mountDevControls(document);
