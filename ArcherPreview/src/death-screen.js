export function setupDeathScreen({beforeOpen,onRestart}){
  const dialog=document.querySelector('#death-dialog'),button=document.querySelector('#death-restart');
  let restarting=false;
  dialog.addEventListener('cancel',event=>event.preventDefault());
  button.addEventListener('click',()=>{
    if(!dialog.open||restarting)return;
    restarting=true;
    // Encounter teardown can still report the previous HP before the reset.
    try{dialog.close();onRestart();}finally{restarting=false;}
  });
  return {
    isOpen:()=>dialog.open||restarting,
    show(){
      if(dialog.open||restarting)return;
      beforeOpen();
      for(const other of document.querySelectorAll('dialog[open]'))other.close();
      dialog.showModal();button.focus({preventScroll:true});
    },
  };
}
