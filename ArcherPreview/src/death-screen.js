export function setupDeathScreen({beforeOpen,onRestart}){
  const dialog=document.querySelector('#death-dialog'),button=document.querySelector('#death-restart');
  dialog.addEventListener('cancel',event=>event.preventDefault());
  button.addEventListener('click',()=>{if(!dialog.open)return;dialog.close();onRestart();});
  return {
    isOpen:()=>dialog.open,
    show(){
      if(dialog.open)return;
      beforeOpen();
      for(const other of document.querySelectorAll('dialog[open]'))other.close();
      dialog.showModal();button.focus({preventScroll:true});
    },
  };
}
