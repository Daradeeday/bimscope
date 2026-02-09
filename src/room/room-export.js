/**
 * Room data export — JSON and CSV.
 */
import { state, ifcLoader } from '../state.js';
import { toast, downloadFile } from '../helpers/dom-utils.js';

export function collectRoomExportData() {
  if (state.modelID === null || !state.spaceIndex.length) return [];
  const api = ifcLoader.ifcManager.ifcAPI;
  const rows = [];
  for (const s of state.spaceIndex) {
    const row = {
      expressID: s.expressID,
      GlobalId: s.GlobalId || '',
      Name: s.Name || '',
      LongName: s.LongName || '',
    };
    try {
      const line = api.GetLine(state.modelID, s.expressID);
      row.ObjectType = line?.ObjectType?.value || '';
      row.Description = line?.Description?.value || '';
    } catch { /* ignore */ }
    if (state.roomMetadata && state.roomMetadata.rooms) {
      const meta = state.roomMetadata.rooms.find(r => {
        const metaName = (r.name || '').toLowerCase().trim();
        const metaNumber = (r.number || '').toLowerCase().trim();
        const longName = (s.LongName || '').toLowerCase().trim();
        const name = (s.Name || '').toLowerCase().trim();
        return metaName === longName || metaName === name || metaNumber === longName || metaNumber === name;
      });
      if (meta) {
        row.Level = meta.level || '';
        row.Area = meta.area ?? '';
        row.Perimeter = meta.perimeter ?? '';
        row.Volume = meta.volume ?? '';
        row.CenterX = meta.center?.x ?? '';
        row.CenterY = meta.center?.y ?? '';
        row.CenterZ = meta.center?.z ?? '';
        row.BBoxMinX = meta.bbox?.min?.x ?? '';
        row.BBoxMinY = meta.bbox?.min?.y ?? '';
        row.BBoxMinZ = meta.bbox?.min?.z ?? '';
        row.BBoxMaxX = meta.bbox?.max?.x ?? '';
        row.BBoxMaxY = meta.bbox?.max?.y ?? '';
        row.BBoxMaxZ = meta.bbox?.max?.z ?? '';
      }
    }
    rows.push(row);
  }
  return rows;
}

export function exportRoomJSON() {
  const data = collectRoomExportData();
  if (!data.length) {
    toast('No room data to export.', 'error');
    return;
  }
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, 'rooms_export.json', 'application/json');
  toast(`Exported ${data.length} rooms as JSON`, 'success');
}

export function exportRoomCSV() {
  const data = collectRoomExportData();
  if (!data.length) {
    toast('No room data to export.', 'error');
    return;
  }
  const allKeys = new Set();
  for (const row of data) {
    for (const k of Object.keys(row)) allKeys.add(k);
  }
  const headers = [...allKeys];
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of data) {
    lines.push(headers.map(h => escape(row[h])).join(','));
  }
  downloadFile(lines.join('\n'), 'rooms_export.csv', 'text/csv');
  toast(`Exported ${data.length} rooms as CSV`, 'success');
}
