/**
 * Category visibility toggle — discover IFC categories and show/hide them.
 */
import {
    IFCWALL, IFCWALLSTANDARDCASE,
    IFCSLAB,
    IFCDOOR,
    IFCWINDOW,
    IFCCOLUMN,
    IFCBEAM,
    IFCSTAIR, IFCSTAIRFLIGHT,
    IFCROOF,
    IFCRAILING,
    IFCCOVERING,
    IFCFURNISHINGELEMENT,
    IFCFLOWSEGMENT,
    IFCFLOWTERMINAL,
    IFCPLATE,
    IFCMEMBER,
    IFCCURTAINWALL,
    IFCFOOTING,
    IFCBUILDINGELEMENTPROXY,
    IFCOPENINGELEMENT,
    IFCSPACE,
} from 'web-ifc';
import { state, ifcLoader, dom } from '../state.js';

/**
 * Predefined IFC type mapping: display name → IFC type constant(s).
 * We check each one against the loaded model to see which exist.
 */
const IFC_CATEGORIES = [
    { name: 'IfcWall', types: [IFCWALL, IFCWALLSTANDARDCASE] },
    { name: 'IfcSlab', types: [IFCSLAB] },
    { name: 'IfcDoor', types: [IFCDOOR] },
    { name: 'IfcWindow', types: [IFCWINDOW] },
    { name: 'IfcColumn', types: [IFCCOLUMN] },
    { name: 'IfcBeam', types: [IFCBEAM] },
    { name: 'IfcStair', types: [IFCSTAIR, IFCSTAIRFLIGHT] },
    { name: 'IfcRoof', types: [IFCROOF] },
    { name: 'IfcRailing', types: [IFCRAILING] },
    { name: 'IfcCovering', types: [IFCCOVERING] },
    { name: 'IfcFurnishingElement', types: [IFCFURNISHINGELEMENT] },
    { name: 'IfcFlowSegment', types: [IFCFLOWSEGMENT] },
    { name: 'IfcFlowTerminal', types: [IFCFLOWTERMINAL] },
    { name: 'IfcPlate', types: [IFCPLATE] },
    { name: 'IfcMember', types: [IFCMEMBER] },
    { name: 'IfcCurtainWall', types: [IFCCURTAINWALL] },
    { name: 'IfcFooting', types: [IFCFOOTING] },
    { name: 'IfcBuildingElementProxy', types: [IFCBUILDINGELEMENTPROXY] },
    { name: 'IfcOpeningElement', types: [IFCOPENINGELEMENT] },
    { name: 'IfcSpace', types: [IFCSPACE] },
];

/**
 * Discover which IFC categories exist in the loaded model.
 * Populates state.categoryVisibility with { [name]: { visible, ids } }.
 */
export function discoverCategories() {
    state.categoryVisibility = {};
    if (state.modelID === null) return;

    const api = ifcLoader.ifcManager.ifcAPI;

    for (const cat of IFC_CATEGORIES) {
        const allIds = [];
        for (const typeConst of cat.types) {
            try {
                const idSet = api.GetLineIDsWithType(state.modelID, typeConst);
                const n = idSet.size();
                for (let i = 0; i < n; i++) {
                    allIds.push(idSet.get(i));
                }
            } catch {
                // Type not present in this model — skip
            }
        }
        if (allIds.length > 0) {
            state.categoryVisibility[cat.name] = {
                visible: true,
                ids: allIds,
            };
        }
    }
}

/**
 * Apply visibility for a single category.
 * Uses ifcLoader.ifcManager.createSubset / removeSubset to toggle geometry.
 */
export function setCategoryVisible(catName, visible) {
    const cat = state.categoryVisibility[catName];
    if (!cat) return;

    cat.visible = visible;

    if (!state.ifcModel) return;

    if (!visible) {
        // Hide: create hidden subset to remove from main model display
        try {
            ifcLoader.ifcManager.removeSubset(state.modelID, undefined, `cat-hide-${catName}`);
        } catch { /* ignore */ }

        try {
            ifcLoader.ifcManager.createSubset({
                modelID: state.modelID,
                ids: cat.ids,
                scene: state.scene,
                removePrevious: true,
                customID: `cat-hide-${catName}`,
                applyBVH: false,
            });
            // Remove the subset from scene — we just use it to remove those IDs from the main display
            const subset = ifcLoader.ifcManager.getSubset(state.modelID, undefined, `cat-hide-${catName}`);
            if (subset) {
                subset.visible = false;
            }
        } catch { /* ignore */ }

        // Also set visible = false on the main model for matching express IDs
        const hiddenSet = new Set(cat.ids);
        state.ifcModel.traverse((child) => {
            if (!child.isMesh) return;
            // web-ifc-three stores expressID on geometry
            const eid = child.geometry?.attributes?.expressID;
            if (!eid) return;
            const arr = eid.array;
            if (!arr || arr.length === 0) return;
            // Check if ALL express IDs in this mesh belong to hidden category
            // Since meshes can contain multiple elements, we can't simply hide
        });

        // Simpler approach: rebuild visible subset
        _rebuildVisibleSubset();
    } else {
        // Show: remove the hidden subset
        try {
            ifcLoader.ifcManager.removeSubset(state.modelID, undefined, `cat-hide-${catName}`);
        } catch { /* ignore */ }
        _rebuildVisibleSubset();
    }

    // Update checkbox UI
    const cb = document.getElementById(`cat-cb-${catName}`);
    if (cb) cb.checked = visible;
}

