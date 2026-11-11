import {RENDER_SCALE_PERCENTAGES,defaultRenderScale,normalizeRenderScale,renderPixelRatio} from './render-policy.js';

export const RENDER_SCALE_KEY='moonforest-render-scale-v1';
export function readRenderScale(storage,touchDevice){
  try{return normalizeRenderScale(storage?.getItem(RENDER_SCALE_KEY),touchDevice);}
  catch{return defaultRenderScale(touchDevice);}
}

// Add this control to the existing display settings without replacing any
// quality/FPS controls or changing the canvas/HUD's CSS dimensions.
export function setupRenderScaleControl({host,select,storage,touchDevice=false,onChange=()=>{}}){
  let owned=null;
  if(!select){
    const doc=host.ownerDocument;
    owned=doc.createElement('div');owned.id='render-scale-options';owned.className='camera-zoom-options';
    const label=doc.createElement('label');label.textContent='3D 해상도';
    select=doc.createElement('select');select.id='render-scale-select';select.className='quality-select';select.setAttribute('aria-label','3D 렌더 해상도');select.setAttribute('aria-describedby','render-scale-help');
    for(const percent of RENDER_SCALE_PERCENTAGES){const option=doc.createElement('option');option.value=String(percent);option.textContent=percent+'%';select.append(option);}
    const help=doc.createElement('small');help.id='render-scale-help';help.textContent='기본 85%. 낮추면 3D 화면의 부하가 줄어듭니다. 글자와 버튼 크기는 같습니다.';
    label.append(select);owned.append(label,help);host.append(owned);
  }
  let value=readRenderScale(storage,touchDevice);
  const apply=next=>{value=normalizeRenderScale(next,touchDevice);select.value=String(value);onChange(value);};
  apply(value);
  const change=()=>{apply(select.value);try{storage?.setItem(RENDER_SCALE_KEY,String(value));}catch{/* Keep the session choice if saving is unavailable. */}};
  select.addEventListener('change',change);
  return {get value(){return value;},select,dispose(){select.removeEventListener('change',change);owned?.remove();}};
}

// Scalar-only diagnostic data; reads existing dimensions without resizing or
// allocating a render target. Requested ratio and actual integer buffer differ
// slightly when the engine rounds a fractional-size backing buffer.
export function renderResolutionSnapshot({engine,canvas,deviceRatio,quality,touchDevice,percent}){
  const selectedPercent=normalizeRenderScale(percent,touchDevice),basePixelRatio=renderPixelRatio(deviceRatio,quality,touchDevice);
  const cssSize=[canvas.clientWidth,canvas.clientHeight],renderSize=engine?[engine.getRenderWidth(),engine.getRenderHeight()]:null;
  return {selectedPercent,basePixelRatio,requestedPixelRatio:renderPixelRatio(deviceRatio,quality,touchDevice,selectedPercent),cssSize,renderSize,effectivePixelRatio:renderSize?renderSize.map((n,i)=>cssSize[i]>0?n/cssSize[i]:null):null,pixels:renderSize?renderSize[0]*renderSize[1]:null};
}
