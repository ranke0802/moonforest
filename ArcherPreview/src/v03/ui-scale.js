// One scale for 0.3's screen UI on large PC windows (2026-11-23, user: on a
// big screen the HUD and the dialogue kept their pixel size and looked tiny).
// Above the 1280x720 reference window the panels listed in v03.css
// (html[data-v03-zoom]) are enlarged with CSS zoom, and the viewport units in
// their rules are divided by the same factor (var(--v03-ui,1)), so a larger
// window shows the reference layout enlarged rather than re-spaced.
// Touch screens keep their tuned layout (scale 1). Written only on change.
export const UI_REFERENCE=Object.freeze({width:1280,height:720,max:3,step:.05});

export function uiScaleFor({width,height,coarse=false}){
 if(coarse||!(width>0)||!(height>0))return 1;
 const scale=Math.min(width/UI_REFERENCE.width,height/UI_REFERENCE.height);
 if(!(scale>1))return 1;
 return Math.min(UI_REFERENCE.max,Math.round(scale/UI_REFERENCE.step)*UI_REFERENCE.step);
}

export function setupUiScale({view,doc}){
 const root=doc.documentElement,coarse=view.matchMedia?.('(pointer: coarse)')??null;let current=0;
 const apply=()=>{
  const scale=+uiScaleFor({width:view.innerWidth,height:view.innerHeight,coarse:coarse?.matches===true}).toFixed(2);
  if(scale===current)return;current=scale;
  if(scale>1){root.style.setProperty('--v03-ui',String(scale));root.dataset.v03Zoom='';}
  else{root.style.removeProperty('--v03-ui');delete root.dataset.v03Zoom;}
 };
 apply();view.addEventListener('resize',apply);coarse?.addEventListener?.('change',apply);
 return {get scale(){return current;},dispose(){view.removeEventListener('resize',apply);coarse?.removeEventListener?.('change',apply);root.style.removeProperty('--v03-ui');delete root.dataset.v03Zoom;}};
}
