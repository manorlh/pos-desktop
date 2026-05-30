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

/** Resolve a packaged font file for pos-font:// protocol (path traversal safe). */
export function resolveFontFileByName(
  resourcesPath: string,
  filename: string,
): string | null {
  if (!FONT_FILE_RE.test(filename)) return null;

  const assetsDir = resolveFontAssetsDir(resourcesPath);
  if (!assetsDir) return null;

  const filePath = path.resolve(assetsDir, filename);
  const assetsRoot = path.resolve(assetsDir);
  if (!filePath.startsWith(assetsRoot + path.sep) && filePath !== assetsRoot) {
    return null;
  }
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

function fontCssUrl(filename: string): string {
  return `pos-font://font/${encodeURIComponent(filename)}`;
}

/** Build @font-face rules using pos-font:// URLs (file:// fails in packaged Windows). */
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
    rules.push(`@font-face {
  font-family: 'Heebo';
  font-style: normal;
  font-display: swap;
  font-weight: ${weightStr};
  src: url("${fontCssUrl(file)}") format('woff2');
  unicode-range: ${HEBREW_UNICODE};
}`);
  }

  return rules.join('\n');
}

export function getPackagedResourcesPath(appPath: string, resourcesPath?: string): string {
  return resourcesPath || path.join(path.dirname(appPath), '..');
}
