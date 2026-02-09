/**
 * IFC data-extraction helpers.
 * Pure utility functions — no side-effects, no DOM access.
 */
import * as THREE from 'three';
import { state } from '../state.js';

export function ifcRefId(ref) {
  if (ref === null || ref === undefined) return null;
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'object' && Number.isFinite(ref.value)) return ref.value;
  return null;
}

export function ifcListToArray(list) {
  if (!list || typeof list.size !== 'function' || typeof list.get !== 'function') return null;
  const n = list.size();
  const out = [];
  for (let i = 0; i < n; i++) out.push(list.get(i));
  return out;
}

export function extractIfcValue(val) {
  // Handle IfcLengthMeasure and similar IFC value objects
  if (val === null || val === undefined) return NaN;
  if (typeof val === 'number') return val;
  // Try different property names used by web-ifc
  if (typeof val === 'object') {
    if (val.value !== undefined) return Number(val.value);
    if (val.Value !== undefined) return Number(val.Value);
    // Log structure for debugging
    console.log('[extractIfcValue] Unknown object structure:', JSON.stringify(val));
  }
  return Number(val);
}

export function extractIfcCartesianPoint3(line) {
  const c = line?.Coordinates;
  const arr = ifcListToArray(c);
  if (!arr || arr.length < 3) return null;
  const x = extractIfcValue(arr[0]);
  const y = extractIfcValue(arr[1]);
  const z = extractIfcValue(arr[2]);
  if (![x, y, z].every(Number.isFinite)) return null;
  return new THREE.Vector3(x, y, z);
}

export function extractIfcDirection3(line) {
  const r = line?.DirectionRatios;
  const arr = ifcListToArray(r);
  if (!arr || arr.length < 3) return null;
  const x = extractIfcValue(arr[0]);
  const y = extractIfcValue(arr[1]);
  const z = extractIfcValue(arr[2]);
  if (![x, y, z].every(Number.isFinite)) return null;
  const v = new THREE.Vector3(x, y, z);
  if (v.lengthSq() < 1e-12) return null;
  return v.normalize();
}

export function axis2Placement3DToMatrix(relPlacementLine, api) {
  const locRef = ifcRefId(relPlacementLine?.Location);
  const axisRef = ifcRefId(relPlacementLine?.Axis);
  const refDirRef = ifcRefId(relPlacementLine?.RefDirection);

  const loc = (locRef ? extractIfcCartesianPoint3(api.GetLine(state.modelID, locRef)) : null) ?? new THREE.Vector3(0, 0, 0);
  const z = (axisRef ? extractIfcDirection3(api.GetLine(state.modelID, axisRef)) : null) ?? new THREE.Vector3(0, 0, 1);
  let x = (refDirRef ? extractIfcDirection3(api.GetLine(state.modelID, refDirRef)) : null) ?? new THREE.Vector3(1, 0, 0);

  // Ensure an orthonormal basis.
  const y = new THREE.Vector3().crossVectors(z, x);
  if (y.lengthSq() < 1e-12) {
    // If x is collinear with z, pick any perpendicular x.
    x = Math.abs(z.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  }
  const y2 = new THREE.Vector3().crossVectors(z, x).normalize();
  const x2 = new THREE.Vector3().crossVectors(y2, z).normalize();
  const z2 = z.clone().normalize();

  const m = new THREE.Matrix4();
  m.makeBasis(x2, y2, z2);
  m.setPosition(loc);
  return m;
}
