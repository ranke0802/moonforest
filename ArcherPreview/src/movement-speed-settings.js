export const MOVEMENT_SPEED_KEY='moonforest-movement-speed-v1';
export const defaultMovementSpeed=()=>({walk:1,sprint:1.8});
export function normalizeMovementSpeed(value){
 const numeric=(v,fallback,min,max)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
 return {walk:numeric(value?.walk,1,.5,2),sprint:numeric(value?.sprint,1.8,.5,3)};
}
export function setupMovementSpeedSettings({host,storage,onChange=()=>{}}){
 const doc=host.ownerDocument,box=doc.createElement('div');box.className='camera-zoom-options';
 box.innerHTML='<label>기본 이동속도 <input type="range" data-move="walk" min="0.5" max="2" step="0.05"><output data-move-value="walk"></output></label><label>달리기 속도 <input type="range" data-move="sprint" min="0.5" max="3" step="0.05"><output data-move-value="sprint"></output></label><button type="button" data-move-reset>이동속도 초기화</button><small>기본 이동은 1.00배, 달리기는 기본 이동속도의 1.80배입니다. 설정은 이 브라우저에 저장됩니다.</small>';
 host.append(box);let value=defaultMovementSpeed();try{const raw=storage?.getItem(MOVEMENT_SPEED_KEY);if(raw)value=normalizeMovementSpeed(JSON.parse(raw));}catch{/* Retain the default when stored settings are unavailable. */}
 function render(){for(const key of ['walk','sprint']){box.querySelector('[data-move='+key+']').value=String(value[key]);box.querySelector('[data-move-value='+key+']').textContent=value[key].toFixed(2)+'×';}}
 function update(next){value=normalizeMovementSpeed(next);render();try{storage?.setItem(MOVEMENT_SPEED_KEY,JSON.stringify(value));}catch{/* Session setting still applies. */}onChange({...value});}
 const input=event=>{const key=event.target.dataset.move;if(key==='walk'||key==='sprint')update({...value,[key]:Number(event.target.value)});};
 const reset=()=>update(defaultMovementSpeed());box.addEventListener('input',input);box.querySelector('[data-move-reset]').addEventListener('click',reset);render();
 return {get value(){return {...value};},apply(controller){controller?.setMovementSpeed?.(value);},dispose(){box.removeEventListener('input',input);box.querySelector('[data-move-reset]').removeEventListener('click',reset);box.remove();}};
}
