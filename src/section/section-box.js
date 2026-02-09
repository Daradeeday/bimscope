/**
 * Section box — create / clear clipping planes, apply clipping to model.
 */
import * as THREE from 'three';
import { state, ifcLoader, dom } from '../state.js';

/**
 * Compute a tight bounding box from only the indexed vertices of a subset mesh.
 * web-ifc-three shares one big position buffer across all subsets, so
 * Box3.setFromObject() returns the bbox of the *entire model*.
 * This function reads only the vertices referenced by the index buffer.
 */
export function computeSubsetBBox(mesh) {
  if (!mesh || !mesh.geometry) return null;
  const geom = mesh.geometry;
  const pos = geom.getAttribute('position');
  const idx = geom.getIndex();
  if (!pos) return null;

  mesh.updateMatrixWorld(true);
  const mat = mesh.matrixWorld;

  const box = new THREE.Box3();
  const v = new THREE.Vector3();

  if (idx && idx.count > 0) {
    // Only iterate over vertices that are actually referenced by the index buffer
    const visited = new Set();
    for (let i = 0; i < idx.count; i++) {
      const vi = idx.getX(i);
      if (visited.has(vi)) continue;
      visited.add(vi);
      v.fromBufferAttribute(pos, vi).applyMatrix4(mat);
      box.expandByPoint(v);
    }
  } else if (pos.count > 0 && pos.count < 50000) {
    // Non-indexed geometry — iterate all vertices (only if reasonable count)
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mat);
      box.expandByPoint(v);
    }
  }

  return box.isEmpty() ? null : box;
}

