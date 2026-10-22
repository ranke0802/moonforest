import { normalizeAttackSpeed } from './controller.js';
import { V2_LABELS } from './warrior-v2.js';

const STORAGE_KEY='warrior-v2-motion-speeds';
export function setupMotionSpeedControls({getController,beforeOpen}) {
  const $=selector=>document.querySelector(selector),dialog=$('#motion-speed-dialog');
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{};}catch{/* Use defaults when storage is unavailable. */}
  const speeds=Object.fromEntries(Object.keys(V2_LABELS).map(state=>[state,normalizeAttackSpeed(saved[state])]));
  const fields=new Map();
  function sync(state){
    for(const {input,output} of fields.get(state)||[]){
      input.value=String(speeds[state]);input.setAttribute('aria-valuetext',`${speeds[state].toFixed(1)}배`);
      output.textContent=`${speeds[state].toFixed(1)}×`;
    }
    getController()?.setMotionSpeed(state,speeds[state]);
  }
  function setSpeed(state,value){
    speeds[state]=normalizeAttackSpeed(value);sync(state);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(speeds));}catch{/* Keep session values. */}
  }
  function bind(state,input,output,reset){
    if(!fields.has(state))fields.set(state,[]);
    fields.get(state).push({input,output});
    input.addEventListener('input',()=>setSpeed(state,Number(input.value)));
    reset.addEventListener('click',()=>setSpeed(state,1));sync(state);
  }
  for(const [state,label] of Object.entries(V2_LABELS)){
    const row=document.createElement('div');row.className='motion-speed-row';
    row.innerHTML=`<label for="motion-speed-${state}">${label}<output for="motion-speed-${state}">1.0×</output></label><div class="attack-speed-slider"><input id="motion-speed-${state}" type="range" min="0.5" max="2" step="0.1" value="1" aria-label="${label} 속도"/><button type="button" aria-label="${label} 속도 1배로 복원" title="1배로 복원">1×</button></div>`;
    $('#motion-speed-options').append(row);
    bind(state,row.querySelector('input'),row.querySelector('output'),row.querySelector('button'));
  }
  bind('dodge',$('#dodge-speed'),$('#dodge-speed-value'),$('#reset-dodge-speed'));
  $('#reset-motion-speeds').addEventListener('click',()=>{for(const state of Object.keys(speeds))setSpeed(state,1);});
  $('#motion-speed-toggle').addEventListener('click',()=>{beforeOpen();dialog.showModal();});
  $('#close-motion-speed').addEventListener('click',()=>dialog.close());
  // Require both ends outside so dragging a slider out of the dialog never closes it.
  const outside=event=>{const r=dialog.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
  let backdropPress=false;
  dialog.addEventListener('pointerdown',event=>{backdropPress=event.target===dialog&&outside(event);});
  dialog.addEventListener('click',event=>{if(backdropPress&&event.target===dialog&&outside(event))dialog.close();backdropPress=false;});
  return {
    apply(controller){for(const [state,value] of Object.entries(speeds))controller.setMotionSpeed?.(state,value);},
    setVisible(visible){$('#dodge-speed-control').hidden=!visible;$('#motion-speed-toggle').hidden=!visible;if(!visible&&dialog.open)dialog.close();},
    isOpen:()=>dialog.open,
  };
}
