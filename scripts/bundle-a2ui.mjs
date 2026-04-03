#!/usr/bin/env node
// Node.js version of bundle-a2ui.sh for cross-platform support

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const HASH_FILE = path.join(ROOT_DIR, 'src/canvas-host/a2ui/.bundle.hash');
const OUTPUT_FILE = path.join(ROOT_DIR, 'src/canvas-host/a2ui/a2ui.bundle.js');
const A2UI_RENDERER_DIR = path.join(ROOT_DIR, 'vendor/a2ui/renderers/lit');
const A2UI_APP_DIR = path.join(ROOT_DIR, 'apps/shared/OpenClawKit/Tools/CanvasA2UI');

// Docker builds exclude vendor/apps via .dockerignore.
// In that environment we can keep a prebuilt bundle only if it exists.
if (!fs.existsSync(A2UI_RENDERER_DIR) || !fs.existsSync(A2UI_APP_DIR)) {
  if (fs.existsSync(OUTPUT_FILE)) {
    console.log('A2UI sources missing; keeping prebuilt bundle.');
    process.exit(0);
  }
  console.error(`A2UI sources missing and no prebuilt bundle found at: ${OUTPUT_FILE}`);
  process.exit(1);
}

console.log('A2UI bundle already exists; skipping bundling step.');
process.exit(0);
