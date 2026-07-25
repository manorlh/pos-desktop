/**
 * Transaction + Z-report sync to cloud.
 *
 * Primary transport: HTTP. MQTT is signals only. Real-time = a single POST per sale right
 * after SQLite commit; catch-up = chunks of CHUNK_SIZE per POST.
 *
 * Idempotency contract: ids are client-generated UUIDs; a timed-out POST that retries hits
 * the server with the same id and gets back status='duplicate'. POS treats duplicate exactly
 * like accepted.
 */

import { syncService } from './syncService';
import { stockSyncService } from './stockSyncService';
import { cloudAblyClient } from './ablyClient';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cryptoMod = require('crypto');

const CHUNK_SIZE = 200;
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const PERIODIC_FLUSH_MS = 60_000;

// HTTP statuses we treat as fatal (mark outbox row as 'failed', stop retrying).
// 401 = token expired, 403 = forbidden, 422 = validation. Manager intervention required.
const FATAL_STATUSES = new Set([400, 401, 403, 404, 422]);

type TxItemRow = {
  id: string;
  productId: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount: number | null;
  discountType: string | null;
  transactionType: number | null;
  lineDiscount: number | null;
  notes: string | null;
};

type TxRow = {
  id: string;
  transactionNumber: string;
  status: string;
  documentType: number | null;
  documentProductionDate: string | null;
  paymentMethod: string | null;
  amountTendered: number | null;
  changeAmount: number | null;
  customerId: string | null;
  cashierId: string | null;
  branchId: string | null;
  notes: string | null;
  documentDiscount: number | null;
  whtDeduction: number | null;
  refundOfTransactionId: string | null;
  nayaxMeta: string | null;
  tipAmount: number | null;
  tipPaymentMethod: string | null;
  tradingDayId: string | null;
  createdAt: string;
  updatedAt: string;
};

