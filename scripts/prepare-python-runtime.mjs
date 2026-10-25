import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const runtimeDir = path.join(repoRoot, 'python_runtime', 'vision_runtime');
const releasesDir = path.join(repoRoot, 'python_runtime', 'data', 'releases');
const sampleImagesDir = path.join(repoRoot, 'sample_images');

if (!fs.existsSync(path.join(runtimeDir, 'main.py'))) {
  console.error(`[prepare-python-runtime] Missing vision_runtime/main.py at ${runtimeDir}`);
  process.exit(1);
}

fs.mkdirSync(releasesDir, { recursive: true });
fs.mkdirSync(sampleImagesDir, { recursive: true });

console.log('[prepare-python-runtime] Verified Python FastAPI Runtime & resource directories for Windows packaging:');
console.log(`  - Runtime module : ${runtimeDir}`);
console.log(`  - Releases dir   : ${releasesDir}`);
console.log(`  - Sample images  : ${sampleImagesDir}`);
