import './style.css';
import * as THREE from 'three';
import { IFCSPACE, IFCBUILDINGSTOREY } from 'web-ifc';
import { initializeLanguage, setLanguage, getCurrentLanguage } from './i18n.js';
import { openTour } from './tour.js';

// ── Shared state & DOM refs ─────────────────────────────────────────
import { state, ifcLoader, dom } from './state.js';

// ── Helpers ─────────────────────────────────────────────────────────
import { toast, showLoading, updateLoading, hideLoading, setOutput, setEnabled } from './helpers/dom-utils.js';

// ── Viewer ──────────────────────────────────────────────────────────
import { initThree } from './viewer/init-three.js';
import { fitCameraToObject, resetView, setIsometricView, setPerspectiveView } from './viewer/camera.js';
import {
  rebuildDebugGridOverlay,
  rebuildDebugLevelsOverlay,
  rebuildIfcGridOverlay,
  clearEdges,
  buildEdgesOverlay,
  setShadowForModel,
  updateShadowPlaneForModel,
  setModelAppearance,
} from './viewer/overlays.js';

// ── IFC ─────────────────────────────────────────────────────────────
import { initIfc, openIfcFromFile } from './ifc/init-ifc.js';
import { listBasicStructure, inspectLine, getPropertySets, getTypeProperties, parseExpressId } from './ifc/query.js';
import { rebuildSpatialStructureCache } from './ifc/spatial-tree.js';

// ── Section ─────────────────────────────────────────────────────────
import {
  clearSectionBox,
  applySectionForCurrentSelection,
  applyClippingToModel,
  updateSectionUiState,
  registerSectionCallbacks,
  computeSubsetBBox,
} from './section/section-box.js';
import { updateSectionBoxFromRoom, raycastFloorYAt } from './section/section-room.js';
import { updateSectionBoxFromStorey, populateStoreysDropdown } from './section/section-storey.js';

// ── Room ────────────────────────────────────────────────────────────
import { focusRoomByExpressId, clearRoomFocus, populateSpacesDropdown } from './room/room-focus.js';
import { exportRoomJSON, exportRoomCSV } from './room/room-export.js';

// ── Interaction ─────────────────────────────────────────────────────
import { highlightExpressId, onDoubleClick } from './interaction/highlight.js';
import { initSplitter } from './interaction/splitter.js';

// ── Register section callbacks (avoids circular imports) ────────────
registerSectionCallbacks(updateSectionBoxFromRoom, updateSectionBoxFromStorey);

// ── Splitter ────────────────────────────────────────────────────────
initSplitter();

// ══════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════════════════════════════════

// ── Section mode ────────────────────────────────────────────────────

dom.sectionMode.addEventListener('change', () => {
  state.sectionModeValue = dom.sectionMode.value || 'off';
  updateSectionUiState();
  applySectionForCurrentSelection();
});

dom.storeySelect.addEventListener('change', () => {
  const val = dom.storeySelect.value;
  if (val) {
    state.sectionModeValue = 'storey';
    dom.sectionMode.value = 'storey';
    console.log('[storeySelect change] Level selected:', val);
    applySectionForCurrentSelection();
  } else {
    state.sectionModeValue = 'off';
    dom.sectionMode.value = 'off';
    clearSectionBox();
    if (state.ifcModel) state.ifcModel.visible = true;
  }
  updateSectionUiState();
});

