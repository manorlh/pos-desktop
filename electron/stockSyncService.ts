/**
 * Stock sync (server → POS): pull per-shop stock levels after catalog/txn sync.
 */

import { syncService } from './syncService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BrowserWindow } = require('electron');

function nowIso(): string {
  return new Date().toISOString();
}

type StockLevelRow = {
  productId: string;
  quantity: number;
  reorderMin?: number | null;
  reorderMax?: number | null;
  reorderOpt?: number | null;
  updatedAt?: string;
};

type StockSyncPayload = {
  syncType?: string;
  stockUpdatedAt?: string;
  levels?: StockLevelRow[];
};

export class StockSyncService {
  private db: any = null;

  shutdown(): void {
    this.db = null;
  }

  init(db: any): void {
    this.shutdown();
    this.db = db;
  }

  pullStockImmediate(): Promise<{ ok: boolean; error?: string }> {
    return this._pullNow();
  }

  private _pullNow(): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.db) return resolve({ ok: false, error: 'Database not initialized' });

      const lastRow = this.db
        .prepare("SELECT value FROM settings WHERE key = 'cloud_last_stock_sync'")
        .get() as { value: string } | undefined;
      const since = lastRow && lastRow.value ? String(lastRow.value) : null;

      const httpCfg = syncService.readCloudHttpConfigFromDb();
      if (!httpCfg) {
        return resolve({ ok: false, error: 'Cloud not configured' });
      }

      let path = '/sync/' + httpCfg.machineId + '/stock';
      if (since) path += '?since=' + encodeURIComponent(since);

      syncService.cloudJson('GET', path, null, (err, _code, data) => {
        if (err) {
          console.error('[StockSync] pull failed:', err.message);
          return resolve({ ok: false, error: err.message });
        }
        try {
          const payload = (data ?? {}) as StockSyncPayload;
          if (payload.syncType === 'unchanged') {
            if (payload.stockUpdatedAt) {
              this._updateLastSync(payload.stockUpdatedAt);
            }
            return resolve({ ok: true });
          }

          this._applyLevels(payload.levels ?? []);
          this._updateLastSync(payload.stockUpdatedAt ?? nowIso());
          this._broadcastUpdated();
          console.log('[StockSync] applied', (payload.levels ?? []).length, 'levels');
          resolve({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          resolve({ ok: false, error: msg });
        }
      });
    });
  }

  private _applyLevels(levels: StockLevelRow[]): void {
    if (!this.db) return;
    const upsert = this.db.prepare(`
      INSERT INTO stock_levels (product_id, cloud_product_id, base_quantity, reorder_min, reorder_max, reorder_opt, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(product_id) DO UPDATE SET
        cloud_product_id = excluded.cloud_product_id,
        base_quantity = excluded.base_quantity,
        reorder_min = excluded.reorder_min,
        reorder_max = excluded.reorder_max,
        reorder_opt = excluded.reorder_opt,
        updated_at = excluded.updated_at
    `);

    for (const row of levels) {
      const cloudId = row.productId;
      const local = this.db
        .prepare('SELECT id FROM products WHERE id = ? OR cloud_id = ?')
        .get(cloudId, cloudId) as { id?: string } | undefined;
      const productId = local?.id ?? cloudId;
      upsert.run(
        productId,
        cloudId,
        row.quantity,
        row.reorderMin ?? null,
        row.reorderMax ?? null,
        row.reorderOpt ?? null,
        row.updatedAt ?? nowIso(),
      );
    }
  }

  private _updateLastSync(watermark: string): void {
    if (!this.db) return;
    this.db
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_last_stock_sync', ?)")
      .run(watermark);
  }

  private _broadcastUpdated(): void {
    try {
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        if (w && !w.isDestroyed()) {
          w.webContents.send('stock-updated', {});
        }
      }
    } catch (e) {
      console.error('[StockSync] broadcast failed:', e);
    }
  }
}

export const stockSyncService = new StockSyncService();
