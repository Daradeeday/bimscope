/**
 * Room focus — focusRoomByExpressId, clearRoomFocus, populateSpacesDropdown.
 */
import * as THREE from 'three';
import { state, ifcLoader, dom } from '../state.js';
import { computeSubsetBBox } from '../section/section-box.js';
import { getRoomBoundaryBox, getSpacePlacementPoint, getRoomAnchorPoint } from '../section/section-room.js';
import { getSpatialStructureRootCached, findSpatialNodeById, collectSpatialElementIds } from '../ifc/spatial-tree.js';
import { flyCameraToPoint } from '../viewer/camera.js';

export function clearRoomFocus() {
  if (state.roomSubset) {
    state.roomSubset.removeFromParent();
    state.roomSubset = null;
  }
  state.roomSubsetWorldBox = null;

  try {
    const mgr = ifcLoader?.ifcManager;
    if (mgr && typeof mgr.removeSubset === 'function' && state.modelID !== null) {
      if (state.roomHighlightCustomId) mgr.removeSubset(state.modelID, undefined, state.roomHighlightCustomId);
    }
  } catch {
    // ignore
  }
  state.roomHighlightCustomId = null;
}

export function populateSpacesDropdown(spaces) {
  state.spaceIndex = spaces;
  dom.spaceSelect.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = spaces.length ? `Select a room... (${spaces.length})` : 'No IfcSpace found.';
  dom.spaceSelect.appendChild(opt0);

  for (const s of spaces) {
    const o = document.createElement('option');
    o.value = String(s.expressID);
    const label = s.LongName || s.Name || `IfcSpace #${s.expressID}`;
    o.textContent = `${label} [${s.expressID}]`;
    dom.spaceSelect.appendChild(o);
  }
}

