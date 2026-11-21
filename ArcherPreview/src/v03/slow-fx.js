// The slow-motion beat at the start of an attack (0.3): the game runs slow for
// a moment and the camera pushes in. 2026-11-20 (user): a stronger push-in, a
// longer beat, and the player's own choice in the settings: on or off, how
// far it zooms, how long it lasts, and whether fights after the tutorial get
// it too. Everything is on by default. Stored per browser.
export const SLOW_FX_KEY='moonforest:slow-fx:v1';
// lines: focus lines at the screen's edge while the beat lasts (2026-11-20).
export const SLOW_FX_DEFAULT=Object.freeze({on:true,everywhere:true,lines:true,zoom:.32,seconds:.7});
// [min, max, step]
export const SLOW_FX_RANGE=Object.freeze({zoom:[.1,.5,.02],seconds:[.3,1.2,.05]});
const within=(value,[min,max],fallback)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const normal=raw=>Object.freeze({on:raw.on!==false,everywhere:raw.everywhere!==false,lines:raw.lines!==false,zoom:within(+raw.zoom,SLOW_FX_RANGE.zoom,SLOW_FX_DEFAULT.zoom),seconds:within(+raw.seconds,SLOW_FX_RANGE.seconds,SLOW_FX_DEFAULT.seconds)});

// value: one frozen object, replaced only when a setting changes (the story
// reads it every frame).
export function createSlowFx(storage=null){
 let value=SLOW_FX_DEFAULT;
 try{const raw=JSON.parse(storage?.getItem(SLOW_FX_KEY)??'null');if(raw&&typeof raw==='object')value=normal(raw);}catch{/* defaults */}
 return {
  get value(){return value;},
  set(patch){value=normal({...value,...patch});try{storage?.setItem(SLOW_FX_KEY,JSON.stringify(value));}catch{/* kept for this visit */}return value;},
 };
}

// One section in the game's settings dialog. t(key): the UI text.
export function mountSlowFxSettings({doc,host,fx,t}){
 if(!host||host.querySelector('.v03-slowfx'))return null;
 const make=(tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
 const section=make('details','settings-section v03-slowfx'),body=make('div','settings-section-body');
 section.append(make('summary','',t('settings.combatFx')),body);
 body.append(make('p','v03-slowfx-note',t('settings.slowNote')));
 const toggle=(key,label)=>{
  const row=make('label','v03-slowfx-row'),box=make('input');box.type='checkbox';box.checked=fx.value[key];
  box.addEventListener('change',()=>{fx.set({[key]:box.checked});sync();});
  row.append(box,make('span','',label));body.append(row);return box;
 };
 const slider=(key,label,show)=>{
  const row=make('label','v03-slowfx-row is-range'),input=make('input'),out=make('output'),[min,max,step]=SLOW_FX_RANGE[key];
  input.type='range';input.min=min;input.max=max;input.step=step;input.value=fx.value[key];out.textContent=show(fx.value[key]);
  input.addEventListener('input',()=>{out.textContent=show(fx.set({[key]:+input.value})[key]);});
  row.append(make('span','',label),input,out);body.append(row);return input;
 };
 const on=toggle('on',t('settings.slow')),everywhere=toggle('everywhere',t('settings.slowEverywhere')),lines=toggle('lines',t('settings.slowLines'));
 const zoom=slider('zoom',t('settings.slowZoom'),value=>Math.round(value*100)+'%'),seconds=slider('seconds',t('settings.slowSeconds'),value=>value.toFixed(2)+'s');
 // The rest only matters while the beat is on.
 function sync(){const off=!fx.value.on;everywhere.disabled=off;lines.disabled=off;zoom.disabled=off;seconds.disabled=off;}
 sync();void on;
 const after=host.querySelectorAll(':scope > .settings-section')[1];
 if(after)after.after(section);else host.prepend(section);
 return section;
}
