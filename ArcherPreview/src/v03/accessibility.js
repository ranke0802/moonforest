// Accessibility choices for 0.3 (2026-11-26): text size, reduced motion and
// vibration. One stored key; every effect source asks the cached values here
// (reducedMotion(), vibrationAllowed(), textScale()), so nothing in a frame
// reads storage or media queries. The page root carries the state for CSS:
//  - data-mf-text="large" and --mf-text-scale (accessibility.css)
//  - data-mf-motion="reduce" whenever motion is reduced, chosen or by the device
export const A11Y_KEY='moonforest:a11y:v1';
export const TEXT_SCALES=Object.freeze({normal:1,large:1.15});
export const MOTION_CHOICES=Object.freeze(['system','on','off']);
// motion: 'system' follows the device, 'on' = reduce motion, 'off' = full motion.
export const A11Y_DEFAULT=Object.freeze({text:'normal',motion:'system',vibration:true});
// The Starfall impact buzz (great-attack-fx.js) is the game's one vibration;
// it goes through vibrate() below, so the switch is shown.
export const VIBRATION_IN_USE=true;
const REDUCE_QUERY='(prefers-reduced-motion: reduce)';

const normal=raw=>Object.freeze({
 text:raw?.text==='large'?'large':'normal',
 motion:MOTION_CHOICES.includes(raw?.motion)?raw.motion:'system',
 vibration:raw?.vibration!==false,
});
export function readAccessibility(storage){
 try{const raw=JSON.parse(storage?.getItem(A11Y_KEY)??'null');return raw&&typeof raw==='object'?normal(raw):A11Y_DEFAULT;}catch{return A11Y_DEFAULT;}
}

// Module state: one page, one set of choices.
let value=A11Y_DEFAULT,deviceReduce=false,reduce=false,scale=1,storage=null,root=null,query=null;
const listeners=new Set();
function derive(){
 reduce=value.motion==='on'||value.motion==='system'&&deviceReduce;
 scale=TEXT_SCALES[value.text]??1;
}
function paint(){
 if(!root)return;
 if(scale!==1){root.dataset.mfText=value.text;root.style?.setProperty?.('--mf-text-scale',String(scale));}
 else{delete root.dataset.mfText;root.style?.removeProperty?.('--mf-text-scale');}
 if(reduce)root.dataset.mfMotion='reduce';else delete root.dataset.mfMotion;
}
function changed(){derive();paint();for(const fn of listeners){try{fn(value);}catch(error){console.warn('[MoonForest 0.3] accessibility listener',error);}}}
const onQuery=event=>{deviceReduce=event?.matches===true;changed();};

export const reducedMotion=()=>reduce;
export const vibrationAllowed=()=>value.vibration;
export const textScale=()=>scale;
export const accessibility=()=>value;
// Every vibration of the game goes through here.
export function vibrate(pattern,nav=globalThis.navigator){
 if(!value.vibration||typeof nav?.vibrate!=='function')return false;
 try{return nav.vibrate(pattern)!==false;}catch{return false;}
}
export function onAccessibilityChange(fn){listeners.add(fn);return ()=>listeners.delete(fn);}

// Reads the stored choices and writes the root before the title is drawn.
// Called once by the 0.3 boot; calling it again re-binds (tests, a new page).
export function setupAccessibility({doc,view=doc?.defaultView,storage:store=null}={}){
 query?.removeEventListener?.('change',onQuery);
 storage=store;root=doc?.documentElement??null;value=readAccessibility(storage);
 try{query=view?.matchMedia?.(REDUCE_QUERY)??null;}catch{query=null;}
 deviceReduce=query?.matches===true;query?.addEventListener?.('change',onQuery);
 derive();paint();
 return {get value(){return value;},set:setAccessibility,dispose:disposeAccessibility};
}
export function setAccessibility(patch){
 value=normal({...value,...patch});
 try{storage?.setItem(A11Y_KEY,JSON.stringify(value));}catch{/* kept for this visit */}
 changed();return value;
}
export function disposeAccessibility(){
 query?.removeEventListener?.('change',onQuery);query=null;
 if(root){delete root.dataset.mfText;delete root.dataset.mfMotion;root.style?.removeProperty?.('--mf-text-scale');}
 root=null;storage=null;value=A11Y_DEFAULT;deviceReduce=false;derive();listeners.clear();
}

// The settings group "접근성", placed after the display group of the game's
// settings dialog, built like the other groups (details.settings-section).
export function mountAccessibilitySettings({doc,host,t,vibration=VIBRATION_IN_USE}){
 if(!host||host.querySelector('.mf-a11y'))return null;
 const make=(tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
 // Selecting one option deselects the others (a single <select>).
 const pick=(select,id)=>{for(const option of select.options)if(option.value===id)option.selected=true;};
 const section=make('details','settings-section mf-a11y'),body=make('div','settings-section-body');section.id='v03-accessibility-settings';
 section.append(make('summary','',t('settings.a11y')),body);
 const choice=(key,label,options,note)=>{
  const row=make('label','mf-a11y-row'),select=make('select','quality-select');select.setAttribute('data-a11y',key);
  for(const [id,text] of options){const option=make('option','',text);option.value=id;select.append(option);}
  pick(select,value[key]);select.addEventListener('change',()=>{setAccessibility({[key]:select.value});});
  row.append(make('span','',label),select);body.append(row);if(note)body.append(make('small','mf-a11y-note',note));return select;
 };
 const text=choice('text',t('settings.a11yText'),[['normal',t('settings.a11yTextNormal')],['large',t('settings.a11yTextLarge')]]);
 const motion=choice('motion',t('settings.a11yMotion'),[['system',t('settings.a11yMotionSystem')],['on',t('settings.a11yOn')],['off',t('settings.a11yOff')]],t('settings.a11yMotionNote'));
 let buzz=null;
 if(vibration){
  const row=make('label','v03-slowfx-row mf-a11y-row');buzz=make('input');buzz.type='checkbox';buzz.setAttribute('data-a11y','vibration');buzz.checked=value.vibration;
  buzz.addEventListener('change',()=>{setAccessibility({vibration:buzz.checked});});row.append(buzz,make('span','',t('settings.a11yVibration')));body.append(row);
 }
 // Kept in step when the choice changes elsewhere (the title and play share one dialog).
 const off=onAccessibilityChange(next=>{pick(text,next.text);pick(motion,next.motion);if(buzz)buzz.checked=next.vibration;});
 const display=host.querySelector('.settings-display-options')?.closest('.settings-section');
 if(display?.parentElement===host)display.after(section);else host.append(section);
 return {element:section,dispose(){off();section.remove();}};
}
