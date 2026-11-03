// Reorder existing nodes with their listeners and state. Called only at UI
// construction boundaries, never from the frame loop.
export function arrangeTopActions(root){
  const top=root?.querySelector('.top-actions');if(!top)return;
  // The test menu remains available through Escape and its settings entry.
  const menu=top.querySelector('[data-uit-action="menu"]');if(menu)menu.hidden=true;
  for(const [key,selector]of [
    ['fps','#live-fps'],
    ['bag','[data-chapter="bag"],[data-uit-action="inventory"]'],
    ['journal','[data-chapter="journal"],[data-uit-action="journal"]'],
    ['summon','#open-summon'],
    ['fullscreen','#fullscreen-button'],
    ['settings','#motion-speed-toggle'],
  ]){
    const node=top.querySelector(selector);if(!node)continue;
    node.dataset.topAction=key;top.append(node);
  }
}
