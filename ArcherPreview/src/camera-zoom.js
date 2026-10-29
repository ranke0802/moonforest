// A fixed reference across maps/orientations makes the displayed magnification
// useful for choosing limits. This is orbit zoom, not render resolution or DPR.
export const minimumCameraRadius = camera => Math.max(.1, (camera.minZ ?? .05) * 2);

export function zoomCamera(camera, factor) {
  const radius = camera.radius * factor;
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(radius)) return;
  camera.radius = Math.max(camera.lowerRadiusLimit ?? minimumCameraRadius(camera),
    Math.min(camera.upperRadiusLimit ?? Infinity, radius));
}

export class CameraZoom {
  constructor(camera, {referenceRadius = 17, storage, key = 'moonforest-camera-zoom-world-v1'} = {}) {
    this.camera = camera; this.referenceRadius = referenceRadius; this.storage = storage; this.key = key;
    this.defaults = Object.freeze({minEnabled:true, maxEnabled:true,
      minZoom:referenceRadius / (camera.upperRadiusLimit ?? 82),
      maxZoom:referenceRadius / (camera.lowerRadiusLimit ?? .8)});
    this.settings = {...this.defaults};
    try { const saved = JSON.parse(storage?.getItem(key) ?? 'null'); if (this.valid(saved)) this.settings = saved; }
    catch { /* Missing/invalid storage uses the existing camera range. */ }
    this.apply();
  }
  valid(s) {
    return s && typeof s.minEnabled === 'boolean' && typeof s.maxEnabled === 'boolean'
      && Number.isFinite(s.minZoom) && Number.isFinite(s.maxZoom)
      && s.minZoom > 0 && s.minZoom <= s.maxZoom && s.maxZoom <= this.referenceRadius / minimumCameraRadius(this.camera);
  }
  update(patch) {
    const next = {...this.settings, ...patch};
    if (!this.valid(next)) throw new RangeError('Invalid camera zoom range');
    this.settings = next; this.apply();
    try { this.storage?.setItem(this.key, JSON.stringify(next)); } catch { /* Session settings still work. */ }
  }
  apply() {
    const s = this.settings, c = this.camera;
    c.lowerRadiusLimit = s.maxEnabled ? this.referenceRadius / s.maxZoom : null;
    c.upperRadiusLimit = s.minEnabled ? this.referenceRadius / s.minZoom : null;
    zoomCamera(c, 1);
  }
  snapshot() {
    return {factor:this.referenceRadius / this.camera.radius, radius:this.camera.radius,
      referenceRadius:this.referenceRadius, ...this.settings};
  }
}

export function setupCameraZoomControls(zoom, {doc = document, onChange = () => {}} = {}) {
  const get = id => doc.getElementById(id), minOn = get('camera-min-enabled'), maxOn = get('camera-max-enabled');
  const min = get('camera-min-zoom'), max = get('camera-max-zoom'), status = get('camera-zoom-status');
  const sync = () => {
    const s = zoom.settings;
    minOn.checked = s.minEnabled; maxOn.checked = s.maxEnabled;
    // Retain the exact legacy bounds until the user edits a value.
    min.value = String(Number(s.minZoom.toFixed(4))); max.value = String(Number(s.maxZoom.toFixed(4)));
    min.disabled = !s.minEnabled; max.disabled = !s.maxEnabled;
    min.max = max.max = String(zoom.referenceRadius / minimumCameraRadius(zoom.camera));
    min.setAttribute('aria-invalid', 'false'); max.setAttribute('aria-invalid', 'false');
  };
  const save = patch => { zoom.update(patch); sync(); status.textContent = '배율 설정을 적용했습니다.'; onChange(); };
  for (const node of [minOn, maxOn]) node.addEventListener('change', () => save({minEnabled:minOn.checked, maxEnabled:maxOn.checked}));
  get('apply-camera-zoom').addEventListener('click', () => {
    const value = (node, old) => node.value === String(Number(old.toFixed(4))) ? old : Number(node.value);
    const minZoom = value(min, zoom.settings.minZoom), maxZoom = value(max, zoom.settings.maxZoom);
    if (!zoom.valid({...zoom.settings, minZoom, maxZoom})) {
      status.textContent = `0보다 큰 배율로, 최소 ≤ 최대 ≤ ${max.max} 범위에서 입력해 주세요.`;
      min.setAttribute('aria-invalid', 'true'); max.setAttribute('aria-invalid', 'true'); return;
    }
    save({minZoom, maxZoom});
  });
  get('reset-camera-zoom').addEventListener('click', () => save(zoom.defaults));
  sync();
}
