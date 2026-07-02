/**
 * Settings sync (server → POS).
 *
 * Pull merged company/shop settings over HTTP, mirroring pos-users:
 *  - MQTT `pos/.../settings/notify` triggers a debounced pull.
 *  - HTTP GET /sync/{machineId}/settings?since=ISO applies to local SQLite.
 *  - Cloud is source of truth for managed keys; virtual keyboard etc. stay local.
 */

import { syncService } from './syncService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BrowserWindow } = require('electron');

function nowIso(): string {
  return new Date().toISOString();
}

type BusinessInfoPayload = {
  vatNumber: string;
  companyName: string;
  companyAddress: string;
  companyAddressNumber?: string;
  companyCity: string;
  companyZip?: string;
  companyRegNumber?: string | null;
  hasBranches?: boolean;
  branchId?: string | null;
};

type SettingsSyncPayload = {
  syncType?: string;
  settingsUpdatedAt?: string;
  settings?: Record<string, unknown>;
  businessInfo?: BusinessInfoPayload | null;
};

const MANAGED_KEYS = [
  'globalTaxRate',
  'hideOutOfStockProducts',
  'language',
  'nayaxEnabled',
  'nayaxDeviceHost',
  'nayaxDevicePort',
  'nayaxSpicyPath',
  'outOfStockPolicy',
  'tipsEnabled',
  'cashTipsEnabled',
  'tipPresets',
  'tipDistribution',
  'receiptPrinterName',
  'drawerPrinterName',
] as const;

export class SettingsSyncService {
  private db: any = null;
  private pullDebounce: NodeJS.Timeout | null = null;

  shutdown(): void {
    if (this.pullDebounce) {
      clearTimeout(this.pullDebounce);
      this.pullDebounce = null;
    }
    this.db = null;
  }

  init(db: any): void {
    this.shutdown();
    this.db = db;
  }

  pullSettings(): void {
    if (this.pullDebounce) clearTimeout(this.pullDebounce);
    this.pullDebounce = setTimeout(() => {
      this.pullDebounce = null;
      this._pullNow().catch((e) => {
        console.error('[SettingsSync] pull failed:', e instanceof Error ? e.message : String(e));
      });
    }, 250);
  }

  pullSettingsImmediate(): Promise<{ ok: boolean; error?: string }> {
    return this._pullNow();
  }

  private _pullNow(): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.db) return resolve({ ok: false, error: 'Database not initialized' });

      const lastRow = this.db
        .prepare("SELECT value FROM settings WHERE key = 'cloud_last_settings_sync'")
        .get() as { value: string } | undefined;
      const since = lastRow && lastRow.value ? String(lastRow.value) : null;

      const httpCfg = syncService.readCloudHttpConfigFromDb();
      if (!httpCfg) {
        return resolve({ ok: false, error: 'Cloud not configured: pair the device first.' });
      }

      let path = '/sync/' + httpCfg.machineId + '/settings';
      if (since) path += '?since=' + encodeURIComponent(since);

      syncService.cloudJson('GET', path, null, (err, _code, data) => {
        if (err) {
          console.error('[SettingsSync] pull failed:', err.message);
          return resolve({ ok: false, error: err.message });
        }
        try {
          const payload = (data ?? {}) as SettingsSyncPayload;
          if (payload.syncType === 'unchanged') {
            if (payload.settingsUpdatedAt) {
              this._updateLastSync(payload.settingsUpdatedAt);
            }
            console.log('[SettingsSync] unchanged (since:', since || 'full', ')');
            return resolve({ ok: true });
          }

          this._applySettings(payload.settings ?? {});
          if (payload.businessInfo) {
            this._applyBusinessInfo(payload.businessInfo);
          }
          this._updateLastSync(payload.settingsUpdatedAt ?? nowIso());
          this._broadcastUpdated();
          console.log('[SettingsSync] applied cloud settings (since:', since || 'full', ')');
          resolve({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[SettingsSync] apply failed:', msg);
          resolve({ ok: false, error: msg });
        }
      });
    });
  }

  private _applySettings(settings: Record<string, unknown>): void {
    if (!this.db) return;
    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const key of MANAGED_KEYS) {
      if (!(key in settings)) continue;
      const val = settings[key];
      if (val === undefined || val === null) continue;
      if (key === 'globalTaxRate') {
        stmt.run(key, String(val));
      } else if (key === 'hideOutOfStockProducts' || key === 'nayaxEnabled' || key === 'tipsEnabled' || key === 'cashTipsEnabled') {
        stmt.run(key, val ? 'true' : 'false');
      } else if (key === 'tipPresets') {
        stmt.run(key, JSON.stringify(val));
      } else {
        stmt.run(key, String(val));
      }
    }
  }

  private _applyBusinessInfo(info: BusinessInfoPayload): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO business_info
      (id, vatNumber, companyName, companyAddress, companyAddressNumber, companyCity, companyZip,
       companyRegNumber, hasBranches, branchId, updatedAt)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      info.vatNumber ?? '',
      info.companyName ?? '',
      info.companyAddress ?? '',
      info.companyAddressNumber ?? '1',
      info.companyCity ?? '',
      info.companyZip ?? '',
      info.companyRegNumber ?? null,
      info.hasBranches ? 1 : 0,
      info.branchId ?? null,
      nowIso(),
    );
  }

  private _updateLastSync(watermark: string): void {
    if (!this.db) return;
    this.db
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_last_settings_sync', ?)")
      .run(watermark);
  }

  private _broadcastUpdated(): void {
    try {
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        if (w && !w.isDestroyed()) {
          w.webContents.send('settings-updated', {});
        }
      }
    } catch (e) {
      console.error('[SettingsSync] broadcast failed:', e);
    }
  }
}

export const settingsSyncService = new SettingsSyncService();
