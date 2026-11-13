// Persistent, screen-centred hold instruction. One element; no frame timer,
// world projection or writes while its visible text/state is unchanged.
export function setupWolfMaulNotice(root){
 const node=root.ownerDocument.createElement('div');node.id='wolf-maul-escape-notice';node.hidden=true;node.setAttribute('role','status');node.setAttribute('aria-live','polite');
 Object.assign(node.style,{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:'max-content',maxWidth:'calc(100% - 32px)',textAlign:'center',pointerEvents:'none',zIndex:'1100',color:'#fff0c6',background:'none',border:'0',font:"700 clamp(20px,3.5vmin,32px)/1.5 MoonforestUI,'Malgun Gothic',sans-serif",webkitTextStroke:'.8px #10160e',paintOrder:'stroke fill',textShadow:'-1px 0 #10160e,1px 0 #10160e,0 -1px #10160e,0 1px #10160e,0 2px 3px #0009'});
 root.append(node);let previous='';
 return {node,update(grab){const message=grab?.active&&grab.escapePrompt?grab.escapePrompt:'';if(message===previous)return;previous=message;node.textContent=message;node.hidden=!message;},dispose(){node.remove();}};
}
