/**
 * Local PIN authentication for POS users.
 *
 * The POS-desktop verifies a 4-6 digit PIN against the bcrypt hash that was synced
 * from the cloud (see posUserSync.ts). This stays in the main process so renderer
 * code never sees the hashes; the only IPCs are `posUserLogin(pin)` (returns a
 * sanitised user object on success) and `posUserListForShop()` (returns tiles
 * without secrets).
 *
 * Bcrypt is wire-compatible between cloud `passlib[bcrypt]` (`$2b$`) and `bcryptjs`,
 * so a hash created in the cloud verifies cleanly here.
 */

import { posUserSyncService } from './posUserSync';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bcrypt = require('bcryptjs');

export type PosUserPublic = {
  id: string;
  shopId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  workerNumber: string | null;
  role: string;
  isActive: boolean;
};

export type LoginResult =
  | { ok: true; user: PosUserPublic }
  | { ok: false; reason: 'invalid_pin' | 'no_users' | 'invalid_format' };

const PIN_RE = /^\d{4,6}$/;

export class AuthService {
  private db: any = null;

  init(db: any): void {
    this.db = db;
  }

  /**
   * Verify a PIN against all active local POS users. First match wins.
   * Returns sanitised user metadata on success.
   */
  verifyPin(pin: string): LoginResult {
    if (!PIN_RE.test(pin || '')) {
      return { ok: false, reason: 'invalid_format' };
    }

    const candidates = posUserSyncService.listActiveWithHashes();
    if (candidates.length === 0) {
      return { ok: false, reason: 'no_users' };
    }

    for (const c of candidates) {
      let matched = false;
      try {
        matched = bcrypt.compareSync(pin, c.pinHash);
      } catch (e) {
        console.error('[Auth] bcrypt compare failed for user', c.username, e);
        continue;
      }
      if (matched) {
        const full = this._loadUser(c.id);
        if (full) {
          // Several legacy tables (transactions.cashierId, trading_days.openedBy /
          // closedBy) still FK into the local `users` table from the pre-cloud-auth
          // era. The dashboard's pos_users table is a separate source of truth, so
          // those FKs would fail the moment a cloud-synced user opens a trading day
          // or rings up a sale. We mirror the logged-in pos_user into `users` to
          // satisfy the FKs without a schema migration.
          this._mirrorToLegacyUsersTable(full);
          return { ok: true, user: full };
        }
      }
    }
    return { ok: false, reason: 'invalid_pin' };
  }

  /**
   * Idempotent upsert of a logged-in pos_user into the legacy `users` table.
   *
   * Uses the same `id` as the pos_user so that `cashierId` / `openedBy` /
   * `closedBy` references resolve cleanly. The `users.email` column is NOT
   * NULL UNIQUE; we synthesise a deterministic `<id>@pos.local` so every
   * pos_user maps to exactly one local users row, even across re-logins.
   */
  private _mirrorToLegacyUsersTable(u: PosUserPublic): void {
    if (!this.db) return;
    try {
      const now = new Date().toISOString();
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username;
      const email = `${u.id}@pos.local`;
      this.db
        .prepare(
          `INSERT INTO users (id, name, email, role, isActive, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             role = excluded.role,
             isActive = 1,
             updatedAt = excluded.updatedAt`,
        )
        .run(u.id, name, email, u.role, now, now);
    } catch (e) {
      // Logged but non-fatal: the user already authenticated successfully.
      // Worst case the FK insert that follows will fail loudly with a clearer
      // message than this silent best-effort mirror.
      console.error('[Auth] failed to mirror pos_user to legacy users table:', e);
    }
  }

  listForCurrentShop(): PosUserPublic[] {
    return posUserSyncService.listForCurrentShop();
  }

  private _loadUser(id: string): PosUserPublic | null {
    if (!this.db) return null;
    const row = this.db
      .prepare(
        `SELECT id, shopId, username, firstName, lastName, workerNumber, role, isActive
         FROM pos_users WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          shopId: string;
          username: string;
          firstName: string | null;
          lastName: string | null;
          workerNumber: string | null;
          role: string;
          isActive: number;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      shopId: row.shopId,
      username: row.username,
      firstName: row.firstName,
      lastName: row.lastName,
      workerNumber: row.workerNumber,
      role: row.role,
      isActive: row.isActive === 1,
    };
  }
}

export const authService = new AuthService();
