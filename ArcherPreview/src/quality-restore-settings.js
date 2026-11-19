// Three performance trims of 2026-11-18 that cost visible quality for little
// gain once the static shadow cache landed (reviewed 2026-11-19). Each is
// restored by default and keeps a switch, so a device can be compared both ways.
export const QUALITY_RESTORE_KEY='moonforest-quality-restore-v1';
export const QUALITY_RESTORE_DEFAULTS=Object.freeze({steadyShadows:true,farActorShadows:true,farOutlines:true});
const ROWS=Object.freeze([
 ['steadyShadows','quality-steady-shadows',' 그림자 매 프레임 갱신','끄면 프레임이 모자랄 때 움직이는 그림자를 두 프레임에 한 번만 다시 그립니다.'],
 ['farActorShadows','quality-far-actor-shadows',' 먼 몬스터 그림자','끄면 32m보다 먼 몬스터·인물은 그림자를 그리지 않습니다.'],
 ['farOutlines','quality-far-outlines',' 먼 캐릭터 외곽선','끄면 32m보다 먼 몬스터·인물의 외곽선을 생략합니다. 주인공 외곽선은 항상 그립니다.'],
]);
export function readQualityRestore(storage){
 const value={...QUALITY_RESTORE_DEFAULTS};
 try{const saved=JSON.parse(storage?.getItem(QUALITY_RESTORE_KEY)??'null');if(saved&&typeof saved==='object')for(const key of Object.keys(value))if(typeof saved[key]==='boolean')value[key]=saved[key];}catch{/* unreadable: defaults */}
 return value;
}
export function setupQualityRestoreSettings({host,storage,onChange=()=>{}}){
 const doc=host.ownerDocument,value=readQualityRestore(storage),nodes=[],listeners=[];
 for(const [key,id,text,hint]of ROWS){
  const label=doc.createElement('label'),input=doc.createElement('input'),note=doc.createElement('small');
  input.type='checkbox';input.id=id;input.checked=value[key];label.append(input,text);note.textContent=hint;host.append(label,note);
  const change=()=>{value[key]=input.checked;try{storage?.setItem(QUALITY_RESTORE_KEY,JSON.stringify(value));}catch{/* storage optional */}onChange({...value});};
  input.addEventListener('change',change);nodes.push(label,note);listeners.push([input,change]);
 }
 return {get value(){return {...value};},dispose(){for(const [input,change]of listeners)input.removeEventListener('change',change);for(const node of nodes)node.remove();}};
}
