/**
 * Camera utilities — fly, fit, reset, isometric / perspective switching.
 */
import * as THREE from 'three';
import { state, dom } from '../state.js';

export function updateOrthoFrustumForView(distanceHint = null) {
  if (!state.orthoCamera || !state.renderer) return;
  const w = dom.viewer3d.clientWidth || 800;
  const h = dom.viewer3d.clientHeight || 420;
  const aspect = w / h;

  // Use model size to choose a reasonable ortho frustum.
  const base = Number.isFinite(state.modelMaxDim) ? state.modelMaxDim : (distanceHint ?? 50);
  const halfH = Math.max(0.1, base * 0.55);
  const halfW = halfH * aspect;

  state.orthoCamera.left = -halfW;
  state.orthoCamera.right = halfW;
  state.orthoCamera.top = halfH;
  state.orthoCamera.bottom = -halfH;
  state.orthoCamera.near = 0.01;
  state.orthoCamera.far = Math.max(2000, base * 200);
  state.orthoCamera.updateProjectionMatrix();
}

export function flyCameraTo(center, maxDim, opts = {}) {
  const fov = (state.camera.fov * Math.PI) / 180;
  const startPos = state.camera.position.clone();
  const startTarget = state.controls.target.clone();
  const endTarget = center.clone();

  const currentDist = Math.max(1e-6, startPos.distanceTo(startTarget));
  // Base distance to fit the room in view, but rooms should generally be approached closer
  const fitDist = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 0.6;
  // Force a noticeable zoom-in relative to current view
  const desiredDist = Math.min(fitDist, currentDist * 0.6);
  // Robust clamps (IfcSpace bbox can be unexpectedly huge)
  const minDist = Math.max(0.15, maxDim * 0.08);
  const maxDistClamp = Math.max(minDist * 2, maxDim * 0.8);
  let dist = Math.min(maxDistClamp, Math.max(minDist, desiredDist));

  // If we want to look from inside the room, move much closer to the center.
  if (opts.inside) {
    const insideDist = Math.max(0.05, maxDim * 0.12);
    dist = Math.min(dist, insideDist, currentDist * 0.35);
    state.camera.near = Math.min(state.camera.near, Math.max(0.01, dist / 50));
    state.camera.updateProjectionMatrix();
  }
  // Preserve current view direction: keep the same camera ray direction relative to the target,
  // but move it to the desired distance around the new target.
  const dir = startPos.clone().sub(startTarget);
  if (dir.lengthSq() < 1e-12) dir.set(1, 1, 1);
  dir.normalize();
  const endPos = endTarget.clone().add(dir.multiplyScalar(dist));

  const duration = 450;
  const start = performance.now();

  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    state.camera.position.lerpVectors(startPos, endPos, ease);
    state.controls.target.lerpVectors(startTarget, endTarget, ease);
    state.controls.update();
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);

  return { dist, maxDim };
}

export function flyCameraToPoint(point, opts = {}) {
  if (!state.camera || !state.controls) {
    console.error('[flyCameraToPoint] camera or controls not initialized');
    return { dist: 0 };
  }

  const endTarget = point.clone();
  const dist = opts.dist ?? 8.0;

  // Calculate camera position: offset from target
  const viewDist = Math.max(dist, 10);
  const dir = new THREE.Vector3(1, 0.6, 1).normalize();
  const endPos = new THREE.Vector3(
    endTarget.x + dir.x * viewDist,
    endTarget.y + dir.y * viewDist,
    endTarget.z + dir.z * viewDist
  );

  console.log('[flyCameraToPoint] Moving camera to target:', endTarget.x.toFixed(2), endTarget.y.toFixed(2), endTarget.z.toFixed(2));
  console.log('[flyCameraToPoint] Camera position will be:', endPos.x.toFixed(2), endPos.y.toFixed(2), endPos.z.toFixed(2));
  console.log('[flyCameraToPoint] camera type:', state.camera.type, 'isOrtho:', state.isOrtho);

  // Set camera position
  state.camera.position.set(endPos.x, endPos.y, endPos.z);

  // Set controls target
  state.controls.target.set(endTarget.x, endTarget.y, endTarget.z);

  // Make camera look at target
  state.camera.lookAt(endTarget);

  // Update near plane for close viewing
  if (state.camera.isPerspectiveCamera) {
    state.camera.near = 0.1;
    state.camera.far = 10000;
  }
  state.camera.updateProjectionMatrix();

  // Force controls update
  state.controls.update();

  console.log('[flyCameraToPoint] Camera now at:', state.camera.position.x.toFixed(2), state.camera.position.y.toFixed(2), state.camera.position.z.toFixed(2));
  console.log('[flyCameraToPoint] Controls target:', state.controls.target.x.toFixed(2), state.controls.target.y.toFixed(2), state.controls.target.z.toFixed(2));

  return { dist };
}

