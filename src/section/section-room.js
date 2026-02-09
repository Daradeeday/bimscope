/**
 * Room-based section — updateSectionBoxFromRoom and all room geometry helpers.
 */
import * as THREE from 'three';
import { IFCRELSPACEBOUNDARY } from 'web-ifc';
import { state, ifcLoader, dom } from '../state.js';
import { ifcRefId, ifcListToArray, axis2Placement3DToMatrix } from '../helpers/ifc-utils.js';
import { getSpatialStructureRootCached, findSpatialNodeById, collectSpatialElementIds } from '../ifc/spatial-tree.js';
import { computeSubsetBBox, getSectionPadding, setSectionBoxFromBox } from './section-box.js';

// ── Placement helpers ───────────────────────────────────────────────

export function getSpacePlacementPoint(expressID) {
  const api = ifcLoader.ifcManager.ifcAPI;
  const space = api.GetLine(state.modelID, expressID);
  let placementRef = ifcRefId(space?.ObjectPlacement);

  console.log('[getSpacePlacementPoint] expressID:', expressID, 'placementRef:', placementRef);

  if (!placementRef) {
    console.log('[getSpacePlacementPoint] No placement ref, using modelCenter');
    return state.modelCenter ? state.modelCenter.clone() : new THREE.Vector3(0, 0, 0);
  }

  // Collect matrices from local placement up to root (PlacementRelTo chain)
  const mats = [];
  let guard = 0;
  while (placementRef && guard++ < 64) {
    const plLine = api.GetLine(state.modelID, placementRef);
    const relRef = ifcRefId(plLine?.RelativePlacement);
    if (relRef) {
      const relLine = api.GetLine(state.modelID, relRef);
      const mat = axis2Placement3DToMatrix(relLine, api);
      mats.push(mat);

      // Extract location from this placement level
      const locRef = ifcRefId(relLine?.Location);
      if (locRef) {
        const locLine = api.GetLine(state.modelID, locRef);
        const coords = locLine?.Coordinates;
        if (coords) {
          console.log('[getSpacePlacementPoint] Placement level', guard, 'location:', coords);
        }
      }
    }
    placementRef = ifcRefId(plLine?.PlacementRelTo);
  }

  // Multiply from root to leaf
  const world = new THREE.Matrix4().identity();
  for (let i = mats.length - 1; i >= 0; i--) world.multiply(mats[i]);

  const result = new THREE.Vector3(0, 0, 0).applyMatrix4(world);
  console.log('[getSpacePlacementPoint] Final position:', result.x.toFixed(2), result.y.toFixed(2), result.z.toFixed(2));
  return result;
}

// ── Raycast helpers ─────────────────────────────────────────────────

export function raycastFloorYAt(x, z, yHint = null) {
  if (!state.ifcModel) return null;
  const top = Number.isFinite(state.modelMaxDim) ? state.modelMaxDim * 2 : 500;
  const origin = new THREE.Vector3(x, top, z);
  const dir = new THREE.Vector3(0, -1, 0);
  state.raycaster.set(origin, dir);
  const hits = state.raycaster.intersectObject(state.ifcModel, true);
  if (!hits || hits.length === 0) return null;

  // Prefer upward-facing surfaces (floors), and prefer ones close to yHint.
  const nh = Math.min(hits.length, 50);
  const hint = Number.isFinite(yHint) ? yHint : null;
  let best = null;
  let bestScore = Infinity;

  for (let i = 0; i < nh; i++) {
    const h = hits[i];
    const y = h?.point?.y;
    if (!Number.isFinite(y)) continue;

    // Compute world normal for filtering.
    let ny = null;
    if (h.face && h.object) {
      const n = h.face.normal.clone();
      const nm = new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld);
      n.applyMatrix3(nm).normalize();
      ny = n.y;
    }

    // Keep only mostly-upward faces.
    if (ny !== null && ny < 0.55) continue;

    // If we have a hint, avoid choosing ceilings far above the hint.
    if (hint !== null && y > hint + 2.5) continue;

    // Score: prefer y near hint, otherwise prefer highest y (topmost floor at that x,z)
    const score = hint !== null ? Math.abs(y - hint) : -y;
    if (score < bestScore) {
      bestScore = score;
      best = y;
    }
  }

  if (best === null) {
    // Fallback: choose the highest intersection below the hint (or highest overall).
    let topY = null;
    for (let i = 0; i < nh; i++) {
      const y = hits[i]?.point?.y;
      if (!Number.isFinite(y)) continue;
      if (hint !== null && y > hint + 2.5) continue;
      if (topY === null || y > topY) topY = y;
    }
    best = topY;
  }

  return Number.isFinite(best) ? best : null;
}

