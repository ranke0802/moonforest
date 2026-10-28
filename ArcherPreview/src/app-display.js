// iOS home-screen apps do not expose document.fullscreenElement.
export function isInstalledDisplay(host = globalThis) {
  return host.navigator?.standalone === true ||
    Boolean(host.matchMedia?.('(display-mode: standalone)')?.matches) ||
    Boolean(host.matchMedia?.('(display-mode: fullscreen)')?.matches);
}
