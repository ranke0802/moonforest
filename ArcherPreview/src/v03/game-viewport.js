// The 0.3 entry and its optional outer frame each own a separate viewport.
// These listeners live for the document, including splash, reload and errors.
if (document.documentElement.classList.contains('v03-viewport')) {
  const viewport = document.querySelector('meta[name="viewport"]');
  // The optional outer frame also serves the 0.4 demo, which keeps its own policy.
  if (!viewport.content.includes('maximum-scale')) viewport.content += ', minimum-scale=1, maximum-scale=1';

  const options = {capture: true, passive: false};
  const preventZoom = event => event.preventDefault();
  document.addEventListener('gesturestart', preventZoom, options);
  document.addEventListener('gesturechange', preventZoom, options);
  // Chromium and Firefox represent a trackpad pinch as Ctrl+wheel. The
  // canvas can still use the event for its own camera. Ordinary wheel events
  // and native button, touch, selection and keyboard events keep their defaults.
  document.addEventListener('wheel', event => {
    if (event.ctrlKey) event.preventDefault();
  }, options);
}