export function getSectionPadding() {
  const v = Number(dom.sectionPadding?.value);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

export function clearSectionBox() {
  state.sectionPlanes = null;
  if (state.sectionBoxHelper) {
    state.sectionBoxHelper.removeFromParent();
    state.sectionBoxHelper = null;
  }
  if (state.renderer) {
    state.renderer.localClippingEnabled = false;
    state.renderer.clippingPlanes = [];
  }
  if (state.edgesGroup) {
    state.edgesGroup.visible = true;
  }

  if (state.sectionSubset) {
    try {
      state.sectionSubset.removeFromParent();
    } catch {
      // ignore
    }
    state.sectionSubset = null;
  }

  // Ensure IFC manager subset cache is cleared too (web-ifc-three keeps subsets by customID).
  try {
    const mgr = ifcLoader?.ifcManager;
    if (mgr && typeof mgr.removeSubset === 'function' && state.modelID !== null) {
      if (state.sectionSubsetCustomId) mgr.removeSubset(state.modelID, undefined, state.sectionSubsetCustomId);
    }
  } catch {
    // ignore
  }
  state.sectionSubsetCustomId = null;
  // Restore visibility and remove subsets
  if (state.ifcModel) {
    state.ifcModel.visible = true;

    // Remove all subsets created by section
    const toRemove = [];
    state.scene.traverse((obj) => {
      if (obj !== state.ifcModel && obj.userData?.isSubset) {
        toRemove.push(obj);
      }
    });
    toRemove.forEach(obj => obj.removeFromParent());

    state.ifcModel.traverse((obj) => {
      obj.visible = true;
    });
  }
  if (state.ifcModel) {
    state.ifcModel.traverse((obj) => {
      if (!obj || !obj.isMesh) return;
      const m = obj.material;
      if (!m) return;
      if (Array.isArray(m)) {
        for (const mi of m) {
          if (!mi) continue;
          mi.clippingPlanes = null;
          mi.clipIntersection = false;
          mi.needsUpdate = true;
        }
      } else {
        m.clippingPlanes = null;
        m.clipIntersection = false;
        m.needsUpdate = true;
      }
    });
  }
  if (state.edgesMaterial) {
    state.edgesMaterial.clippingPlanes = null;
    state.edgesMaterial.clipIntersection = false;
    state.edgesMaterial.needsUpdate = true;
  }
}

export function setSectionBoxFromBox(box, pad = 0) {
  if (!box || box.isEmpty() || !state.renderer) return;

  // Always remove the previously created section subset to avoid stale geometry.
  if (state.sectionSubset) {
    try {
      state.sectionSubset.removeFromParent();
    } catch {
      // ignore
    }
    state.sectionSubset = null;
  }

  // Clear old section first
  clearSectionBox();

  const min = box.min.clone().addScalar(-pad);
  const max = box.max.clone().addScalar(pad);
  // In room mode, lower the top clipping plane by 0.7m (70 cm) to cut the ceiling
  if (state.sectionModeValue === 'room') {
    max.y = Math.max(min.y + 0.05, max.y - 0.7);
  }

  const p1 = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(1, 0, 0), new THREE.Vector3(min.x, 0, 0));
  const p2 = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(max.x, 0, 0));
  const p3 = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, min.y, 0));
  const p4 = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, max.y, 0));
  const p5 = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, min.z));
  const p6 = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, max.z));

  state.sectionPlanes = [p1, p2, p3, p4, p5, p6];

  // Create section box visualization
  if (state.scene) {
    if (state.sectionBoxHelper) {
      state.sectionBoxHelper.removeFromParent();
      state.sectionBoxHelper = null;
    }
    try {
      const displayBox = new THREE.Box3();
      displayBox.min.copy(min);
      displayBox.max.copy(max);
      state.sectionBoxHelper = new THREE.Box3Helper(displayBox, 0xff0000); // Red color for visibility
      if (state.sectionBoxHelper && state.sectionBoxHelper.material) {
        state.sectionBoxHelper.material.depthTest = false;
        state.sectionBoxHelper.material.depthWrite = false;
        state.sectionBoxHelper.material.transparent = false;
        state.sectionBoxHelper.material.fog = false;
        state.sectionBoxHelper.renderOrder = 9999; // Always on top
      }
      state.scene.add(state.sectionBoxHelper);
      console.log('[setSectionBoxFromBox] Created section box helper');
    } catch (e) {
      console.error('[setSectionBoxFromBox] Error creating box helper:', e);
    }
  }

  // Create subset from sectionVisibleIds
  if (state.sectionVisibleIds.length > 0 && ifcLoader && state.modelID !== null && state.ifcModel && state.scene) {
    try {
      // Hide original model
      state.ifcModel.visible = false;

      // Hide edges overlay so parts outside the subset aren't still visible via outlines.
      if (state.edgesGroup) {
        state.edgesGroup.visible = false;
      }

      // Create subset with visible IDs
      const material = new THREE.MeshBasicMaterial({
        color: 0xf2f2ef,
        side: THREE.DoubleSide,
        transparent: false
      });

      const subset = ifcLoader.ifcManager.createSubset({
        modelID: state.modelID,
        ids: state.sectionVisibleIds,
        material,
        scene: state.scene,
        customID: `section-subset-${state.sectionModeValue === 'room' ? Number(dom.spaceSelect?.value) : 'active'}`,
        removePrevious: true
      });

      state.sectionSubsetCustomId = subset?.userData?.customID ?? `section-subset-${state.sectionModeValue === 'room' ? Number(dom.spaceSelect?.value) : 'active'}`;

      state.sectionSubset = subset;
      if (state.sectionSubset) {
        state.sectionSubset.userData = state.sectionSubset.userData || {};
        state.sectionSubset.userData.isSubset = true;
      }

      subset.userData.isSubset = true;
      subset.updateMatrixWorld(true);

      // Ensure all subset materials have clipping planes enabled
      subset.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          if (Array.isArray(obj.material)) {
            for (const m of obj.material) {
              if (m) {
                m.clippingPlanes = state.sectionPlanes;
                m.clipIntersection = false;
                m.needsUpdate = true;
              }
            }
          } else {
            obj.material.clippingPlanes = state.sectionPlanes;
            obj.material.clipIntersection = false;
            obj.material.needsUpdate = true;
          }
        }
      });
      console.log('[setSectionBoxFromBox] Created subset with', state.sectionVisibleIds.length, 'IDs, planes recalculated from geometry');
    } catch (e) {
      console.error('[setSectionBoxFromBox] Error creating subset:', e);
      state.ifcModel.visible = true;
    }
  }
  else {
    // Clip-only mode: keep the full model visible. For room mode, hide edges to avoid showing outside outlines.
    if (state.ifcModel) state.ifcModel.visible = true;
    if (state.sectionModeValue === 'room' && state.edgesGroup) state.edgesGroup.visible = false;
  }

  if (state.edgesMaterial) {
    state.edgesMaterial.clippingPlanes = state.sectionPlanes;
    state.edgesMaterial.clipIntersection = false;
    state.edgesMaterial.needsUpdate = true;
  }

  // Ensure renderer has local clipping enabled (material-level only)
  if (state.renderer) {
    state.renderer.localClippingEnabled = true;
    state.renderer.clippingPlanes = [];
  }

  // Force renderer update
  if (state.renderer) {
    state.renderer.render(state.scene, state.camera);
  }
}

