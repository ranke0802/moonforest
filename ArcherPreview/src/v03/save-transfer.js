// Save slot export / restore (0.3). A slot is every localStorage key under
// `<edition>:slot<n>:` plus its entry in the shared slot index
// (save-slots.js). The file carries both exactly as stored; nothing is
// re-mapped, so the game's own loaders migrate an older record when it is
// opened, the same way they do for a record that never left the browser.
//
// The file is untrusted input: bounded size and nesting, a strict shape, an
// integrity value, and no path from its text to markup. Restoring writes only
// into a slot that is empty at the moment of writing, all or nothing.
import {t} from './i18n.js';
import {SLOT_COUNT,readSlotIndex,slotPrefix,editionPrefix} from './save-slots.js';
import {slotSummary} from './title-screen.js';

export const SAVE_FORMAT='moonforest-save';
export const SAVE_FORMAT_VERSION=1;
// Layout of a slot: the 'slots:v1' index plus prefixed keys (save-slots.js).
export const SLOT_SCHEMA=1;
export const SAVE_EXTENSION='.mfsave';
export const MAX_FILE_BYTES=4*1024*1024;
const MAX_DEPTH=6,MAX_KEYS=4096,MAX_KEY_LENGTH=256,MAX_META_KEYS=32,MAX_META_TEXT=200;
const INDEX_KEY='slots:v1',MARKER_KEY='had-saves:v1',PERSIST_KEY='persist:v1';
// Versioned records inside a slot whose loaders refuse an unknown version
// (gold-loot.js: version!==1 is treated as damaged; map-resume.js likewise).
const KNOWN_VERSIONS=Object.freeze({'moonforest-gold-ledger-v1':1,'moonforest-map-position-v1':1});
const TOP_KEYS=['format','formatVersion','game','createdAt','payload','integrity'];
const FORBIDDEN=new Set(['__proto__','constructor','prototype']);
export const TRANSFER_ERRORS=Object.freeze(['not-save','damaged','newer','older','other-edition','too-large','slot-filled','storage','no-storage','invalid-slot']);

const usable=raw=>!!raw&&typeof raw.getItem==='function'&&typeof raw.setItem==='function'&&typeof raw.removeItem==='function';
const validSlot=value=>Number.isInteger(value)&&value>=1&&value<=SLOT_COUNT;
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const fail=code=>({ok:false,code});

// ----- integrity -----
// Canonical text: objects with sorted keys, no spaces. Only JSON values occur.
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 return JSON.stringify(value??null);
}
const utf8=text=>new TextEncoder().encode(text);
const hex=bytes=>Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
// Small synchronous fallback (cyrb53) for pages without crypto.subtle
// (plain http on a LAN address is not a secure context). It catches damage,
// not deliberate edits; the file says which checks it carries.
export function cyrb53(text,seed=0){
 const bytes=utf8(text);let h1=0xdeadbeef^seed,h2=0x41c6ce57^seed;
 for(let i=0;i<bytes.length;i++){const ch=bytes[i];h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}
 h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
 h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
 return (h2>>>0).toString(16).padStart(8,'0')+(h1>>>0).toString(16).padStart(8,'0');
}
const defaultSubtle=()=>{try{return globalThis.crypto?.subtle??null;}catch{return null;}};
async function sha256(text,subtle){
 if(!subtle?.digest)return null;
 try{return hex(new Uint8Array(await subtle.digest('SHA-256',utf8(text))));}catch{return null;}
}
const signed=file=>canonical({format:file.format,formatVersion:file.formatVersion,game:file.game,createdAt:file.createdAt,payload:file.payload});

// ----- reading a slot -----
// The slot exactly as stored: its index entry and every key under its prefix.
export function readSlotPayload(raw,edition,slot){
 if(!usable(raw)||!validSlot(slot))return null;
 let index=null;try{index=JSON.parse(raw.getItem(editionPrefix(edition)+INDEX_KEY)??'null');}catch{return null;}
 const meta=index?.[slot];if(!plain(meta)||meta.used!==true)return null;
 const prefix=slotPrefix(edition,slot),keys=[];
 for(let i=0;i<(raw.length??0);i++){const key=raw.key(i);if(typeof key==='string'&&key.startsWith(prefix))keys.push(key);}
 keys.sort();const data={};
 for(const key of keys){const value=raw.getItem(key);if(typeof value==='string')data[key.slice(prefix.length)]=value;}
 return {meta,data};
}
function pad(n){return String(n).padStart(2,'0');}
export function saveFileName(meta,at=new Date()){
 const where=String(meta?.placeKey||('ch'+(meta?.chapter||1))).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32)||'record';
 return `moonforest-save-${where}-${at.getFullYear()}${pad(at.getMonth()+1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${SAVE_EXTENSION}`;
}