dom.spaceSelect.addEventListener('change', () => {
  const selectedId = Number(dom.spaceSelect?.value);
  const displayMode = dom.roomDisplayMode?.value || 'highlight';

  if (!Number.isFinite(selectedId) || selectedId <= 0) {
    clearRoomFocus();
    clearSectionBox();
    // Restore model opacity when no room selected
    if (state.ifcModel) {
      state.ifcModel.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m && m._originalOpacity !== undefined) {
              m.opacity = m._originalOpacity;
              m.transparent = m._originalTransparent;
              m.needsUpdate = true;
              delete m._originalOpacity;
              delete m._originalTransparent;
            }
          }
        }
      });
    }
    return;
  }

  // Update green room highlight
  try {
    clearRoomFocus();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    state.roomHighlightCustomId = `room-highlight-${selectedId}`;
    state.roomSubset = ifcLoader.ifcManager.createSubset({
      modelID: state.modelID,
      ids: [selectedId],
      material: mat,
      scene: state.scene,
      customID: state.roomHighlightCustomId,
      removePrevious: true
    });

    if (state.roomSubset) {
      state.roomSubset.renderOrder = 999;
    }

    try {
      if (state.roomSubset) {
        const worldBox = computeSubsetBBox(state.roomSubset);
        if (worldBox) {
          const c = worldBox.getCenter(new THREE.Vector3());
          const s = worldBox.getSize(new THREE.Vector3());
          state.roomSubsetWorldBox = worldBox.clone();
          state.roomSubsetBboxCenter = c.clone();
          console.log('[spaceSelect change] room-highlight world bbox center/size:', c.toArray(), s.toArray());
        } else {
          state.roomSubsetWorldBox = null;
          state.roomSubsetBboxCenter = null;
          console.log('[spaceSelect change] room-highlight world bbox is empty');
        }
      } else {
        state.roomSubsetWorldBox = null;
        state.roomSubsetBboxCenter = null;
      }
    } catch (err) {
      console.log('[spaceSelect change] bbox error:', err);
      state.roomSubsetWorldBox = null;
      state.roomSubsetBboxCenter = null;
    }
    console.log('[spaceSelect change] Updated green room highlight for ID:', selectedId);
  } catch (e) {
    console.error('[spaceSelect change] Error updating room highlight:', e);
  }

  // Apply display mode based on user preference
  console.log('[spaceSelect change] Display mode:', displayMode);

  if (displayMode === 'highlight') {
    // HIGHLIGHT MODE: Make model semi-transparent, show green highlight
    clearSectionBox();
    if (state.roomSubset) state.roomSubset.visible = true;
    if (state.ifcModel) {
      state.ifcModel.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m && m._originalOpacity === undefined) {
              m._originalOpacity = m.opacity;
              m._originalTransparent = m.transparent;
            }
            if (m) {
              m.transparent = true;
              m.opacity = 0.35;
              m.needsUpdate = true;
            }
          }
        }
      });
    }
  } else if (displayMode === 'sectionbox') {
    // SECTION BOX MODE: Clip areas outside the room
    if (state.roomSubset) state.roomSubset.visible = false;
    if (state.ifcModel) {
      state.ifcModel.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m && m._originalOpacity !== undefined) {
              m.opacity = m._originalOpacity;
              m.transparent = m._originalTransparent;
              m.needsUpdate = true;
              delete m._originalOpacity;
              delete m._originalTransparent;
            }
          }
        }
      });
    }

    let currentMode = dom.sectionMode?.value || 'off';
    if (currentMode === 'off') {
      dom.sectionMode.value = 'room';
      currentMode = 'room';
      state.sectionModeValue = 'room';
      updateSectionUiState();
      console.log('[spaceSelect change] Auto-switched mode to "room"');
    }

    if (currentMode === 'room') {
      console.log('[spaceSelect change] Calling applySectionForCurrentSelection with delay');
      setTimeout(() => {
        applySectionForCurrentSelection();
      }, 100);
    }
  }
});

// Re-apply display mode when user changes the mode dropdown
dom.roomDisplayMode.addEventListener('change', () => {
  const selectedId = Number(dom.spaceSelect?.value);
  if (Number.isFinite(selectedId) && selectedId > 0) {
    dom.spaceSelect.dispatchEvent(new Event('change'));
  }
});

dom.sectionPadding.addEventListener('change', () => {
  applySectionForCurrentSelection();
  applyClippingToModel();
});

