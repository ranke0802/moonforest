// Play-screen HUD buttons never keep focus after a mouse or touch press
// (2026-11-26, user screenshot): the keyboard is the game controller there, so
// a focused button would show a focus ring at the next key and Space/Enter
// would press it again. A press with the mouse or a finger does not move focus
// (mousedown default prevented, the convention of the action buttons, which
// prevent pointerdown in main.js), and a pointer click that still left focus on
// the button gives it back. Keyboard users who Tab to a button keep focus.
export function releaseFocusAfterPointer(node){
 if(!node?.addEventListener)return ()=>{};
 const down=event=>{if(event.button===0||event.button===undefined)event.preventDefault();};
 const click=event=>{if(event.detail>0&&node.ownerDocument?.activeElement===node)node.blur?.();};
 node.addEventListener('mousedown',down);node.addEventListener('click',click);
 return ()=>{node.removeEventListener('mousedown',down);node.removeEventListener('click',click);};
}
