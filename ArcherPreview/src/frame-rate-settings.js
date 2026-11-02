export const FRAME_RATE_KEY='moonforest-frame-rate-v1';
export function readFrameRate(storage){try{return storage?.getItem(FRAME_RATE_KEY)==='60'?60:30;}catch{return 30;}}
export function setupFrameRateControl({select,storage,activity,onChange=()=>{}}){
  const apply=value=>{const fps=activity.setTargetFps(value);select.value=String(fps);onChange(fps);return fps;};
  apply(readFrameRate(storage));
  const change=()=>{const fps=apply(select.value);try{storage?.setItem(FRAME_RATE_KEY,String(fps));}catch{/* Keep the session choice when storage is unavailable. */}};
  select.addEventListener('change',change);
  return {dispose:()=>select.removeEventListener('change',change)};
}
