/**
 * Viewer splitter — drag to resize the 3D viewport height.
 */
import { dom } from '../state.js';

export function initSplitter() {
  if (!dom.viewerSplitter || !dom.viewer3d) return;

  let dragging = false;
  let startY = 0;
  let startH = 0;

  const onMove = (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    const next = Math.max(180, startH + dy);
    dom.viewer3d.style.height = `${next}px`;
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
  };

  dom.viewerSplitter.addEventListener('mousedown', (e) => {
    dragging = true;
    startY = e.clientY;
    startH = dom.viewer3d.getBoundingClientRect().height;
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
