/**
 * Debug overlays — grid, storey levels, IFC grid lines, edges, shadow plane.
 */
import * as THREE from 'three';
import { IFCGRID } from 'web-ifc';
import { state, ifcLoader, dom } from '../state.js';
import { ifcRefId, ifcListToArray } from '../helpers/ifc-utils.js';

// ── Debug Grid ──────────────────────────────────────────────────────

export function rebuildDebugGridOverlay() {
  if (!state.debugOverlayGroup) return;
  if (!state.modelBoxCached || !Number.isFinite(state.modelMaxDim)) return;

  // Dispose old grid helper if exists
  if (state.debugGridHelper) {
    try {
      if (state.debugGridHelper.parent) state.debugGridHelper.removeFromParent();
      if (state.debugGridHelper.geometry) state.debugGridHelper.geometry.dispose();
      if (state.debugGridHelper.material) {
        const ms = Array.isArray(state.debugGridHelper.material) ? state.debugGridHelper.material : [state.debugGridHelper.material];
        for (const m of ms) {
          if (m && m.dispose) m.dispose();
        }
      }
    } catch {
      // ignore
    }
  }

  const size = Math.max(10, state.modelMaxDim * 3);
  const divisions = Math.max(10, Math.min(200, Math.round(size / 5)));

  state.debugGridHelper = new THREE.GridHelper(size, divisions, 0x2b3a52, 0x1f2a3b);
  state.debugGridHelper.material.opacity = 0.35;
  state.debugGridHelper.material.transparent = true;

  // Place grid at Y=0 (±0.00 level)
  state.debugGridHelper.position.set(state.modelCenter ? state.modelCenter.x : 0, 0, state.modelCenter ? state.modelCenter.z : 0);

  state.debugOverlayGroup.add(state.debugGridHelper);
}

// ── Debug Levels ────────────────────────────────────────────────────

export function rebuildDebugLevelsOverlay() {
  if (!state.scene || !state.debugLevelsGroup) return;
  // Clear previous
  while (state.debugLevelsGroup.children.length) {
    const c = state.debugLevelsGroup.children.pop();
    try {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    } catch {
      // ignore
    }
  }

  if (!state.modelBoxCached) return;

  const ys = [];
  for (const s of state.storeyIndex || []) {
    const rawElev = s?.Elevation;
    // Use raw IFC Elevation directly - IFC Y maps to Three.js Y in web-ifc-three
    const y = Number.isFinite(rawElev) ? rawElev : null;
    if (Number.isFinite(y)) {
      ys.push({ id: s.expressID, y, name: s.Name });
    }
  }

  console.log('[rebuildDebugLevelsOverlay] Level Y values:', ys.map(l => `${l.name}: ${l.y.toFixed(2)}`));
  console.log('[rebuildDebugLevelsOverlay] Model Y range:', state.modelBoxCached.min.y.toFixed(2), 'to', state.modelBoxCached.max.y.toFixed(2));
  // If no storey levels exist, don't draw.
  if (!ys.length) return;

  // De-duplicate close levels.
  ys.sort((a, b) => a.y - b.y);
  const unique = [];
  for (const it of ys) {
    if (!unique.length || Math.abs(it.y - unique[unique.length - 1].y) > 1e-3) unique.push(it);
  }

  const min = state.modelBoxCached.min;
  const max = state.modelBoxCached.max;
  const dx = max.x - min.x;
  const dz = max.z - min.z;
  const inset = Math.max(0.1, Math.min(dx, dz) * 0.02);

  const cornersAtY = (y) => [
    new THREE.Vector3(min.x + inset, y, min.z + inset),
    new THREE.Vector3(max.x - inset, y, min.z + inset),
    new THREE.Vector3(max.x - inset, y, max.z - inset),
    new THREE.Vector3(min.x + inset, y, max.z - inset),
    new THREE.Vector3(min.x + inset, y, min.z + inset),
  ];

  for (let i = 0; i < unique.length; i++) {
    const y = unique[i].y;
    const pts = cornersAtY(y);
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.8 });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 50;
    state.debugLevelsGroup.add(line);
  }
}

// ── IFC Grid Overlay ────────────────────────────────────────────────