export function raycastCeilingYAt(x, z, yHint = null) {
  if (!state.ifcModel) return null;
  const bottom = Number.isFinite(state.modelMinY) ? (state.modelMinY - 5) : -500;
  const origin = new THREE.Vector3(x, bottom, z);
  const dir = new THREE.Vector3(0, 1, 0);
  state.raycaster.set(origin, dir);
  const hits = state.raycaster.intersectObject(state.ifcModel, true);
  if (!hits || hits.length === 0) return null;

  const nh = Math.min(hits.length, 50);
  const hint = Number.isFinite(yHint) ? yHint : null;
  let best = null;
  let bestScore = Infinity;

  for (let i = 0; i < nh; i++) {
    const h = hits[i];
    const y = h?.point?.y;
    if (!Number.isFinite(y)) continue;

    // Prefer mostly-downward faces for ceilings.
    let ny = null;
    if (h.face && h.object) {
      const n = h.face.normal.clone();
      const nm = new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld);
      n.applyMatrix3(nm).normalize();
      ny = n.y;
    }
    if (ny !== null && ny > -0.55) continue;

    // If we have a hint, avoid choosing floors far below the hint.
    if (hint !== null && y < hint - 2.5) continue;

    const score = hint !== null ? Math.abs(y - hint) : y;
    if (score < bestScore) {
      bestScore = score;
      best = y;
    }
  }

  if (best === null) {
    // Fallback: choose lowest intersection above hint (or lowest overall).
    let lowY = null;
    for (let i = 0; i < nh; i++) {
      const y = hits[i]?.point?.y;
      if (!Number.isFinite(y)) continue;
      if (hint !== null && y < hint - 2.5) continue;
      if (lowY === null || y < lowY) lowY = y;
    }
    best = lowY;
  }

  return Number.isFinite(best) ? best : null;
}

// ── Room anchor / boundary helpers ──────────────────────────────────

export function getRoomAnchorPoint(spaceId) {
  // Prefer using stored world bbox from the green highlight (most accurate).
  if (state.roomSubsetWorldBox && !state.roomSubsetWorldBox.isEmpty()) {
    const c = state.roomSubsetWorldBox.getCenter(new THREE.Vector3());
    console.log('[getRoomAnchorPoint] Using stored roomSubsetWorldBox center:', c.toArray());
    return c;
  }
  // Fallback: compute from subset indexed vertices
  try {
    if (state.roomSubset) {
      const b = computeSubsetBBox(state.roomSubset);
      if (b) {
        const c = b.getCenter(new THREE.Vector3());
        console.log('[getRoomAnchorPoint] Using computeSubsetBBox center:', c.toArray());
        return c;
      }
    }
  } catch {
    // ignore
  }
  const p = getSpacePlacementPoint(spaceId);
  console.log('[getRoomAnchorPoint] Using placement point:', p.toArray());
  return p;
}

// Get boundary element IDs for a space (Walls, Floors, Ceilings)
export function getRoomBoundaryIds(spaceId) {
  try {
    const api = ifcLoader.ifcManager.ifcAPI;
    const boundaries = api.GetLineIDsWithType(state.modelID, IFCRELSPACEBOUNDARY);
    const boundaryIds = [];

    for (let i = 0; i < boundaries.size(); i++) {
      const relId = boundaries.get(i);
      const rel = api.GetLine(state.modelID, relId);
      const relatingSpace = ifcRefId(rel?.RelatingSpace);
      if (relatingSpace === spaceId) {
        const relatedElement = ifcRefId(rel?.RelatedBuildingElement);
        if (relatedElement) boundaryIds.push(relatedElement);
      }
    }
    return boundaryIds.length > 0 ? [...new Set(boundaryIds)] : null;
  } catch (e) {
    console.error('[getRoomBoundaryIds] Error:', e);
    return null;
  }
}