dom.btnSectionReset.addEventListener('click', () => {
  state.sectionModeValue = 'off';
  dom.sectionMode.value = 'off';
  clearSectionBox();
  updateSectionUiState();
});

dom.btnLevelReset.addEventListener('click', () => {
  dom.storeySelect.value = '';
  state.sectionModeValue = 'off';
  dom.sectionMode.value = 'off';
  clearSectionBox();
  updateSectionUiState();
  if (state.ifcModel) state.ifcModel.visible = true;
});

// Level View Reset (duplicate guard)
if (dom.btnLevelReset) {
  dom.btnLevelReset.addEventListener('click', () => {
    if (dom.storeySelect) dom.storeySelect.value = '';
    state.sectionModeValue = 'off';
    if (dom.sectionMode) dom.sectionMode.value = 'off';
    clearSectionBox();
    updateSectionUiState();
    if (state.ifcModel) state.ifcModel.visible = true;
  });
}

// Level Offset Change
if (dom.levelOffset) {
  dom.levelOffset.addEventListener('change', () => {
    const val = dom.storeySelect?.value;
    if (val) {
      updateSectionBoxFromStorey(Number(val));
      applyClippingToModel();
    }
  });
  dom.levelOffset.addEventListener('input', () => {
    // Optional: live update while dragging slider
  });
}

// ── File / Load / Close ─────────────────────────────────────────────

dom.elFile.addEventListener('change', () => {
  const has = !!dom.elFile.files?.[0];
  dom.btnLoad.disabled = !has;
  dom.loadHint.textContent = has ? 'Ready to load.' : 'Select an .ifc file to start.';
});

