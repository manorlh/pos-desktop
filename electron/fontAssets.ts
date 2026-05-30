import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Unicode ranges from @fontsource/heebo — one @font-face per subset/weight. */
const SUBSET_UNICODE: Record<string, string> = {
  hebrew:
    'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F',
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};

const FONT_FILE_RE =
  /^heebo-(hebrew|latin-ext|latin)-(\d+)-normal-.+\.woff2$/i;

/** Resolve dist/assets — unpacked first (if present), else inside app.asar. */
export function resolveFontAssetsDir(resourcesPath: string): string | null {
  const candidates = [
    path.join(resourcesPath, 'app.asar.unpacked', 'dist', 'assets'),
    path.join(resourcesPath, 'app.asar', 'dist', 'assets'),
    path.join(resourcesPath, 'dist', 'assets'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
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
    const [, subset, weightStr] = match;
    const unicodeRange = SUBSET_UNICODE[subset.toLowerCase()];
    if (!unicodeRange) continue;

    const fileUrl = pathToFileURL(path.join(assetsDir, file)).href;
    rules.push(`@font-face {
  font-family: 'Heebo';
  font-style: normal;
  font-display: swap;
  font-weight: ${weightStr};
  src: url("${fileUrl}") format('woff2');
  unicode-range: ${unicodeRange};
}`);
  }

  return rules.join('\n');
}