// Get room bounding box from IfcRelSpaceBoundary - finds elements (walls, floors) that bound the space
export function getRoomBoundaryBox(spaceId) {
  try {
    const boundaryIds = getRoomBoundaryIds(spaceId);

    if (!boundaryIds || boundaryIds.length === 0) {
      console.log('[getRoomBoundaryBox] No IfcRelSpaceBoundary found for space:', spaceId);
      return null;
    }

    console.log('[getRoomBoundaryBox] Found', boundaryIds.length, 'boundary elements for space:', spaceId);

    // Create subset from boundary elements and get their bbox
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const subset = ifcLoader.ifcManager.createSubset({
      modelID: state.modelID,
      ids: boundaryIds,
      material: mat,
      scene: state.scene,
      customID: 'boundary-temp',
      removePrevious: true
    });

    if (subset) {
      const box = computeSubsetBBox(subset);
      // Remove temp subset
      ifcLoader.ifcManager.removeSubset(state.modelID, mat, 'boundary-temp');
      state.scene.remove(subset);

      if (box) {
        console.log('[getRoomBoundaryBox] Boundary box:', box.min.toArray(), box.max.toArray());
        return box;
      }
    }
  } catch (e) {
    console.error('[getRoomBoundaryBox] Error:', e);
  }
  return null;
}

export function getRoomAnchorBox(spaceId) {
  // Prefer stored world bbox
  if (state.roomSubsetWorldBox && !state.roomSubsetWorldBox.isEmpty()) {
    return state.roomSubsetWorldBox.clone();
  }
  try {
    if (state.roomSubset) {
      const b = computeSubsetBBox(state.roomSubset);
      if (b) return b;
    }
  } catch {
    // ignore
  }
  // Fallback to a small box around the anchor point (better than using the full model bbox).
  const p = getRoomAnchorPoint(spaceId);
  const half = state.modelMaxDim ? Math.max(1.5, state.modelMaxDim * 0.02) : 2.0;
  return new THREE.Box3(
    new THREE.Vector3(p.x - half, p.y - half, p.z - half),
    new THREE.Vector3(p.x + half, p.y + half, p.z + half)
  );
}

export function collectElementIdsNearPoint(point, opts = {}) {
  if (!state.raycaster || !state.ifcModel || !ifcLoader?.ifcManager) return [];
  const maxDist = opts.maxDist ?? (Number.isFinite(state.modelMaxDim) ? state.modelMaxDim * 0.25 : 25);
  const rings = opts.rings ?? 2;
  const raysPerRing = opts.raysPerRing ?? 16;
  const height = opts.height ?? 1.2;
  const step = opts.step ?? (Number.isFinite(state.modelMaxDim) ? state.modelMaxDim * 0.01 : 0.5);

  const out = new Set();
  const base = new THREE.Vector3(point.x, point.y + height, point.z);
  const mgr = ifcLoader.ifcManager;

  // Down ray to catch floor/slab, and up ray to catch ceiling.
  for (const dir of [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0)]) {
    state.raycaster.set(base, dir);
    const hits = state.raycaster.intersectObject(state.ifcModel, true);
    const h = hits?.find((hh) => hh && Number.isFinite(hh.faceIndex) && hh.distance > 0.05 && hh.distance < maxDist) ?? null;
    if (h) {
      const id = mgr.getExpressId(h.object.geometry, h.faceIndex);
      if (id) out.add(id);
    }
  }

  // Horizontal rays in multiple directions from small offsets around the point.
  for (let r = 0; r <= rings; r++) {
    const radius = r * step;
    for (let i = 0; i < raysPerRing; i++) {
      const a = (i / raysPerRing) * Math.PI * 2;
      const origin = new THREE.Vector3(base.x + Math.cos(a) * radius, base.y, base.z + Math.sin(a) * radius);
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      state.raycaster.set(origin, dir);
      const hits = state.raycaster.intersectObject(state.ifcModel, true);
      const h = hits?.find((hh) => hh && Number.isFinite(hh.faceIndex) && hh.distance > 0.05 && hh.distance < maxDist) ?? null;
      if (h) {
        const id = mgr.getExpressId(h.object.geometry, h.faceIndex);
        if (id) out.add(id);
      }
    }
  }

  return Array.from(out);
}