export function rebuildIfcGridOverlay() {
  if (!state.scene || !state.debugIfcGridGroup) return;

  // Clear previous
  while (state.debugIfcGridGroup.children.length) {
    const c = state.debugIfcGridGroup.children.pop();
    try {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    } catch {
      // ignore
    }
  }

  if (state.modelID === null || !ifcLoader?.ifcManager?.ifcAPI) return;

  try {
    const api = ifcLoader.ifcManager.ifcAPI;

    // Get all IfcGrid entities
    const gridIds = api.GetLineIDsWithType(state.modelID, IFCGRID);
    if (!gridIds || gridIds.size() === 0) {
      console.log('[rebuildIfcGridOverlay] No IfcGrid found in model');
      return;
    }

    console.log('[rebuildIfcGridOverlay] Found', gridIds.size(), 'IfcGrid entities');

    // Debug: log first grid structure
    for (let gi = 0; gi < Math.min(1, gridIds.size()); gi++) {
      const gridId = gridIds.get(gi);
      const grid = api.GetLine(state.modelID, gridId);
      console.log('[rebuildIfcGridOverlay] Grid structure:', JSON.stringify(grid, null, 2));
    }

    // Helper to extract curve points from IfcGridAxis
    const getAxisCurvePoints = (axisId) => {
      try {
        const axis = api.GetLine(state.modelID, axisId);
        if (!axis) return null;

        const curveRef = ifcRefId(axis?.AxisCurve);
        if (!curveRef) return null;

        const curve = api.GetLine(state.modelID, curveRef);
        if (!curve) return null;

        // Handle IfcLine (most common for grid axes)
        if (curve.Pnt !== undefined && curve.Dir !== undefined) {
          const pntRef = ifcRefId(curve.Pnt);
          const dirRef = ifcRefId(curve.Dir);
          if (!pntRef || !dirRef) return null;

          const pnt = api.GetLine(state.modelID, pntRef);
          const dir = api.GetLine(state.modelID, dirRef);

          const coords = ifcListToArray(pnt?.Coordinates);
          if (!coords || coords.length < 2) return null;

          const x = Number(coords[0]) || 0;
          const y = Number(coords[1]) || 0;
          const z = Number(coords[2]) || 0;

          // Direction
          let dx = 1, dy = 0, dz = 0;
          const dirCoords = ifcListToArray(dir?.DirectionRatios);
          if (dirCoords && dirCoords.length >= 2) {
            dx = Number(dirCoords[0]) || 0;
            dy = Number(dirCoords[1]) || 0;
            dz = Number(dirCoords[2]) || 0;
          }

          // Extend line in both directions
          const len = state.modelMaxDim ? state.modelMaxDim * 2 : 500;
          return [
            new THREE.Vector3(x - dx * len, z, y - dy * len),  // IFC Y -> Three.js Z
            new THREE.Vector3(x + dx * len, z, y + dy * len)
          ];
        }

        // Handle IfcPolyline
        const pointsRef = curve?.Points;
        if (pointsRef) {
          const pointIds = ifcListToArray(pointsRef);
          if (pointIds && pointIds.length >= 2) {
            const pts = [];
            for (const pid of pointIds) {
              const pt = api.GetLine(state.modelID, ifcRefId(pid) || pid);
              const coords = ifcListToArray(pt?.Coordinates);
              if (coords && coords.length >= 2) {
                const x = Number(coords[0]) || 0;
                const y = Number(coords[1]) || 0;
                const z = Number(coords[2]) || 0;
                pts.push(new THREE.Vector3(x, z, y));  // IFC Y -> Three.js Z
              }
            }
            if (pts.length >= 2) return pts;
          }
        }

        return null;
      } catch (e) {
        console.error('[getAxisCurvePoints] Error:', e);
        return null;
      }
    };

    // Process each grid
    for (let gi = 0; gi < gridIds.size(); gi++) {
      const gridId = gridIds.get(gi);
      const grid = api.GetLine(state.modelID, gridId);
      if (!grid) continue;

      // Get U, V, W axes
      const axisArrays = [grid.UAxes, grid.VAxes, grid.WAxes];
      const colors = [0xff6666, 0x66ff66, 0x6666ff];  // Red for U, Green for V, Blue for W

      for (let ai = 0; ai < axisArrays.length; ai++) {
        const axesRef = axisArrays[ai];
        if (!axesRef) continue;

        const axisIds = ifcListToArray(axesRef);
        if (!axisIds || axisIds.length === 0) continue;

        for (const axisIdRaw of axisIds) {
          const axisId = ifcRefId(axisIdRaw) || axisIdRaw;
          const pts = getAxisCurvePoints(axisId);
          if (!pts || pts.length < 2) continue;

          const geom = new THREE.BufferGeometry().setFromPoints(pts);
          const mat = new THREE.LineBasicMaterial({
            color: colors[ai],
            transparent: true,
            opacity: 0.7,
            linewidth: 2
          });
          const line = new THREE.Line(geom, mat);
          line.renderOrder = 60;
          state.debugIfcGridGroup.add(line);
        }
      }
    }

    console.log('[rebuildIfcGridOverlay] Added', state.debugIfcGridGroup.children.length, 'grid lines');
  } catch (e) {
    console.error('[rebuildIfcGridOverlay] Error:', e);
  }
}

