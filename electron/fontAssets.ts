import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

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

function fontFileUrl(assetsDir: string, file: string): string {
  const filePath = path.join(assetsDir, file);
  // Prefer unpacked path when fonts were asarUnpack'd from dist/assets.
  const unpackedPath = filePath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  );
  const loadPath = fs.existsSync(unpackedPath) ? unpackedPath : filePath;
  return pathToFileURL(loadPath).href;
}

/** Build @font-face rules with absolute file:// URLs for packaged Electron. */
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
    const fileUrl = fontFileUrl(assetsDir, file);
    rules.push(`@font-face {
  font-family: 'Heebo';
  font-style: normal;
  font-display: swap;
  font-weight: ${weightStr};
  src: url("${fileUrl}") format('woff2');
  unicode-range: ${HEBREW_UNICODE};
}`);
  }

  return rules.join('\n');
}