dom.btnLoad.addEventListener('click', async () => {
  try {
    const file = dom.elFile.files?.[0];
    if (!file) return;

    dom.btnLoad.disabled = true;
    showLoading('Initializing IFC parser...');
    dom.loadHint.textContent = 'Initializing IFC parser...';

    await initIfc();

    updateLoading('Opening model...');
    dom.loadHint.textContent = 'Opening model...';
    if (!state.scene) initThree();

    if (state.ifcModel) {
      state.ifcModel.removeFromParent();
      state.ifcModel = null;
    }
    clearSectionBox();
    state.sectionModeValue = 'off';
    dom.sectionMode.value = 'off';
    updateSectionUiState();
    clearEdges();
    if (state.highlightSubset) {
      state.highlightSubset.removeFromParent();
      state.highlightSubset = null;
    }
    clearRoomFocus();

    updateLoading('Parsing IFC geometry...');
    state.ifcModel = await openIfcFromFile(file);
    state.modelID = state.ifcModel.modelID;
    state.scene.add(state.ifcModel);
    setModelAppearance(state.ifcModel);

    const modelBox = new THREE.Box3().setFromObject(state.ifcModel);
    const modelSize = modelBox.getSize(new THREE.Vector3());
    state.modelCenter = modelBox.getCenter(new THREE.Vector3());
    state.modelMinY = modelBox.min.y;
    state.modelMaxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
    state.modelBoxCached = modelBox.clone();
    state.storeyElevationOffset = 0;
    state.storeyWorldY = new Map();
    state.spatialRootCached = null;

    setShadowForModel(state.ifcModel);
    updateShadowPlaneForModel();
    buildEdgesOverlay(state.ifcModel);

    fitCameraToObject(state.ifcModel, true);

    rebuildDebugGridOverlay();

    updateLoading('Building spatial structure...');
    dom.viewerMeta.textContent = `Loaded: ${file.name} (modelID=${state.modelID})`;
    toast(`Loaded: ${file.name}`, 'success');
    setEnabled(true);

    await rebuildSpatialStructureCache();

    const summary = await listBasicStructure();
    // Populate rooms list (IfcSpace)
    const api = ifcLoader.ifcManager.ifcAPI;
    const ids = api.GetLineIDsWithType(state.modelID, IFCSPACE);
    const n = ids.size();
    const spaces = [];
    for (let i = 0; i < n; i++) {
      const id = ids.get(i);
      const line = api.GetLine(state.modelID, id);
      spaces.push({
        expressID: id,
        GlobalId: line?.GlobalId?.value,
        Name: line?.Name?.value,
        LongName: line?.LongName?.value,
      });
    }
    spaces.sort((a, b) => String(a.LongName || a.Name || '').localeCompare(String(b.LongName || b.Name || '')));
    populateSpacesDropdown(spaces);

    // Populate storeys list (IfcBuildingStorey)
    const storeyIds = api.GetLineIDsWithType(state.modelID, IFCBUILDINGSTOREY);
    const ns = storeyIds.size();
    const storeys = [];
    for (let i = 0; i < ns; i++) {
      const id = storeyIds.get(i);
      const line = api.GetLine(state.modelID, id);
      storeys.push({
        expressID: id,
        Name: line?.Name?.value,
        Elevation: Number(line?.Elevation?.value)
      });
    }
    storeys.sort((a, b) => {
      const ea = a.Elevation;
      const eb = b.Elevation;
      if (Number.isFinite(ea) && Number.isFinite(eb)) return ea - eb;
      if (Number.isFinite(ea)) return -1;
      if (Number.isFinite(eb)) return 1;
      return String(a.Name || '').localeCompare(String(b.Name || ''));
    });

    // Map IFC storey elevations into the model's world-Y space.
    const minElev = storeys.find((s) => Number.isFinite(s.Elevation))?.Elevation ?? null;
    if (Number.isFinite(minElev) && Number.isFinite(state.modelMinY)) {
      state.storeyElevationOffset = state.modelMinY - minElev;
    }

    // Build a mapping from storey elevation to actual world Y by raycasting at model center.
    if (state.raycaster && state.modelCenter) {
      for (const s of storeys) {
        const er = s.Elevation;
        if (!Number.isFinite(er)) continue;
        const guess = er + state.storeyElevationOffset;
        const y = raycastFloorYAt(state.modelCenter.x, state.modelCenter.z, guess);
        if (Number.isFinite(y)) state.storeyWorldY.set(s.expressID, y);
      }
    }

    // Re-sort storeys using mapped world-Y when available.
    storeys.sort((a, b) => {
      const ya = state.storeyWorldY.get(a.expressID);
      const yb = state.storeyWorldY.get(b.expressID);
      if (Number.isFinite(ya) && Number.isFinite(yb)) return ya - yb;
      if (Number.isFinite(ya)) return -1;
      if (Number.isFinite(yb)) return 1;
      const ea = a.Elevation;
      const eb = b.Elevation;
      if (Number.isFinite(ea) && Number.isFinite(eb)) return ea - eb;
      if (Number.isFinite(ea)) return -1;
      if (Number.isFinite(eb)) return 1;
      return String(a.Name || '').localeCompare(String(b.Name || ''));
    });

    populateStoreysDropdown(storeys);
    rebuildDebugLevelsOverlay();
    rebuildIfcGridOverlay();

    // Register dblclick after renderer is ready
    state.renderer.domElement.addEventListener('dblclick', onDoubleClick);

    setOutput({
      status: 'ok',
      message: 'Model loaded. Use the buttons to query IFC data.',
      ...summary,
    });
  } catch (e) {
    setOutput({ status: 'error', message: String(e?.message ?? e), stack: e?.stack });
    dom.viewerMeta.textContent = 'Load failed';
    toast('Load failed', 'error');
    setEnabled(false);
  } finally {
    hideLoading();
    dom.btnLoad.disabled = false;
    dom.loadHint.textContent = state.modelID ? 'Model ready.' : 'Select an .ifc file to start.';
  }
});

