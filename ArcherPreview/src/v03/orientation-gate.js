// Landscape-only play on phones and tablets (0.3).
// After the language is chosen, a portrait screen is covered by a "turn your
// device" card and the game is held (blocksGame). A tap asks for fullscreen and
// a landscape lock where the browser allows it (Android Chrome and similar).
// iPhone/iPad Safari has neither, so the card offers "Add to Home Screen"
// steps: launched from the home screen the game runs without browser bars.
import {t} from './i18n.js';

export function isIos(view){
 const nav=view?.navigator;if(!nav)return false;
 return /iPad|iPhone|iPod/.test(nav.userAgent??'')||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1);
}
export function isStandalone(view){return view?.navigator?.standalone===true||view?.matchMedia?.('(display-mode: standalone)')?.matches===true||view?.matchMedia?.('(display-mode: fullscreen)')?.matches===true;}

// On phones the game runs in a frame of moonforest-shell.html; that outer
// page owns fullscreen and the landscape lock so a reload of the game (new
// game, loading a record) cannot drop them.
function shellOf(view){try{const shell=view&&view.parent!==view?view.parent.__moonforestShell:null;return shell&&typeof shell.goLandscape==='function'?shell:null;}catch{return null;}}
const isFullscreen=doc=>{const shell=shellOf(doc.defaultView);return shell?shell.isFullscreen()===true:!!(doc.fullscreenElement||doc.webkitFullscreenElement);};
async function goLandscape(doc){
 const target=doc.documentElement,view=doc.defaultView,shell=shellOf(view);
 if(shell){try{await shell.goLandscape();}catch{/* the card stays */}return;}
 const request=target.requestFullscreen??target.webkitRequestFullscreen;
 try{if(request&&!doc.fullscreenElement&&!doc.webkitFullscreenElement)await Promise.resolve(request===target.requestFullscreen?request.call(target,{navigationUI:'hide'}):request.call(target));}catch{/* fullscreen refused: the card stays */}
 try{await view.screen?.orientation?.lock?.('landscape');}catch{/* lock unsupported: the player turns the device */}
}

export function createOrientationGate({doc,mount=doc.body}){
 const view=doc.defaultView,touch=view?.matchMedia?.('(pointer: coarse)')?.matches===true,portraitQuery=view?.matchMedia?.('(orientation: portrait)'),ios=isIos(view);
 const layer=doc.createElement('section');layer.className='v03-rotate';layer.dataset.v03Layer='rotate';layer.hidden=true;layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');
 const icon=doc.createElement('div');icon.className='v03-rotate-icon';icon.setAttribute('aria-hidden','true');
 const title=doc.createElement('h2');title.className='v03-rotate-title';
 const lead=doc.createElement('p');lead.className='v03-rotate-lead';
 const add=doc.createElement('button');add.type='button';add.className='v03-rotate-add';add.hidden=true;
 const steps=doc.createElement('ol');steps.className='v03-rotate-steps';steps.hidden=true;
 layer.append(icon,title,lead,add,steps);mount.append(layer);
 let enabled=false,active=false,install=null;
 // Android Chrome: an installed app (manifest orientation: landscape) keeps
 // landscape across reloads (new game, slot change, language change).
 const onInstallable=event=>{event.preventDefault?.();install=event;if(active)label();};
 view?.addEventListener?.('beforeinstallprompt',onInstallable);
 // A reload leaves fullscreen and drops the orientation lock. On Android the
 // first touch afterwards (any touch, in landscape too) takes both back, so a
 // phone with auto-rotate off does not fall back to portrait mid-game.
 const relock=event=>{if(!enabled||!touch||ios||isStandalone(view)||isFullscreen(doc)||event.target?.closest?.('#fullscreen-button,#diagnostic-fullscreen'))return;void goLandscape(doc);};
 doc.addEventListener('pointerup',relock,true);
 function label(){
  title.textContent=t('rotate.title');
  lead.textContent=ios?t('rotate.ios'):t('rotate.tap');
  const shell=shellOf(view);
  add.textContent=ios?t('ios.add'):t('rotate.install');add.hidden=isStandalone(view)||!(ios||install||shell?.installable?.());
  steps.replaceChildren(...[t('ios.step1'),t('ios.step2'),t('ios.step3')].map(text=>{const item=doc.createElement('li');item.textContent=text;return item;}));
 }
 function sync(){
  const next=enabled&&touch&&portraitQuery?.matches===true;
  if(next===active)return;active=next;layer.hidden=!active;
  if(active){label();steps.hidden=true;}
 }
 // The first tap anywhere on the card (except the iOS button) asks for
 // landscape fullscreen; it must run inside the user gesture.
 layer.addEventListener('click',event=>{
  if(event.target.closest?.('.v03-rotate-add')){if(ios){steps.hidden=!steps.hidden;return;}const prompt=install;install=null;add.hidden=true;void Promise.resolve(prompt?prompt.prompt?.():shellOf(view)?.install?.()).catch(()=>{});return;}
  if(!ios)void goLandscape(doc);
 });
 portraitQuery?.addEventListener?.('change',sync);view?.addEventListener?.('resize',sync);
 return {
  element:layer,
  // Called once the language is chosen (nothing before that is gated).
  enable(){enabled=true;sync();},
  get active(){return active;},
  relabel(){if(active)label();},
  dispose(){view?.removeEventListener?.('beforeinstallprompt',onInstallable);doc.removeEventListener('pointerup',relock,true);portraitQuery?.removeEventListener?.('change',sync);view?.removeEventListener?.('resize',sync);layer.remove();},
 };
}
