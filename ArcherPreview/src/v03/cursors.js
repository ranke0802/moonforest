// Mouse cursors for 0.3: small hand-drawn SVGs in the game's gold-and-ink
// palette, switched by situation through one attribute on <html>:
// ui (menus, dialogue) · play (sword) · combat (blooded sword) · talk (someone
// to speak to) · camera (right-drag turning the view). Loading shows the moon.
// No per-frame DOM writes: the attribute changes only when the mode does.
const INK='#1b140b',GOLD='#e8cf8f',BRIGHT='#ffe6a6',SILVER='#e4ecf2',MOON='#bfe3ff';
const svg=(body,size=32)=>`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 32 32'>${body}</svg>`)}")`;
const ARROW="M3 2 3 24 8.6 18.6 12.6 28 16.8 26.2 12.9 17 20.6 17Z";
const SPARK=(x,y,c)=>`<path d='M${x} ${y-3}l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z' fill='${c}'/>`;
export const CURSOR_ART=Object.freeze({
 arrow:svg(`<path d='${ARROW}' fill='#22301f' stroke='${GOLD}' stroke-width='1.6' stroke-linejoin='round'/><path d='M5 6v13' stroke='#4c6045' stroke-width='1.4' stroke-linecap='round'/>`),
 point:svg(`<path d='${ARROW}' fill='${BRIGHT}' stroke='${INK}' stroke-width='1.6' stroke-linejoin='round'/><path d='M5 6v13' stroke='#fff7da' stroke-width='1.4' stroke-linecap='round'/>${SPARK(24,6,MOON)}`),
 sword:svg(`<g stroke='${INK}' stroke-width='1.5' stroke-linejoin='round'><path d='M2.5 2.5 6.5 3.4 20.4 17.3 17.3 20.4 3.4 6.5Z' fill='${SILVER}'/><path d='M15.2 22.6 22.6 15.2 24.8 17.4 17.4 24.8Z' fill='${GOLD}'/><path d='M21.4 21.4 26.2 26.2 24.4 28 19.6 23.2Z' fill='#6b4a2b'/><circle cx='27.3' cy='27.3' r='2.4' fill='${GOLD}'/></g><path d='M5 5 18 18' stroke='#fff' stroke-width='.9' opacity='.8'/>`),
 combat:svg(`<g stroke='${INK}' stroke-width='1.5' stroke-linejoin='round'><path d='M2.5 2.5 6.5 3.4 20.4 17.3 17.3 20.4 3.4 6.5Z' fill='#f3d2cc'/><path d='M15.2 22.6 22.6 15.2 24.8 17.4 17.4 24.8Z' fill='#d8644a'/><path d='M21.4 21.4 26.2 26.2 24.4 28 19.6 23.2Z' fill='#5a2a1e'/><circle cx='27.3' cy='27.3' r='2.4' fill='#d8644a'/></g><path d='M5 5 18 18' stroke='#ff8a6e' stroke-width='1.1'/>`),
 talk:svg(`<path d='M3 2 3 19 7.4 14.8 10.4 21.6 13.6 20.2 10.7 13.4 16.6 13.4Z' fill='${BRIGHT}' stroke='${INK}' stroke-width='1.5' stroke-linejoin='round'/><path d='M15 17.5h13a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-7l-3.6 3v-3H15a2.5 2.5 0 0 1-2.5-2.5v-5a2.5 2.5 0 0 1 2.5-2.5Z' fill='#22301f' stroke='${GOLD}' stroke-width='1.4'/><g fill='${BRIGHT}'><circle cx='17.5' cy='22.5' r='1.2'/><circle cx='21.5' cy='22.5' r='1.2'/><circle cx='25.5' cy='22.5' r='1.2'/></g>`),
 camera:svg(`<circle cx='16' cy='16' r='6.2' fill='#22301f' stroke='${GOLD}' stroke-width='1.5'/><path d='M18.6 12.2a4.6 4.6 0 1 0 0 7.6 3.6 3.6 0 1 1 0-7.6Z' fill='${MOON}'/><g fill='${GOLD}' stroke='${INK}' stroke-width='1.1' stroke-linejoin='round'><path d='M16 1.5 19.4 6.4H12.6Z'/><path d='M16 30.5 12.6 25.6H19.4Z'/><path d='M1.5 16 6.4 12.6V19.4Z'/><path d='M30.5 16 25.6 19.4V12.6Z'/></g>`),
 wait:svg(`<circle cx='16' cy='16' r='12' fill='#0d1622' stroke='${GOLD}' stroke-width='1.4'/><path d='M20.5 8.2a8.6 8.6 0 1 0 0 15.6 6.8 6.8 0 1 1 0-15.6Z' fill='${MOON}'/>${SPARK(9,10,BRIGHT)}${SPARK(11,22,MOON)}`),
});
const CLICKABLE=':is(button,a[href],summary,select,label,[role=button],input:is([type=range],[type=checkbox],[type=radio])):not(:disabled)';
export function cursorCss(art=CURSOR_ART){
 const c=(name,x,y,fallback)=>`${art[name]} ${x} ${y}, ${fallback}`;
 return [
  `html[data-v03-cursor],html[data-v03-cursor] body,html[data-v03-cursor] canvas{cursor:${c('arrow',3,2,'auto')}}`,
  `html[data-v03-cursor] ${CLICKABLE}{cursor:${c('point',3,2,'pointer')}}`,
  `html[data-v03-cursor=play] canvas{cursor:${c('sword',3,3,'crosshair')}}`,
  `html[data-v03-cursor=combat] canvas{cursor:${c('combat',3,3,'crosshair')}}`,
  `html[data-v03-cursor=talk] canvas{cursor:${c('talk',3,2,'pointer')}}`,
  `html[data-v03-cursor=camera],html[data-v03-cursor=camera] *{cursor:${c('camera',16,16,'grabbing')}!important}`,
  `html[data-v03-cursor][data-loading],html[data-v03-cursor][data-loading] *{cursor:${c('wait',16,16,'progress')}!important}`,
 ].join('\n');
}
export function createCursors(doc){
 const html=doc.documentElement,style=doc.createElement('style');
 style.dataset.v03Cursors='';style.textContent=cursorCss();doc.head.append(style);
 let mode=null,turning=false;
 const down=event=>{if(event.button===2&&event.target?.tagName==='CANVAS'){turning=true;apply();}};
 const up=event=>{if(turning&&(event.type!=='pointerup'||event.button===2)){turning=false;apply();}};
 doc.addEventListener('pointerdown',down,true);doc.addEventListener('pointerup',up,true);doc.defaultView?.addEventListener?.('blur',up);
 let wanted='ui';
 function apply(){const next=turning&&wanted!=='ui'?'camera':wanted;if(next!==mode){mode=next;html.dataset.v03Cursor=next;}}
 apply();
 return {
  set(next){wanted=next;apply();},
  get mode(){return mode;},
  dispose(){doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('pointerup',up,true);doc.defaultView?.removeEventListener?.('blur',up);style.remove();delete html.dataset.v03Cursor;},
 };
}
