/**
 * Catalog sync: MQTT catalog/notify is a wake-up only; data is loaded via HTTP GET /sync/{machineId}/catalog.
 * Cloud is source of truth — use cloud APIs for creates/updates (see main process IPC).
 */

import { cloudMqttClient, CloudMqttConfig } from './mqttClient';
import { posUserSyncService } from './posUserSync';
import { settingsSyncService } from './settingsSyncService';
import { imageCacheService } from './imageCacheService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { URL } = require('url');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BrowserWindow } = require('electron');

export interface SyncQueueRow {
  id: string;
  entity_type: 'product' | 'category';
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  payload: string;
  created_at: string;
  status: 'pending' | 'synced' | 'failed';
}

export interface SyncStatus {
  enabled: boolean;
  connected: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
}

export type CloudHttpConfig = {
  apiBaseUrl: string;
  accessToken: string;
  machineId: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

/** Compare cloud vs local updatedAt without brittle string ordering (ISO or SQLite text). */
function isIncomingOlderOrEqual(incomingUpdatedAt: string, existingUpdatedAt: string): boolean {
  const a = Date.parse(incomingUpdatedAt);
  const b = Date.parse(existingUpdatedAt);
  if (!Number.isNaN(a) && !Number.isNaN(b)) {
    return a <= b;
  }
  return String(incomingUpdatedAt) <= String(existingUpdatedAt);
}

function generateId(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('hex');
}

function httpJson(
  method: string,
  urlStr: string,
  token: string,
  body: Record<string, unknown> | null,
  cb: (err: Error | null, statusCode?: number, data?: unknown) => void,
): void {
  let u: typeof URL.prototype;
  try {
    u = new URL(urlStr);
  } catch (e) {
    return cb(e as Error);
  }
  const isHttps = u.protocol === 'https:';
  const lib = isHttps ? require('https') : require('http');
  const port = u.port ? parseInt(u.port, 10) : isHttps ? 443 : 80;
  const pathWithQuery = u.pathname + (u.search || '');
  const payload = body ? JSON.stringify(body) : null;
  const opts: Record<string, unknown> = {
    hostname: u.hostname,
    port,
    path: pathWithQuery,
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
    },
  };
  const req = lib.request(opts, (res: { statusCode?: number; on: (ev: string, fn: (...args: unknown[]) => void) => void }) => {
    let raw = '';
    res.on('data', (c: Buffer) => {
      raw += c.toString();
    });
    res.on('end', () => {
      const code = res.statusCode || 0;
      if (code === 204 || raw === '') {
        return cb(null, code, null);
      }
      if (code >= 400) {
        return cb(new Error('HTTP ' + code + ': ' + raw.slice(0, 300)));
      }
      try {
        cb(null, code, JSON.parse(raw));
      } catch (e) {
        cb(e as Error, code);
      }
    });
  });
  req.on('error', (e: Error) => cb(e));
  if (payload) req.write(payload);
  req.end();
}

export class SyncService {
  private db: any = null;
  private config: CloudMqttConfig | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pullDebounce: NodeJS.Timeout | null = null;

  init(db: any): void {
    if (!db || (typeof db.open === 'boolean' && !db.open)) {
      return;
    }
    const dbChanged = this.db !== db;
    this.db = db;
    if (dbChanged) {
      this._ensureSchema();
    }
  }

  /** Read cloud HTTP settings from SQLite (for pulls / API when MQTT not connected). */
  readCloudHttpConfigFromDb(): CloudHttpConfig | null {
    if (!this.db) return null;
    const g = (k: string): string | null => {
      const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(k) as { value: string } | undefined;
      return r ? r.value : null;
    };
    const apiBaseUrl = g('cloud_api_base');
    const accessToken = g('cloud_access_token');
    const machineId = g('cloud_machine_id');
    if (!apiBaseUrl || !accessToken || !machineId) return null;
    return { apiBaseUrl, accessToken, machineId };
  }