// → {text,name,meta} or null when the slot holds no record.
export async function exportSlot({raw,edition,slot,now=()=>Date.now(),label='MoonForest 0.3',subtle=defaultSubtle()}){
 const payload=readSlotPayload(raw,edition,slot);if(!payload)return null;
 const at=new Date(now());
 const file={format:SAVE_FORMAT,formatVersion:SAVE_FORMAT_VERSION,game:{edition,slotSchema:SLOT_SCHEMA,label:String(label).slice(0,40)},createdAt:at.toISOString(),payload};
 const body=signed(file),strong=await sha256(body,subtle);
 file.integrity=strong?{sha256:strong,cyrb53:cyrb53(body)}:{cyrb53:cyrb53(body),weak:true};
 return {text:JSON.stringify(file,null,1)+'\n',name:saveFileName(payload.meta,at),meta:payload.meta};
}

// ----- checking a file -----
// Nesting depth outside strings, without parsing (a deep "bomb" is refused
// before JSON.parse sees it).
export function nestingDepth(text,limit=MAX_DEPTH){
 let depth=0,max=0,inString=false,escaped=false;
 for(let i=0;i<text.length;i++){
  const c=text.charCodeAt(i);
  if(inString){if(escaped)escaped=false;else if(c===92)escaped=true;else if(c===34)inString=false;continue;}
  if(c===34)inString=true;
  else if(c===123||c===91){if(++depth>max){max=depth;if(max>limit)return max;}}
  else if(c===125||c===93)depth--;
 }
 return max;
}
const looksLikeOurs=text=>/^\s*\{/.test(text)&&text.includes('"'+SAVE_FORMAT+'"');
function cleanData(data){
 if(!plain(data))return null;
 const keys=Object.keys(data);if(keys.length>MAX_KEYS)return null;
 for(const key of keys){
  if(!key||key.length>MAX_KEY_LENGTH||FORBIDDEN.has(key)||typeof data[key]!=='string')return null;
  // Control characters never occur in the game's own key names.
  if(/[\u0000-\u001f]/.test(key))return null;
 }
 return data;
}
function cleanFileMeta(meta){
 if(!plain(meta)||meta.used!==true)return null;
 const keys=Object.keys(meta);if(keys.length>MAX_META_KEYS)return null;
 for(const key of keys){
  const value=meta[key];if(FORBIDDEN.has(key)||key.length>40)return null;
  if(value===null||typeof value==='boolean')continue;
  if(typeof value==='number'){if(!Number.isFinite(value))return null;continue;}
  if(typeof value==='string'){if(value.length>MAX_META_TEXT)return null;continue;}
  return null;
 }
 return meta;
}
function versionCheck(data){
 for(const [key,known] of Object.entries(KNOWN_VERSIONS)){
  if(!Object.hasOwn(data,key))continue;
  let value=null;try{value=JSON.parse(data[key]);}catch{return 'damaged';}
  const version=value?.version;
  if(!Number.isInteger(version))return 'damaged';
  if(version>known)return 'newer';
  if(version<known)return 'older';
 }
 return null;
}
// → {ok:true,edition,payload,meta,summary,check} | {ok:false,code}
export async function inspectFile(text,{edition,subtle=defaultSubtle()}={}){
 if(typeof text!=='string')return fail('not-save');
 if(text.length>MAX_FILE_BYTES)return fail('too-large');
 if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
 if(nestingDepth(text)>MAX_DEPTH)return fail(looksLikeOurs(text)?'damaged':'not-save');
 let file;try{file=JSON.parse(text);}catch{return fail(looksLikeOurs(text)?'damaged':'not-save');}
 if(!plain(file)||file.format!==SAVE_FORMAT)return fail('not-save');
 if(!Number.isInteger(file.formatVersion)||file.formatVersion<1)return fail('not-save');
 if(file.formatVersion>SAVE_FORMAT_VERSION)return fail('newer');
 const keys=Object.keys(file);
 if(keys.length!==TOP_KEYS.length||!TOP_KEYS.every(key=>Object.hasOwn(file,key)))return fail('damaged');
 const game=file.game;
 if(!plain(game)||typeof game.edition!=='string'||!Number.isInteger(game.slotSchema)||typeof game.label!=='string'||Object.keys(game).length!==3)return fail('damaged');
 if(game.slotSchema>SLOT_SCHEMA)return fail('newer');
 if(game.slotSchema<1)return fail('older');
 if(edition&&game.edition!==edition)return fail('other-edition');
 if(typeof file.createdAt!=='string'||file.createdAt.length>40)return fail('damaged');
 const integrity=file.integrity;
 if(!plain(integrity)||typeof integrity.cyrb53!=='string')return fail('damaged');
 const body=signed(file);
 if(cyrb53(body)!==integrity.cyrb53)return fail('damaged');
 let check='weak';
 if(typeof integrity.sha256==='string'){
  const strong=await sha256(body,subtle);
  if(strong){if(strong!==integrity.sha256)return fail('damaged');check='sha256';}
 }
 const payload=file.payload;
 if(!plain(payload)||Object.keys(payload).length!==2)return fail('damaged');
 const meta=cleanFileMeta(payload.meta),data=cleanData(payload.data);
 if(!meta||!data)return fail('damaged');
 const version=versionCheck(data);if(version)return fail(version);
 const clean=readSlotIndex({getItem:()=>JSON.stringify({1:meta})},'x')[0];
 return {ok:true,edition:game.edition,payload:{meta,data},meta:clean,check,
  summary:{chapter:clean.chapter,placeKey:clean.placeKey??null,titleKey:clean.titleKey??null,level:clean.level,playSeconds:clean.playSeconds,savedAt:clean.savedAt,build:game.label,createdAt:file.createdAt}};
}

// ----- restoring -----
// Writes only into a slot that is empty right now, all or nothing. On any
// failure the storage is left exactly as it was. Other slots, preferences
// and every other key are never written.
export function restoreInto({raw,edition,slot,inspected}){
 if(!usable(raw))return fail('no-storage');
 if(!validSlot(slot))return fail('invalid-slot');
 if(!inspected?.ok||inspected.edition!==edition)return fail('not-save');
 const indexKey=editionPrefix(edition)+INDEX_KEY,prefix=slotPrefix(edition,slot);
 let indexBefore,index;
 try{indexBefore=raw.getItem(indexKey);index=JSON.parse(indexBefore??'{}');}catch{return fail('storage');}
 if(!plain(index))return fail('storage');
 if(index[slot]?.used===true)return fail('slot-filled');
 // Keys left by an unsaved run in this empty slot: replaced, restored on failure.
 const stray=new Map();
 try{for(let i=0;i<(raw.length??0);i++){const key=raw.key(i);if(typeof key==='string'&&key.startsWith(prefix))stray.set(key,raw.getItem(key));}}catch{return fail('storage');}
 const entries=Object.entries(inspected.payload.data),written=[];
 const meta={...inspected.payload.meta};if('slot' in meta)meta.slot=slot;
 const rollback=()=>{
  for(const key of written){try{raw.removeItem(key);}catch{/* best effort */}}
  for(const [key,value] of stray){try{raw.setItem(key,value);}catch{/* best effort */}}
  try{if(raw.getItem(indexKey)!==indexBefore){if(indexBefore===null)raw.removeItem(indexKey);else raw.setItem(indexKey,indexBefore);}}catch{/* best effort */}
 };
 try{
  for(const key of stray.keys())raw.removeItem(key);
  // Stage: the keys go in while the index still says empty.
  for(const [key,value] of entries){written.push(prefix+key);raw.setItem(prefix+key,value);}
  for(const [key,value] of entries)if(raw.getItem(prefix+key)!==value)throw Error('verify');
  let count=0;for(let i=0;i<(raw.length??0);i++){const key=raw.key(i);if(typeof key==='string'&&key.startsWith(prefix))count++;}
  if(count!==entries.length)throw Error('verify');
  // Re-check right before the slot becomes present (another tab may have saved).
  if(raw.getItem(indexKey)!==indexBefore){rollback();return fail('slot-filled');}
  index[slot]=meta;const next=JSON.stringify(index);raw.setItem(indexKey,next);
  if(raw.getItem(indexKey)!==next||!readSlotIndex(raw,edition)[slot-1].used)throw Error('verify');
 }catch{rollback();return fail('storage');}
 return {ok:true,slot};
}

// ----- device markers (outside the slots) -----
const readJson=(raw,key)=>{try{return JSON.parse(raw?.getItem(key)??'null');}catch{return null;}};
// Remembers that this browser has held a record. Returns true when it had
// one before and every slot is empty now. A browser that clears the whole
// site storage clears this marker too; then nothing can tell, and the
// empty slots' restore buttons are the way back.
export function checkStorageLoss(raw,edition){
 if(!usable(raw))return false;
 const key=editionPrefix(edition)+MARKER_KEY,any=readSlotIndex(raw,edition).some(meta=>meta.used);
 let marked=false;try{marked=raw.getItem(key)==='1';}catch{return false;}
 if(any&&!marked){try{raw.setItem(key,'1');}catch{/* told again next time */}}
 return marked&&!any;
}
// Asks once for persistent storage, after a real save. The browser decides
// (no prompt of ours); the answer is kept for diagnostics.
export async function requestPersistence(raw,edition,storageManager,now=()=>Date.now()){
 if(!usable(raw)||!readSlotIndex(raw,edition).some(meta=>meta.used))return null;
 const key=editionPrefix(edition)+PERSIST_KEY,known=readJson(raw,key);if(known)return known;
 let result='unsupported';
 if(typeof storageManager?.persist==='function'){try{result=await storageManager.persist()?'granted':'denied';}catch{result='error';}}
 const record={result,at:now()};try{raw.setItem(key,JSON.stringify(record));}catch{/* asked again next time */}
 return record;
}
export const persistenceRecord=(raw,edition)=>readJson(raw,editionPrefix(edition)+PERSIST_KEY);

// ----- delivering the file -----
// Blob + a[download] as the diagnostics download does (frame-diagnostics.js).
// Home-screen apps on iOS and in-app browsers drop that download: share the
// file there when possible, otherwise show the text to copy.
const IN_APP=/FBAN|FBAV|Instagram|Line\/|KAKAOTALK|NAVER\(inapp|DaumApps|; wv\)/;
const appleDevice=nav=>/iPad|iPhone|iPod/.test(nav?.userAgent??'')||(nav?.platform==='MacIntel'&&nav?.maxTouchPoints>1);
export function deliveryRoute(view){
 const nav=view?.navigator;if(!nav)return 'text';
 const standalone=nav.standalone===true||view.matchMedia?.('(display-mode: standalone)')?.matches===true;
 if((appleDevice(nav)&&standalone)||IN_APP.test(nav.userAgent??''))return 'share';
 return 'download';
}
export async function deliverFile({doc,view,text,name}){
 if(deliveryRoute(view)==='share'){
  const nav=view.navigator,File=view.File??globalThis.File;
  let file=null;try{file=typeof File==='function'?new File([text],name,{type:'application/json'}):null;}catch{file=null;}
  if(file&&typeof nav.share==='function'&&nav.canShare?.({files:[file]})){
   try{await nav.share({files:[file]});return 'share';}catch(error){if(error?.name==='AbortError')return 'cancelled';}
  }
  return 'text';
 }
 try{
  const Blob=view?.Blob??globalThis.Blob,urls=view?.URL??globalThis.URL;
  const url=urls.createObjectURL(new Blob([text],{type:'application/octet-stream'})),link=doc.createElement('a');
  link.href=url;link.download=name;link.hidden=true;doc.body.append(link);
  try{link.click();}finally{link.remove();(view?.setTimeout??setTimeout)(()=>urls.revokeObjectURL?.(url),1000);}
  return 'download';
 }catch{return 'text';}
}

// ----- title UI -----
const el=(doc,tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const button=(doc,className,text)=>{const node=el(doc,'button',className,text);node.type='button';return node;};
function when(doc,ms){
 if(!Number.isFinite(ms)||ms<=0)return '';
 try{return new Intl.DateTimeFormat(doc.documentElement?.lang||undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(ms));}catch{return new Date(ms).toISOString().slice(0,16).replace('T',' ');}
}
export const errorText=code=>t('transfer.error.'+(TRANSFER_ERRORS.includes(code)?code:'storage'));
const card=(doc,summary)=>{const node=el(doc,'div','v03-transfer-card');node.append(el(doc,'strong','',summary.title),el(doc,'small','',summary.detail));return node;};

// Slot-screen flows. `title` is the title screen (panel/setNotice), `save`
// the page's save session, `describe` the title's meta → words.
export function createSaveTransfer({doc,view=doc.defaultView,save,title,describe=null,edition=save.edition,now=()=>Date.now(),subtle=defaultSubtle(),readFile=file=>file.text()}){
 const raw=()=>save.local;
 let notice=null,disposed=false,asking=null;
 const take=()=>{const value=notice;notice=null;return value;};
 const persist=()=>{asking??=requestPersistence(raw(),edition,view?.navigator?.storage,now).catch(()=>null);};
 function refreshLoss(){title.setNotice?.(checkStorageLoss(raw(),edition)?t('transfer.lostNotice'):null);}
 async function exportFlow(slot){
  let made=null;try{made=await exportSlot({raw:raw(),edition,slot,now,subtle});}catch{made=null;}
  if(disposed)return;
  if(!made){notice={tone:'error',text:t('transfer.exportFailed')};return;}
  const summary=slotSummary(readSlotIndex(raw(),edition)[slot-1],describe);
  await title.panel((box,close)=>{
   box.classList.add('v03-transfer');
   const status=el(doc,'p','v03-transfer-status');status.setAttribute('role','status');
   const area=el(doc,'textarea','v03-transfer-text');area.readOnly=true;area.hidden=true;area.setAttribute('aria-label',t('transfer.textLabel'));
   const row=el(doc,'div','v03-panel-actions v03-transfer-actions');
   const keep=button(doc,'v03-panel-accept',t('transfer.saveFile')),copy=button(doc,'v03-panel-back',t('transfer.copyText')),back=button(doc,'v03-panel-back v03-transfer-back',t('panel.back'));
   keep.dataset.transferAction='save';copy.dataset.transferAction='copy';
   const showText=()=>{area.value=made.text;area.hidden=false;area.focus?.({preventScroll:true});area.select?.();};
   keep.addEventListener('click',async()=>{
    keep.disabled=true;
    const result=await deliverFile({doc,view,text:made.text,name:made.name});if(disposed)return;keep.disabled=false;
    if(result==='download')status.textContent=t('transfer.savedDownload',{name:made.name});
    else if(result==='share')status.textContent=t('transfer.savedShare');
    else if(result==='cancelled')status.textContent=t('transfer.shareCancelled');
    else{showText();status.textContent=t('transfer.savedText');}
   });
   copy.addEventListener('click',async()=>{
    try{await view.navigator.clipboard.writeText(made.text);status.textContent=t('transfer.copied');}
    catch{showText();status.textContent=t('transfer.copyManual');}
   });
   back.addEventListener('click',()=>close(null));row.append(keep,copy);
   box.append(el(doc,'h2','v03-panel-title',t('transfer.exportTitle',{slot})),card(doc,summary),el(doc,'p','v03-panel-note',t('transfer.exportNote')),row,status,area,back);
  });
 }
 async function restoreFlow(slot){
  const inspected=await title.panel((box,close)=>{
   box.classList.add('v03-transfer');
   const input=el(doc,'input','v03-transfer-file');input.type='file';input.hidden=true;
   // iOS greys out an unknown extension under `accept`: any file there (the content is checked).
   if(!appleDevice(view?.navigator))input.setAttribute('accept',SAVE_EXTENSION+',.json,application/json,text/plain');
   const pick=button(doc,'v03-panel-accept',t('transfer.pickFile'));pick.dataset.transferAction='pick';
   const area=el(doc,'textarea','v03-transfer-text');area.setAttribute('aria-label',t('transfer.pasteLabel'));area.placeholder=t('transfer.pastePlaceholder');area.spellcheck=false;
   const check=button(doc,'v03-panel-back',t('transfer.checkText'));check.dataset.transferAction='check';
   const error=el(doc,'p','v03-transfer-status is-error');error.setAttribute('role','alert');
   const back=button(doc,'v03-panel-back v03-transfer-back',t('panel.back'));
   let request=0;
   const judge=async(text,id)=>{
    error.textContent=t('transfer.checking');
    const result=await inspectFile(text,{edition,subtle});
    if(disposed||id!==request)return;
    if(result.ok)close(result);else{error.textContent=errorText(result.code);error.dataset.code=result.code;}
   };
   pick.addEventListener('click',()=>input.click());
   input.addEventListener('change',async()=>{
    const file=input.files?.[0],id=++request;if(!file)return;
    if(file.size>MAX_FILE_BYTES){error.textContent=errorText('too-large');error.dataset.code='too-large';input.value='';return;}
    let text=null;try{text=await readFile(file);}catch{text=null;}
    input.value='';if(id!==request)return;
    if(typeof text!=='string'){error.textContent=errorText('not-save');error.dataset.code='not-save';return;}
    await judge(text,id);
   });
   check.addEventListener('click',()=>{const text=area.value;if(!text.trim()){error.textContent=t('transfer.pasteEmpty');return;}void judge(text,++request);});
   back.addEventListener('click',()=>close(null));
   const row=el(doc,'div','v03-panel-actions v03-transfer-actions');row.append(pick);
   const paste=el(doc,'div','v03-transfer-paste');paste.append(el(doc,'small','',t('transfer.orPaste')),area,check);
   box.append(el(doc,'h2','v03-panel-title',t('transfer.restoreTitle',{slot})),el(doc,'p','v03-panel-note',t('transfer.restoreNote')),input,row,paste,error,back);
  });
  if(disposed||!inspected)return null;
  const summary=slotSummary(inspected.meta,describe);
  const accepted=await title.panel((box,close)=>{
   box.classList.add('is-confirm','v03-transfer');
   const info=card(doc,summary),saved=when(doc,inspected.summary.savedAt);
   if(saved)info.append(el(doc,'small','',t('transfer.savedAt',{when:saved})));
   info.append(el(doc,'small','',t('transfer.build',{build:inspected.summary.build})));
   if(inspected.check!=='sha256')info.append(el(doc,'small','',t('transfer.weakCheck')));
   const row=el(doc,'div','v03-panel-actions'),yes=button(doc,'v03-panel-accept',t('transfer.restoreAccept')),no=button(doc,'v03-panel-back',t('confirm.cancel'));
   yes.addEventListener('click',()=>close(true));no.addEventListener('click',()=>close(false));row.append(yes,no);
   box.append(el(doc,'h2','v03-panel-title',t('transfer.confirmTitle')),info,el(doc,'p','v03-panel-note',t('transfer.confirmNote',{slot})),row);
  });
  if(disposed)return null;
  if(accepted!==true){notice={tone:'info',text:t('transfer.cancelled')};return null;}
  const result=restoreInto({raw:raw(),edition,slot,inspected});
  if(!result.ok){notice={tone:'error',text:errorText(result.code)};return null;}
  notice={tone:'info',text:t('transfer.restored',{slot})};
  refreshLoss();persist();
  return {restored:slot};
 }
 return {
  // picked: {transfer:'export'|'restore',slot} from the slot list.
  async run(picked){
   if(disposed||!picked||!validSlot(picked.slot))return null;
   const meta=readSlotIndex(raw(),edition)[picked.slot-1];
   if(picked.transfer==='export'&&meta.used){await exportFlow(picked.slot);return null;}
   if(picked.transfer==='restore'&&!meta.used)return restoreFlow(picked.slot);
   notice={tone:'error',text:errorText(picked.transfer==='restore'?'slot-filled':'not-save')};return null;
  },
  notice:take,
  // On the title once the language is ready; again after a restore.
  mount:refreshLoss,
  // After a real save: remember that records exist, ask once to keep them.
  saved(){if(disposed)return;checkStorageLoss(raw(),edition);title.setNotice?.(null);persist();},
  inspect:()=>({persist:persistenceRecord(raw(),edition),route:deliveryRoute(view)}),
  dispose(){disposed=true;notice=null;},
 };
}