export function applyClippingToModel() {
  if (!state.renderer || !state.sectionPlanes?.length) {
    console.log('[applyClippingToModel] Skipped: renderer or planes missing', { planes: state.sectionPlanes?.length });
    return;
  }

  console.log('[applyClippingToModel] Applying', state.sectionPlanes.length, 'planes. Mode:', state.sectionModeValue);

  state.renderer.localClippingEnabled = true;
  state.renderer.clippingPlanes = [];

  // For storey mode, show the full model (it's already hidden by setSectionBoxFromBox if room mode)
  if (state.sectionModeValue === 'storey' && state.ifcModel) {
    state.ifcModel.visible = true;
  }

  // Checking bounds of first plane just for debug
  if (state.sectionPlanes.length > 0) {
    console.log('Plane 0 constant:', state.sectionPlanes[0].constant);
  }

  // Apply clipping planes to all materials in ifcModel
  if (state.ifcModel) {
    let count = 0;
    state.ifcModel.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        if (Array.isArray(obj.material)) {
          for (const m of obj.material) {
            if (m) {
              m.clippingPlanes = state.sectionPlanes;
              m.clipIntersection = false;  // false = clip outside box (keep inside)
              m.needsUpdate = true;
              count++;
            }
          }
        } else {
          obj.material.clippingPlanes = state.sectionPlanes;
          obj.material.clipIntersection = false;  // false = clip outside box (keep inside)
          obj.material.needsUpdate = true;
          count++;
        }
      }
    });
    console.log('[applyClippingToModel] Applied to', count, 'materials');
  }
}

export function updateSectionUiState() {
  const mode = state.sectionModeValue;
  // Always enable storey select for the new "Level Views" feature
  dom.storeySelect.disabled = false;

  // Existing logic for other controls (if any)
}

export function applySectionForCurrentSelection() {
  // Always sync from UI to avoid stale state.
  state.sectionModeValue = dom.sectionMode?.value || state.sectionModeValue || 'off';
  if (state.sectionModeValue === 'off') {
    clearSectionBox();
    return;
  }
  if (state.sectionModeValue === 'room') {
    const id = Number(dom.spaceSelect?.value);
    if (Number.isFinite(id) && id > 0) {
      // updateSectionBoxFromRoom is imported dynamically to avoid circular deps
      // It will be wired in main.js
      if (applySectionForCurrentSelection._updateRoom) {
        applySectionForCurrentSelection._updateRoom(id);
      }
      applyClippingToModel();
    }
    return;
  }
  if (state.sectionModeValue === 'storey') {
    const id = Number(dom.storeySelect?.value);
    if (Number.isFinite(id) && id > 0) {
      if (applySectionForCurrentSelection._updateStorey) {
        applySectionForCurrentSelection._updateStorey(id);
      }
      applyClippingToModel();
    }
  }
}

/** Register the room/storey update callbacks (called from main.js to avoid circular imports). */
export function registerSectionCallbacks(updateRoom, updateStorey) {
  applySectionForCurrentSelection._updateRoom = updateRoom;
  applySectionForCurrentSelection._updateStorey = updateStorey;
}
