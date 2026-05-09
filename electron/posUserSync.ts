/**
 * POS-user sync (server → POS).
 *
 * Pull pos_users for this machine's shop over HTTP, mirroring the catalog pattern:
 *  - MQTT message `pos/.../pos-users/notify` triggers a debounced pull.
 *  - HTTP GET /sync/{machineId}/pos-users?since=ISO upserts rows into local SQLite.
 *  - Each row carries a bcrypt PIN hash so the renderer can authenticate offline
 *    via the auth IPC (see electron/auth.ts).
 *
 * Rows are NEVER written from the renderer; cloud is the source of truth.
 */

import { syncService } from './syncService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BrowserWindow } = require('electron');

function nowIso(): string {
  return new Date().toISOString();
}

type PosUserRow = {
  id: string;
  shopId: string;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  workerNumber?: string | null;
  pinHash: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export class PosUserSyncService {
  private db: any = null;
  private pullDebounce: NodeJS.Timeout | null = null;

  init(db: any): void {
    this.db = db;
  }

  /**
   * Debounced pull (used for MQTT-driven syncs to coalesce bursts).
   */
  pullPosUsers(): void {
    if (this.pullDebounce) clearTimeout(this.pullDebounce);
    this.pullDebounce = setTimeout(() => {
      this.pullDebounce = null;
      this._pullNow().catch((e) => {
        console.error('[PosUserSync] pull failed:', e instanceof Error ? e.message : String(e));
      });
    }, 250);
  }

  /**
   * Promise variant — used by Settings "Sync now" and the onboarding wizard so the UI
   * can show errors and progress.
   */
  pullPosUsersImmediate(): Promise<{ ok: boolean; error?: string; users?: number }> {
    return this._pullNow();
  }

  private _pullNow(): Promise<{ ok: boolean; error?: string; users?: number }> {
    return this._pullWithSince(null);
  }

  /**
   * Inner pull that may be retried with a different `since`. Top-level callers
   * always go through `_pullNow` which seeds `forceFull=false` so the saved
   * watermark is honoured; the self-heal path below re-invokes us with
   * `forceFull=true` when a delta turned up empty against an empty local
   * roster (e.g. after a re-pair to a different shop, where the inherited
   * watermark is from the old pairing and now hides the new shop's roster).
   */
  private _pullWithSince(
    forceFull: false | 'self_heal',
  ): Promise<{ ok: boolean; error?: string; users?: number }> {
    return new Promise((resolve) => {
      if (!this.db) return resolve({ ok: false, error: 'Database not initialized' });

      let since: string | null = null;
      if (!forceFull) {
        const lastRow = this.db
          .prepare("SELECT value FROM settings WHERE key = 'cloud_last_pos_users_sync'")
          .get() as { value: string } | undefined;
        since = lastRow && lastRow.value ? String(lastRow.value) : null;
      }

      const httpCfg = syncService.readCloudHttpConfigFromDb();
      if (!httpCfg) {
        return resolve({
          ok: false,
          error: 'Cloud not configured: pair the device first.',
        });
      }

      let path = '/sync/' + httpCfg.machineId + '/pos-users';
      if (since) path += '?since=' + encodeURIComponent(since);

      syncService.cloudJson('GET', path, null, (err, _code, data) => {
        if (err) {
          console.error('[PosUserSync] pull failed:', err.message);
          return resolve({ ok: false, error: err.message });
        }
        try {
          const users = ((data as any)?.users as unknown[]) || [];

          // Self-heal: if a delta query returned an empty payload AND the
          // local roster is also empty, our `cloud_last_pos_users_sync`
          // watermark is almost certainly stale (e.g. inherited from a
          // previous pairing whose machine was removed in the dashboard).
          // Retry once as a full sync so the operator isn't stuck on the
          // onboarding screen.
          if (
            !forceFull &&
            since &&
            users.length === 0 &&
            !this.hasAnyActive()
          ) {
            console.warn(
              '[PosUserSync] delta returned 0 users and local roster is empty — '
                + 'watermark looks stale, retrying as full sync',
            );
            // Drop the stale watermark before retrying so subsequent pulls
            // also start fresh, even if this retry fails.
            this.db
              .prepare("DELETE FROM settings WHERE key = 'cloud_last_pos_users_sync'")
              .run();
            return this._pullWithSince('self_heal').then(resolve);
          }

          this._applyUsers(users as Record<string, unknown>[]);
          this._updateLastSync();
          this._broadcastUpdated(users.length);
          console.log('[PosUserSync] applied', users.length, 'pos users (since:', since || 'full', ')');
          resolve({ ok: true, users: users.length });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[PosUserSync] apply failed:', msg);
          resolve({ ok: false, error: msg });
        }
      });
    });
  }

  /** Idempotent upsert keyed by cloud id. */
  private _applyUsers(users: Record<string, unknown>[]): void {
    if (!this.db || users.length === 0) return;

    const upsert = this.db.prepare(`
      INSERT INTO pos_users
        (id, shopId, username, firstName, lastName, workerNumber,
         pinHash, role, isActive, createdAt, updatedAt, syncedAt)
      VALUES (@id, @shopId, @username, @firstName, @lastName, @workerNumber,
              @pinHash, @role, @isActive, @createdAt, @updatedAt, @syncedAt)
      ON CONFLICT(id) DO UPDATE SET
        shopId = excluded.shopId,
        username = excluded.username,
        firstName = excluded.firstName,
        lastName = excluded.lastName,
        workerNumber = excluded.workerNumber,
        pinHash = excluded.pinHash,
        role = excluded.role,
        isActive = excluded.isActive,
        updatedAt = excluded.updatedAt,
        syncedAt = excluded.syncedAt
    `);

    const tx = this.db.transaction((rows: PosUserRow[]) => {
      for (const u of rows) {
        upsert.run({
          id: u.id,
          shopId: u.shopId,
          username: u.username,
          firstName: u.firstName ?? null,
          lastName: u.lastName ?? null,
          workerNumber: u.workerNumber ?? null,
          pinHash: u.pinHash,
          role: u.role,
          isActive: u.isActive ? 1 : 0,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          syncedAt: nowIso(),
        });
      }
    });

    const normalised: PosUserRow[] = users.map((u) => ({
      id: String(u.id),
      shopId: String(u.shopId),
      username: String(u.username),
      firstName: (u.firstName as string) ?? null,
      lastName: (u.lastName as string) ?? null,
      workerNumber: (u.workerNumber as string) ?? null,
      pinHash: String(u.pinHash),
      role: String(u.role),
      isActive: !!u.isActive,
      createdAt: String(u.createdAt),
      updatedAt: String(u.updatedAt),
    }));

    tx(normalised);
  }

  private _updateLastSync(): void {
    if (!this.db) return;
    this.db
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_last_pos_users_sync', ?)")
      .run(nowIso());
  }

  private _broadcastUpdated(count: number): void {
    try {
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        if (w && !w.isDestroyed()) {
          w.webContents.send('pos-users-updated', { count });
        }
      }
    } catch (e) {
      console.error('[PosUserSync] broadcast failed:', e);
    }
  }

  /** Used by IPC: list active POS users for the currently-paired shop. */
  listForCurrentShop(): Array<{
    id: string;
    shopId: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    workerNumber: string | null;
    role: string;
    isActive: boolean;
  }> {
    if (!this.db) return [];
    const rows = this.db
      .prepare(
        `SELECT id, shopId, username, firstName, lastName, workerNumber, role, isActive
         FROM pos_users
         WHERE isActive = 1
         ORDER BY firstName, lastName, username`,
      )
      .all() as Array<{
      id: string;
      shopId: string;
      username: string;
      firstName: string | null;
      lastName: string | null;
      workerNumber: string | null;
      role: string;
      isActive: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      shopId: r.shopId,
      username: r.username,
      firstName: r.firstName,
      lastName: r.lastName,
      workerNumber: r.workerNumber,
      role: r.role,
      isActive: r.isActive === 1,
    }));
  }

  /** Used by auth IPC. Includes pinHash; never expose to renderer directly. */
  listActiveWithHashes(): Array<{ id: string; username: string; pinHash: string }> {
    if (!this.db) return [];
    return this.db
      .prepare(
        `SELECT id, username, pinHash
         FROM pos_users
         WHERE isActive = 1`,
      )
      .all() as Array<{ id: string; username: string; pinHash: string }>;
  }

  /** Has at least one active POS user been synced? Used by onboarding gate. */
  hasAnyActive(): boolean {
    if (!this.db) return false;
    const row = this.db
      .prepare(`SELECT 1 AS x FROM pos_users WHERE isActive = 1 LIMIT 1`)
      .get() as { x: number } | undefined;
    return !!row;
  }
}

export const posUserSyncService = new PosUserSyncService();