dom.btnClose.addEventListener('click', () => {
  try {
    if (state.modelID !== null) {
      try {
        ifcLoader.ifcManager.close(state.modelID);
      } catch {
        // ignore
      }
    }
  } finally {
    state.modelID = null;
    state.spatialRootCached = null;
    if (state.ifcModel) {
      state.ifcModel.removeFromParent();
      state.ifcModel = null;
    }
    clearSectionBox();
    state.sectionModeValue = 'off';
    dom.sectionMode.value = 'off';
    updateSectionUiState();
    clearEdges();
    if (state.highlightSubset) {
      state.highlightSubset.removeFromParent();
      state.highlightSubset = null;
    }
    clearRoomFocus();
    state.modelMaxDim = null;
    state.modelCenter = null;
    state.modelMinY = null;
    state.modelBoxCached = null;
    populateSpacesDropdown([]);
    populateStoreysDropdown([]);
    dom.viewerMeta.textContent = 'No model loaded';
    toast('Model closed', 'info');
    setEnabled(false);
    setOutput('Waiting for IFC file...');
  }
});

// ── Navigation buttons ──────────────────────────────────────────────

dom.btnGoSpace.addEventListener('click', async () => {
  if (state.modelID === null) return;
  const v = Number(dom.spaceSelect.value);
  if (!Number.isFinite(v) || v <= 0) {
    setOutput({ status: 'error', message: 'Please select a room first.' });
    return;
  }
  try {
    await focusRoomByExpressId(v);
    dom.expressIdInput.value = String(v);
    dom.btnInspect.click();

    state.sectionModeValue = dom.sectionMode?.value || state.sectionModeValue || 'off';
    if (state.sectionModeValue === 'room') {
      applySectionForCurrentSelection();
    }
  } catch (e) {
    setOutput({ status: 'error', message: String(e?.message ?? e), stack: e?.stack });
  }
});

dom.btnClearSpace.addEventListener('click', () => {
  clearRoomFocus();
});

dom.btnResetView.addEventListener('click', () => {
  clearRoomFocus();
  resetView();
});

dom.btnIsoView.addEventListener('click', () => {
  if (state.camera && state.camera.isOrthographicCamera) {
    setPerspectiveView();
    dom.btnIsoView.textContent = 'Isometric';
  } else {
    setIsometricView();
    dom.btnIsoView.textContent = '3D';
  }
});

// ── Query buttons ───────────────────────────────────────────────────

dom.btnListTypes.addEventListener('click', async () => {
  if (state.modelID === null) return;
  const summary = await listBasicStructure();
  setOutput(summary);
});

dom.btnListSpaces.addEventListener('click', async () => {
  if (state.modelID === null) return;
  const ids = ifcLoader.ifcManager.ifcAPI.GetLineIDsWithType(state.modelID, IFCSPACE);
  const out = [];
  const n = Math.min(ids.size(), 50);
  for (let i = 0; i < n; i++) {
    const id = ids.get(i);
    const line = ifcLoader.ifcManager.ifcAPI.GetLine(state.modelID, id);
    out.push({
      expressID: id,
      GlobalId: line?.GlobalId?.value,
      Name: line?.Name?.value,
      LongName: line?.LongName?.value,
    });
  }
  setOutput({ count: ids.size(), first: out });
});

dom.btnInspect.addEventListener('click', async () => {
  if (state.modelID === null) return;
  const id = parseExpressId();
  if (!id) {
    setOutput({ status: 'error', message: 'Please enter a valid ExpressID.' });
    return;
  }
  try {
    const line = await inspectLine(id);
    setOutput(line);
  } catch (e) {
    setOutput({ status: 'error', message: String(e?.message ?? e), stack: e?.stack });
  }
});

dom.btnProps.addEventListener('click', async () => {
  if (state.modelID === null) return;
  const id = parseExpressId();
  if (!id) {
    setOutput({ status: 'error', message: 'Please enter a valid ExpressID.' });
    return;
  }
  try {
    const psets = await getPropertySets(id);
    setOutput(psets);
  } catch (e) {
    setOutput({ status: 'error', message: String(e?.message ?? e), stack: e?.stack });
  }
});

