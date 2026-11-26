// A yes/no question during play (2026-11-26, user: going straight back to the map
// just left asks first). A modal <dialog>: the accept button says yes; the other
// button, Escape or closing the dialog says no. The refusal holds the focus at
// first, so a key already held for a dodge or an attack cannot agree by accident.
// A/D or the arrows move between the two buttons.
import {t} from './i18n.js';
export function createConfirmDialog({doc,mount=doc.body}){
 const dialog=doc.createElement('dialog');dialog.className='v03-confirm';
 const title=doc.createElement('h2'),message=doc.createElement('p'),row=doc.createElement('div'),yes=doc.createElement('button'),no=doc.createElement('button');
 yes.type=no.type='button';yes.className='v03-confirm-yes';no.className='v03-confirm-no';row.className='v03-confirm-actions';
 row.append(yes,no);dialog.append(title,message,row);mount.append(dialog);
 let settle=null;
 const finish=value=>{const done=settle;settle=null;if(dialog.open)dialog.close();done?.(value);};
 yes.addEventListener('click',()=>finish(true));no.addEventListener('click',()=>finish(false));
 dialog.addEventListener('close',()=>finish(false));
 dialog.addEventListener('keydown',event=>{
  if(event.code==='ArrowLeft'||event.code==='KeyA'){yes.focus?.({preventScroll:true});event.preventDefault();}
  else if(event.code==='ArrowRight'||event.code==='KeyD'){no.focus?.({preventScroll:true});event.preventDefault();}
 });
 return {
  get open(){return settle!==null;},
  // Resolves true only for the accept button.
  ask({title:heading,message:text,accept=t('confirm.ok'),cancel=t('confirm.cancel')}){
   if(settle)return Promise.resolve(false);
   title.textContent=heading;message.textContent=text;yes.textContent=accept;no.textContent=cancel;
   return new Promise(resolve=>{settle=resolve;dialog.showModal();no.focus?.({preventScroll:true});});
  },
  cancel(){finish(false);},
  dispose(){finish(false);dialog.remove();},
 };
}