export async function focusRoomByExpressId(spaceId) {
  if (state.modelID === null) return;

  console.log('[focusRoomByExpressId] Starting camera animation to room:', spaceId);

  // Make model semi-transparent to see room highlight better
  if (state.ifcModel) {
    state.ifcModel.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && !m._originalOpacity) {
            m._originalOpacity = m.opacity;
            m._originalTransparent = m.transparent;
          }
          if (m) {
            m.transparent = true;
            m.opacity = 0.3;
            m.needsUpdate = true;
          }
        }
      }
    });
  }

  // Make room highlight more visible
  if (state.roomSubset && state.roomSubset.material) {
    state.roomSubset.material.opacity = 0.8;
    state.roomSubset.material.color.setHex(0x00ff00); // Bright green
    state.roomSubset.material.needsUpdate = true;
  }

  // First, try to use roomSubset bbox (the green highlight) - this is the most accurate
  let box = new THREE.Box3();
  let method = 'unknown';

  if (state.roomSubsetWorldBox && !state.roomSubsetWorldBox.isEmpty()) {
    const b = state.roomSubsetWorldBox.clone();
    if (!b.isEmpty() && state.modelBoxCached) {
      const modelSize = state.modelBoxCached.getSize(new THREE.Vector3());
      const subsetSize = b.getSize(new THREE.Vector3());
      const ratio = Math.max(subsetSize.x / modelSize.x, subsetSize.y / modelSize.y, subsetSize.z / modelSize.z);
      console.log('[focusRoomByExpressId] roomSubset ratio:', ratio.toFixed(2));

      if (ratio <= 0.8) {
        box = b;
        method = 'roomSubset';
        console.log('[focusRoomByExpressId] Using roomSubset bbox');
      }
    }
  }

  // Fallback: try IfcRelSpaceBoundary to find walls/floors that bound the room
  if (box.isEmpty()) {
    try {
      const boundaryBox = getRoomBoundaryBox(spaceId);
      if (boundaryBox && !boundaryBox.isEmpty()) {
        // Check if boundary box is reasonable size
        if (state.modelBoxCached) {
          const modelSize = state.modelBoxCached.getSize(new THREE.Vector3());
          const bbSize = boundaryBox.getSize(new THREE.Vector3());
          const ratio = Math.max(bbSize.x / modelSize.x, bbSize.y / modelSize.y, bbSize.z / modelSize.z);
          if (ratio <= 0.6) {
            box = boundaryBox;
            method = 'boundary';
            console.log('[focusRoomByExpressId] Using boundary box, ratio:', ratio.toFixed(2));
          }
        }
      }
    } catch (e) {
      console.log('[focusRoomByExpressId] Boundary box error:', e);
    }
  }

  // Fallback: use spatial structure to get all elements for camera positioning
  if (box.isEmpty()) {
    let visibleIds = [spaceId];
    try {
      const root = getSpatialStructureRootCached();
      if (root) {
        const spaceNode = findSpatialNodeById(root, spaceId);
        if (spaceNode) {
          const ids = collectSpatialElementIds(spaceNode);
          const filtered = ids.filter((x) => x !== spaceId);
          if (filtered.length > 0) {
            visibleIds = filtered;
          }
        }
      }
    } catch (e) {
      console.log('[focusRoomByExpressId] Fallback to space ID only:', e);
    }

    // Create temp subset just for bbox calculation (invisible)
    const tmpMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false });
    const tmpSubset = ifcLoader.ifcManager.createSubset({
      modelID: state.modelID,
      ids: visibleIds,
      material: tmpMat,
      scene: state.scene,
      removePrevious: false
    });

    const tmpBox = computeSubsetBBox(tmpSubset);
    tmpSubset.removeFromParent();
    if (tmpBox) {
      box = tmpBox;
      method = 'spatialStructure';
    }

    // Check if this box is also too large
    if (!box.isEmpty() && state.modelBoxCached) {
      const modelSize = state.modelBoxCached.getSize(new THREE.Vector3());
      const boxSize = box.getSize(new THREE.Vector3());
      const ratio = Math.max(boxSize.x / modelSize.x, boxSize.y / modelSize.y, boxSize.z / modelSize.z);
      if (ratio > 0.5) {
        console.log('[focusRoomByExpressId] spatialStructure bbox too large, ratio:', ratio.toFixed(2));
        box = new THREE.Box3(); // Reset to empty
      }
    }
  }

  console.log('[focusRoomByExpressId] bbox:', {
    isEmpty: box.isEmpty(),
    min: box.min,
    max: box.max,
    size: box.getSize(new THREE.Vector3()),
    method: method
  });

  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    console.log('[focusRoomByExpressId] center:', center.x.toFixed(2), center.y.toFixed(2), center.z.toFixed(2), 'size:', maxDim.toFixed(2));

    // Position camera to view room from a good angle
    // Place camera at room center + offset for perspective view
    const viewDistance = maxDim * 1.2;  // Distance from room center

    // Create a view angle (from above-right-front looking back at center)
    const phi = Math.PI / 6;  // 30 degrees above horizontal
    const theta = Math.PI / 4;  // 45 degrees around

    const cameraPos = new THREE.Vector3(
      center.x + viewDistance * Math.cos(phi) * Math.sin(theta),
      center.y + viewDistance * Math.sin(phi),
      center.z + viewDistance * Math.cos(phi) * Math.cos(theta)
    );

    const targetPos = center.clone();  // Look directly at room center

    state.camera.near = Math.max(0.01, viewDistance / 100);
    state.camera.far = Math.max(1000, viewDistance * 10);
    state.camera.updateProjectionMatrix();

    console.log('[focusRoomByExpressId] animating camera from:', state.camera.position.x.toFixed(2), state.camera.position.y.toFixed(2), state.camera.position.z.toFixed(2));
    console.log('[focusRoomByExpressId] to position:', cameraPos.x.toFixed(2), cameraPos.y.toFixed(2), cameraPos.z.toFixed(2), 'target:', targetPos.x.toFixed(2), targetPos.y.toFixed(2), targetPos.z.toFixed(2));

    // Store start positions
    const startPos = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const duration = 600;  // Slightly longer for smooth animation
    const startTime = performance.now();

    // Return promise that resolves when animation completes
    return new Promise((resolve) => {
      // Animation loop
      const animateCamera = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);

        // Ease-in-out cubic
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Interpolate camera position and target
        state.camera.position.lerpVectors(startPos, cameraPos, ease);
        state.controls.target.lerpVectors(startTarget, targetPos, ease);
        state.controls.update();

        // Continue animation if not done
        if (t < 1) {
          requestAnimationFrame(animateCamera);
        } else {
          // Ensure final position is exact
          state.camera.position.copy(cameraPos);
          state.controls.target.copy(targetPos);
          state.controls.update();
          console.log('[focusRoomByExpressId] animation complete');
          resolve();  // Animation done
        }
      };

      requestAnimationFrame(animateCamera);
      dom.viewerMeta.textContent = `Focused room: ${spaceId} (${method})`;
    });
  }

  // First priority: use room coordinates from pyRevit metadata JSON if available
  let p = null;
  let fallbackMethod = 'none';

  if (state.roomMetadata && state.roomMetadata.rooms) {
    // Find room by matching name/number from spaceIndex
    const spaceInfo = state.spaceIndex.find(s => s.expressID === spaceId);
    if (spaceInfo) {
      const roomLongName = (spaceInfo.LongName || '').toLowerCase().trim();
      const roomName = (spaceInfo.Name || '').toLowerCase().trim();

      console.log('[focusRoomByExpressId] Trying to match IFC room:', { LongName: spaceInfo.LongName, Name: spaceInfo.Name });
      console.log('[focusRoomByExpressId] Available metadata rooms:', state.roomMetadata.rooms.map(r => ({ name: r.name, number: r.number })));

      // Try to match by name (partial match) or number
      const metaRoom = state.roomMetadata.rooms.find(r => {
        const metaName = (r.name || '').toLowerCase().trim();
        const metaNumber = (r.number || '').toLowerCase().trim();

        // Exact match
        if (metaName && roomLongName && metaName === roomLongName) return true;
        if (metaName && roomName && metaName === roomName) return true;
        if (metaNumber && roomName && metaNumber === roomName) return true;

        // Partial match (contains)
        if (metaName && roomLongName && (metaName.includes(roomLongName) || roomLongName.includes(metaName))) return true;
        if (metaName && roomName && (metaName.includes(roomName) || roomName.includes(metaName))) return true;

        return false;
      });

      if (metaRoom) {
        console.log('[focusRoomByExpressId] Matched metadata room:', metaRoom.name, metaRoom.number);

        if (metaRoom.bounding_box && metaRoom.bounding_box.center) {
          const center = metaRoom.bounding_box.center;
          p = new THREE.Vector3(center.x, center.z, -center.y); // Convert Revit coords to Three.js
          fallbackMethod = 'pyrevit-bbox';
          console.log('[focusRoomByExpressId] Using pyRevit bbox center:', p.toArray());
        } else if (metaRoom.location) {
          const loc = metaRoom.location;
          p = new THREE.Vector3(loc.x, loc.z, -loc.y); // Convert Revit coords to Three.js
          fallbackMethod = 'pyrevit-location';
          console.log('[focusRoomByExpressId] Using pyRevit location:', p.toArray());
        }
      } else {
        console.log('[focusRoomByExpressId] No matching metadata room found');
      }
    }
  }

  // Second priority: use IfcSpace placement point
  if (!p || !Number.isFinite(p.x)) {
    p = getSpacePlacementPoint(spaceId);
    fallbackMethod = 'placement';
  }

  // Check if placement is inside model bounds
  if (state.modelBoxCached) {
    const expandedBox = state.modelBoxCached.clone().expandByScalar(state.modelMaxDim * 0.5);
    if (!expandedBox.containsPoint(p)) {
      // Placement is far outside model - try to use relative offset from model center
      // Each room should still have a unique placement, so we use it as an offset
      const modelCtr = state.modelCenter ? state.modelCenter.clone() : new THREE.Vector3(0, 0, 0);
      const placementOffset = p.clone().sub(new THREE.Vector3(0, 0, 0)); // Offset from origin

      // Scale down the offset to fit within model bounds
      const maxOffset = state.modelMaxDim * 0.3;
      if (placementOffset.length() > maxOffset) {
        placementOffset.normalize().multiplyScalar(maxOffset);
      }

      p = modelCtr.clone().add(placementOffset);
      fallbackMethod = 'placement-adjusted';
      console.log('[focusRoomByExpressId] placement outside model, adjusted to:', p.toArray());
    }
  }

  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) || p.lengthSq() < 1e-10) {
    // Fallback: use room index to create unique position within model bounds
    let roomIdx = 0;
    if (state.spaceIndex && state.spaceIndex.length > 0) {
      const idx2 = state.spaceIndex.findIndex(s => s.expressID === spaceId);
      if (idx2 >= 0) roomIdx = idx2;
    }

    const modelCtr = state.modelCenter ? state.modelCenter.clone() : new THREE.Vector3(0, 0, 0);
    const modelSize = state.modelBoxCached ? state.modelBoxCached.getSize(new THREE.Vector3()) : new THREE.Vector3(100, 20, 100);

    // Create grid-based position for rooms
    const totalRooms = state.spaceIndex ? Math.max(1, state.spaceIndex.length) : 1;
    const gridSize = Math.ceil(Math.sqrt(totalRooms));
    const gridX = roomIdx % gridSize;
    const gridZ = Math.floor(roomIdx / gridSize);

    // Calculate position within model bounds
    const cellWidth = modelSize.x / gridSize;
    const cellDepth = modelSize.z / gridSize;
    const startX = modelCtr.x - modelSize.x / 2 + cellWidth / 2;
    const startZ = modelCtr.z - modelSize.z / 2 + cellDepth / 2;

    let roomY = modelCtr.y;
    if (state.storeyIndex && state.storeyIndex.length > 0) {
      // Try to find which storey this room belongs to based on room index
      const storeyIdx = Math.floor(roomIdx / Math.ceil(totalRooms / state.storeyIndex.length));
      if (storeyIdx < state.storeyIndex.length && Number.isFinite(state.storeyIndex[storeyIdx].Elevation)) {
        roomY = state.storeyIndex[storeyIdx].Elevation + 1.5;
      }
    }

    p = new THREE.Vector3(
      startX + gridX * cellWidth,
      roomY,
      startZ + gridZ * cellDepth
    );
    fallbackMethod = 'grid-' + roomIdx;
    console.log('[focusRoomByExpressId] Using grid position for room', roomIdx, ':', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2));
  }

  console.log('[focusRoomByExpressId] fallback:', fallbackMethod, 'at:', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2));
  const roomDist = state.modelMaxDim ? Math.max(2.0, state.modelMaxDim * 0.15) : 5.0;
  const info2 = flyCameraToPoint(p, { dist: roomDist });
  dom.viewerMeta.textContent = `Focused room: ${spaceId} (${fallbackMethod})`;

  // Return a resolved promise for consistency
  return Promise.resolve();
}
