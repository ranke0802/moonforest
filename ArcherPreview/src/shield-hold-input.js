// One stance owns every physical shield source. Losing focus cancels rather
// than turning an unfinished hold into a short shield push.
export class ShieldHoldSources {
  constructor({onBegin=()=>true,onEnd=()=>{},onCancel=()=>{}}={}){
    this.onBegin=onBegin;this.onEnd=onEnd;this.onCancel=onCancel;this.sources=new Map();
  }
  setHeld(source,held,pointerType='unknown'){
    if(held){
      if(this.sources.has(source))return true;
      if(!this.sources.size&&this.onBegin()===false)return false;
      this.sources.set(source,pointerType);return true;
    }
    if(!this.sources.delete(source))return false;
    if(!this.sources.size)this.onEnd();
    return true;
  }
  cancel(source){
    if(source!==undefined){if(!this.sources.delete(source))return false;if(this.sources.size)return true;}
    else this.sources.clear();
    this.onCancel();return true;
  }
  hasTouchHud(pointerType){
    let touch=false,mouse=false;
    for(const [source,type]of this.sources)if(source.startsWith('button:')){if(type==='mouse')mouse=true;else touch=true;}
    return touch&&(!!pointerType||!mouse);
  }
}

export function bindShieldHoldButton(button,{setHeld,cancel,tap,now=()=>performance.now(),windowTarget=window}={}){
  const abort=new AbortController(),options={signal:abort.signal},owned=new Set();let lastPress=-Infinity;
  button.addEventListener('pointerdown',event=>{
    if(event.button!==0||button.disabled)return;
    event.preventDefault();lastPress=now();
    if(setHeld(true,'button:'+event.pointerId,event.pointerType)===false)return;
    owned.add(event.pointerId);
    try{button.setPointerCapture(event.pointerId);}catch{/* Global release still owns this press. */}
  },options);
  const finish=(event,cancelled=false)=>{
    if(!owned.delete(event.pointerId))return;
    if(!cancelled)event.preventDefault();
    if(cancelled)cancel('button:'+event.pointerId);else setHeld(false,'button:'+event.pointerId);
    if(button.hasPointerCapture?.(event.pointerId))try{button.releasePointerCapture(event.pointerId);}catch{}
  };
  button.addEventListener('pointerup',event=>finish(event),options);
  for(const name of ['pointercancel','lostpointercapture'])button.addEventListener(name,event=>finish(event,true),options);
  // Capturing is unavailable on some embedded WebViews; release still ends the
  // same physical press when the finger leaves the button.
  windowTarget.addEventListener('pointerup',event=>finish(event),{...options,capture:true});
  windowTarget.addEventListener('pointercancel',event=>finish(event,true),{...options,capture:true});
  button.addEventListener('click',event=>{if(!button.disabled&&event.detail===0&&now()-lastPress>350)tap();},options);
  return {dispose(){for(const id of owned)cancel('button:'+id);owned.clear();abort.abort();}};
}
