// Event-only recovery: no per-frame polling, GPU waits, or extra render pass.
export function createContextRecovery(engine,{timeoutMs=20000,setTimer=setTimeout,clearTimer=clearTimeout,onLost=()=>{},onRestored=()=>{},onTimeout=()=>{}}={}){
 let state='ready',timer=null,losses=0,disposed=false;
 const clear=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 const lost=()=>{
  if(disposed||state!=='ready')return;
  state='recovering';losses++;onLost();
  timer=setTimer(()=>{timer=null;if(disposed||state!=='recovering')return;state='failed';onTimeout();},timeoutMs);
 };
 const restored=()=>{
  // A late restoration after the deadline must not silently resume combat.
  if(disposed||state!=='recovering')return;
  clear();state='ready';onRestored();
 };
 const lostObserver=engine.onContextLostObservable.add(lost),restoredObserver=engine.onContextRestoredObservable.add(restored);
 return {get blocked(){return state!=='ready';},snapshot(){return {state,losses,timeoutMs};},dispose(){if(disposed)return;disposed=true;clear();engine.onContextLostObservable.remove(lostObserver);engine.onContextRestoredObservable.remove(restoredObserver);}};
}

export function createContextRecoveryNotice(doc=document,{reload=()=>globalThis.location.reload()}={}){
 const panel=doc.createElement('dialog'),title=doc.createElement('h2'),message=doc.createElement('p'),button=doc.createElement('button'),style=doc.createElement('style');
 panel.className='context-recovery-notice';panel.setAttribute('aria-labelledby','context-recovery-title');title.id='context-recovery-title';button.type='button';button.textContent='다시 불러오기';button.hidden=true;
 style.textContent='.context-recovery-notice{position:fixed;inset:0;margin:auto;width:min(440px,calc(100vw - 48px));max-height:calc(100dvh - 48px);box-sizing:border-box;padding:26px;color:#f6ecd0;background:#14251f;border:1px solid #ab9560;border-radius:10px;text-align:center;font:16px/1.6 sans-serif}.context-recovery-notice::backdrop{background:#0009}.context-recovery-notice h2{font-size:22px;margin:0 0 12px}.context-recovery-notice button{font:inherit;padding:10px 24px;border:1px solid #ab9560;background:#384b37;color:#fff0ca;border-radius:5px}.context-recovery-notice button[hidden]{display:none}';
 panel.append(title,message,button);doc.body.append(style,panel);
 panel.addEventListener('cancel',event=>event.preventDefault());button.addEventListener('click',()=>{button.disabled=true;reload();});
 const open=()=>{if(panel.open)return;if(panel.showModal)panel.showModal();else panel.setAttribute('open','');};
 return {
  show(){title.textContent='화면을 복구하고 있습니다';message.textContent='그래픽 연결이 일시적으로 끊겼습니다. 복구하는 동안 게임을 멈춥니다.';button.hidden=true;button.disabled=false;open();},
  fail(){title.textContent='화면을 복구하지 못했습니다';message.textContent='다시 불러오기를 눌러 주세요. 브라우저에 저장된 진행과 리소스는 지우지 않습니다.';button.hidden=false;open();button.focus?.();},
  hide(){if(panel.close)panel.close();else panel.removeAttribute('open');},
  dispose(){panel.remove();style.remove();},
 };
}
