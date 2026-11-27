// The character texture choice of 0.3 (2026-11-27, user: "플레이어 2K (모바일,피시 공통
// 기본값) 4K는 선택 옵션으로 변경해줘"). One device-wide key holding '2k' or '4k' (never a
// translated label); nothing stored means the 2K default. The choice is read when the
// character is loaded (main.js), so a change applies from the next visit; the settings row
// says so. 4K is offered only where the last load found 4096 textures and a GPU-compressed
// format (player-texture-profile.js). Older choices still count:
//  - ?playertex=2k|4k in the address wins for that visit (checks and comparisons);
//  - the 0.3 PC list before this ("4K GPU 압축" / "8K 원본", moonforest-player-texture-pc-v1):
//    "8K 원본" asked for the sharpest picture, so it reads as 4K until a choice is made here.
import {selectEditionPlayerTextureProfile} from '../player-texture-profile.js';

export const PLAYER_TEXTURE_KEY='moonforest:player-texture:v1';
export const LEGACY_PC_TEXTURE_KEY='moonforest-player-texture-pc-v1';
const DETAILS=['2k','4k'];
const read=(storage,key)=>{try{return storage?.getItem(key)??null;}catch{return null;}};

export function readPlayerTextureChoice({storage=null,legacyStorage=null,search=''}={}){
 let url=null;try{url=new URLSearchParams(search).get('playertex');}catch{/* no address */}
 if(DETAILS.includes(url))return {detail:url,source:'url'};
 const stored=read(storage,PLAYER_TEXTURE_KEY);if(DETAILS.includes(stored))return {detail:stored,source:'user'};
 if(read(legacyStorage,LEGACY_PC_TEXTURE_KEY)==='original')return {detail:'4k',source:'legacy-original'};
 return {detail:'2k',source:'default'};
}
export function writePlayerTextureChoice(storage,detail){
 if(!DETAILS.includes(detail))return false;
 try{storage?.setItem(PLAYER_TEXTURE_KEY,detail);return true;}catch{return false;}
}

// What the last load found and used (diagnostics carry the same object as playerTextures.textureDetail).
let active=null;const listeners=new Set();
export const activePlayerTexture=()=>active;
export function selectV03PlayerTextures(character,caps,navigator,options={}){
 const choice=readPlayerTextureChoice(options),profile=selectEditionPlayerTextureProfile(character,caps,navigator,choice);
 if(profile.textureDetail){active=profile.textureDetail;for(const fn of listeners){try{fn(active);}catch(error){console.warn('[MoonForest 0.3] texture setting',error);}}}
 return profile;
}

// The row in the display group of the game's settings dialog.
export function mountPlayerTextureSettings({doc,host,t,storage=null,search=doc?.defaultView?.location?.search??''}){
 if(!host||host.querySelector('.v03-texture-row'))return null;
 const make=(tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
 const row=make('label','v03-texture-row mf-a11y-row'),select=make('select','quality-select'),note=make('small','v03-texture-note mf-a11y-note');
 select.id='v03-player-texture-select';select.dataset.playerTexture='';note.setAttribute('role','status');
 const two=make('option','',t('settings.playerTexture2k')),four=make('option','',t('settings.playerTexture4k'));two.value='2k';four.value='4k';select.append(two,four);
 row.append(make('span','',t('settings.playerTexture')),select);
 const picked=()=>readPlayerTextureChoice({storage,search:''}).detail;
 let shownNote=null;
 function sync(){
  const can=active?active.fourKAvailable!==false:true,want=picked();
  four.disabled=!can;if(can)four.removeAttribute('disabled');else four.setAttribute('disabled','');four.textContent=t(can?'settings.playerTexture4k':'settings.playerTexture4kOff');
  const value=want==='4k'&&can?'4k':'2k';(value==='4k'?four:two).selected=true;
  const now=active?.value,key=active&&now!==value&&now!=='original'?'settings.playerTextureNext':can?'settings.playerTextureNote':'settings.playerTextureNote4kOff';
  if(key!==shownNote){shownNote=key;note.textContent=t(key);}
 }
 const change=()=>{if(select.value==='4k'&&four.disabled){sync();return;}writePlayerTextureChoice(storage,select.value);sync();};
 select.addEventListener('change',change);listeners.add(sync);
 const display=host.querySelector('.settings-display-options')??host;display.append(row,note);sync();
 return {element:row,select,note,sync,dispose(){listeners.delete(sync);select.removeEventListener('change',change);row.remove();note.remove();}};
}