/**
 * Rebuild the main model visibility by hiding all unchecked category IDs.
 * This traverses the model once and hides geometry groups that contain hidden IDs.
 */
function _rebuildVisibleSubset() {
    if (!state.ifcModel) return;

    // Collect all hidden IDs
    const hiddenIds = new Set();
    for (const [, cat] of Object.entries(state.categoryVisibility)) {
        if (!cat.visible) {
            for (const id of cat.ids) hiddenIds.add(id);
        }
    }

    // Traverse the model and toggle visibility on mesh level
    state.ifcModel.traverse((child) => {
        if (!child.isMesh) return;
        const eid = child.geometry?.attributes?.expressID;
        if (!eid) return;
        const arr = eid.array;
        if (!arr || arr.length === 0) return;

        // Check which express IDs are in this mesh
        const uniqueIds = new Set(arr);
        // If ALL IDs in this mesh are hidden → hide the mesh
        // If ANY ID in this mesh is visible → show the mesh
        let allHidden = true;
        for (const id of uniqueIds) {
            if (id === 0) continue; // skip zero-padding
            if (!hiddenIds.has(id)) {
                allHidden = false;
                break;
            }
        }

        // Only toggle if the mesh actually has relevant IDs
        let hasRelevant = false;
        for (const id of uniqueIds) {
            if (id !== 0) { hasRelevant = true; break; }
        }

        if (hasRelevant) {
            child.visible = !allHidden;
        }
    });
}

/**
 * Show all categories.
 */
export function showAllCategories() {
    for (const catName of Object.keys(state.categoryVisibility)) {
        state.categoryVisibility[catName].visible = true;
    }
    _rebuildVisibleSubset();
    _updateAllCheckboxes(true);
}

/**
 * Hide all categories.
 */
export function hideAllCategories() {
    for (const catName of Object.keys(state.categoryVisibility)) {
        state.categoryVisibility[catName].visible = false;
    }
    _rebuildVisibleSubset();
    _updateAllCheckboxes(false);
}

function _updateAllCheckboxes(checked) {
    for (const catName of Object.keys(state.categoryVisibility)) {
        const cb = document.getElementById(`cat-cb-${catName}`);
        if (cb) cb.checked = checked;
    }
}

/**
 * Build the category list UI inside #categoryList.
 */
export function populateCategoryUI() {
    const container = dom.categoryList;
    if (!container) return;
    container.innerHTML = '';

    const categories = Object.entries(state.categoryVisibility);

    if (categories.length === 0) {
        container.innerHTML = '<p class="field-hint">No categories found.</p>';
        if (dom.btnShowAllCat) dom.btnShowAllCat.disabled = true;
        if (dom.btnHideAllCat) dom.btnHideAllCat.disabled = true;
        return;
    }

    // Sort by name
    categories.sort((a, b) => a[0].localeCompare(b[0]));

    for (const [name, cat] of categories) {
        const row = document.createElement('label');
        row.className = 'category-row';
        row.htmlFor = `cat-cb-${name}`;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = `cat-cb-${name}`;
        cb.className = 'category-checkbox';
        cb.checked = cat.visible;
        cb.addEventListener('change', () => {
            setCategoryVisible(name, cb.checked);
        });

        const label = document.createElement('span');
        label.className = 'category-label';
        // Pretty-print: remove "Ifc" prefix
        label.textContent = name.replace(/^Ifc/, '');

        const badge = document.createElement('span');
        badge.className = 'category-badge';
        badge.textContent = String(cat.ids.length);

        row.append(cb, label, badge);
        container.appendChild(row);
    }

    if (dom.btnShowAllCat) dom.btnShowAllCat.disabled = false;
    if (dom.btnHideAllCat) dom.btnHideAllCat.disabled = false;
}

/**
 * Clear category UI and state (called on model close).
 */
export function clearCategoryUI() {
    state.categoryVisibility = {};
    const container = dom.categoryList;
    if (container) {
        container.innerHTML = '<p class="field-hint">Load a model to see categories.</p>';
    }
    if (dom.btnShowAllCat) dom.btnShowAllCat.disabled = true;
    if (dom.btnHideAllCat) dom.btnHideAllCat.disabled = true;
}
