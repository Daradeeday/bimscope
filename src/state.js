/**
 * Shared application state.
 * Every module that needs to read / write global state imports from here.
 */
import * as THREE from 'three';
import { IFCLoader } from 'web-ifc-three/IFCLoader';

// ── DOM element references ──────────────────────────────────────────
export const dom = {
  elFile: document.getElementById('ifcFile'),
  btnLoad: document.getElementById('btnLoad'),
  btnClose: document.getElementById('btnClose'),
  btnListTypes: document.getElementById('btnListTypes'),
  btnListSpaces: document.getElementById('btnListSpaces'),
  expressIdInput: document.getElementById('expressId'),
  btnInspect: document.getElementById('btnInspect'),
  btnProps: document.getElementById('btnProps'),
  btnTypeProps: document.getElementById('btnTypeProps'),
  output: document.getElementById('output'),
  viewerMeta: document.getElementById('viewerMeta'),
  loadHint: document.getElementById('loadHint'),
  viewer3d: document.getElementById('viewer3d'),
  spaceSelect: document.getElementById('spaceSelect'),
  btnGoSpace: document.getElementById('btnGoSpace'),
  btnClearSpace: document.getElementById('btnClearSpace'),
  btnResetView: document.getElementById('btnResetView'),
  btnIsoView: document.getElementById('btnIsoView'),
  sectionMode: document.getElementById('sectionMode'),
  storeySelect: document.getElementById('storeySelect'),
  sectionPadding: document.getElementById('sectionPadding'),
  roomDisplayMode: document.getElementById('roomDisplayMode'),
  btnSectionReset: document.getElementById('btnSectionReset'),
  btnLevelReset: document.getElementById('btnLevelReset'),
  levelOffset: document.getElementById('levelOffset'),
  viewerSplitter: document.getElementById('viewerSplitter'),
  btnExportJSON: document.getElementById('btnExportJSON'),
  btnExportCSV: document.getElementById('btnExportCSV'),
  metadataFile: document.getElementById('metadataFile'),
  summaryPanel: document.getElementById('summaryPanel'),
  // floorPanel:      document.getElementById('floorPanel'),
  toastContainer: document.getElementById('toast-container'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingText: document.getElementById('loadingText'),
  categoryList: document.getElementById('categoryList'),
  btnShowAllCat: document.getElementById('btnShowAllCat'),
  btnHideAllCat: document.getElementById('btnHideAllCat'),
};

// ── IFC loader ──────────────────────────────────────────────────────
export const ifcLoader = new IFCLoader();

// ── Mutable application state ───────────────────────────────────────
// Wrapped in an object so modules can mutate by reference.
export const state = {
  modelID: null,
  roomMetadata: null,

  // Three.js core
  scene: null,
  camera: null,
  perspCamera: null,
  orthoCamera: null,
  renderer: null,
  controls: null,
  raycaster: null,
  mouse: null,

  // Model objects
  ifcModel: null,
  highlightMat: null,
  highlightSubset: null,
  roomSubset: null,
  roomSubsetBboxCenter: null,
  roomSubsetWorldBox: null,
  sectionSubset: null,
  roomHighlightCustomId: null,
  sectionSubsetCustomId: null,
  edgesGroup: null,
  shadowPlane: null,
  edgesMaterial: null,

  // Indices
  spaceIndex: [],
  storeyIndex: [],
  sectionVisibleIds: [],

  // Model metrics
  modelMaxDim: null,
  modelCenter: null,
  modelMinY: null,
  modelBoxCached: null,
  storeyElevationOffset: 0,
  storeyWorldY: new Map(),
  spatialRootCached: null,

  // Section
  sectionPlanes: null,
  sectionModeValue: 'off',
  sectionBoxHelper: null,

  // Debug overlay
  debugOverlayGroup: null,
  debugGridHelper: null,
  debugLevelsGroup: null,
  debugIfcGridGroup: null,
  debugOverlayVisible: true,
  debugOverlayKeyBound: false,

  // Camera
  isOrtho: false,

  // Category visibility
  categoryVisibility: {},
};
