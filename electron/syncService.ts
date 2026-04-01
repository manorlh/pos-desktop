/**
 * Sync service — manages the sync_queue table and the bidirectional
 * catalog sync between POS SQLite and the cloud server.
 *
 * Responsibilities:
 *  1. On cloud connect: request full or delta catalog sync.
 *  2. On incoming MQTT sync message: apply to local SQLite.
 *  3. When products/categories change locally: enqueue and publish.
 *  4. On reconnect: flush the pending sync_queue.
 *
 * Node 14 / Electron 13 compatible — no top-level await, no native fetch.
 */

import { cloudMqttClient, CloudMqttConfig } from './mqttClient';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncQueueRow {
  id: string;
  entity_type: 'product' | 'category';
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  payload: string; // JSON
  created_at: string;
  status: 'pending' | 'synced' | 'failed';
}

export interface SyncStatus {
  enabled: boolean;
  connected: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  // Use crypto (Node 14 compatible) for a simple UUID-like id
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('hex');
}

// ── SyncService ───────────────────────────────────────────────────────────────

export class SyncService {
  private db: any = null;
  private config: CloudMqttConfig | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  /** Initialize with the open better-sqlite3 database instance. */
  init(db: any): void {
    this.db = db;
    this._ensureSchema();
  }

  /** Connect to the cloud MQTT broker and start syncing. */
  connect(config: CloudMqttConfig): void {
    this.config = config;

    cloudMqttClient.onMessage(this._handleIncoming.bind(this));
    cloudMqttClient.connect(config);

    // Heartbeat every 30 s
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (cloudMqttClient.connected) cloudMqttClient.publishHeartbeat();
    }, 30000);
  }

  disconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    cloudMqttClient.disconnect();
  }

  /** Enqueue a local product/category change and publish to MQTT. */
  enqueue(
    entityType: 'product' | 'category',
    entityId: string,
    action: 'create' | 'update' | 'delete',
    data: Record<string, unknown> | null,
    cloudId: string | null,
    updatedAt: string,
  ): void {
    if (!this.db) return;

    const id = generateId();
    const payload = JSON.stringify({ action, entity: entityType, localId: entityId, cloudId, updatedAt, data });

    this.db.prepare(`
      INSERT INTO sync_queue (id, entity_type, entity_id, action, payload, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, entityType, entityId, action, payload, nowIso());

    // Publish immediately if connected
    if (cloudMqttClient.connected) {
      cloudMqttClient.publishCatalogUpdate({ action, entity: entityType, localId: entityId, cloudId, updatedAt, data });
      this._markSynced(id);
    }
    // If offline, will be flushed on reconnect via requestCatalogSync flow
  }

  /** Flush all pending items in sync_queue to MQTT. Call on reconnect. */
  flushQueue(): void {
    if (!this.db || !cloudMqttClient.connected) return;

    const pending: SyncQueueRow[] = this.db.prepare(
      "SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC"
    ).all();

    for (const row of pending) {
      try {
        const change = JSON.parse(row.payload);
        cloudMqttClient.publishCatalogUpdate(change);
        this._markSynced(row.id);
      } catch (e) {
        console.error('[Sync] Failed to flush queue item', row.id, e);
      }
    }
  }

  getStatus(): SyncStatus {
    const pendingCount = this.db
      ? (this.db.prepare("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'").get() as any).c
      : 0;

    const lastSyncRow = this.db
      ? this.db.prepare("SELECT value FROM settings WHERE key = 'cloud_last_sync'").get() as any
      : null;

    return {
      enabled: !!this.config,
      connected: cloudMqttClient.connected,
      pendingCount,
      lastSyncedAt: lastSyncRow ? lastSyncRow.value : null,
    };
  }

  // ── Inbound: apply server-pushed catalog changes ──────────────────────────

  private _handleIncoming(topic: string, payload: Record<string, unknown>): void {
    const parts = topic.split('/');
    if (parts.length < 5) return;
    const msgType = parts[3];
    const sub = parts[4];

    if (msgType === 'sync' && sub === 'products') {
      this._applyProductSync(payload);
    } else if (msgType === 'sync' && sub === 'categories') {
      this._applyCategorySync(payload);
    } else if (msgType === 'sync' && sub === 'ack') {
      // Server confirmed it received a catalog update — nothing to do
    }
  }

  private _applyProductSync(payload: Record<string, unknown>): void {
    if (!this.db) return;
    const items = (payload.items as any[]) || [];
    const syncType = payload.type as string;

    for (const item of items) {
      this._upsertProduct(item);
    }

    this._updateLastSync();
    console.log(`[Sync] Applied ${syncType} product sync: ${items.length} items`);
  }

  private _applyCategorySync(payload: Record<string, unknown>): void {
    if (!this.db) return;
    const items = (payload.items as any[]) || [];
    const syncType = payload.type as string;

    for (const item of items) {
      this._upsertCategory(item);
    }

    this._updateLastSync();
    console.log(`[Sync] Applied ${syncType} category sync: ${items.length} items`);
  }

  private _upsertProduct(item: Record<string, unknown>): void {
    if (!this.db) return;

    // Check existing by cloud_id first, then by sku
    const cloudId = item.id as string;
    let existing: any = this.db.prepare('SELECT * FROM products WHERE cloud_id = ?').get(cloudId);
    if (!existing && item.sku) {
      existing = this.db.prepare('SELECT * FROM products WHERE sku = ?').get(item.sku);
    }

    const incomingUpdatedAt = item.updatedAt as string;

    if (existing) {
      // Conflict resolution: latest updated_at wins
      if (existing.updatedAt >= incomingUpdatedAt && existing.cloud_synced === 1) {
        return; // Local is newer or equal, skip
      }

      this.db.prepare(`
        UPDATE products
        SET name = ?, description = ?, price = ?, sku = ?, categoryId = ?,
            imageUrl = ?, inStock = ?, stockQuantity = ?, barcode = ?, taxRate = ?,
            cloud_id = ?, cloud_synced = 1, last_cloud_sync = ?, updatedAt = ?
        WHERE id = ?
      `).run(
        item.name, item.description, item.price, item.sku, item.categoryId,
        item.imageUrl, item.inStock ? 1 : 0, item.stockQuantity, item.barcode,
        item.taxRate, cloudId, nowIso(), incomingUpdatedAt,
        existing.id,
      );
    } else {
      // Insert new product from cloud
      this.db.prepare(`
        INSERT OR IGNORE INTO products
          (id, name, description, price, sku, categoryId, imageUrl, inStock,
           stockQuantity, barcode, taxRate, cloud_id, cloud_synced, last_cloud_sync, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        item.id, item.name, item.description, item.price, item.sku, item.categoryId,
        item.imageUrl, item.inStock ? 1 : 0, item.stockQuantity, item.barcode,
        item.taxRate, cloudId, nowIso(), item.createdAt, incomingUpdatedAt,
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
      if (existing.updatedAt >= incomingUpdatedAt && existing.cloud_synced === 1) return;

      this.db.prepare(`
        UPDATE categories
        SET name = ?, description = ?, color = ?, imageUrl = ?, parentId = ?,
            isActive = ?, sortOrder = ?, cloud_id = ?, cloud_synced = 1,
            last_cloud_sync = ?, updatedAt = ?
        WHERE id = ?
      `).run(
        item.name, item.description, item.color, item.imageUrl, item.parentId,
        item.isActive ? 1 : 0, item.sortOrder, cloudId, nowIso(), incomingUpdatedAt,
        existing.id,
      );
    } else {
      this.db.prepare(`
        INSERT OR IGNORE INTO categories
          (id, name, description, color, imageUrl, parentId, isActive, sortOrder,
           cloud_id, cloud_synced, last_cloud_sync, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        item.id, item.name, item.description, item.color, item.imageUrl,
        item.parentId, item.isActive ? 1 : 0, item.sortOrder,
        cloudId, nowIso(), item.createdAt, incomingUpdatedAt,
      );
    }
  }

  // ── Schema setup ──────────────────────────────────────────────────────────

  private _ensureSchema(): void {
    if (!this.db) return;

    // Add cloud sync columns to products (idempotent migrations)
    for (const col of [
      'cloud_id TEXT',
      'cloud_synced INTEGER DEFAULT 0',
      'last_cloud_sync TEXT',
    ]) {
      try {
        this.db.exec(`ALTER TABLE products ADD COLUMN ${col}`);
      } catch (_) { /* already exists */ }
    }

    // Add cloud sync columns to categories
    for (const col of [
      'cloud_id TEXT',
      'cloud_synced INTEGER DEFAULT 0',
      'last_cloud_sync TEXT',
    ]) {
      try {
        this.db.exec(`ALTER TABLE categories ADD COLUMN ${col}`);
      } catch (_) { /* already exists */ }
    }

    // Create sync_queue table
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
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private _markSynced(queueId: string): void {
    if (!this.db) return;
    this.db.prepare("UPDATE sync_queue SET status = 'synced' WHERE id = ?").run(queueId);
  }

  private _updateLastSync(): void {
    if (!this.db) return;
    this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_last_sync', ?)
    `).run(nowIso());
  }
}

// Singleton used by main.ts IPC handlers
export const syncService = new SyncService();
