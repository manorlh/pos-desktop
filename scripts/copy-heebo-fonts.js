/**
 * Copy Hebrew Heebo woff2 files for extraResources (outside app.asar).
 * Chromium cannot load @font-face URLs pointing inside app.asar on Windows.
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../node_modules/@fontsource/heebo/files');
const destDir = path.join(__dirname, '../build/fonts');
const weights = [400, 500, 600, 700];

fs.mkdirSync(destDir, { recursive: true });

for (const weight of weights) {
  const name = `heebo-hebrew-${weight}-normal.woff2`;
  fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
  console.log(`Copied ${name}`);
}
