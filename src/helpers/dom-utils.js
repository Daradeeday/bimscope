/**
 * DOM utility helpers — toast notifications, loading overlay, output panel, etc.
 */
import { dom } from '../state.js';

/** Show a toast notification. type: 'success' | 'error' | 'info'. Does not affect app logic. */
export function toast(message, type = 'info', duration = 4000) {
  if (!dom.toastContainer) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  dom.toastContainer.appendChild(el);
  const t = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-4px)';
    setTimeout(() => el.remove(), 200);
  }, duration);
  el.addEventListener('click', () => {
    clearTimeout(t);
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  });
}

export function showLoading(msg = 'Loading model...') {
  if (dom.loadingOverlay) { dom.loadingOverlay.style.display = ''; }
  if (dom.loadingText) { dom.loadingText.textContent = msg; }
}

export function updateLoading(msg) {
  if (dom.loadingText) { dom.loadingText.textContent = msg; }
}

export function hideLoading() {
  if (dom.loadingOverlay) { dom.loadingOverlay.style.display = 'none'; }
}

export function setOutput(data) {
  if (typeof data === 'string') {
    dom.output.textContent = data;
    return;
  }
  dom.output.textContent = JSON.stringify(data, null, 2);
}

export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export function setEnabled(enabled) {
  dom.btnClose.disabled = !enabled;
  dom.btnListTypes.disabled = !enabled;
  dom.btnListSpaces.disabled = !enabled;
  dom.btnInspect.disabled = !enabled;
  dom.btnProps.disabled = !enabled;
  dom.btnTypeProps.disabled = !enabled;
  dom.spaceSelect.disabled = !enabled;
  dom.btnGoSpace.disabled = !enabled;
  dom.btnClearSpace.disabled = !enabled;
  dom.btnIsoView.disabled = !enabled;
  dom.btnResetView.disabled = !enabled;
  dom.sectionMode.disabled = !enabled;
  dom.storeySelect.disabled = !enabled;
  dom.sectionPadding.disabled = !enabled;
  dom.btnSectionReset.disabled = !enabled;
  if (dom.btnExportJSON) dom.btnExportJSON.disabled = !enabled;
  if (dom.btnExportCSV) dom.btnExportCSV.disabled = !enabled;
}