export function fitCameraToObject(object3d, saveAsDefault = false) {
  const box = new THREE.Box3().setFromObject(object3d);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  const dir = new THREE.Vector3(1, 1, 1).normalize();

  if (state.camera && state.camera.isOrthographicCamera) {
    // Ortho fit: adjust frustum to tightly include the box.
    const w = dom.viewer3d.clientWidth || 800;
    const h = dom.viewer3d.clientHeight || 420;
    const aspect = w / h;
    const halfH = Math.max(size.y, size.x / Math.max(1e-6, aspect)) * 0.55;
    const halfW = halfH * aspect;
    state.camera.left = -halfW;
    state.camera.right = halfW;
    state.camera.top = halfH;
    state.camera.bottom = -halfH;
    const dist = Math.max(0.1, maxDim * 2);
    state.camera.position.copy(center).add(dir.multiplyScalar(dist));
    state.controls.target.copy(center);
    state.camera.near = 0.01;
    state.camera.far = Math.max(2000, dist * 200);
    state.camera.updateProjectionMatrix();
    state.controls.update();
  } else {
    // Perspective fit using a bounding sphere.
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const r = Math.max(1e-6, sphere.radius);
    const vFov = (state.camera.fov * Math.PI) / 180;
    const aspect = state.camera.aspect || 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const fovMin = Math.min(vFov, hFov);
    const fitDist = r / Math.sin(fovMin / 2);
    const dist = Math.max(0.1, fitDist * 0.72);
    state.camera.position.copy(center).add(dir.multiplyScalar(dist));
    state.controls.target.copy(center);
    state.camera.near = Math.max(0.01, dist / 200);
    state.camera.far = Math.max(2000, dist * 200);
    state.camera.updateProjectionMatrix();
    state.controls.update();
  }

  if (saveAsDefault) {
    state.modelCenter = center.clone();
    state.modelMaxDim = maxDim;
  }
}

export function resetView() {
  if (!state.ifcModel) return;
  // clearRoomFocus is called from main — imported separately to avoid circular deps
  if (state.highlightSubset) {
    state.highlightSubset.removeFromParent();
    state.highlightSubset = null;
  }

  // Restore original model opacity
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

  fitCameraToObject(state.ifcModel);
  dom.viewerMeta.textContent = state.modelID !== null ? `Loaded (modelID=${state.modelID})` : 'No model loaded';
}

export function setIsometricView() {
  if (!state.ifcModel || !state.modelCenter || !Number.isFinite(state.modelMaxDim)) return;
  if (!state.orthoCamera) return;

  // Switch to orthographic camera so isometric stays isometric (Revit-like).
  state.isOrtho = true;
  state.camera = state.orthoCamera;
  state.controls.object = state.camera;

  const center = state.modelCenter.clone();

  // Standard isometric angles: yaw 45°, pitch ~35.264°.
  const yaw = Math.PI / 4;
  const pitch = Math.atan(1 / Math.sqrt(2));
  const dir = new THREE.Vector3(
    Math.cos(pitch) * Math.cos(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.sin(yaw)
  ).normalize();

  const dist = Math.max(0.1, state.modelMaxDim * 2);
  updateOrthoFrustumForView(dist);
  state.camera.position.copy(center).add(dir.multiplyScalar(dist));
  state.controls.target.copy(center);
  state.camera.near = 0.01;
  state.camera.far = Math.max(2000, dist * 200);
  state.camera.updateProjectionMatrix();
  state.controls.update();
}

export function setPerspectiveView() {
  if (!state.perspCamera) return;
  state.isOrtho = false;
  state.camera = state.perspCamera;
  state.controls.object = state.camera;
  const w = dom.viewer3d.clientWidth || 800;
  const h = dom.viewer3d.clientHeight || 420;
  state.perspCamera.aspect = w / h;
  state.perspCamera.updateProjectionMatrix();
  if (state.ifcModel) fitCameraToObject(state.ifcModel);
}