dom.btnTypeProps.addEventListener('click', async () => {
  if (state.modelID === null) return;
  const id = parseExpressId();
  if (!id) {
    setOutput({ status: 'error', message: 'Please enter a valid ExpressID.' });
    return;
  }
  try {
    const props = await getTypeProperties(id);
    setOutput(props);
  } catch (e) {
    setOutput({ status: 'error', message: String(e?.message ?? e), stack: e?.stack });
  }
});

// ── Export buttons ──────────────────────────────────────────────────

dom.btnExportJSON.addEventListener('click', () => {
  if (state.modelID === null) return;
  exportRoomJSON();
});

dom.btnExportCSV.addEventListener('click', () => {
  if (state.modelID === null) return;
  exportRoomCSV();
});

// ── Metadata file ───────────────────────────────────────────────────

dom.metadataFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      state.roomMetadata = JSON.parse(event.target.result);
      console.log('[metadataFile] Loaded metadata:', state.roomMetadata);

      const roomCount = state.roomMetadata.rooms ? state.roomMetadata.rooms.length : 0;
      const levelCount = state.roomMetadata.levels ? state.roomMetadata.levels.length : 0;

      setOutput({
        status: 'success',
        message: 'Metadata loaded successfully',
        rooms: roomCount,
        levels: levelCount,
        project: state.roomMetadata.project_info?.project_name || 'Unknown'
      });

      dom.loadHint.textContent = `Metadata loaded: ${roomCount} rooms, ${levelCount} levels`;
      toast(`Metadata loaded: ${roomCount} rooms, ${levelCount} levels`, 'success');
    } catch (err) {
      console.error('[metadataFile] Error parsing JSON:', err);
      setOutput({ status: 'error', message: 'Invalid JSON file: ' + err.message });
      toast('Invalid metadata file', 'error');
      state.roomMetadata = null;
    }
  };
  reader.readAsText(file);
});

// ── Initial state ───────────────────────────────────────────────────

setEnabled(false);
setOutput('Waiting for IFC file...');

// Initialize language system
initializeLanguage();

// Language switcher functionality
const languageButton = document.getElementById('languageButton');
if (languageButton) {
  languageButton.addEventListener('click', () => {
    const currentLang = getCurrentLanguage();
    const newLang = currentLang === 'en' ? 'th' : 'en';
    setLanguage(newLang);
    
    // Update dynamically generated content
    updateDynamicContent();
  });
}

// Function to update dynamically generated content
function updateDynamicContent() {
  const currentLang = getCurrentLanguage();
  
  // Update viewer meta if no model is loaded
  if (dom.viewerMeta && (dom.viewerMeta.textContent.includes('No model') || dom.viewerMeta.textContent.includes('ไม่มีโมเดล'))) {
    dom.viewerMeta.textContent = currentLang === 'en' ? 'No model loaded' : 'ไม่มีโมเดลที่โหลด';
  }
  
  // Update output if waiting for file
  if (dom.output && (dom.output.textContent.includes('Waiting for IFC') || dom.output.textContent.includes('รอการโหลดไฟล์ IFC'))) {
    dom.output.textContent = currentLang === 'en' ? 'Waiting for IFC file...' : 'รอการโหลดไฟล์ IFC...';
  }
  
  // Update load hint if needed
  if (dom.loadHint && (dom.loadHint.textContent.includes('Select an .ifc') || dom.loadHint.textContent.includes('เลือกไฟล์ .ifc'))) {
    dom.loadHint.textContent = currentLang === 'en' ? 'Select an .ifc file to start.' : 'เลือกไฟล์ .ifc เพื่อเริ่มต้น';
  }
}

// ── Guided Tour ─────────────────────────────────────────────────────
const btnTour = document.getElementById('btnTour');
if (btnTour) {
  btnTour.addEventListener('click', () => openTour());
}
