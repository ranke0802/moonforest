import { normalizeAttackSpeed } from './controller.js';
import { V2_LABELS, V2_MOTION_DEFAULTS } from './warrior-v2.js';

const STORAGE_KEY='warrior-v2-motion-speeds-v2';
export function setupMotionSpeedControls({getController,beforeOpen}) {
  const $=selector=>document.querySelector(selector),dialog=$('#motion-speed-dialog');
  let saved={};
  try{
    const current=localStorage.getItem(STORAGE_KEY);
    saved=JSON.parse(current||localStorage.getItem('warrior-v2-motion-speeds')||'{}')||{};
    if(!current){delete saved.attack;delete saved.dodge;}
  }catch{/* Use defaults when storage is unavailable. */}
  const speeds=Object.fromEntries(Object.keys(V2_LABELS).map(state=>[state,normalizeAttackSpeed(saved[state]??V2_MOTION_DEFAULTS[state])]));
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(speeds));}catch{/* Keep session values. */}
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
    reset.textContent=`${V2_MOTION_DEFAULTS[state]}×`;reset.title='기본 속도로 복원';reset.setAttribute('aria-label',`${V2_LABELS[state]} 기본 속도로 복원`);
    reset.addEventListener('click',()=>setSpeed(state,V2_MOTION_DEFAULTS[state]));sync(state);
  }
  for(const [state,label] of Object.entries(V2_LABELS)){
    const row=document.createElement('div');row.className='motion-speed-row';
    row.innerHTML=`<label for="motion-speed-${state}">${label}<output for="motion-speed-${state}">1.0×</output></label><div class="attack-speed-slider"><input id="motion-speed-${state}" type="range" min="0.5" max="2" step="0.1" value="1" aria-label="${label} 속도"/><button type="button" aria-label="${label} 속도 1배로 복원" title="1배로 복원">1×</button></div>`;
    $('#motion-speed-options').append(row);
    bind(state,row.querySelector('input'),row.querySelector('output'),row.querySelector('button'));
  }
  bind('dodge',$('#dodge-speed'),$('#dodge-speed-value'),$('#reset-dodge-speed'));
  $('#reset-motion-speeds').addEventListener('click',()=>{for(const state of Object.keys(speeds))setSpeed(state,V2_MOTION_DEFAULTS[state]);});
  $('#motion-speed-toggle').addEventListener('click',()=>{beforeOpen();dialog.showModal();});
  $('#close-motion-speed').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>document.querySelector('#viewport').focus({preventScroll:true}));
  // Require both ends outside so dragging a slider out of the dialog never closes it.
  const outside=event=>{const r=dialog.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
  let backdropPress=false;
  dialog.addEventListener('pointerdown',event=>{backdropPress=event.target===dialog&&outside(event);});
  dialog.addEventListener('click',event=>{if(backdropPress&&event.target===dialog&&outside(event))dialog.close();backdropPress=false;});
  return {
    apply(controller){for(const [state,value] of Object.entries(speeds))controller.setMotionSpeed?.(state,value);},
    setVisible(visible){$('#dodge-speed-control').hidden=!visible;$('#v2-motion-settings').hidden=!visible;$('#monster-motion-settings').hidden=!visible;},
    isOpen:()=>dialog.open,
  };
}