export function estimateRoomBoxByRaycast(spaceId) {
  const p = getRoomAnchorPoint(spaceId);
  const fallbackHalf = state.modelMaxDim ? Math.max(2.0, state.modelMaxDim * 0.05) : 4.0;
  const s = Math.max(0.5, fallbackHalf * 0.35);
  const offsets = [
    [0, 0],
    [s, 0],
    [-s, 0],
    [0, s],
    [0, -s],
  ];

  const floorHits = [];
  const ceilHits = [];
  for (const [ox, oz] of offsets) {
    const fx = p.x + ox;
    const fz = p.z + oz;
    const fy = state.raycaster ? raycastFloorYAt(fx, fz, p.y) : null;
    if (Number.isFinite(fy)) floorHits.push(fy);
    const ch = state.raycaster ? raycastCeilingYAt(fx, fz, (Number.isFinite(p.y) ? p.y + 2.8 : null)) : null;
    if (Number.isFinite(ch)) ceilHits.push(ch);
  }

  const floorY = floorHits.length ? Math.min(...floorHits) : null;
  const ceilY = ceilHits.length ? Math.max(...ceilHits) : null;

  const baseY = Number.isFinite(floorY)
    ? floorY
    : (Number.isFinite(p.y) ? p.y : (state.modelBoxCached ? state.modelBoxCached.min.y : 0));

  const topY = Number.isFinite(ceilY)
    ? ceilY
    : (Number.isFinite(baseY) ? baseY + 3.5 : (state.modelBoxCached ? state.modelBoxCached.max.y : 3.5));

  let halfX = null;
  let halfZ = null;
  let hasAnyHit = Number.isFinite(floorY) || Number.isFinite(ceilY);

  if (state.raycaster) {
    const origin = new THREE.Vector3(p.x, baseY + 1.2, p.z);
    const dirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];
    const maxDistRay = 20.0; // Limit raycast distance
    const dists = [];
    for (const d of dirs) {
      state.raycaster.set(origin, d);
      const hits = state.raycaster.intersectObject(state.ifcModel, true);
      const hit = hits?.find((h0) => Number.isFinite(h0?.distance) && h0.distance > 0.05 && h0.distance < maxDistRay) ?? null;
      dists.push(hit ? hit.distance : null);
    }
    const [dxp, dxn, dzp, dzn] = dists;
    if (dxp !== null || dxn !== null || dzp !== null || dzn !== null) hasAnyHit = true;

    // Pick half-size based on hits, fallback to 2.5m
    const pickHalf = (a, b) => {
      if (a !== null && b !== null) return Math.max(0.5, Math.min(a, b));
      if (a !== null) return Math.max(0.5, a * 0.8);
      if (b !== null) return Math.max(0.5, b * 0.8);
      return null;
    };
    halfX = pickHalf(dxp, dxn);
    halfZ = pickHalf(dzp, dzn);
  }

  // If we couldn't find walls, use a safe default size (e.g. 4x4m room)
  if (halfX === null) halfX = 2.0;
  if (halfZ === null) halfZ = 2.0;

  // Ensure minimum size
  halfX = Math.max(1.0, halfX);
  halfZ = Math.max(1.0, halfZ);

  // Expand vertically to ensure we include floor and ceiling surfaces.
  const y0 = baseY - 0.2;
  const y1 = topY + 0.2;

  const b = new THREE.Box3(
    new THREE.Vector3(p.x - halfX, y0, p.z - halfZ),
    new THREE.Vector3(p.x + halfX, y1, p.z + halfZ)
  );

  // Check against model bounds just in case
  if (state.modelBoxCached && !b.intersectsBox(state.modelBoxCached)) {
    console.log('[estimateRoomBoxByRaycast] Box outside model bounds, ignoring');
    return null;
  }
  return b;
}

// ── Main: updateSectionBoxFromRoom ──────────────────────────────────

