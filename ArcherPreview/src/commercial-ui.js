import {arrangeTopActions} from './hud-top-actions.js';
const controllers=new WeakMap();

export const COMMERCIAL_UI_ART=Object.freeze({
  icons:new URL('./ui-test-art/icons.webp',import.meta.url).href,
  crest:new URL('./ui-test-art/crest.webp',import.meta.url).href,
  apple:new URL('./ui-test-art/apple.webp',import.meta.url).href,
  pie:new URL('./ui-test-art/pie.webp',import.meta.url).href,
  bandage:new URL('./ui-test-art/bandage.webp',import.meta.url).href,
  sword:new URL('./ui-test-art/sword.webp',import.meta.url).href,
});

// Art is decorative. Actual item names, counts, rewards and use rules stay in
// ChapterJourney; an unfamiliar item gets a category symbol, never fake stats.
export function commercialItemVisual(id){
  if(['apple','pie','bandage'].includes(id))return `<img src="${COMMERCIAL_UI_ART[id]}" alt="" draggable="false">`;
  const kind=['potion','antidote','travel-tonic','concentrated-tonic','refined-tonic','greater-tonic','restoration-water'].includes(id)?'potion':id==='cargo'||id==='feed'?'bag':'book';
  return `<i class="commercial-icon commercial-icon-${kind}" aria-hidden="true"></i>`;
}

/** Decorate existing controls at construction boundaries, never in a frame loop. */
export function setupCommercialUi({root,onDiagnostics=()=>root.querySelector('#diagnostic-expand')?.click()}={}){
  if(!root)return {refresh(){},dispose(){}};
  if(controllers.has(root))return controllers.get(root);
  const doc=root.ownerDocument,owned=[],decorated=new Set(),addedTitles=new Map(),previous=root.dataset.commercialUi;
  let disposed=false;root.dataset.commercialUi='true';
  const topSelectors=[['bag','[data-chapter="bag"],[data-uit-action="inventory"]','가방'],['journal','[data-chapter="journal"],[data-uit-action="journal"]','수첩'],['summon','#open-summon','소환'],['fullscreen','#fullscreen-button','전체'],['settings','#motion-speed-toggle','설정']];
  function refresh(){
    if(disposed)return;
    for(const [kind,selector,label]of topSelectors){
      const node=root.querySelector('.top-actions')?.querySelector(selector);if(!node)continue;
      node.classList.add('commercial-top','commercial-top-'+kind);node.dataset.commercialLabel=label;decorated.add(node);
      if(!node.title){node.title=node.getAttribute('aria-label')||label;addedTitles.set(node,node.title);}
    }
    for(const [id,kind]of [['attack-button','sword'],['guard-button','shield'],['dodge-button','boot'],['potion-button','potion']]){
      const node=root.querySelector('#'+id);if(!node||node.querySelector('.commercial-action-art'))continue;
      const image=doc.createElement('i');image.className='commercial-action-art commercial-icon commercial-icon-'+kind;image.setAttribute('aria-hidden','true');node.append(image);owned.push(image);
    }
    const fps=root.querySelector('#live-fps');
    if(fps&&!fps.dataset.commercialFps){
      const before=Object.fromEntries(['role','tabindex','title','aria-label'].map(key=>[key,fps.getAttribute(key)]));
      fps.dataset.commercialFps='true';fps.classList.add('commercial-fps');fps.setAttribute('role','button');fps.tabIndex=0;fps.title='성능 진단 열기';fps.setAttribute('aria-label','현재 FPS · 성능 진단 열기');
      const open=()=>{if(!doc.querySelector('dialog[open]'))onDiagnostics();},keydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();if(!event.repeat)open();}};
      fps.addEventListener('click',open);fps.addEventListener('keydown',keydown);owned.push({dispose(){fps.removeEventListener('click',open);fps.removeEventListener('keydown',keydown);fps.classList.remove('commercial-fps');delete fps.dataset.commercialFps;for(const [key,value]of Object.entries(before))if(value===null)fps.removeAttribute(key);else fps.setAttribute(key,value);}});
    }
    arrangeTopActions(root);
  }
  refresh();
  const api={refresh,dispose(){if(disposed)return;disposed=true;for(const item of owned)item.dispose?item.dispose():item.remove();for(const node of decorated){node.classList.remove('commercial-top',...topSelectors.map(([kind])=>'commercial-top-'+kind));delete node.dataset.commercialLabel;if(addedTitles.has(node)&&node.title===addedTitles.get(node))node.removeAttribute('title');}if(previous===undefined)delete root.dataset.commercialUi;else root.dataset.commercialUi=previous;controllers.delete(root);}};
  controllers.set(root,api);return api;
}
