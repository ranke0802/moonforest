// Diagnostic A/B (2026-11-26, follow-up no. 5): the backdrop blur behind the
// action buttons and the joystick can be switched off, so the same scene can
// be recorded with and without it. ?hudblur=0 starts with it off. Like the other
// performance-check switches the choice is kept in this browser; the state goes
// into the performance record's metadata (boot.js recordMetadata).
// The rule itself is in accessibility.css: html[data-mf-hud-blur="off"].
export const HUD_BLUR_KEY='moonforest:hud-blur-off:v1';

export function createHudBlurDiagnostic({doc,view=doc?.defaultView,storage=null}){
 const root=doc?.documentElement??null;
 let off=false;
 try{off=storage?.getItem(HUD_BLUR_KEY)==='1';}catch{/* default: blur on */}
 try{const asked=new URLSearchParams(view?.location?.search??'').get('hudblur');if(asked==='0')off=true;else if(asked==='1')off=false;}catch{/* no query */}
 const paint=()=>{if(!root)return;if(off)root.dataset.mfHudBlur='off';else delete root.dataset.mfHudBlur;};
 paint();
 let input=null;
 return {
  get off(){return off;},
  set(value){off=value===true;try{storage?.setItem(HUD_BLUR_KEY,off?'1':'0');}catch{/* kept for this visit */}paint();if(input)input.checked=off;return off;},
  // For the performance record: one word, so two records can be told apart.
  metadata(){return {hudBlur:off?'off':'on'};},
  // A switch in the performance-check group, beside the frame diagnostics toggle.
  mount({host,t}){
   if(!host||host.querySelector('#v03-hud-blur-toggle'))return null;
   const label=doc.createElement('label'),box=doc.createElement('input'),help=doc.createElement('small');
   box.type='checkbox';box.id='v03-hud-blur-toggle';box.checked=off;box.addEventListener('change',()=>this.set(box.checked));input=box;
   label.className='v03-hud-blur-row';label.append(box,' '+t('settings.hudBlurOff'));help.className='v03-hud-blur-help';help.textContent=t('settings.hudBlurNote');
   const anchor=host.querySelector('#draw-cpu-diagnostics-help')??host.querySelector('label');
   if(anchor)anchor.after(label,help);else host.append(label,help);
   return label;
  },
  dispose(){if(root)delete root.dataset.mfHudBlur;input=null;},
 };
}
