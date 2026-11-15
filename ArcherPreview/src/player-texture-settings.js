import {isMobilePlayerTextureDevice} from './player-texture-profile.js';

export const PLAYER_TEXTURE_PREFERENCE_KEY='moonforest-player-texture-pc-v1';
export const normalizePlayerTexturePreference=value=>value==='original'?'original':'compressed';
export function readPlayerTexturePreference(storage){
 try{return normalizePlayerTexturePreference(storage?.getItem(PLAYER_TEXTURE_PREFERENCE_KEY));}catch{return 'compressed';}
}

/** Settings only: never fetch/reload, change a live texture, or retry a failed
 * graph. The owner applies the preference at the next explicit player load.
 */
export function setupPlayerTextureSettings({host,storage,release,navigator=globalThis.navigator,onChange=()=>{},onApply}={}){
 const enabled=release==='moonforest-0.2',mobile=isMobilePlayerTextureDevice(navigator);
 let value=enabled?readPlayerTexturePreference(storage):'original',disposed=false,failure=null,active=null,applying=false;
 const doc=host?.ownerDocument,root=enabled&&!mobile&&doc?doc.createElement('div'):null;
 let select,note,recover,applyButton;
 function sync(profile=active){
  active=profile;if(!root||disposed)return;
  for(const option of select.options)option.selected=option.value===value;
  select.disabled=applying;recover.hidden=!failure;recover.disabled=applying;if(applyButton)applyButton.disabled=applying;
  note.textContent=applying?'선택한 텍스처로 다시 불러오는 중입니다.':failure?'압축 모드에서 불러오기가 실패했습니다. 원본으로 변경해 다시 불러올 수 있습니다.':
   profile?.selectionReason==='compression-unavailable-original'?'이 환경에서는 원본 이미지를 사용합니다. 휴대기기의 자동 선택은 유지됩니다.':
   '두 모드 모두 원본 해상도입니다. 압축은 미세한 색상 차이가 있을 수 있습니다. 변경 후 다시 접속하면 적용됩니다.';
 }
 function setValue(next,{notify=true}={}){
  if(!enabled||disposed)return value;const normalized=normalizePlayerTexturePreference(next),changed=normalized!==value;value=normalized;failure=null;
  try{storage?.setItem(PLAYER_TEXTURE_PREFERENCE_KEY,value);}catch{/* Session choice remains usable when storage is unavailable. */}
  sync();if(changed&&notify)onChange(value);return value;
 }
 const change=()=>setValue(select.value),restoreOriginal=()=>setValue('original');
 async function apply({original=false}={}){
  if(disposed||!enabled||applying||typeof onApply!=='function')return false;
  if(original)restoreOriginal();applying=true;sync();
  try{await onApply(value);return true;}
  catch(error){failure=String(error?.name??'Error').slice(0,64);return false;}
  finally{applying=false;sync();}
 }
 const applyClick=()=>{void apply();},recoverClick=()=>{if(typeof onApply==='function')void apply({original:true});else restoreOriginal();};
 if(root){
  root.className='player-texture-settings';const label=doc.createElement('label');label.textContent='플레이어 텍스처 · PC ';
  select=doc.createElement('select');select.id='player-texture-pc-select';select.setAttribute('aria-label','PC 플레이어 텍스처');
  for(const [id,title]of [['compressed','8K GPU 압축 · 권장'],['original','8K 원본 이미지']]){const option=doc.createElement('option');option.value=id;option.textContent=title;select.append(option);}
  label.append(select);note=doc.createElement('small');note.setAttribute('role','status');recover=doc.createElement('button');recover.type='button';recover.textContent=typeof onApply==='function'?'원본으로 바꾸고 다시 불러오기':'원본으로 변경';recover.hidden=true;
  root.append(label,note,recover);
  if(typeof onApply==='function'){applyButton=doc.createElement('button');applyButton.type='button';applyButton.textContent='적용하고 다시 불러오기';applyButton.addEventListener('click',applyClick);root.append(applyButton);}
  host.append(root);select.addEventListener('change',change);recover.addEventListener('click',recoverClick);sync();
 }
 return {get value(){return value;},read:()=>value,setValue,restoreOriginal,sync,apply,
  noteFailure(profile,error){if(disposed||!enabled||profile?.mobile||profile?.gpuCompressed!==true)return false;failure=String(error?.name??'Error').slice(0,64);sync(profile);return true;},
  inspect:()=>({enabled,mobile,preference:value,activeManifest:active?.manifest??null,failed:!!failure,applying}),
  dispose(){if(disposed)return;disposed=true;select?.removeEventListener('change',change);recover?.removeEventListener('click',recoverClick);applyButton?.removeEventListener('click',applyClick);root?.remove();active=null;failure=null;}};
}
