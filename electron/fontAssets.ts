import fs from 'fs';
import path from 'path';

/**
 * Canonical Google Fonts unicode-ranges per Heebo subset. Registering each
 * subset with its range means Hebrew glyphs use the hebrew file while Latin
 * letters, digits and common punctuation use the latin file — otherwise those
 * characters fall back to the OS font (Segoe UI on Windows) and look different
 * from the bundled font.
 */
const UNICODE_RANGES: Record<string, string> = {
  hebrew: 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F',
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};

/** Matches fontsource filenames and Vite-hashed build outputs (any subset). */
const FONT_FILE_RE =
  /^heebo-(hebrew|latin-ext|latin)-(\d+)-normal(?:-[^.]+)?\.woff2$/i;

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

    const subset = match[1].toLowerCase();
    const weightStr = match[2];
    const unicodeRange = UNICODE_RANGES[subset];
    if (!unicodeRange) continue;

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
  unicode-range: ${unicodeRange};
}`);
  }

  return rules.join('\n');
}

export function getPackagedResourcesPath(appPath: string, resourcesPath?: string): string {
  return resourcesPath || path.join(path.dirname(appPath), '..');
}
