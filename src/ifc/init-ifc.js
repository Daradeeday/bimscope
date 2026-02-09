/**
 * IFC loader initialization and file opening.
 */
import { ifcLoader } from '../state.js';

export async function initIfc() {
  // Offline mode: serve web-ifc.wasm from Vite's public directory.
  // Place the file at: <project>/public/web-ifc.wasm
  // It will be available at: /web-ifc.wasm
  try {
    const res = await fetch('/web-ifc.wasm', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to fetch /web-ifc.wasm (HTTP ${res.status}). Make sure public/web-ifc.wasm exists.`);
    }
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf.slice(0, 4));
    const isWasm = bytes.length === 4 && bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
    if (!isWasm) {
      const ascii = String.fromCharCode(...bytes);
      throw new Error(`Invalid /web-ifc.wasm content. Expected wasm header "\\0asm", got bytes: ${bytes.join(', ')} ("${ascii}"). This usually means the server returned HTML (404) instead of the wasm file.`);
    }
  } catch (e) {
    throw new Error(
      `web-ifc.wasm is not available offline.\n` +
      `1) Ensure file exists: ifc-viewer/public/web-ifc.wasm\n` +
      `2) Re-run: npm install (or: node scripts/copy-web-ifc-wasm.js)\n` +
      `3) Restart: npm run dev\n\n` +
      `Details: ${String(e?.message ?? e)}`
    );
  }

  // IMPORTANT: IFCLoader uses web-ifc internally.
  // Set the path where /web-ifc.wasm is hosted.
  ifcLoader.ifcManager.setWasmPath('/');
}

export async function openIfcFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const model = await new Promise((resolve, reject) => {
      ifcLoader.load(
        url,
        (loaded) => resolve(loaded),
        undefined,
        (err) => reject(err)
      );
    });
    return model;
  } finally {
    URL.revokeObjectURL(url);
  }
}