  connect(config: CloudMqttConfig): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    cloudMqttClient.disconnect();
    this.config = config;

    if (config.merchantId) {
      cloudMqttClient.onMessage(this._handleIncoming.bind(this));
      const cfg: CloudMqttConfig = {
        ...config,
        onMqttConnected: () => {
          this.pullCatalog();
          posUserSyncService.pullPosUsers();
          settingsSyncService.pullSettings();
        },
      };
      cloudMqttClient.connect(cfg);
      this.heartbeatTimer = setInterval(() => {
        if (cloudMqttClient.connected) cloudMqttClient.publishHeartbeat();
      }, 30000);
    } else {
      console.warn('[Sync] No tenant id for MQTT yet — HTTP sync only. Use GET /machines/me then reconnect.');
      this.pullCatalog();
      posUserSyncService.pullPosUsers();
      settingsSyncService.pullSettings();
    }
  }

  disconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pullDebounce) {
      clearTimeout(this.pullDebounce);
      this.pullDebounce = null;
    }
    cloudMqttClient.disconnect();
    this.config = null;
  }

  /** Stop cloud sync and drop the DB handle before the SQLite file is closed/deleted. */
  shutdownForReset(): void {
    this.disconnect();
    this.db = null;
  }

  /**
   * Pull catalog from cloud (debounced). Uses connect() config or stored DB settings.
   */
  pullCatalog(): void {
    if (this.pullDebounce) clearTimeout(this.pullDebounce);
    this.pullDebounce = setTimeout(() => {
      this.pullDebounce = null;
      this._pullCatalogNow();
    }, 250);
  }

  private _effectiveHttpConfig(): CloudHttpConfig | null {
    if (this.config?.apiBaseUrl && this.config.accessToken && this.config.machineId) {
      return {
        apiBaseUrl: this.config.apiBaseUrl,
        accessToken: this.config.accessToken,
        machineId: this.config.machineId,
      };
    }
    return this.readCloudHttpConfigFromDb();
  }

  private _pullCatalogNow(): void {
    if (!this.db) return;
    const httpCfg = this._effectiveHttpConfig();
    if (!httpCfg) {
      console.warn('[Sync] pullCatalog: no cloud HTTP config');
      return;
    }
    const lastRow = this.db.prepare("SELECT value FROM settings WHERE key = 'cloud_last_sync'").get() as
      | { value: string }
      | undefined;
    const since = lastRow && lastRow.value ? String(lastRow.value) : null;
    const base = httpCfg.apiBaseUrl.replace(/\/$/, '');
    let path = '/sync/' + httpCfg.machineId + '/catalog';
    if (since) path += '?since=' + encodeURIComponent(since);
    const urlStr = base + path;

    httpJson('GET', urlStr, httpCfg.accessToken, null, (err, _code, data) => {
      if (err) {
        console.error('[Sync] pullCatalog failed', err.message);
        return;
      }
      this._applyCatalogFromResponse(data as Record<string, unknown>);
    });
  }

  /**
   * Same as pull but resolves when done (no debounce). Use for Settings "Pull catalog" so UI can show errors.
   * Ensure `apiBaseUrl` includes the API prefix (e.g. …/api/v1) — same value stored at pairing.
   */
  pullCatalogImmediate(): Promise<{
    ok: boolean;
    error?: string;
    products?: number;
    categories?: number;
  }> {
    return new Promise((resolve) => {
      if (!this.db) {
        return resolve({ ok: false, error: 'Database not initialized' });
      }
      const httpCfg = this._effectiveHttpConfig();
      if (!httpCfg) {
        return resolve({
          ok: false,
          error:
            'Cloud not configured: set API base URL, pairing token, and machine ID (pair again if needed).',
        });
      }
      // Manual pull from Settings: always full catalog (no `since`). Delta responses can omit
      // categories while still returning products → SQLite FK failures on POS.
      const base = httpCfg.apiBaseUrl.replace(/\/$/, '');
      const path = '/sync/' + httpCfg.machineId + '/catalog';
      const urlStr = base + path;

      httpJson('GET', urlStr, httpCfg.accessToken, null, (err, _code, data) => {
        if (err) {
          console.error('[Sync] pullCatalog failed', err.message);
          return resolve({ ok: false, error: err.message });
        }
        try {
          const d = data as Record<string, unknown>;
          const products = (d?.products as unknown[]) || [];
          const categories = (d?.categories as unknown[]) || [];
          this._applyCatalogFromResponse(d);
          resolve({
            ok: true,
            products: products.length,
            categories: categories.length,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return resolve({ ok: false, error: msg });
        }
      });
    });
  }

  private _applyCatalogFromResponse(data: Record<string, unknown>): void {
    if (!data || !this.db) return;
    const syncType = (data.syncType as string) || (data.sync_type as string) || 'full';
    const categories = (data.categories as unknown[]) || [];
    const products = (data.products as unknown[]) || [];
    const vouchers = (data.vouchers as unknown[]) || [];

    // Bulk apply: parent categories may sort after children; delta may interleave rows.
    // defer_foreign_keys is unreliable in some SQLite builds; disable FK checks for this transaction only.
    const apply = this.db.transaction(() => {
      this.db.pragma('foreign_keys = OFF');
      try {
        for (const item of categories) {
          this._upsertCategory(item as Record<string, unknown>);
        }
        for (const item of vouchers) {
          this._upsertVoucher(item as Record<string, unknown>);
        }
        for (const item of products) {
          this._upsertProduct(item as Record<string, unknown>);
        }
      } finally {
        this.db.pragma('foreign_keys = ON');
      }
    });
    apply();

    this._updateLastSync();
    console.log('[Sync] Applied catalog pull:', syncType, products.length, 'products,', categories.length, 'categories,', vouchers.length, 'vouchers');

    void imageCacheService.prefetchCatalog().then(() => {
      console.log('[Sync] Product image cache updated');
      try {
        const wins = BrowserWindow.getAllWindows();
        for (const w of wins) {
          if (w && !w.isDestroyed()) {
            w.webContents.send('catalog-images-updated');
          }
        }
      } catch (e) {
        console.error('[Sync] Failed to broadcast catalog-images-updated:', e);
      }
    });

    // Notify any open renderer windows so UI stores can refetch from SQLite.
    // Skip the empty-delta case to avoid forcing refetches when nothing changed.
    if (products.length > 0 || categories.length > 0 || vouchers.length > 0) {
      try {
        const wins = BrowserWindow.getAllWindows();
        for (const w of wins) {
          if (w && !w.isDestroyed()) {
            w.webContents.send('catalog-updated', {
              syncType,
              products: products.length,
              categories: categories.length,
              vouchers: vouchers.length,
            });
          }
        }
      } catch (e) {
        console.error('[Sync] Failed to broadcast catalog-updated:', e);
      }
    }
  }

  /** Cloud JSON request using DB-stored or active connect config. */
  cloudJson(
    method: string,
    path: string,
    body: Record<string, unknown> | null,
    cb: (err: Error | null, status?: number, data?: unknown) => void,
  ): void {
    const httpCfg = this._effectiveHttpConfig();
    if (!httpCfg) {
      return cb(new Error('Cloud not configured'));
    }
    const base = httpCfg.apiBaseUrl.replace(/\/$/, '');
    const urlStr = base + (path.startsWith('/') ? path : '/' + path);
    httpJson(method, urlStr, httpCfg.accessToken, body, cb);
  }

  enqueue(
    _entityType: 'product' | 'category',
    _entityId: string,
    _action: 'create' | 'update' | 'delete',
    _data: Record<string, unknown> | null,
    _cloudId: string | null,
    _updatedAt: string,
  ): void {
    console.warn('[Sync] enqueue ignored — catalog changes must go through the cloud API first');
  }

  flushQueue(): void {
    /* no-op: MQTT catalog/update path disabled server-side */
  }

  getStatus(): SyncStatus {
    const pendingCount = this.db
      ? (this.db.prepare("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'").get() as any).c
      : 0;

    const lastSyncRow = this.db
      ? (this.db.prepare("SELECT value FROM settings WHERE key = 'cloud_last_sync'").get() as any)
      : null;

    return {
      enabled: !!this.config || !!this.readCloudHttpConfigFromDb(),
      connected: cloudMqttClient.connected,
      pendingCount,
      lastSyncedAt: lastSyncRow ? lastSyncRow.value : null,
    };
  }

  private _handleIncoming(topic: string, _payload: Record<string, unknown>): void {
    const parts = topic.split('/');
    if (parts.length >= 5 && parts[3] === 'catalog' && parts[4] === 'notify') {
      console.log('[Sync] catalog/notify — pulling via HTTP');
      this.pullCatalog();
      return;
    }
    if (parts.length >= 5 && parts[3] === 'pos-users' && parts[4] === 'notify') {
      console.log('[Sync] pos-users/notify — pulling via HTTP');
      posUserSyncService.pullPosUsers();
      return;
    }
    if (parts.length >= 5 && parts[3] === 'settings' && parts[4] === 'notify') {
      console.log('[Sync] settings/notify — pulling via HTTP');
      settingsSyncService.pullSettings();
      return;
    }
    if (parts.length >= 5 && parts[3] === 'close-day' && parts[4] === 'notify') {
      console.log('[Sync] close-day/notify — forwarding to renderer');
      const payload = _payload as {
        requestId?: string;
        initiatedBy?: string;
        message?: string;
      };
      if (payload.requestId) {
        // Lazy require avoids syncService ↔ transactionSync circular import at load time.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { transactionSyncService } = require('./transactionSync');
        void transactionSyncService
          .postCloseDayAck({ requestId: payload.requestId, phase: 'received' })
          .catch((e: Error) => console.error('[Sync] close-day received ack failed', e));
      }
      const wins = BrowserWindow.getAllWindows();
      for (const win of wins) {
        win.webContents.send('close-day-requested', payload);
      }
      return;
    }
  }

  private _upsertProduct(item: Record<string, unknown>): void {
    if (!this.db) return;

    const cloudId = item.id as string;
    let existing: any = this.db.prepare('SELECT * FROM products WHERE cloud_id = ?').get(cloudId);
    if (!existing && item.sku) {
      existing = this.db.prepare('SELECT * FROM products WHERE sku = ?').get(item.sku);
    }

    const incomingUpdatedAt = item.updatedAt as string;

    const shopListed =
      item.shopListed === undefined || item.shopListed === null ? 1 : item.shopListed ? 1 : 0;
    const isAvailable =
      item.isAvailable === undefined || item.isAvailable === null ? 1 : item.isAvailable ? 1 : 0;
    // POS does not track inventory counts; keep column 0 for SQLite schema only.

    if (existing) {
      if (existing.cloud_synced === 1 && isIncomingOlderOrEqual(incomingUpdatedAt, existing.updatedAt)) {
        return;
      }

      this.db
        .prepare(
          `
        UPDATE products
        SET name = ?, description = ?, price = ?, sku = ?, categoryId = ?,
            imageUrl = ?, inStock = ?, isAvailable = ?, stockQuantity = ?, barcode = ?, taxRate = ?,
            shopListed = ?, voucherId = ?, track_stock = ?, cloud_id = ?, cloud_synced = 1, last_cloud_sync = ?, updatedAt = ?
        WHERE id = ?
      `,
        )
        .run(
          item.name,
          item.description,
          item.price,
          item.sku,
          item.categoryId,
          item.imageUrl,
          item.inStock ? 1 : 0,
          isAvailable,
          0,
          item.barcode,
          item.taxRate,
          shopListed,
          item.voucherId || null,
          item.trackStock === true ? 1 : 0,
          cloudId,
          nowIso(),
          incomingUpdatedAt,
          existing.id,
        );
    } else {
      this.db
        .prepare(
          `
        INSERT OR IGNORE INTO products
          (id, name, description, price, sku, categoryId, imageUrl, inStock,
           isAvailable, stockQuantity, barcode, taxRate, shopListed, voucherId, track_stock, cloud_id, cloud_synced, last_cloud_sync, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `,
        )
        .run(
          item.id,
          item.name,
          item.description,
          item.price,
          item.sku,
          item.categoryId,
          item.imageUrl,
          item.inStock ? 1 : 0,
          isAvailable,
          0,
          item.barcode,
          item.taxRate,
          shopListed,
          item.voucherId || null,
          item.trackStock === true ? 1 : 0,
          cloudId,
          nowIso(),
          item.createdAt,
          incomingUpdatedAt,
        );
    }
  }

  private _upsertVoucher(item: Record<string, unknown>): void {
    if (!this.db) return;
    const cloudId = item.id as string;
    const incomingUpdatedAt = (item.updatedAt as string) || nowIso();
    const existing: any = this.db.prepare('SELECT * FROM vouchers WHERE cloud_id = ? OR id = ?').get(cloudId, cloudId);

    const values = {
      name: item.name,
      is_active: item.isActive === false ? 0 : 1,
      title: item.title ?? null,
      subtitle: item.subtitle ?? null,
      body_text: item.bodyText ?? null,
      footer_text: item.footerText ?? null,
      validity_days: item.validityDays ?? null,
      value_display_mode: item.valueDisplayMode || 'product_price',
      display_value: item.displayValue ?? null,
      print_barcode: item.printBarcode === false ? 0 : 1,
      print_qr: item.printQr === false ? 0 : 1,
      language: item.language || 'he',
      updated_at: incomingUpdatedAt,
    };

    if (existing) {
      if (existing.updated_at && isIncomingOlderOrEqual(incomingUpdatedAt, existing.updated_at)) {
        return;
      }
      this.db.prepare(`
        UPDATE vouchers SET
          name = ?, is_active = ?, title = ?, subtitle = ?, body_text = ?, footer_text = ?,
          validity_days = ?, value_display_mode = ?, display_value = ?,
          print_barcode = ?, print_qr = ?, language = ?, cloud_id = ?, updated_at = ?
        WHERE id = ?
      `).run(
        values.name,
        values.is_active,
        values.title,
        values.subtitle,
        values.body_text,
        values.footer_text,
        values.validity_days,
        values.value_display_mode,
        values.display_value,
        values.print_barcode,
        values.print_qr,
        values.language,
        cloudId,
        values.updated_at,
        existing.id,
      );
    } else {
      this.db.prepare(`
        INSERT OR REPLACE INTO vouchers
        (id, cloud_id, name, is_active, title, subtitle, body_text, footer_text,
         validity_days, value_display_mode, display_value, print_barcode, print_qr, language, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cloudId,
        cloudId,
        values.name,
        values.is_active,
        values.title,
        values.subtitle,
        values.body_text,
        values.footer_text,
        values.validity_days,
        values.value_display_mode,
        values.display_value,
        values.print_barcode,
        values.print_qr,
        values.language,
        values.updated_at,
      );
    }
  }

  private _upsertCategory(item: Record<string, unknown>): void {
    if (!this.db) return;

    const cloudId = item.id as string;
    let existing: any = this.db.prepare('SELECT * FROM categories WHERE cloud_id = ?').get(cloudId);
    if (!existing) {
      existing = this.db.prepare('SELECT * FROM categories WHERE name = ? AND parentId IS NULL').get(item.name);
    }

    const incomingUpdatedAt = item.updatedAt as string;

    if (existing) {
      if (existing.cloud_synced === 1 && isIncomingOlderOrEqual(incomingUpdatedAt, existing.updatedAt)) return;

      this.db
        .prepare(
          `
        UPDATE categories
        SET name = ?, description = ?, color = ?, imageUrl = ?, parentId = ?,
            isActive = ?, sortOrder = ?, cloud_id = ?, cloud_synced = 1,
            last_cloud_sync = ?, updatedAt = ?
        WHERE id = ?
      `,
        )
        .run(
          item.name,
          item.description,
          item.color,
          item.imageUrl,
          item.parentId,
          item.isActive ? 1 : 0,
          item.sortOrder,
          cloudId,
          nowIso(),
          incomingUpdatedAt,
          existing.id,
        );
    } else {
      this.db
        .prepare(
          `
        INSERT OR IGNORE INTO categories
          (id, name, description, color, imageUrl, parentId, isActive, sortOrder,
           cloud_id, cloud_synced, last_cloud_sync, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `,
        )
        .run(
          item.id,
          item.name,
          item.description,
          item.color,
          item.imageUrl,
          item.parentId,
          item.isActive ? 1 : 0,
          item.sortOrder,
          cloudId,
          nowIso(),
          item.createdAt,
          incomingUpdatedAt,
        );
    }
  }

  private _ensureSchema(): void {
    if (!this.db) return;

    for (const col of [
      'cloud_id TEXT',
      'cloud_synced INTEGER DEFAULT 0',
      'last_cloud_sync TEXT',
      'shopListed INTEGER NOT NULL DEFAULT 1',
      'isAvailable INTEGER NOT NULL DEFAULT 1',
      'voucherId TEXT',
      'track_stock INTEGER NOT NULL DEFAULT 0',
    ]) {
      try {
        this.db.exec(`ALTER TABLE products ADD COLUMN ${col}`);
      } catch (_) {
        /* exists */
      }
    }

    for (const col of ['cloud_id TEXT', 'cloud_synced INTEGER DEFAULT 0', 'last_cloud_sync TEXT']) {
      try {
        this.db.exec(`ALTER TABLE categories ADD COLUMN ${col}`);
      } catch (_) {
        /* exists */
      }
    }

    for (const col of ['localImagePath TEXT']) {
      try {
        this.db.exec(`ALTER TABLE products ADD COLUMN ${col}`);
      } catch (_) {
        /* exists */
      }
      try {
        this.db.exec(`ALTER TABLE categories ADD COLUMN ${col}`);
      } catch (_) {
        /* exists */
      }
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vouchers (
        id TEXT PRIMARY KEY,
        cloud_id TEXT UNIQUE,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        title TEXT,
        subtitle TEXT,
        body_text TEXT,
        footer_text TEXT,
        validity_days INTEGER,
        value_display_mode TEXT NOT NULL DEFAULT 'product_price',
        display_value REAL,
        print_barcode INTEGER NOT NULL DEFAULT 1,
        print_qr INTEGER NOT NULL DEFAULT 1,
        language TEXT DEFAULT 'he',
        updated_at TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issued_vouchers (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        transaction_item_id TEXT,
        voucher_id TEXT,
        product_id TEXT,
        product_name TEXT,
        quantity REAL NOT NULL DEFAULT 1,
        unit_value REAL,
        face_value REAL,
        issued_at TEXT NOT NULL,
        expires_at TEXT,
        status TEXT NOT NULL DEFAULT 'issued',
        reprint_count INTEGER NOT NULL DEFAULT 0,
        last_printed_at TEXT,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
      )
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_issued_vouchers_tx ON issued_vouchers(transaction_id)`);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stock_levels (
        product_id TEXT PRIMARY KEY,
        cloud_product_id TEXT,
        base_quantity REAL NOT NULL DEFAULT 0,
        reorder_min INTEGER,
        reorder_max INTEGER,
        reorder_opt INTEGER,
        updated_at TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        delta REAL NOT NULL,
        reason TEXT NOT NULL,
        transaction_id TEXT,
        transaction_item_id TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_movements_tx ON stock_movements(transaction_id)`);
  }

  private _updateLastSync(): void {
    if (!this.db) return;
    this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_last_sync', ?)
    `).run(nowIso());
  }
}

export const syncService = new SyncService();
