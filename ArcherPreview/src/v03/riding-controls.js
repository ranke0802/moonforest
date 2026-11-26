import { arrangeTopActions } from '../hud-top-actions.js';

export function createRidingControls(root, toggle) {
  const doc = root.ownerDocument;
  const attack = root.querySelector('#attack-button');
  const guard = root.querySelector('#guard-button');
  const dodge = root.querySelector('#dodge-button');
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'v03-ride-toggle';
  button.dataset.ui = '';
  button.hidden = true;
  button.setAttribute('aria-keyshortcuts', 'H');
  root.querySelector('.top-actions').append(button);
  arrangeTopActions(root);
  button.onclick = toggle;
  let state;
  const overrides = [];

  function change() {
    root.dispatchEvent(new doc.defaultView.Event('v03ridingchange', { bubbles: true }));
  }
  function override(node, attribute, value) {
    if (!node) return;
    let entry = overrides.find(item => item.node === node && item.attribute === attribute);
    if (!entry) {
      entry = {node, attribute, prior:node.getAttribute(attribute)};
      overrides.push(entry);
    }
    entry.value = value;
    if (value === null) node.removeAttribute(attribute);
    else node.setAttribute(attribute, value);
  }
  function restore() {
    for (const {node, attribute, prior, value} of overrides) {
      if (node.getAttribute(attribute) !== value) continue;
      if (prior === null) node.removeAttribute(attribute);
      else node.setAttribute(attribute, prior);
    }
    overrides.length = 0;
  }
  function show(next, available, labels) {
    const mounted = next === 'mounted';
    const wasMounted = state === 'mounted';
    const caption = mounted ? labels.dismount : (next === 'loading' || next === 'approaching') ? labels.cancel : labels.mount;
    button.hidden = !available;
    button.disabled = next === 'mounting' || next === 'dismounting' || next === 'departing' || next === 'falling';
    button.textContent = caption;
    button.setAttribute('aria-label', caption);
    button.title = caption + ' (H)';
    button.setAttribute('aria-pressed', String(mounted));
    root.dataset.v03Riding = state = next;
    // Return the touch interaction label to its owner before taking the attack button.
    if (mounted && !wasMounted) change();
    if (mounted) {
      override(attack, 'aria-label', labels.gallop);
      override(attack, 'title', labels.gallop);
      override(guard, 'aria-label', labels.dismount);
      override(guard, 'title', labels.dismount + ' (F)');
      override(guard, 'aria-keyshortcuts', 'F');
      override(guard, 'aria-pressed', null);
      override(dodge, 'aria-label', labels.gallop);
      override(dodge, 'title', labels.gallop + ' (Space)');
    } else if (wasMounted) {
      restore();
      change();
    }
  }
  return { button, show, dispose() {
    restore();
    delete root.dataset.v03Riding;
    button.onclick = null;
    button.remove();
  } };
}
