// 0.3 road travel without the loading screen (next-map-prefetch.js quietFor): the picture
// the player left stays on screen, as a still copy over the game canvas, until the arrival
// is ready; then it dissolves into the live picture. Without it the half-built destination
// showed while the loading screen was held back (Astra 2026-11-28: the character before
// the ground, the horse gone for a moment).
//
// One 2D canvas, made for one travel and emptied afterwards. It sits right after the game
// canvas, so the HUD and the loading screen (later siblings) stay above it, and it takes no
// pointer events. Only `opacity` changes while it is up.
export const HELD_FRAME_FADE_MS=180,HELD_FRAME_PIXELS=4_000_000;

export function createHeldFrame({canvas,doc=canvas?.ownerDocument,maxPixels=HELD_FRAME_PIXELS,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let surface=null,held=false,leaving=null,timer=null;
  const empty=copy=>{copy.remove();copy.width=copy.height=0;};
  const finish=()=>{if(timer!==null){clearTimer(timer);timer=null;}if(leaving){empty(leaving);leaving=null;}};
  const drop=()=>{finish();if(surface){empty(surface);surface=null;}held=false;};
  return {
    get held(){return held;},
    // render(): draws the game canvas now. The copy is taken in the same task because the
    // drawing buffer is not preserved. false = nothing is held (the caller shows its screen).
    hold(render){
      drop();
      if(!canvas||!doc?.createElement)return false;
      let copy=null;
      try{
        render?.();
        const width=canvas.width,height=canvas.height;if(!(width>0&&height>0))return false;
        const scale=Math.min(1,Math.sqrt(maxPixels/(width*height)));
        copy=doc.createElement('canvas');copy.width=Math.max(1,Math.round(width*scale));copy.height=Math.max(1,Math.round(height*scale));
        const context=copy.getContext('2d',{alpha:false});if(!context){copy.width=copy.height=0;return false;}
        context.drawImage(canvas,0,0,copy.width,copy.height);
      }catch{if(copy)copy.width=copy.height=0;return false;}
      copy.setAttribute('aria-hidden','true');copy.dataset.heldFrame='';
      copy.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;opacity:1';
      canvas.after(copy);surface=copy;held=true;return true;
    },
    // fadeMs>0: dissolve into the live picture; 0: gone at once (the loading screen covers it,
    // or the travel failed). Reduced motion (html[data-mf-motion]) never dissolves.
    release(fadeMs=0){
      if(!surface)return;
      finish();held=false;
      if(!(fadeMs>0)||'mfMotion' in (doc.documentElement?.dataset??{})){empty(surface);surface=null;return;}
      leaving=surface;surface=null;
      leaving.style.transition=`opacity ${fadeMs}ms linear`;leaving.style.opacity='0';
      timer=setTimer(()=>{timer=null;finish();},fadeMs+34);
    },
    dispose:drop,
  };
}
