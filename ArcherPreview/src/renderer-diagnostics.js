import {t} from './v03/i18n.js';

const softwareRenderer = /\b(?:swiftshader|llvmpipe|softpipe|lavapipe|software rasterizer|microsoft basic render driver|microsoft warp(?: renderer)?|gdi generic)\b/i;
const hardwareRenderer = /\b(?:adreno|mali|immortalis|powervr|geforce|radeon|quadro|tegra|apple [am]\d+|intel(?:\(r\))?\s+(?:hd|uhd|iris|arc))\b/i;

// Babylon caches these strings when it creates the WebGL context. Masked
// names (including bare "ANGLE") do not establish how rendering is done.
export function readRendererInfo(engine) {
  const renderer = engine?.getGlInfo?.()?.renderer?.trim() || null;
  const version = engine?.webGLVersion;
  let mode = 'unknown';
  if (softwareRenderer.test(renderer)) mode = 'software';
  else if (hardwareRenderer.test(renderer)) mode = 'hardware';
  return {renderer, mode, api: version === 2 ? 'WebGL 2' : version === 1 ? 'WebGL 1' : null};
}

export function rendererDetail(info) {
  return t('gpu.detail', {
    name: info.renderer || t('gpu.unknown'),
    mode: t('gpu.' + info.mode),
    api: info.api || t('gpu.unknown'),
  });
}

const noticeKey = 'moonforest:software-renderer-notice:v1';
const notifiedDocuments = new WeakSet();

function settingsMessage(navigator) {
  const agent = navigator?.userAgent ?? '';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(agent) ||
    (navigator?.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!mobile && /(?:Edg|Chrome)\//.test(agent)) {
    return t('gpu.desktopHelp', {settings: /Edg\//.test(agent) ? 'edge://settings/system' : 'chrome://settings/system'});
  }
  return t('gpu.generalHelp');
}

// Use origin storage across saves and editions. If storage is restricted,
// fall back to the tab, then to this document.
export function showSoftwareRendererNotice(info, {doc, view, onChange}) {
  if (info.mode !== 'software' || notifiedDocuments.has(doc)) return;
  const stores = [];
  for (const key of ['localStorage', 'sessionStorage']) {
    try {
      const storage = view[key];
      if (storage?.getItem(noticeKey) === '1') return;
      if (storage) stores.push(storage);
    } catch { /* Storage can be blocked. */ }
  }
  const dialog = doc.createElement('dialog');
  if (typeof dialog.showModal !== 'function') return;
  dialog.id = 'software-renderer-notice';
  dialog.className = 'motion-speed-dialog';
  dialog.setAttribute('data-ui', '');
  dialog.setAttribute('aria-labelledby', 'software-renderer-title');
  dialog.setAttribute('aria-describedby', 'software-renderer-help');
  const heading = doc.createElement('h2'), help = doc.createElement('p'), ok = doc.createElement('button');
  heading.id = 'software-renderer-title';
  heading.textContent = t('gpu.notice');
  help.id = 'software-renderer-help';
  help.textContent = settingsMessage(view.navigator);
  ok.type = 'button';
  ok.autofocus = true;
  ok.textContent = t('confirm.ok');
  ok.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { dialog.remove(); onChange(); }, {once:true});
  const footer = doc.createElement('footer');
  footer.append(ok);
  dialog.append(heading, help, footer);
  doc.body.append(dialog);
  try { dialog.showModal(); } catch { dialog.remove(); return; }
  notifiedDocuments.add(doc);
  for (const storage of stores) {
    try { storage.setItem(noticeKey, '1'); break; } catch { /* Try the next store. */ }
  }
  onChange();
}
