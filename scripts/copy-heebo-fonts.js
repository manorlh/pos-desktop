/**
 * Copy Heebo woff2 files for extraResources (outside app.asar).
 * Chromium cannot load @font-face URLs pointing inside app.asar on Windows.
 *
 * Bundle Hebrew AND Latin subsets: Hebrew covers the RTL UI text, while Latin
 * (+ latin-ext) covers Latin letters, digits and punctuation. Without the Latin
 * subset those characters (e.g. prices) fall back to the OS font and look
 * different on Windows vs macOS.
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../node_modules/@fontsource/heebo/files');
const destDir = path.join(__dirname, '../build/fonts');
const weights = [400, 500, 600, 700];
const subsets = ['hebrew', 'latin', 'latin-ext'];

fs.mkdirSync(destDir, { recursive: true });

for (const subset of subsets) {
  for (const weight of weights) {
    const name = `heebo-${subset}-${weight}-normal.woff2`;
    const from = path.join(srcDir, name);
    if (!fs.existsSync(from)) {
      console.warn(`Skipped missing ${name}`);
      continue;
    }
    fs.copyFileSync(from, path.join(destDir, name));
    console.log(`Copied ${name}`);
  }
}
