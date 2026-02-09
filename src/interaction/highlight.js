/**
 * Element highlighting — double-click pick + express ID highlight.
 */
import { state, ifcLoader, dom } from '../state.js';

export function highlightExpressId(expressID) {
  if (state.modelID === null) return;
  if (state.highlightSubset) {
    state.highlightSubset.removeFromParent();
    state.highlightSubset = null;
  }

  state.highlightSubset = ifcLoader.ifcManager.createSubset({
    modelID: state.modelID,
    ids: [expressID],
    material: state.highlightMat,
    scene: state.scene,
    removePrevious: true
  });
}

export function onDoubleClick(event) {
  if (!state.ifcModel || state.modelID === null) return;

  const rect = state.renderer.domElement.getBoundingClientRect();
  state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.mouse.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

  state.raycaster.setFromCamera(state.mouse, state.camera);
  const intersects = state.raycaster.intersectObject(state.ifcModel, true);
  if (!intersects.length) return;

  const hit = intersects[0];
  const faceIndex = hit.faceIndex;
  if (faceIndex === null || faceIndex === undefined) return;

  const id = ifcLoader.ifcManager.getExpressId(hit.object.geometry, faceIndex);
  if (!id) return;

  dom.expressIdInput.value = String(id);
  highlightExpressId(id);
  // Default action: show Inspect output
  dom.btnInspect.click();
}