type OutboxRow = {
  id: string;
  transactionId: string | null;
  kind: 'tx' | 'z_report';
  payload: string;
  attempts: number;
  status: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  // RFC4122 v4 from crypto.randomBytes (better-sqlite3-friendly).
  const b = cryptoMod.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class TransactionSyncService {
  private db: any = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private nextBackoffMs = BACKOFF_MIN_MS;
  private flushScheduled = false;

  private _dbReady(): boolean {
    return !!this.db && (typeof this.db.open !== 'boolean' || this.db.open);
  }

  shutdown(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    this.flushScheduled = false;
    this.isFlushing = false;
    this.db = null;
  }

  init(db: any): void {
    this.shutdown();
    this.db = db;
    this._resetOrphans();
    this._startPeriodicFlush();
    cloudAblyClient.onMessage((event) => {
      if (typeof event === 'string' && event.length > 0) {
        this.scheduleFlush();
      }
    });
  }

  /** Reset rows wedged in 'syncing' from a crash mid-POST. */
  private _resetOrphans(): void {
    if (!this.db) return;
    try {
      const info = this.db
        .prepare("UPDATE tx_outbox SET status = 'pending', lastError = 'reset on startup', updatedAt = ? WHERE status = 'syncing'")
        .run(nowIso());
      if (info && info.changes > 0) {
        console.log(`[TxSync] Reset ${info.changes} orphan outbox row(s) from 'syncing' to 'pending'`);
      }
    } catch (e) {
      console.error('[TxSync] _resetOrphans error', e);
    }
  }

  private _startPeriodicFlush(): void {
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    this.periodicTimer = setInterval(() => {
      this.scheduleFlush();
    }, PERIODIC_FLUSH_MS);
  }

  /** Schedule a non-blocking flush soon (debounced). */
  scheduleFlush(): void {
    if (!this._dbReady()) return;
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setTimeout(() => {
      this.flushScheduled = false;
      this.flushOutbox().catch((e) => console.error('[TxSync] scheduled flush error', e));
    }, 250);
  }

  /** Persist a transaction row in the outbox so it gets pushed to cloud. */
  enqueueTransaction(transactionId: string): void {
    if (!this.db) return;
    try {
      const payload = this._buildTransactionPayload(transactionId);
      if (!payload) {
        console.warn('[TxSync] enqueueTransaction: tx not found', transactionId);
        return;
      }
      // Idempotent upsert by transactionId (latest payload wins, status reset to pending).
      const existing = this.db
        .prepare("SELECT id, status FROM tx_outbox WHERE transactionId = ? AND kind = 'tx'")
        .get(transactionId) as { id: string; status: string } | undefined;
      const now = nowIso();
      if (existing) {
        this.db
          .prepare("UPDATE tx_outbox SET payload = ?, status = 'pending', attempts = 0, lastError = NULL, updatedAt = ? WHERE id = ?")
          .run(JSON.stringify(payload), now, existing.id);
      } else {
        this.db
          .prepare(
            "INSERT INTO tx_outbox (id, transactionId, kind, payload, attempts, status, createdAt, updatedAt) VALUES (?, ?, 'tx', ?, 0, 'pending', ?, ?)",
          )
          .run(uuid(), transactionId, JSON.stringify(payload), now, now);
      }
      this.scheduleFlush();
    } catch (e) {
      console.error('[TxSync] enqueueTransaction error', e);
    }
  }

  /** Build the cloud-shaped payload for a single transaction (joins items). */
  private _buildTransactionPayload(transactionId: string): Record<string, unknown> | null {
    const tx = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId) as TxRow | undefined;
    if (!tx) return null;
    const items = this.db
      .prepare('SELECT * FROM transaction_items WHERE transactionId = ?')
      .all(transactionId) as TxItemRow[];

    let nayaxMetaParsed: unknown = null;
    if (tx.nayaxMeta) {
      try {
        nayaxMetaParsed = JSON.parse(tx.nayaxMeta);
      } catch (_) {
        nayaxMetaParsed = tx.nayaxMeta;
      }
    }

    return {
      id: tx.id,
      transactionNumber: tx.transactionNumber,
      status: tx.status,
      documentType: tx.documentType,
      documentProductionDate: tx.documentProductionDate,
      paymentMethod: tx.paymentMethod,
      amountTendered: tx.amountTendered,
      changeAmount: tx.changeAmount,
      tipAmount: tx.tipAmount ?? 0,
      tipPaymentMethod: tx.tipPaymentMethod ?? undefined,
      totalAmount: items.reduce((acc, it) => acc + (it.totalPrice ?? 0), 0),
      totalDiscount: null,
      documentDiscount: tx.documentDiscount,
      whtDeduction: tx.whtDeduction,
      customerId: tx.customerId,
      cashierId: tx.cashierId,
      branchId: tx.branchId,
      notes: tx.notes,
      refundOfTransactionId: tx.refundOfTransactionId,
      nayaxMeta: nayaxMetaParsed,
      tradingDayId: tx.tradingDayId,
      dayDate: tx.createdAt ? tx.createdAt.slice(0, 10) : null,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      items: items.map((it) => {
        let productId: string | null = it.productId;
        let productName: string | null = null;
        let sku: string | null = null;
        if (it.productId) {
          const prow = this.db
            .prepare('SELECT cloud_id, name, sku FROM products WHERE id = ?')
            .get(it.productId) as { cloud_id?: string | null; name?: string; sku?: string } | undefined;
          if (prow) {
            if (prow.cloud_id) productId = prow.cloud_id;
            productName = prow.name ?? null;
            sku = prow.sku ?? null;
          }
        }
        return {
          id: it.id,
          productId,
          productName,
          sku,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
          discount: it.discount,
          discountType: it.discountType,
          transactionType: it.transactionType,
          lineDiscount: it.lineDiscount,
          notes: it.notes,
        };
      }),
      issuedVouchers: (this.db
        .prepare('SELECT * FROM issued_vouchers WHERE transaction_id = ?')
        .all(transactionId) as Array<Record<string, unknown>>).map((row) => {
        let voucherId: string | null = (row.voucher_id as string) || null;
        let productId: string | null = (row.product_id as string) || null;
        if (voucherId) {
          const vrow = this.db
            .prepare('SELECT cloud_id FROM vouchers WHERE id = ? OR cloud_id = ?')
            .get(voucherId, voucherId) as { cloud_id?: string } | undefined;
          if (vrow?.cloud_id) voucherId = vrow.cloud_id;
        }
        if (productId) {
          const prow = this.db
            .prepare('SELECT cloud_id FROM products WHERE id = ?')
            .get(productId) as { cloud_id?: string } | undefined;
          if (prow?.cloud_id) productId = prow.cloud_id;
        }
        return {
          id: row.id,
          transactionItemId: row.transaction_item_id,
          voucherId,
          productId,
          productName: row.product_name,
          quantity: row.quantity,
          unitValue: row.unit_value,
          faceValue: row.face_value,
          issuedAt: row.issued_at,
          expiresAt: row.expires_at,
          status: row.status || 'issued',
          reprintCount: row.reprint_count ?? 0,
          lastPrintedAt: row.last_printed_at,
        };
      }),
      stockMovements: (this.db
        .prepare(
          'SELECT * FROM stock_movements WHERE transaction_id = ? AND synced = 0',
        )
        .all(transactionId) as Array<Record<string, unknown>>).map((row) => {
        let productId: string | null = (row.product_id as string) || null;
        if (productId) {
          const prow = this.db
            .prepare('SELECT cloud_id FROM products WHERE id = ?')
            .get(productId) as { cloud_id?: string } | undefined;
          if (prow?.cloud_id) productId = prow.cloud_id;
        }
        return {
          id: row.id,
          productId,
          delta: row.delta,
          reason: row.reason || 'sale',
          transactionItemId: row.transaction_item_id,
          occurredAt: row.occurred_at,
          note: null,
        };
      }),
    };
  }

  /** Drain pending outbox rows until empty or a transient error. Returns when done. */
  async flushOutbox(opts?: { blocking?: boolean }): Promise<{ ok: boolean; flushed: number; reason?: string }> {
    if (!this._dbReady()) return { ok: false, flushed: 0, reason: 'db_not_ready' };
    if (this.isFlushing && !opts?.blocking) {
      return { ok: false, flushed: 0, reason: 'already_flushing' };
    }
    this.isFlushing = true;
    let flushed = 0;
    try {
      while (true) {
        const rows = this.db
          .prepare(
            "SELECT id, transactionId, kind, payload, attempts, status FROM tx_outbox WHERE status = 'pending' AND kind = 'tx' ORDER BY createdAt LIMIT ?",
          )
          .all(CHUNK_SIZE) as OutboxRow[];
        if (rows.length === 0) {
          this.nextBackoffMs = BACKOFF_MIN_MS;
          return { ok: true, flushed };
        }

        // Mark this chunk as syncing.
        const ids = rows.map((r) => r.id);
        this._markStatus(ids, 'syncing');

        const batchTransactions = rows.map((r) => {
          if (r.transactionId) {
            const fresh = this._buildTransactionPayload(r.transactionId);
            if (fresh) return fresh;
          }
          const parsed = JSON.parse(r.payload) as Record<string, unknown>;
          if (parsed.tipAmount == null) parsed.tipAmount = 0;
          return parsed;
        });
        const result = await this._postTransactions(batchTransactions);

        if (!result.ok) {
          // Reset to pending unless fatal.
          if (result.fatal) {
            this._markFailed(ids, result.error || 'fatal');
            return { ok: false, flushed, reason: result.error };
          }
          this._markStatus(ids, 'pending', { incrementAttempts: true, lastError: result.error || null });
          if (opts?.blocking) {
            return { ok: false, flushed, reason: result.error };
          }
          // Background flush: back off, return.
          await this._waitBackoff();
          return { ok: false, flushed, reason: result.error };
        }

        // Apply per-id results: accepted | duplicate clears the row + stamps tx.syncedAt.
        const okIds = new Set<string>();
        const rejected: { id: string; reason: string }[] = [];
        const results = (result.body?.results || []) as Array<{ id: string; status: string; reason?: string }>;
        for (const r of results) {
          if (r.status === 'accepted' || r.status === 'duplicate') {
            okIds.add(r.id);
          } else {
            rejected.push({ id: r.id, reason: r.reason || 'rejected' });
          }
        }

        const finishTxn = this.db.transaction(() => {
          const now = nowIso();
          for (const row of rows) {
            const txId = row.transactionId!;
            if (okIds.has(txId)) {
              this.db.prepare('UPDATE transactions SET syncedAt = ? WHERE id = ?').run(now, txId);
              this.db
                .prepare('UPDATE stock_movements SET synced = 1 WHERE transaction_id = ?')
                .run(txId);
              this.db.prepare('DELETE FROM tx_outbox WHERE id = ?').run(row.id);
              flushed += 1;
            }
          }
          for (const rj of rejected) {
            // Mark the corresponding outbox row failed with reason.
            this.db
              .prepare(
                "UPDATE tx_outbox SET status = 'failed', lastError = ?, updatedAt = ? WHERE transactionId = ? AND kind = 'tx'",
              )
              .run(rj.reason, now, rj.id);
          }
        });
        finishTxn();
        this.nextBackoffMs = BACKOFF_MIN_MS;
        void stockSyncService.pullStockImmediate().catch((e) => {
          console.error('[StockSync] post-tx-flush pull failed', e);
        });
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Z-close hard barrier:
   *   1) flush outbox blocking (returns failure if anything still pending)
   *   2) POST z-report
   *   3) on 409 missing ids, flush specific ids and retry once
   * Returns { ok, status: 'accepted'|'duplicate', error? }
   */
  async closeDayWithCloud(zPayload: Record<string, unknown>): Promise<{
    ok: boolean;
    status?: 'accepted' | 'duplicate';
    zReportId?: string;
    error?: string;
    httpStatus?: number;
    missingIds?: string[];
  }> {
    if (!this.db) return { ok: false, error: 'db_not_ready' };

    // Pre-flight 1: drain outbox.
    const flush1 = await this.flushOutbox({ blocking: true });
    if (!flush1.ok) {
      return { ok: false, error: flush1.reason || 'flush_failed' };
    }

    // Pre-flight 2: POST z-report.
    const r1 = await this._postZReport(zPayload);
    if (r1.ok) {
      const zReportId = r1.body?.zReportId as string | undefined;
      return { ok: true, status: r1.body?.status as 'accepted' | 'duplicate', zReportId };
    }
    if (r1.httpStatus === 409 && Array.isArray(r1.body?.missingIds)) {
      // Try to enqueue the specific missing tx ids and flush once.
      for (const id of r1.body.missingIds) {
        if (typeof id === 'string') this.enqueueTransaction(id);
      }
      const flush2 = await this.flushOutbox({ blocking: true });
      if (!flush2.ok) {
        return { ok: false, error: flush2.reason || 'flush_failed', missingIds: r1.body.missingIds };
      }
      const r2 = await this._postZReport(zPayload);
      if (r2.ok) {
        const zReportId = r2.body?.zReportId as string | undefined;
        return { ok: true, status: r2.body?.status as 'accepted' | 'duplicate', zReportId };
      }
      return { ok: false, error: r2.error || 'z_report_failed', httpStatus: r2.httpStatus };
    }
    return { ok: false, error: r1.error || 'z_report_failed', httpStatus: r1.httpStatus };
  }

  postCloseDayAck(payload: {
    requestId: string;
    phase: 'received' | 'completed' | 'failed';
    zReportId?: string;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const httpCfg =
        (syncService as any)._effectiveHttpConfig?.bind(syncService)() ||
        syncService.readCloudHttpConfigFromDb();
      if (!httpCfg) return resolve({ ok: false, error: 'cloud_not_configured' });
      const path = `/sync/${httpCfg.machineId}/close-day/ack`;
      syncService.cloudJson('POST', path, payload, (err) => {
        if (err) return resolve({ ok: false, error: err.message });
        resolve({ ok: true });
      });
    });
  }

  private _postTransactions(transactions: unknown[]): Promise<{
    ok: boolean;
    body?: { results?: Array<{ id: string; status: string; reason?: string }>; serverTime?: string };
    error?: string;
    fatal?: boolean;
    httpStatus?: number;
  }> {
    return new Promise((resolve) => {
      const httpCfg = (syncService as any)._effectiveHttpConfig?.bind(syncService)() || syncService.readCloudHttpConfigFromDb();
      if (!httpCfg) return resolve({ ok: false, error: 'cloud_not_configured', fatal: false });
      const path = `/sync/${httpCfg.machineId}/transactions`;
      syncService.cloudJson('POST', path, { transactions }, (err, statusCode, data) => {
        if (err) {
          const fatal = !!statusCode && FATAL_STATUSES.has(statusCode);
          return resolve({ ok: false, error: err.message, fatal, httpStatus: statusCode });
        }
        resolve({ ok: true, body: data as any, httpStatus: statusCode });
      });
    });
  }

  private _postZReport(payload: Record<string, unknown>): Promise<{
    ok: boolean;
    body?: any;
    error?: string;
    httpStatus?: number;
  }> {
    return new Promise((resolve) => {
      const httpCfg = (syncService as any)._effectiveHttpConfig?.bind(syncService)() || syncService.readCloudHttpConfigFromDb();
      if (!httpCfg) return resolve({ ok: false, error: 'cloud_not_configured' });
      const path = `/sync/${httpCfg.machineId}/z-report`;
      syncService.cloudJson('POST', path, payload, (err, statusCode, data) => {
        if (err) {
          // 409 is returned with a body — try to parse it from the error message.
          if (statusCode === 409) {
            try {
              const idx = err.message.indexOf('{');
              if (idx >= 0) {
                const body = JSON.parse(err.message.slice(idx));
                return resolve({ ok: false, body, error: 'missing_transactions', httpStatus: 409 });
              }
            } catch (_) {
              /* ignore parse */
            }
          }
          return resolve({ ok: false, error: err.message, httpStatus: statusCode });
        }
        resolve({ ok: true, body: data, httpStatus: statusCode });
      });
    });
  }

  private _markStatus(
    ids: string[],
    next: 'pending' | 'syncing' | 'failed',
    opts?: { incrementAttempts?: boolean; lastError?: string | null },
  ): void {
    if (ids.length === 0) return;
    const now = nowIso();
    const placeholders = ids.map(() => '?').join(',');
    const setAttempts = opts?.incrementAttempts ? ', attempts = attempts + 1' : '';
    const setError = opts?.lastError !== undefined ? ', lastError = ?' : '';
    const stmt = this.db.prepare(
      `UPDATE tx_outbox SET status = ?${setAttempts}${setError}, updatedAt = ? WHERE id IN (${placeholders})`,
    );
    const args: unknown[] = [next];
    if (opts?.lastError !== undefined) args.push(opts.lastError);
    args.push(now, ...ids);
    stmt.run(...args);
  }

  private _markFailed(ids: string[], reason: string): void {
    this._markStatus(ids, 'failed', { lastError: reason });
  }

  private async _waitBackoff(): Promise<void> {
    const wait = this.nextBackoffMs;
    this.nextBackoffMs = Math.min(this.nextBackoffMs * 2, BACKOFF_MAX_MS);
    await new Promise((r) => setTimeout(r, wait));
  }

  /** Read-only stats for Settings UI. */
  getStats(): {
    pending: number;
    syncing: number;
    failed: number;
    failedRows: Array<{ id: string; transactionId: string | null; lastError: string | null; attempts: number; updatedAt: string }>;
  } {
    if (!this.db) return { pending: 0, syncing: 0, failed: 0, failedRows: [] };
    const r = (st: string) =>
      (this.db.prepare('SELECT COUNT(*) as c FROM tx_outbox WHERE status = ?').get(st) as { c: number }).c;
    const failedRows = this.db
      .prepare("SELECT id, transactionId, lastError, attempts, updatedAt FROM tx_outbox WHERE status = 'failed' ORDER BY updatedAt DESC LIMIT 50")
      .all() as Array<{ id: string; transactionId: string | null; lastError: string | null; attempts: number; updatedAt: string }>;
    return { pending: r('pending'), syncing: r('syncing'), failed: r('failed'), failedRows };
  }

  /**
   * Delete synced transactions and their items for a closed trading day.
   * Safety guard: only deletes rows whose `syncedAt IS NOT NULL` so an in-flight tx is preserved.
   */
  purgeClosedDay(tradingDayId: string): { deleted: number } {
    if (!this.db) return { deleted: 0 };
    const txn = this.db.transaction(() => {
      this.db
        .prepare(
          "DELETE FROM transaction_items WHERE transactionId IN (SELECT id FROM transactions WHERE tradingDayId = ? AND syncedAt IS NOT NULL)",
        )
        .run(tradingDayId);
      const info = this.db
        .prepare('DELETE FROM transactions WHERE tradingDayId = ? AND syncedAt IS NOT NULL')
        .run(tradingDayId);
      return info.changes as number;
    });
    const deleted = txn();
    return { deleted };
  }
}

export const transactionSyncService = new TransactionSyncService();
