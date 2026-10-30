// Reparent existing controls, so selection, loading and spawn handlers keep
// their identity. Keeping dialogs under #app also preserves fullscreen.
export function setupSummonPanel(){
  const dialog=document.createElement('dialog');dialog.id='summon-dialog';dialog.className='motion-speed-dialog summon-dialog';dialog.dataset.ui='';dialog.setAttribute('aria-labelledby','summon-title');
  dialog.innerHTML='<header><h2 id="summon-title">몬스터 소환</h2><button id="close-summon" type="button" aria-label="소환 닫기">×</button></header>';
  dialog.append(document.querySelector('#boss-controls'));document.querySelector('#app').append(dialog);
  const open=document.createElement('button');open.id='open-summon';open.type='button';open.className='motion-speed-toggle';open.textContent='소환';open.setAttribute('aria-haspopup','dialog');
  document.querySelector('#motion-speed-toggle').before(open);
  open.addEventListener('click',()=>dialog.showModal());dialog.querySelector('#close-summon').addEventListener('click',()=>dialog.close());
  document.querySelector('.right-tools').hidden=true;
  return dialog;
}
