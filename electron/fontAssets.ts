import fs from 'fs';
import path from 'path';

const HEBREW_UNICODE =
  'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';

/** Matches fontsource filenames and Vite-hashed build outputs. */
const FONT_FILE_RE = /^heebo-hebrew-(\d+)-normal(?:-[^.]+)?\.woff2$/i;

/** Resolve font directory — must be outside app.asar for Chromium @font-face. */
export function resolveFontAssetsDir(resourcesPath: string): string | null {
  const candidates = [
    path.join(resourcesPath, 'fonts'),
    path.join(resourcesPath, 'app.asar.unpacked', 'dist', 'assets'),
    path.join(resourcesPath, 'dist', 'assets'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

/**
 * Build @font-face rules with base64 data: URLs.
 *
 * Why data URLs and not file:// or a custom protocol: the packaged renderer
 * runs on a file:// origin, so any cross-origin font (file:// to a different
 * path, or pos-font://) is subject to CORS and Chromium silently refuses to
 * use it for text rendering even though the bytes download. Inlining the woff2
 * (~32KB total for the Hebrew subset) sidesteps origin/CORS entirely.
 */
export function buildHeeboFontFaceCss(resourcesPath: string): string {
  const assetsDir = resolveFontAssetsDir(resourcesPath);
  if (!assetsDir) return '';

  let files: string[];
  try {
    files = fs.readdirSync(assetsDir);
  } catch {
    return '';
  }

  const rules: string[] = [];
  for (const file of files) {
    const match = file.match(FONT_FILE_RE);
    if (!match) continue;

    const weightStr = match[1];
    let base64: string;
    try {
      base64 = fs.readFileSync(path.join(assetsDir, file)).toString('base64');
    } catch {
      continue;
    }

    rules.push(`@font-face {
  font-family: 'Heebo';
  font-style: normal;
  font-display: swap;
  font-weight: ${weightStr};
  src: url("data:font/woff2;base64,${base64}") format('woff2');
  unicode-range: ${HEBREW_UNICODE};
}`);
  }

  return rules.join('\n');
}

export function getPackagedResourcesPath(appPath: string, resourcesPath?: string): string {
  return resourcesPath || path.join(path.dirname(appPath), '..');
}
