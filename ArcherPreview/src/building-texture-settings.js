const preferenceKey = 'building-texture-quality-v1';
const normalize = value => value === 'high' ? 'high' : 'standard';

export function setupBuildingTextureSettings({host, storage}) {
  let value = 'standard';
  try { value = normalize(storage?.getItem(preferenceKey)); } catch { /* Private storage is optional. */ }
  const listeners = new Set();
  const doc = host.ownerDocument;
  const label = doc.createElement('label');
  label.textContent = '건물 텍스처';
  const select = doc.createElement('select');
  select.id = 'building-texture-quality';
  select.className = 'quality-select';
  for (const [mode, title] of [['standard', '일반 · 2K'], ['high', '고화질 · 4K']]) {
    const option = doc.createElement('option');
    option.value = mode;
    option.textContent = title;
    option.selected = mode === value;
    select.append(option);
  }
  function change() {
    const next = normalize(select.value);
    if (next === value) return;
    value = next;
    try { storage?.setItem(preferenceKey, value); } catch { /* Keep the session choice. */ }
    for (const notify of listeners) notify(value);
  }
  select.addEventListener('change', change);
  label.append(select);
  host.append(label);
  return {
    get value() { return value; },
    subscribe(notify) { listeners.add(notify); return () => listeners.delete(notify); },
    dispose() { select.removeEventListener('change', change); listeners.clear(); label.remove(); }
  };
}
