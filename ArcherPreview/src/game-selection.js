// Selection prevention belongs to the application root, not the input router.
// Never cancel pointer, touch, keyboard, click or scroll events here.
const installed=new WeakMap();
const textInputTypes=new Set(['text','number','search','email','password','tel','url']);

function nativeSelectionTarget(target,root){
  let element=target?.nodeType===1?target:target?.parentElement??target?.parentNode;
  for(;element; element=element.parentElement){
    const tag=element.localName?.toLowerCase();
    if(tag==='textarea'||tag==='select'||tag==='option')return true;
    if(tag==='input'&&textInputTypes.has((element.getAttribute('type')??'text').toLowerCase()))return true;
    const editable=element.getAttribute?.('contenteditable')?.toLowerCase();
    if(editable===''||editable==='true'||editable==='plaintext-only')return true;
    if(editable==='false')return false;
    if(element===root)break;
  }
  return false;
}

export function setupGameSelection(root){
  if(!root?.addEventListener)return {dispose(){}};
  if(installed.has(root))return installed.get(root);
  const preventSelection=event=>{if(!nativeSelectionTarget(event.target,root))event.preventDefault();};
  root.addEventListener('selectstart',preventSelection);
  root.addEventListener('dragstart',preventSelection);
  const preventMenu=event=>event.preventDefault();
  root.addEventListener('contextmenu',preventMenu,true);
  let disposed=false;
  const control={dispose(){
    if(disposed)return;disposed=true;
    root.removeEventListener('selectstart',preventSelection);
    root.removeEventListener('dragstart',preventSelection);
    root.removeEventListener('contextmenu',preventMenu,true);
    installed.delete(root);
  }};
  installed.set(root,control);return control;
}