export function updateSectionBoxFromRoom(expressID) {
  if (!state.ifcModel || state.modelID === null) return;
  const pad = getSectionPadding();

  // Try to find exact boundary elements for isolation
  let isolationIds = [];
  try {
    const bids = getRoomBoundaryIds(expressID);
    if (bids && bids.length > 0) {
      console.log('[updateSectionBoxFromRoom] Found isolation elements:', bids.length);
      isolationIds = bids;
    }
  } catch (e) { console.error(e); }

  // PRIORITY: Use stored room highlight world bbox (matches green highlight position exactly)
  try {
    if (state.roomSubsetWorldBox && !state.roomSubsetWorldBox.isEmpty()) {
      const b = state.roomSubsetWorldBox.clone();

      console.log('[updateSectionBoxFromRoom] roomSubset bbox:', b.isEmpty() ? 'EMPTY' : 'min=' + b.min.toArray() + ' max=' + b.max.toArray());

      let isValid = !b.isEmpty();
      if (isValid && state.modelBoxCached) {
        const modelSize = state.modelBoxCached.getSize(new THREE.Vector3());
        const subsetSize = b.getSize(new THREE.Vector3());
        const ratio = Math.max(subsetSize.x / modelSize.x, subsetSize.y / modelSize.y, subsetSize.z / modelSize.z);
        console.log('[updateSectionBoxFromRoom] roomSubset ratio:', ratio.toFixed(2));
        if (ratio > 0.8) {
          console.log('[updateSectionBoxFromRoom] roomSubset bbox suspiciously large, skipping');
          isValid = false;
        }
      }

      if (isValid) {
        // Use roomSubset bbox regardless of size - it always shows the correct position
        console.log('[updateSectionBoxFromRoom] Using roomSubset bbox directly (matches green highlight)');
        // Use clip-only mode to avoid wrong element subsets; box is derived from highlight geometry
        state.sectionVisibleIds = [];
        // Use tiny padding to catch inner wall faces
        setSectionBoxFromBox(b, 0.02);
        const method = isolationIds.length > 0 ? 'isolated-subset' : 'subset-box';
        dom.viewerMeta.textContent = `Section: Room ${expressID} (${method})`;
        return;
      }
    } else {
      console.log('[updateSectionBoxFromRoom] roomSubset world bbox is null/empty');
    }
  } catch (e) {
    console.error('[updateSectionBoxFromRoom] roomSubset bbox error:', e);
  }

  // Fallback: try IfcRelSpaceBoundary to find walls/floors that bound the room
  try {
    const boundaryBox = getRoomBoundaryBox(expressID);
    if (boundaryBox && !boundaryBox.isEmpty()) {
      // Check if boundary box is reasonable size
      if (state.modelBoxCached) {
        const modelSize = state.modelBoxCached.getSize(new THREE.Vector3());
        const bbSize = boundaryBox.getSize(new THREE.Vector3());
        const ratio = Math.max(bbSize.x / modelSize.x, bbSize.y / modelSize.y, bbSize.z / modelSize.z);
        if (ratio <= 0.6) {
          console.log('[updateSectionBoxFromRoom] Using boundary-box, ratio:', ratio.toFixed(2));
          state.sectionVisibleIds = isolationIds.length > 0 ? isolationIds : [];
          setSectionBoxFromBox(boundaryBox, pad);
          dom.viewerMeta.textContent = `Section: Room ${expressID} (boundary-box)`;
          return;
        }
      }
    }
  } catch (e) {
    console.error('[updateSectionBoxFromRoom] Boundary-box error:', e);
  }

  // Fallback: use placement point if it's inside model bounds
  try {
    let p = getSpacePlacementPoint(expressID);

    // Check if placement is inside model bounds (with some margin)
    if (state.modelBoxCached) {
      const expandedBox = state.modelBoxCached.clone().expandByScalar(state.modelMaxDim * 0.1);
      if (expandedBox.containsPoint(p)) {
        console.log('[updateSectionBoxFromRoom] Using placement-based box at:', p.toArray());
        const half = state.modelMaxDim ? Math.max(2.0, state.modelMaxDim * 0.06) : 3.0;
        const heightHalf = state.modelMaxDim ? Math.max(1.5, state.modelMaxDim * 0.04) : 2.0;
        const rb = new THREE.Box3(
          new THREE.Vector3(p.x - half, p.y - heightHalf, p.z - half),
          new THREE.Vector3(p.x + half, p.y + heightHalf, p.z + half)
        );
        state.sectionVisibleIds = [];
        setSectionBoxFromBox(rb, pad);
        dom.viewerMeta.textContent = `Section: Room ${expressID} (placement-box)`;
        return;
      }
    }
  } catch (e) {
    console.error('[updateSectionBoxFromRoom] Placement-box error:', e);
  }

  // Fallback: try raycast-based estimation
  try {
    const rb = estimateRoomBoxByRaycast(expressID);
    if (rb && !rb.isEmpty()) {
      let valid = true;
      if (state.modelBoxCached) {
        const modelSize = state.modelBoxCached.getSize(new THREE.Vector3());
        const rbSize = rb.getSize(new THREE.Vector3());
        const ratio = Math.max(rbSize.x / modelSize.x, rbSize.y / modelSize.y, rbSize.z / modelSize.z);

        // Allow slightly larger ratio for raycast as it might be generous
        if (ratio > 0.8) {
          console.log('[updateSectionBoxFromRoom] Raycast-box ratio too large:', ratio.toFixed(2));
          valid = false;
        } else {
          console.log('[updateSectionBoxFromRoom] Using raycast-box, ratio:', ratio.toFixed(2));
        }
      }

      if (valid) {
        state.sectionVisibleIds = isolationIds.length > 0 ? isolationIds : [];
        setSectionBoxFromBox(rb, 0.02);
        dom.viewerMeta.textContent = `Section: Room ${expressID} (raycast-box)`;
        return;
      }
    }
  } catch (e) {
    console.error('[updateSectionBoxFromRoom] Raycast-box error:', e);
  }

  // Final fallback: just box around anchor point
  try {
    const p = getRoomAnchorPoint(expressID);
    const size = 3.0; // 3m box
    const fb = new THREE.Box3(
      new THREE.Vector3(p.x - size / 2, p.y, p.z - size / 2),
      new THREE.Vector3(p.x + size / 2, p.y + 3.0, p.z + size / 2)
    );
    state.sectionVisibleIds = isolationIds.length > 0 ? isolationIds : [];
    setSectionBoxFromBox(fb, 0.02);
    dom.viewerMeta.textContent = `Section: Room ${expressID} (anchor-box-fallback)`;
    console.log('[updateSectionBoxFromRoom] Using final fallback anchor-box');
  } catch (e) {
    console.error('[updateSectionBoxFromRoom] Final fallback error:', e);
  }

  // Last fallback: use model center with grid offset based on room index
  try {
    const roomIndex = state.spaceIndex.findIndex(s => s.expressID === expressID);
    const totalRooms = state.spaceIndex.length || 1;

    // Create a grid layout for rooms
    const gridCols = Math.ceil(Math.sqrt(totalRooms));
    const col = roomIndex % gridCols;
    const row = Math.floor(roomIndex / gridCols);

    const cellSize = state.modelMaxDim ? state.modelMaxDim / gridCols : 5;
    const startX = state.modelBoxCached ? state.modelBoxCached.min.x : 0;
    const startZ = state.modelBoxCached ? state.modelBoxCached.min.z : 0;
    const centerY = state.modelCenter ? state.modelCenter.y : 0;

    const p = new THREE.Vector3(
      startX + (col + 0.5) * cellSize,
      centerY,
      startZ + (row + 0.5) * cellSize
    );

    console.log('[updateSectionBoxFromRoom] Using grid-offset box at:', p.toArray(), 'room index:', roomIndex);
    const half = cellSize * 0.4;
    const heightHalf = state.modelMaxDim ? Math.max(1.5, state.modelMaxDim * 0.04) : 2.0;
    const rb = new THREE.Box3(
      new THREE.Vector3(p.x - half, p.y - heightHalf, p.z - half),
      new THREE.Vector3(p.x + half, p.y + heightHalf, p.z + half)
    );
    state.sectionVisibleIds = [];
    setSectionBoxFromBox(rb, pad);
    dom.viewerMeta.textContent = `Section: Room ${expressID} (grid-box)`;
    return;
  } catch (e) {
    console.error('[updateSectionBoxFromRoom] Grid-box error:', e);
  }

  // Fallback: build a list of elements by merging spatial structure IDs with ray-picked IDs,
  // then isolate that subset.
  let mergedIds = [];
  try {
    const root = getSpatialStructureRootCached();
    const spaceNode = root ? findSpatialNodeById(root, expressID) : null;
    const idsFromStructure = spaceNode ? collectSpatialElementIds(spaceNode).filter((x) => x !== expressID) : [];
    const p = getRoomAnchorPoint(expressID);
    const idsFromRays = collectElementIdsNearPoint(p, { maxDist: Number.isFinite(state.modelMaxDim) ? state.modelMaxDim * 0.5 : 50, rings: 3, raysPerRing: 24 });
    mergedIds = Array.from(new Set([...idsFromStructure, ...idsFromRays]));
  } catch (e) {
    console.error('[updateSectionBoxFromRoom] Merge IDs error:', e);
  }

  if (mergedIds.length) {
    state.sectionVisibleIds = mergedIds;
    const rb = getRoomAnchorBox(expressID);
    console.log('[updateSectionBoxFromRoom] anchor-box min/max:', rb.min.toArray(), rb.max.toArray(), 'mergedIds:', mergedIds.length);
    setSectionBoxFromBox(rb, pad);
    dom.viewerMeta.textContent = `Section: Room ${expressID} (ids+ray)`;
    return;
  }

  // Prefer spatial structure bbox: use elements contained in the space (IfcSpace often has no own geometry).
  try {
    const mgr = ifcLoader?.ifcManager;
    const root = getSpatialStructureRootCached();
    if (mgr && root) {
      const spaceNode = findSpatialNodeById(root, expressID);
      if (spaceNode) {
        const ids = collectSpatialElementIds(spaceNode);
        // Remove the space id itself if present (usually has no geometry).
        const filtered = ids.filter((x) => x !== expressID);
        if (filtered.length) {
          // Store IDs to show in section
          state.sectionVisibleIds = filtered;

          const tmpMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false });
          const tmp = mgr.createSubset({ modelID: state.modelID, ids: filtered, material: tmpMat, scene: state.scene, removePrevious: false });
          tmp.visible = false;
          const bb = computeSubsetBBox(tmp);
          tmp.removeFromParent();
          if (bb && !bb.isEmpty()) {
            setSectionBoxFromBox(bb, pad);
            dom.viewerMeta.textContent = `Section: Room ${expressID} (structure)`;
            console.log('[updateSectionBoxFromRoom] Applied from structure with', filtered.length, 'IDs');
            return;
          }
        }
      }
    }
  } catch (e) {
    console.error('[updateSectionBoxFromRoom] Structure error:', e);
  }

  if (state.roomSubset) {
    const b = computeSubsetBBox(state.roomSubset);
    if (b && !b.isEmpty()) {
      state.sectionVisibleIds = [expressID];
      setSectionBoxFromBox(b, pad);
      return;
    }
  }

  const tmpMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false });
  const tmp = ifcLoader.ifcManager.createSubset({
    modelID: state.modelID,
    ids: [expressID],
    material: tmpMat,
    scene: state.scene,
    removePrevious: false
  });
  tmp.visible = false;
  const b2 = computeSubsetBBox(tmp);
  tmp.removeFromParent();

  // Store single ID for section
  state.sectionVisibleIds = [expressID];

  // Many IFCs don't provide geometry for IfcSpace. If bbox is empty, fallback to a placement-based box.
  if (!b2 || b2.isEmpty()) {
    const fb = estimateRoomBoxByRaycast(expressID);
    state.sectionVisibleIds = [];
    setSectionBoxFromBox(fb, pad);
    dom.viewerMeta.textContent = `Section: Room ${expressID} (raycast-box)`;
    return;
  }

  setSectionBoxFromBox(b2, pad);
  dom.viewerMeta.textContent = `Section: Room ${expressID} (space-geom)`;
}
