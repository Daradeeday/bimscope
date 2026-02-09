/**
 * IFC query helpers — list structure, inspect, property sets, type properties.
 */
import { IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCSPACE } from 'web-ifc';
import { state, ifcLoader, dom } from '../state.js';

export async function listBasicStructure() {
  const api = ifcLoader.ifcManager.ifcAPI;
  const sites = api.GetLineIDsWithType(state.modelID, IFCSITE);
  const buildings = api.GetLineIDsWithType(state.modelID, IFCBUILDING);
  const storeys = api.GetLineIDsWithType(state.modelID, IFCBUILDINGSTOREY);
  const spaces = api.GetLineIDsWithType(state.modelID, IFCSPACE);

  return {
    modelID: state.modelID,
    counts: {
      IFCSITE: sites.size(),
      IFCBUILDING: buildings.size(),
      IFCBUILDINGSTOREY: storeys.size(),
      IFCSPACE: spaces.size(),
    },
  };
}

export async function inspectLine(expressID) {
  return ifcLoader.ifcManager.ifcAPI.GetLine(state.modelID, expressID);
}

export async function getPropertySets(expressID) {
  return ifcLoader.ifcManager.getPropertySets(state.modelID, expressID, true);
}

export async function getTypeProperties(expressID) {
  return ifcLoader.ifcManager.getTypeProperties(state.modelID, expressID, true);
}

export function parseExpressId() {
  const v = Number(dom.expressIdInput.value);
  return Number.isFinite(v) && v > 0 ? v : null;
}
