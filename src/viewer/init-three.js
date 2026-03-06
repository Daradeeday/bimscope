/**
 * Three.js initialization — scene, cameras, renderer, controls, animate loop.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state, dom } from '../state.js';
import { updateOrthoFrustumForView } from './camera.js';
import { ensureShadowPlane } from './overlays.js';

export function initThree() {
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0xeaeeee);

  const w = dom.viewer3d.clientWidth || 800;
  const h = dom.viewer3d.clientHeight || 420;

  state.perspCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);
  state.perspCamera.position.set(10, 10, 10);
  state.orthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 10000);
  updateOrthoFrustumForView();
  state.camera = state.perspCamera;
  state.isOrtho = false;

  state.renderer = new THREE.WebGLRenderer({ antialias: true });
  state.renderer.setSize(w, h);
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.renderer.shadowMap.enabled = false;
  state.renderer.localClippingEnabled = false;
  dom.viewer3d.innerHTML = '';
  dom.viewer3d.appendChild(state.renderer.domElement);

  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.controls.enableDamping = true;
  state.controls.dampingFactor = 0.08;
  state.controls.screenSpacePanning = true;

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  state.scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 1.15);
  dir.position.set(10, 20, 10);
  dir.castShadow = false;
  state.scene.add(dir);

  ensureShadowPlane();

  state.debugOverlayGroup = new THREE.Group();
  state.debugOverlayGroup.renderOrder = -10;
  state.debugOverlayGroup.visible = state.debugOverlayVisible;
  state.scene.add(state.debugOverlayGroup);

  // Don't add initial GridHelper here - it will be rebuilt after model load
  // debugGridHelper will be created by rebuildDebugGridOverlay()

  state.debugLevelsGroup = new THREE.Group();
  state.debugOverlayGroup.add(state.debugLevelsGroup);

  state.debugIfcGridGroup = new THREE.Group();
  state.debugOverlayGroup.add(state.debugIfcGridGroup);

  state.raycaster = new THREE.Raycaster();
  state.mouse = new THREE.Vector2();

  state.highlightMat = new THREE.MeshBasicMaterial({
    color: 0x4da3ff,
    transparent: true,
    opacity: 0.35,
    depthTest: true
  });

  function onResize() {
    const w2 = dom.viewer3d.clientWidth || 800;
    const h2 = dom.viewer3d.clientHeight || 420;
    if (state.perspCamera) {
      state.perspCamera.aspect = w2 / h2;
      state.perspCamera.updateProjectionMatrix();
    }
    if (state.orthoCamera) {
      updateOrthoFrustumForView();
    }
    state.renderer.setSize(w2, h2);
  }

  window.addEventListener('resize', onResize);

  const ro = new ResizeObserver(() => onResize());
  ro.observe(dom.viewer3d);

  if (!state.debugOverlayKeyBound) {
    state.debugOverlayKeyBound = true;
    window.addEventListener('keydown', (e) => {
      const k = String(e?.key || '').toLowerCase();
      if (k === 'g') {
        state.debugOverlayVisible = !state.debugOverlayVisible;
        if (state.debugOverlayGroup) state.debugOverlayGroup.visible = state.debugOverlayVisible;
      }
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    state.controls.update();

    // Toggle clipping flag — materials already have planes set by section-box.js
    if (state.sectionPlanes && state.sectionPlanes.length > 0) {
      state.renderer.localClippingEnabled = true;
    } else {
      state.renderer.localClippingEnabled = false;
    }

    state.renderer.render(state.scene, state.camera);
  }
  animate();
}
