/**
 * Offline cache for product/category images from Cloudinary URLs.
 * Downloads after catalog sync; serves via pos-asset:// protocol.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';

export type ImageEntityType = 'product' | 'category';

export type ImageRow = {
  id: string;
  imageUrl?: string | null;
  localImagePath?: string | null;
};

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
  } catch {
    /* ignore */
  }
  return '.jpg';
}

function downloadToFile(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return resolve(false);
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(url, (res) => {
      if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadToFile(res.headers.location, destPath));
      }
      if ((res.statusCode ?? 0) !== 200) {
        res.resume();
        return resolve(false);
      }
      const tmpPath = destPath + '.tmp';
      const file = fs.createWriteStream(tmpPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            fs.renameSync(tmpPath, destPath);
            resolve(true);
          } catch {
            resolve(false);
          }
        });
      });
      file.on('error', () => {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
        resolve(false);
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(30_000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export class ImageCacheService {
  private cacheDir: string | null = null;
  private db: any = null;

  init(db: any, userDataPath: string): void {
    this.db = db;
    this.cacheDir = path.join(userDataPath, 'product-images');
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  getCacheDir(): string | null {
    return this.cacheDir;
  }

  assetUrl(entityType: ImageEntityType, entityId: string): string {
    return `pos-asset://${entityType}/${entityId}`;
  }

  resolveLocalFile(entityType: ImageEntityType, entityId: string): string | null {
    if (!this.db) return null;
    const table = entityType === 'product' ? 'products' : 'categories';
    const row = this.db.prepare(`SELECT localImagePath FROM ${table} WHERE id = ?`).get(entityId) as
      | { localImagePath?: string | null }
      | undefined;
    const localPath = row?.localImagePath;
    if (!localPath || !fs.existsSync(localPath)) return null;
    const cacheDir = this.cacheDir ? path.resolve(this.cacheDir) : '';
    const resolved = path.resolve(localPath);
    if (cacheDir && !resolved.startsWith(cacheDir)) return null;
    return resolved;
  }

  async prefetchEntity(
    entityType: ImageEntityType,
    row: ImageRow,
  ): Promise<string | null> {
    if (!this.db || !this.cacheDir) return null;
    const table = entityType === 'product' ? 'products' : 'categories';
    const imageUrl = row.imageUrl?.trim() || null;
    const existingPath = row.localImagePath?.trim() || null;

    if (!imageUrl) {
      if (existingPath && fs.existsSync(existingPath)) {
        try {
          fs.unlinkSync(existingPath);
        } catch {
          /* ignore */
        }
      }
      this.db.prepare(`UPDATE ${table} SET localImagePath = NULL WHERE id = ?`).run(row.id);
      return null;
    }

    const ext = extensionFromUrl(imageUrl);

    if (existingPath && fs.existsSync(existingPath)) {
      const expectedName = `${entityType}-${row.id}-${hashUrl(imageUrl)}${ext}`;
      if (path.basename(existingPath) === expectedName) {
        return existingPath;
      }
      try {
        fs.unlinkSync(existingPath);
      } catch {
        /* ignore */
      }
    }

    const fileName = `${entityType}-${row.id}-${hashUrl(imageUrl)}${ext}`;
    const destPath = path.join(this.cacheDir, fileName);

    const ok = await downloadToFile(imageUrl, destPath);
    if (!ok) {
      if (existingPath && fs.existsSync(existingPath)) return existingPath;
      return null;
    }

    if (existingPath && existingPath !== destPath && fs.existsSync(existingPath)) {
      try {
        fs.unlinkSync(existingPath);
      } catch {
        /* ignore */
      }
    }

    this.db.prepare(`UPDATE ${table} SET localImagePath = ? WHERE id = ?`).run(destPath, row.id);
    return destPath;
  }

  async prefetchCatalog(): Promise<void> {
    if (!this.db || !this.cacheDir) return;

    const products = this.db
      .prepare('SELECT id, imageUrl, localImagePath FROM products')
      .all() as ImageRow[];
    const categories = this.db
      .prepare('SELECT id, imageUrl, localImagePath FROM categories')
      .all() as ImageRow[];

    for (const p of products) {
      await this.prefetchEntity('product', p);
    }
    for (const c of categories) {
      await this.prefetchEntity('category', c);
    }

    this.pruneOrphans();
  }

  pruneOrphans(): void {
    if (!this.db || !this.cacheDir || !fs.existsSync(this.cacheDir)) return;
    const referenced = new Set<string>();
    for (const table of ['products', 'categories'] as const) {
      const rows = this.db.prepare(`SELECT localImagePath FROM ${table} WHERE localImagePath IS NOT NULL`).all() as {
        localImagePath: string;
      }[];
      for (const r of rows) {
        if (r.localImagePath) referenced.add(path.resolve(r.localImagePath));
      }
    }
    for (const name of fs.readdirSync(this.cacheDir)) {
      const full = path.resolve(path.join(this.cacheDir, name));
      if (!referenced.has(full)) {
        try {
          fs.unlinkSync(full);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

export const imageCacheService = new ImageCacheService();
