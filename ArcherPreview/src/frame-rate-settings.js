// v2 (2026-11-19): the v1 value was mostly the old 60 default; PC now starts at 120.
export const FRAME_RATE_KEY='moonforest-frame-rate-v2';
export const FRAME_RATES=[30,60,120];
// PC defaults to 120 (2026-11-19): a frame that fits 8.3 ms leaves a phone at
// 60 fps half its budget idle. Touch devices keep 60 by default.
export const defaultFrameRate=touch=>touch?60:120;
export function readFrameRate(storage,touch=false){try{const value=Number(storage?.getItem(FRAME_RATE_KEY));return FRAME_RATES.includes(value)?value:defaultFrameRate(touch);}catch{return defaultFrameRate(touch);}}
export function setupFrameRateControl({select,storage,activity,onChange=()=>{}}){
  const apply=value=>{const fps=activity.setTargetFps(value);select.value=String(fps);onChange(fps);return fps;};
  const base=defaultFrameRate(activity.touchDevice);
  for(const option of select.options??[])if(Number(option.value)===base&&!/·/.test(option.textContent))option.textContent+=' · 기본';
  apply(readFrameRate(storage,activity.touchDevice));
  const change=()=>{const fps=apply(select.value);try{storage?.setItem(FRAME_RATE_KEY,String(fps));}catch{/* Keep the session choice when storage is unavailable. */}};
  select.addEventListener('change',change);
  return {dispose:()=>select.removeEventListener('change',change)};
}
