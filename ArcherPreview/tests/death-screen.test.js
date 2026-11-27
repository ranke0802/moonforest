import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {setupDeathScreen} from '../src/death-screen.js';

test('stale death notifications during restart cannot reopen the death dialog',()=>{
 const {document}=parseHTML('<dialog id="death-dialog"><button id="death-restart"></button></dialog>');
 const previous=globalThis.document;
 globalThis.document=document;
 const dialog=document.querySelector('#death-dialog');
 dialog.close=()=>{dialog.open=false;dialog.removeAttribute('open');};
 dialog.showModal=()=>{dialog.open=true;dialog.setAttribute('open','');};
 let shown=0,restarts=0;
 try{
  const death=setupDeathScreen({
   beforeOpen:()=>shown++,
   onRestart:()=>{
    restarts++;
    assert.equal(dialog.open,false);
    assert.equal(death.isOpen(),true);
    death.show();
   }
  });
  death.show();
  document.querySelector('#death-restart').click();
  assert.equal(restarts,1);
  assert.equal(shown,1);
  assert.equal(death.isOpen(),false);
  death.show();
  assert.equal(death.isOpen(),true);
  assert.equal(shown,2);
 }finally{
  if(previous===undefined)delete globalThis.document;
  else globalThis.document=previous;
 }
});
