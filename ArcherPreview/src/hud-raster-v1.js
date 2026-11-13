// Cosmetic bindings only. Existing game buttons/input owners execute actions.
// update() joins the game's existing frame; this module owns no RAF or timer.
const instances=new WeakMap();
export const HUD_RASTER_SPRITES=Object.freeze({
 attack:{selector:'#attack-button',atlas:'combat',row:0,key:'KeyJ'},
 guard:{selector:'#guard-button',atlas:'combat',row:1,key:'KeyF'},
 dodge:{selector:'#dodge-button',atlas:'combat',row:2,key:'Space'},
 potion:{selector:'#potion-button',atlas:'combat',row:3,key:'KeyE'},
 inventory:{selector:'.top-actions [data-chapter="bag"],.top-actions [data-uit-action="inventory"]',atlas:'menu',row:0},
 journal:{selector:'.top-actions [data-chapter="journal"],.top-actions [data-uit-action="journal"]',atlas:'menu',row:1},
 settings:{selector:'#motion-speed-toggle',atlas:'menu',row:2},
 story:{selector:'.chapter-story button',atlas:'menu',row:3},
});
export function hudRasterFrame({held=false,elapsed=0,released=false}={}){return released?(elapsed<70?'release':'idle'):held?(elapsed<45?'press':'held'):'idle';}

export function setupHudRasterV1({root,touchDevice=false,now=()=>performance.now(),onLayoutChange=()=>{}}={}){
 if(!root)return {update(){},refresh(){},clear(){},dispose(){}};
 if(instances.has(root))return instances.get(root);
 const doc=root.ownerDocument,win=doc.defaultView,entries=new Map(),sources=new Map(),cleanups=[],owned=[];
 const previous={raster:root.dataset.rasterHud,input:root.dataset.hudInput};let disposed=false,guarding=false,blocked=false;
 const coarse=win?.matchMedia?.('(pointer:coarse)'),listen=(node,type,fn,options)=>{node?.addEventListener(type,fn,options);cleanups.push(()=>node?.removeEventListener(type,fn,options));};
 root.dataset.rasterHud='v1';
 function mode(touch){const value=touch?'touch':'pc';if(root.dataset.hudInput===value)return;clear();root.dataset.hudInput=value;onLayoutChange();}
 mode(touchDevice||coarse?.matches);
 function draw(entry,time){
  const unavailable=entry.node.disabled||blocked;
  const held=!unavailable&&(entry.sources.size>0||entry.name==='guard'&&guarding);
  const frame=unavailable?'idle':hudRasterFrame({held,elapsed:time-entry.changed,released:!held&&entry.released});
  if(frame!==entry.frame){entry.frame=frame;entry.node.dataset.hudSpriteState=frame;}
 }
 function refresh(){
  if(disposed)return;
  for(const [name,spec]of Object.entries(HUD_RASTER_SPRITES)){
   const node=root.querySelector(spec.selector),old=entries.get(name);if(old?.node===node)continue;
   if(old){for(const source of old.sources)sources.delete(source);old.layer.remove();delete old.node.dataset.hudSprite;delete old.node.dataset.hudSpriteState;}
   if(!node){entries.delete(name);continue;}
   const layer=doc.createElement('i');layer.className='hud-v1-sprite hud-v1-'+spec.atlas;layer.setAttribute('aria-hidden','true');layer.style.setProperty('--hud-sprite-row',String(spec.row/3*100)+'%');node.append(layer);
   node.dataset.hudSprite=name;node.dataset.hudSpriteState='idle';
   const entry={name,node,layer,sources:new Set(),changed:now(),released:false,frame:'idle'};entries.set(name,entry);
  }
  const attack=root.querySelector('#attack-button');if(attack&&!attack.querySelector('.hud-v1-pc-key')){const key=doc.createElement('kbd');key.className='hud-v1-pc-key';key.textContent='J';key.setAttribute('aria-hidden','true');attack.append(key);owned.push(key);}
 }
 function begin(entry,source){if(!entry||entry.node.disabled||blocked||doc.querySelector('dialog[open]')||sources.has(source))return;sources.set(source,entry);entry.sources.add(source);entry.changed=now();entry.released=false;draw(entry,entry.changed);}
 function finish(source,cancel=false){const entry=sources.get(source);if(!entry)return;sources.delete(source);entry.sources.delete(source);if(!entry.sources.size){entry.changed=now();entry.released=!cancel;}draw(entry,now());}
 function clear(){sources.clear();for(const entry of entries.values()){entry.sources.clear();entry.released=false;entry.frame='idle';entry.node.dataset.hudSpriteState='idle';}}
 function entryFor(node){const button=node?.closest?.('[data-hud-sprite]');return button&&[...entries.values()].find(entry=>entry.node===button);}
 refresh();
 listen(root,'pointerdown',event=>{if(event.button!==undefined&&event.button!==0)return;if(event.pointerType==='touch'||event.pointerType==='pen')mode(true);else if(event.pointerType==='mouse'&&!coarse?.matches&&!touchDevice)mode(false);begin(entryFor(event.target),'pointer:'+event.pointerId);},true);
 listen(win,'pointerup',event=>finish('pointer:'+event.pointerId),true);
 listen(win,'pointercancel',event=>finish('pointer:'+event.pointerId,true),true);
 for(const type of ['pointercancel','lostpointercapture'])listen(root,type,event=>finish('pointer:'+event.pointerId,true),true);
 listen(doc,'keydown',event=>{if(event.repeat||/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)||doc.querySelector('dialog[open]'))return;const target=entryFor(event.target),entry=target&&['Enter','Space'].includes(event.code)?target:[...entries.values()].find(entry=>HUD_RASTER_SPRITES[entry.name].key===event.code);begin(entry,'key:'+event.code);},true);
 listen(doc,'keyup',event=>finish('key:'+event.code),true);
 listen(win,'blur',clear);listen(win,'pagehide',clear);listen(win,'orientationchange',clear);
 listen(root,'focusout',event=>{const entry=entryFor(event.target);if(entry)for(const source of [...entry.sources])if(source.startsWith('key:'))finish(source,true);});
 listen(doc,'visibilitychange',()=>{if(doc.hidden)clear();});
 const menus=win?.MutationObserver?new win.MutationObserver(()=>{if(doc.querySelector('dialog[open]'))clear();}):null;menus?.observe(root,{subtree:true,attributes:true,attributeFilter:['open']});
 const additions=win?.MutationObserver?new win.MutationObserver(refresh):null;for(const host of [root.querySelector('.top-actions'),root.querySelector('#chapter-hud')])if(host)additions?.observe(host,{childList:true,subtree:true});
 if(coarse)listen(coarse,'change',()=>mode(touchDevice||coarse.matches));
 const api={refresh,clear,update(state={}){if(disposed)return;const next=state.blocked===true;if(next&&!blocked)clear();blocked=next;guarding=state.guarding===true;const time=now();for(const entry of entries.values())draw(entry,time);},inspect:()=>({sprites:entries.size,sources:sources.size,input:root.dataset.hudInput}),dispose(){if(disposed)return;clear();disposed=true;menus?.disconnect();additions?.disconnect();for(const stop of cleanups)stop();for(const entry of entries.values()){entry.layer.remove();delete entry.node.dataset.hudSprite;delete entry.node.dataset.hudSpriteState;}for(const node of owned)node.remove();for(const [key,value]of [['rasterHud',previous.raster],['hudInput',previous.input]])if(value===undefined)delete root.dataset[key];else root.dataset[key]=value;instances.delete(root);}};
 instances.set(root,api);return api;
}
