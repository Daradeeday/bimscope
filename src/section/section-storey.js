/**
 * Storey-based section — updateSectionBoxFromStorey, populateStoreysDropdown.
 */
import * as THREE from 'three';
import { state, dom } from '../state.js';
import { getSectionPadding, setSectionBoxFromBox } from './section-box.js';

export function populateStoreysDropdown(storeys) {
  state.storeyIndex = storeys;
  dom.storeySelect.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = storeys.length ? `Select a storey... (${storeys.length})` : 'No IfcBuildingStorey found.';
  dom.storeySelect.appendChild(opt0);
  for (const s of storeys) {
    const o = document.createElement('option');
    o.value = String(s.expressID);
    const label = s.Name || `Storey #${s.expressID}`;
    const elev = Number.isFinite(s.Elevation) ? s.Elevation.toFixed(2) : 'n/a';
    const wy = state.storeyWorldY?.get?.(s.expressID);
    const wyText = Number.isFinite(wy) ? `, worldY≈${wy.toFixed(2)}` : '';
    o.textContent = `${label} (elev=${elev}${wyText}) [${s.expressID}]`;
    dom.storeySelect.appendChild(o);
  }
}

export function updateSectionBoxFromStorey(storeyId) {
  if (!state.ifcModel || state.modelID === null || !state.modelBoxCached) return;
  const pad = getSectionPadding();

  // Top-Down Section Logic:
  // We want to see the selected storey and everything below it.
  // So section box should be:
  //   minY = model's bottom (or very low)
  //   maxY = ceiling of the selected storey

  const idx = state.storeyIndex.findIndex((s) => s.expressID === storeyId);
  if (idx < 0) return;
  const mapped = state.storeyWorldY.get(storeyId);
  const elevRaw = state.storeyIndex[idx].Elevation;
  const elev = Number.isFinite(mapped) ? mapped : (Number.isFinite(elevRaw) ? elevRaw + state.storeyElevationOffset : elevRaw);
  if (!Number.isFinite(elev)) return;

  // Find the next storey above to determine ceiling height
  let nextElev = null;
  for (let i = 0; i < state.storeyIndex.length; i++) {
    const sid2 = state.storeyIndex[i]?.expressID;
    if (!sid2 || sid2 === storeyId) continue;
    const mapped2 = state.storeyWorldY.get(sid2);
    const e2raw = state.storeyIndex[i]?.Elevation;
    const e2 = Number.isFinite(mapped2) ? mapped2 : (Number.isFinite(e2raw) ? e2raw + state.storeyElevationOffset : e2raw);
    if (!Number.isFinite(e2)) continue;
    if (e2 <= elev + 1e-6) continue;
    if (nextElev === null || e2 < nextElev) nextElev = e2;
  }
  const defaultH = state.modelMaxDim ? Math.max(2.8, state.modelMaxDim * 0.08) : 3.0;

  // Top-Down: 
  // minY = modelBoxCached.min.y (bottom of model)
  // maxY = ceiling of current level + user offset
  const offset = Number(dom.levelOffset?.value) || -0.70; // Default -0.70m
  const minY = state.modelBoxCached.min.y - pad;
  const maxY = (nextElev !== null ? Math.max(nextElev, elev + 0.1) : elev + defaultH) + offset + pad;

  const b = state.modelBoxCached.clone();
  b.min.y = minY;
  b.max.y = maxY;

  // Clear visible IDs (show everything within the box)
  state.sectionVisibleIds = [];

  setSectionBoxFromBox(b, 0);
  dom.viewerMeta.textContent = `Level View: Storey ${storeyId} (Top-Down, Offset ${offset}m)`;
}
