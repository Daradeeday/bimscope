/**
 * Spatial structure tree — cache, traverse, find nodes, collect element IDs.
 */
import { state, ifcLoader } from '../state.js';

export function getSpatialStructureRootCached() {
  return state.spatialRootCached;
}

export async function rebuildSpatialStructureCache() {
  const mgr = ifcLoader?.ifcManager;
  if (!mgr || typeof mgr.getSpatialStructure !== 'function') {
    state.spatialRootCached = null;
    return null;
  }
  if (state.modelID === null) {
    state.spatialRootCached = null;
    return null;
  }
  try {
    state.spatialRootCached = await mgr.getSpatialStructure(state.modelID, true);
    return state.spatialRootCached;
  } catch {
    state.spatialRootCached = null;
    return null;
  }
}

export function spatialChildNodes(node) {
  if (!node || typeof node !== 'object') return [];
  const out = [];
  const keys = ['children', 'Children', 'childrenIDs', 'childrenIds', 'childrenId', 'contains', 'Contains', 'elements', 'Elements'];
  for (const k of keys) {
    const v = node[k];
    if (Array.isArray(v)) {
      for (const it of v) if (it && typeof it === 'object') out.push(it);
    }
  }
  // Heuristic: collect any array-of-objects with expressID.
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (!Array.isArray(v)) continue;
    for (const it of v) {
      if (it && typeof it === 'object' && 'expressID' in it) out.push(it);
    }
  }
  return out;
}

export function findSpatialNodeById(root, targetId) {
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    const id = Number(n.expressID);
    if (Number.isFinite(id) && id === targetId) return n;
    if (seen.has(n)) continue;
    seen.add(n);
    const kids = spatialChildNodes(n);
    for (const c of kids) stack.push(c);
  }
  return null;
}

export function collectSpatialElementIds(node) {
  const ids = new Set();
  const stack = [node];
  const seen = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    if (seen.has(n)) continue;
    seen.add(n);
    const id = Number(n.expressID);
    if (Number.isFinite(id) && id > 0) ids.add(id);

    // Also support array-of-number ids if present.
    const idLists = [n.childrenIDs, n.childrenIds, n.childrenId, n.elementsIDs, n.elementsIds];
    for (const lst of idLists) {
      if (!Array.isArray(lst)) continue;
      for (const x of lst) {
        const nx = Number(x);
        if (Number.isFinite(nx) && nx > 0) ids.add(nx);
      }
    }

    const kids = spatialChildNodes(n);
    for (const c of kids) stack.push(c);
  }
  return Array.from(ids);
}
