import { arrangeTopActions } from '../hud-top-actions.js';

export function createRidingControls(root, toggle) {
  const doc = root.ownerDocument;
  const attack = root.querySelector('#attack-button');
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'v03-ride-toggle';
  button.dataset.ui = '';
  button.hidden = true;
  button.setAttribute('aria-keyshortcuts', 'H');
  root.querySelector('.top-actions').append(button);
  arrangeTopActions(root);
  button.onclick = toggle;
  let state, priorAttack, gallopLabel;

  function change() {
    root.dispatchEvent(new doc.defaultView.Event('v03ridingchange', { bubbles: true }));
  }
  function restoreAttack() {
    if (!priorAttack) return;
    for (const [attribute, value] of priorAttack) {
      if (attack.getAttribute(attribute) !== gallopLabel) continue;
      if (value === null) attack.removeAttribute(attribute);
      else attack.setAttribute(attribute, value);
    }
    priorAttack = null;
  }
  function show(next, available, labels) {
    const mounted = next === 'mounted';
    const wasMounted = state === 'mounted';
    const caption = mounted ? labels.dismount : next === 'loading' ? labels.cancel : labels.mount;
    button.hidden = !available;
    button.textContent = caption;
    button.setAttribute('aria-label', caption);
    button.title = caption + ' (H)';
    button.setAttribute('aria-pressed', String(mounted));
    root.dataset.v03Riding = state = next;
    // Return the touch interaction label to its owner before taking the attack button.
    if (mounted && !wasMounted) {
      change();
      if (attack) priorAttack = ['aria-label', 'title'].map(key => [key, attack.getAttribute(key)]);
    }
    if (mounted && attack) {
      gallopLabel = labels.gallop;
      attack.setAttribute('aria-label', gallopLabel);
      attack.title = gallopLabel;
    } else if (wasMounted) {
      restoreAttack();
      change();
    }
  }
  return { button, show, dispose() {
    restoreAttack();
    delete root.dataset.v03Riding;
    button.onclick = null;
    button.remove();
  } };
}
