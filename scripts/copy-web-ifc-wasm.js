import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);

const candidates = [];

function pushWebIfcCandidatesFromPkgJson(pkgJsonPath) {
  const pkgDir = path.dirname(pkgJsonPath);
  candidates.push(path.join(pkgDir, 'web-ifc.wasm'));
  candidates.push(path.join(pkgDir, 'dist', 'web-ifc.wasm'));
}

try {
  pushWebIfcCandidatesFromPkgJson(require.resolve('web-ifc/package.json'));
} catch {
  // ignore
}

// Fallback: if web-ifc isn't hoisted, it may be nested under web-ifc-three
try {
  const ifcThreePkg = require.resolve('web-ifc-three/package.json');
  const ifcThreeDir = path.dirname(ifcThreePkg);
  candidates.push(path.join(ifcThreeDir, 'node_modules', 'web-ifc', 'web-ifc.wasm'));
  candidates.push(path.join(ifcThreeDir, 'node_modules', 'web-ifc', 'dist', 'web-ifc.wasm'));
} catch {
  // ignore
}

// Last-resort legacy path
candidates.push(path.join(root, 'node_modules', 'web-ifc', 'web-ifc.wasm'));
candidates.push(path.join(root, 'node_modules', 'web-ifc', 'dist', 'web-ifc.wasm'));

const src = candidates.find((p) => fs.existsSync(p));
const publicDir = path.join(root, 'public');
const dst = path.join(publicDir, 'web-ifc.wasm');

try {
  if (!src) {
    console.error('[copy-web-ifc-wasm] Source wasm not found. Tried:');
    for (const p of candidates) console.error(' -', p);
    process.exit(1);
  }

  fs.mkdirSync(publicDir, { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('[copy-web-ifc-wasm] Copied web-ifc.wasm ->', dst);
} catch (e) {
  console.error('[copy-web-ifc-wasm] Failed:', e);
  process.exit(1);
}