// ── Edges Overlay ───────────────────────────────────────────────────

export function clearEdges() {
  if (state.edgesGroup) {
    state.edgesGroup.removeFromParent();
    state.edgesGroup = null;
  }
  state.edgesMaterial = null;
}

export function buildEdgesOverlay(object3d) {
  clearEdges();
  if (!object3d) return;

  // Count meshes first — skip edge generation for very large models
  let meshCount = 0;
  object3d.traverse((obj) => { if (obj?.isMesh) meshCount++; });
  if (meshCount > 500) {
    console.log(`[buildEdgesOverlay] Skipped: model has ${meshCount} meshes (limit 500)`);
    return;
  }

  state.edgesGroup = new THREE.Group();
  state.edgesGroup.renderOrder = 10;

  state.edgesMaterial = new THREE.LineBasicMaterial({ color: 0x2b2f36, transparent: true, opacity: 0.85 });
  if (state.sectionPlanes) {
    state.edgesMaterial.clippingPlanes = state.sectionPlanes;
    state.edgesMaterial.clipIntersection = false;
  }

  object3d.traverse((obj) => {
    if (!obj || !obj.isMesh || !obj.geometry) return;
    const geom = obj.geometry;
    // Use higher angle threshold (35°) to produce fewer edge lines
    const edges = new THREE.EdgesGeometry(geom, 35);
    const lines = new THREE.LineSegments(edges, state.edgesMaterial);
    lines.matrixAutoUpdate = false;
    lines.matrix.copy(obj.matrixWorld);
    lines.frustumCulled = true;
    state.edgesGroup.add(lines);
  });

  state.scene.add(state.edgesGroup);
}

// ── Shadow Plane ────────────────────────────────────────────────────

export function setShadowForModel(object3d) {
  if (!object3d) return;
  // Only receiveShadow — castShadow on every mesh forces a full scene
  // re-render into the shadow map each frame, which is very expensive.
  object3d.traverse((obj) => {
    if (!obj || !obj.isMesh) return;
    obj.castShadow = false;
    obj.receiveShadow = true;
  });
}

export function ensureShadowPlane() {
  if (state.shadowPlane) return;
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShadowMaterial({ opacity: 0.22 });
  state.shadowPlane = new THREE.Mesh(geo, mat);
  state.shadowPlane.rotation.x = -Math.PI / 2;
  state.shadowPlane.receiveShadow = true;
  state.shadowPlane.renderOrder = -1;
  state.scene.add(state.shadowPlane);
}

export function updateShadowPlaneForModel() {
  if (!state.shadowPlane || !Number.isFinite(state.modelMaxDim) || !Number.isFinite(state.modelMinY) || !state.modelCenter) return;
  const s = Math.max(10, state.modelMaxDim * 3);
  state.shadowPlane.geometry.dispose();
  state.shadowPlane.geometry = new THREE.PlaneGeometry(s, s);
  state.shadowPlane.position.set(state.modelCenter.x, state.modelMinY - 0.02, state.modelCenter.z);
}

// ── Model Appearance ────────────────────────────────────────────────

export function setModelAppearance(object3d) {
  if (!object3d) return;
  object3d.traverse((obj) => {
    if (!obj || !obj.isMesh) return;
    const m = obj.material;
    if (!m) return;
    const materials = Array.isArray(m) ? m : [m];
    for (const mi of materials) {
      if (!mi) continue;
      // Ensure double-sided rendering for IFC geometry
      if (mi.side !== THREE.DoubleSide) mi.side = THREE.DoubleSide;
      // Preserve original IFC colors and textures — do NOT override color
      // Enable clipping planes support
      mi.clippingPlanes = state.sectionPlanes || [];
      mi.clipIntersection = false;
      mi.needsUpdate = true;
    }
  });
}
