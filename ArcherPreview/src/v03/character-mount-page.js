const coats=[['original','original'],['cream','#edcc9f'],['chestnut','#a25638'],['bay','#714735'],['black','#342e2c'],['grey','#9b9a98'],['white','#ffffff']];
function colour(value){return /^#[\da-f]{6}$/i.test(value)?value.toLowerCase():'original';}
function chip(node,value){
 node.style.setProperty('--mf-coat',value==='original'?'#9d7553':value);
 node.classList.toggle('is-original',value==='original');
}
export function createMountPage({body,dialog,wardrobe,make,button,stat,frame,labels,locale,onPreview,invalidate,retry,scene,onSceneEnd,rotate,zoomBy}){
 const win=body.ownerDocument.defaultView;
 const details=make('section','mf-menu-card mf-menu-stats mf-mount-details'),title=make('h2','',labels.horse);
 details.append(title);
 if(!wardrobe?.owned){details.append(make('p','',labels.locked));body.append(details);return {close(){}};}
 const stats=make('dl'),number=value=>new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value);
 const {speedMultiplier,gallopSpeed,gallopSeconds}=wardrobe.stats;
 stat(stats,labels.speed,number(speedMultiplier)+' ×');
 stat(stats,labels.gallop,number(gallopSpeed)+' m/s');stat(stats,labels.duration,number(gallopSeconds)+' '+labels.seconds);
 const stage=make('div','mf-mount-stage'),notice=make('p','mf-mount-notice',labels.loading);
 const tools=make('div','mf-mount-tools'),controls=[];
 for(const [symbol,label,action] of [['←',labels.left,()=>rotate(-48,0)],['→',labels.right,()=>rotate(48,0)],
  ['−',labels.zoomOut,()=>zoomBy(.86)],['+',labels.zoomIn,()=>zoomBy(1.16)]]){
  const control=button(symbol,action);control.setAttribute('aria-label',label);control.title=label;control.disabled=true;
  controls.push(control);tools.append(control);
 }
 notice.setAttribute('role','status');stage.append(frame,tools,notice);body.append(stage,details);
 const selected=make('div','mf-mount-colour'),indicator=make('i','mf-coat-chip'),name=make('span');
 const describe=value=>labels[coats.find(([,hex])=>hex===value)?.[0]]??value.toUpperCase();
 let current=colour(wardrobe.coat),preview=null,closed=false,failed=false,palette=null,timer=0;
 const change=button(labels.change,openPalette);change.className='mf-mount-action';change.disabled=true;
 function updateCurrent(){chip(indicator,current);name.textContent=describe(current);}
 updateCurrent();indicator.setAttribute('aria-hidden','true');selected.append(indicator,name);
 details.append(stats,make('h3','',labels.coat),selected,change);
 function openPalette(){
  if(closed||failed||!preview||palette)return;
  let draft=current;
  const panel=make('dialog','mf-mount-palette'),choices=make('div','mf-mount-choices'),buttons=new Map();
  panel.setAttribute('aria-label',labels.change);
  const custom=make('input');custom.type='color';custom.setAttribute('aria-label',labels.custom);
  const customLabel=make('label','mf-mount-custom',labels.custom);customLabel.append(custom);
  const message=make('p','mf-mount-message');message.setAttribute('role','status');
  function select(value){
   draft=colour(value);preview?.setCoat(draft);custom.value=draft==='original'?'#ffffff':draft;
   for(const [hex,b] of buttons)b.setAttribute('aria-pressed',String(hex===draft));
   invalidate();message.textContent='';
  }
  for(const [key,hex] of coats){
   const b=button(labels[key],()=>select(hex)),sample=make('i','mf-coat-chip');
   chip(sample,hex);sample.setAttribute('aria-hidden','true');b.prepend(sample);buttons.set(hex,b);choices.append(b);
   b.setAttribute('aria-pressed',String(hex===draft));
  }
  custom.value=draft==='original'?'#ffffff':draft;
  custom.addEventListener('input',()=>select(custom.value));custom.addEventListener('change',()=>select(custom.value));
  const actions=make('div','mf-mount-actions'),cancel=button(labels.cancel,()=>finish(false)),apply=button(labels.apply,()=>{
   if(closed||palette!==finish)return;
   if(draft!==current&&!wardrobe.setCoat(draft)){message.textContent=labels.saveError;return;}
   current=draft;updateCurrent();finish(true);
  });
  function finish(saved){
   if(palette!==finish)return;palette=null;
   if(!saved&&preview){preview.setCoat(current);invalidate();}
   if(panel.open)panel.close();panel.remove();if(!closed&&change.isConnected)change.focus();
  }
  panel.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}});
  panel.addEventListener('close',()=>finish(false));
  actions.append(cancel,apply);panel.append(make('h2','',labels.change),choices,customLabel,message,actions);dialog.append(panel);
  palette=finish;panel.showModal();(buttons.get(draft)??custom).focus();
 }
 function release(){
  if(wardrobe.closePreview)wardrobe.closePreview();else preview?.dispose();
  preview=null;
 }
 function fail(){
  if(closed||failed)return;failed=true;
  win.clearTimeout(timer);palette?.(false);release();onPreview(null);change.disabled=true;for(const control of controls)control.disabled=true;
  notice.replaceChildren(make('span','',labels.failed),button(labels.retry,retry));notice.hidden=false;
 }
 function waiting(){if(!closed&&!failed&&!timer)timer=win.setTimeout(fail,12000);}
 function drawn(){if(!closed&&!failed){win.clearTimeout(timer);timer=0;notice.hidden=true;change.disabled=false;for(const control of controls)control.disabled=false;}}
 const sceneObserver=scene?.onDisposeObservable?.addOnce(onSceneEnd);
 function close(){
  if(closed)return;closed=true;win.clearTimeout(timer);palette?.(false);
  scene?.onDisposeObservable?.remove(sceneObserver);
  if(!failed)release();
 }
 waiting();
 // The parent can synchronously close this scope while the GLB is loading.
 // A late result owns its model only, so it cannot close a newer preview.
 try{Promise.resolve(wardrobe.preview()).then(model=>{
  if(closed||failed){model?.dispose();return;}
  if(!model){fail();return;}
  preview=model;onPreview(model);
 },fail);}catch{fail();}
 return {close,fail,drawn,waiting};
}
