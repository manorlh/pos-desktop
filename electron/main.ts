const { app, BrowserWindow, Menu, ipcMain, dialog, protocol, powerMonitor, net } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const iconv = require('iconv-lite');
const crypto = require('crypto');

import { syncService } from './syncService';
import { transactionSyncService } from './transactionSync';
import { posUserSyncService } from './posUserSync';
import { settingsSyncService } from './settingsSyncService';
import { stockSyncService } from './stockSyncService';
import { authService } from './auth';
import { imageCacheService } from './imageCacheService';
import { normalizeApiBaseUrl, parseMqttBrokerUrl, postPairingValidate, postDeviceRegister, getDevicePollStatus, pairingCredentialsFromValidateData } from './cloudPairing';

import {
  callNayaxJsonRpc,
  validateNayaxHost,
  parseNayaxPort,
  normalizeNayaxPath,
  DEFAULT_NAYAX_TRANSACTION_TIMEOUT_MS,
  DEFAULT_NAYAX_TEST_TIMEOUT_MS,
  DEFAULT_NAYAX_ABORT_RPC_TIMEOUT_MS,
  type NayaxJsonRpcResult,
} from './nayaxClient';
import {
  parseAshraitDoTransactionResult,
  parseAbortTransactionResult,
  INTEGRATION_LOG_TYPE_NAYAX,
} from './nayaxOutcome';
import { normalizeIsraeli9Digit } from '../src/utils/israeliTaxId';
import {
  formatOpenFormatLinkId,
  buildB110Record,
  buildM100Record,
  buildC100Record,
  buildD110Record,
  buildD120Record,
  collectUniqueProductsForM100,
} from '../src/utils/taxReportGenerator';
import { buildReceiptHtml, type ReceiptPrintPayload } from '../src/utils/receiptTemplate';
import { buildVoucherHtml, type VoucherPrintPayload } from '../src/utils/voucherTemplate';
import { buildHeeboFontFaceCss, getPackagedResourcesPath } from './fontAssets';

const mainDirname = path.dirname(__filename);
// Resolve better-sqlite3 from project root node_modules
// In development, __dirname is dist-electron, so we go up one level to project root
let betterSqlite3Path: string;
if (app.isPackaged) {
  // When packaged, better-sqlite3 is unpacked from ASAR
  // On Windows: resources/app.asar.unpacked/node_modules/better-sqlite3
  // On macOS: resources/app.asar.unpacked/node_modules/better-sqlite3
  // process.resourcesPath points to the resources folder which contains app.asar and app.asar.unpacked
  const resourcesPath = (process as any).resourcesPath || app.getAppPath().replace(/[\\/]app\.asar$/, '');
  const unpackedPath = path.join(resourcesPath, 'app.asar.unpacked');
  const nodeModulesPath = path.join(unpackedPath, 'node_modules');
  betterSqlite3Path = path.join(nodeModulesPath, 'better-sqlite3');
  
  // Add unpacked node_modules to module search path so dependencies like 'bindings' can be found
  const Module = require('module');
  if (Module._nodeModulePaths) {
    // Add unpacked node_modules to the module search paths
    const originalNodeModulePaths = Module._nodeModulePaths;
    Module._nodeModulePaths = function(from: string) {
      const paths = originalNodeModulePaths.call(this, from);
      // Insert unpacked node_modules at the beginning of the search path
      if (fs.existsSync(nodeModulesPath)) {
        paths.unshift(nodeModulesPath);
      }
      return paths;
    };
  }
} else {
  // In development, better-sqlite3 is in the project root node_modules
  const projectRoot = path.resolve(mainDirname, '..');
  betterSqlite3Path = path.join(projectRoot, 'node_modules', 'better-sqlite3');
}

// Try to require better-sqlite3 with better error handling
let Database: any;
try {
  Database = require(betterSqlite3Path);
  console.log('Successfully loaded better-sqlite3 from:', betterSqlite3Path);
} catch (error: any) {
  console.error('Failed to load better-sqlite3:', error);
  console.error('Looking for better-sqlite3 at:', betterSqlite3Path);
  console.error('app.isPackaged:', app.isPackaged);
  console.error('process.platform:', process.platform);
  
  if (app.isPackaged) {
    const resourcesPath = (process as any).resourcesPath || app.getAppPath().replace(/[\\/]app\.asar$/, '');
    console.error('process.resourcesPath:', resourcesPath);
    console.error('app.getAppPath():', app.getAppPath());
    console.error('__dirname:', mainDirname);
    
    // Try multiple alternative paths
    const altPaths = [
      path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'better-sqlite3'),
      path.join(resourcesPath, 'node_modules', 'better-sqlite3'),
      path.join(path.dirname(resourcesPath), 'app.asar.unpacked', 'node_modules', 'better-sqlite3'),
      path.join(path.dirname(app.getAppPath()), 'app.asar.unpacked', 'node_modules', 'better-sqlite3'),
    ];
    
    console.error('Trying alternative paths:', altPaths);
    let found = false;
    for (const altPath of altPaths) {
      try {
        if (fs.existsSync(altPath)) {
          console.log('Found better-sqlite3 at:', altPath);
          Database = require(altPath);
          console.log('Successfully loaded better-sqlite3 from:', altPath);
          found = true;
          break;
        } else {
          console.log('Path does not exist:', altPath);
        }
      } catch (altError: any) {
        console.error('Failed to load from', altPath, ':', altError.message);
        // Continue to next path
      }
    }
    
    if (!found) {
      const errorMsg = `Cannot find module 'better-sqlite3'. Tried paths:\n${[betterSqlite3Path, ...altPaths].join('\n')}\n\nPlease ensure better-sqlite3 is properly packaged in app.asar.unpacked.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  } else {
    throw new Error(`Cannot find module 'better-sqlite3' at ${betterSqlite3Path}. Please run 'npm install'.`);
  }
}

// ============================================================================
// Database initialization and operations (inlined from database-main.ts and database-ops.ts)
// ============================================================================

let dbInstance: any = null;

function createSchema(db: any): void {
  // Products table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      categoryId TEXT NOT NULL,
      imageUrl TEXT,
      localImagePath TEXT,
      inStock INTEGER NOT NULL DEFAULT 1,
      isAvailable INTEGER NOT NULL DEFAULT 1,
      stockQuantity INTEGER NOT NULL DEFAULT 0,
      barcode TEXT,
      taxRate REAL,
      shopListed INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (categoryId) REFERENCES categories(id)
    )
  `);

  try {
    db.exec(`ALTER TABLE products ADD COLUMN voucherId TEXT`);
  } catch (_) {
    // Column already exists
  }

  // Vouchers table (cloud-synced templates)
  db.exec(`
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

  // Issued vouchers (one per voucher-linked transaction line)
  db.exec(`
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

  db.exec(`CREATE INDEX IF NOT EXISTS idx_issued_vouchers_tx ON issued_vouchers(transaction_id)`);

  try {
    db.exec(`ALTER TABLE products ADD COLUMN track_stock INTEGER NOT NULL DEFAULT 0`);
  } catch (_) {
    // Column already exists
  }

  db.exec(`
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

  db.exec(`
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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_movements_tx ON stock_movements(transaction_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)`);

  // Categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      imageUrl TEXT,
      localImagePath TEXT,
      parentId TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (parentId) REFERENCES categories(id)
    )
  `);

  // Customers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      loyaltyPoints INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      transactionNumber TEXT NOT NULL UNIQUE,
      customerId TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      receiptUrl TEXT,
      notes TEXT,
      cashierId TEXT NOT NULL,
      documentType INTEGER NOT NULL,
      documentProductionDate TEXT NOT NULL,
      branchId TEXT,
      documentDiscount REAL,
      whtDeduction REAL,
      amountTendered REAL,
      changeAmount REAL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (customerId) REFERENCES customers(id),
      FOREIGN KEY (cashierId) REFERENCES users(id)
    )
  `);

  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN refundOfTransactionId TEXT REFERENCES transactions(id)`);
  } catch (_) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN paymentMethod TEXT`);
  } catch (_) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN nayaxMeta TEXT`);
  } catch (_) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN tradingDayId TEXT REFERENCES trading_days(id)`);
  } catch (_) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN syncedAt TEXT`);
  } catch (_) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN tipAmount REAL`);
  } catch (_) {
    // Column already exists
  }

  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN tipPaymentMethod TEXT`);
  } catch (_) {
    // Column already exists
  }

  try {
    db.exec(`UPDATE transactions SET tipAmount = 0 WHERE tipAmount IS NULL`);
  } catch (_) {
    // tipAmount column may not exist yet on very old DBs
  }

  // Transaction items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transaction_items (
      id TEXT PRIMARY KEY,
      transactionId TEXT NOT NULL,
      productId TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitPrice REAL NOT NULL,
      totalPrice REAL NOT NULL,
      discount REAL,
      discountType TEXT,
      transactionType INTEGER,
      lineDiscount REAL,
      notes TEXT,
      FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id)
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Integration logs (e.g. Nayax JSON-RPC request/response audit)
  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_logs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      method TEXT NOT NULL,
      requestJson TEXT NOT NULL,
      responseJson TEXT,
      outcome TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);

  // Business info table
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_info (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      vatNumber TEXT NOT NULL,
      companyName TEXT NOT NULL,
      companyAddress TEXT NOT NULL,
      companyAddressNumber TEXT NOT NULL,
      companyCity TEXT NOT NULL,
      companyZip TEXT NOT NULL,
      companyRegNumber TEXT,
      hasBranches INTEGER NOT NULL DEFAULT 0,
      branchId TEXT,
      updatedAt TEXT NOT NULL
    )
  `);

  // Software info table
  db.exec(`
    CREATE TABLE IF NOT EXISTS software_info (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      registrationNumber TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      manufacturerId TEXT NOT NULL,
      manufacturerName TEXT NOT NULL,
      softwareType TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Outbox for cloud sync of transactions and Z-reports.
  // Idempotent on the wire: server upserts by tx id and returns 'duplicate' on retry.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tx_outbox (
      id TEXT PRIMARY KEY,
      transactionId TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('tx', 'z_report')),
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'syncing', 'synced', 'failed')) DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Trading days table
  db.exec(`
    CREATE TABLE IF NOT EXISTS trading_days (
      id TEXT PRIMARY KEY,
      dayDate TEXT NOT NULL,
      openedAt TEXT NOT NULL,
      closedAt TEXT,
      openingCash REAL NOT NULL,
      closingCash REAL,
      expectedCash REAL,
      actualCash REAL,
      discrepancy REAL,
      openedBy TEXT NOT NULL,
      closedBy TEXT,
      status TEXT NOT NULL,
      zReportData TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (openedBy) REFERENCES users(id),
      FOREIGN KEY (closedBy) REFERENCES users(id)
    )
  `);

  // POS users (synced from cloud, scoped to this machine's shop). Carries the bcrypt
  // PIN hash so cashiers can log in fully offline.
  db.exec(`
    CREATE TABLE IF NOT EXISTS pos_users (
      id TEXT PRIMARY KEY,
      shopId TEXT NOT NULL,
      username TEXT NOT NULL,
      firstName TEXT,
      lastName TEXT,
      workerNumber TEXT,
      pinHash TEXT NOT NULL,
      role TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      syncedAt TEXT
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_createdAt ON transactions(createdAt);
    CREATE INDEX IF NOT EXISTS idx_transactions_transactionNumber ON transactions(transactionNumber);
    CREATE INDEX IF NOT EXISTS idx_transactions_customerId ON transactions(customerId);
    CREATE INDEX IF NOT EXISTS idx_transaction_items_transactionId ON transaction_items(transactionId);
    CREATE INDEX IF NOT EXISTS idx_products_categoryId ON products(categoryId);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_trading_days_dayDate ON trading_days(dayDate);
    CREATE INDEX IF NOT EXISTS idx_trading_days_status ON trading_days(status);
    CREATE INDEX IF NOT EXISTS idx_integration_logs_type_created ON integration_logs(type, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_tx_outbox_status ON tx_outbox(status, createdAt);
    CREATE INDEX IF NOT EXISTS idx_transactions_tradingDayId ON transactions(tradingDayId);
    CREATE INDEX IF NOT EXISTS idx_transactions_syncedAt ON transactions(syncedAt);
    CREATE INDEX IF NOT EXISTS idx_pos_users_shop_active ON pos_users(shopId, isActive);
    CREATE INDEX IF NOT EXISTS idx_pos_users_username ON pos_users(shopId, username);
  `);
}

let dbSleepPaused = false;
let dbResumeInProgress = false;
let lastSystemWakeHandledAt = 0;
let tenantBackfillInFlight = false;
let cloudTenantMissingLogged = false;

function initializeDatabaseMain(dbPath: string): any {
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (dbInstance) {
    shutdownDatabaseServicesBeforeReset();
    try {
      if (isSqliteOpen(dbInstance)) {
        dbInstance.pragma('wal_checkpoint(TRUNCATE)');
      }
    } catch (e) {
      console.warn('[DB] wal checkpoint before reopen failed:', e);
    }
    try {
      dbInstance.close();
    } catch (e) {
      // Ignore
    }
    dbInstance = null;
  }

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  
  createSchema(dbInstance);
  syncService.init(dbInstance);
  imageCacheService.init(dbInstance, app.getPath('userData'));
  transactionSyncService.init(dbInstance);
  posUserSyncService.init(dbInstance);
  settingsSyncService.init(dbInstance);
  stockSyncService.init(dbInstance);
  authService.init(dbInstance);
  tryReconnectCloudMqttFromDb(dbInstance);
  dbSleepPaused = false;

  return dbInstance;
}

function getDatabaseMain(): any {
  if (!dbInstance) {
    throw new Error('Database not initialized');
  }
  return dbInstance;
}

function closeDatabaseMain(): void {
  if (dbInstance) {
    shutdownDatabaseServicesBeforeReset();
    try {
      if (isSqliteOpen(dbInstance)) {
        dbInstance.pragma('wal_checkpoint(TRUNCATE)');
      }
    } catch (e) {
      console.warn('[DB] wal checkpoint before close failed:', e);
    }
    try {
      dbInstance.close();
    } catch (e) {
      console.warn('[DB] close failed:', e);
    }
    dbInstance = null;
  }
}

/** Checkpoint WAL and close SQLite before macOS sleep (avoids stale -shm on wake). */
function pauseDatabaseForSystemSleep(): void {
  if (dbSleepPaused || !dbInstance) return;
  dbSleepPaused = true;
  console.log('[DB] Pausing database for system sleep');
  closeDatabaseMain();
}

function notifyRendererDatabaseEvent(channel: 'database-resumed' | 'database-resume-failed'): void {
  try {
    win?.webContents?.send(channel);
  } catch (e) {
    console.warn(`[DB] failed to notify renderer (${channel}):`, e);
  }
}

/** Reopen SQLite after wake with short retries while the volume finishes mounting. */
async function resumeDatabaseAfterSystemWake(): Promise<boolean> {
  if (!dbSleepPaused && dbInstance && isSqliteOpen(dbInstance)) {
    return true;
  }
  if (dbResumeInProgress) return false;
  dbResumeInProgress = true;
  const dbPath = getResolvedDatabasePathMain();
  const delaysMs = [0, 400, 1200];
  try {
    console.log('[DB] Resuming database after system wake');
    for (let attempt = 0; attempt < delaysMs.length; attempt++) {
      if (delaysMs[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      }
      try {
        initializeDatabaseMain(dbPath);
        dbSleepPaused = false;
        notifyRendererDatabaseEvent('database-resumed');
        return true;
      } catch (e) {
        console.warn(`[DB] wake reopen attempt ${attempt + 1}/${delaysMs.length} failed:`, e);
      }
    }
    notifyRendererDatabaseEvent('database-resume-failed');
    return false;
  } finally {
    dbResumeInProgress = false;
  }
}

function scheduleResumeDatabaseAfterSystemWake(): void {
  const now = Date.now();
  if (now - lastSystemWakeHandledAt < 2500) return;
  lastSystemWakeHandledAt = now;
  void resumeDatabaseAfterSystemWake().catch((e) => {
    console.warn('[DB] resume on wake failed:', e);
  });
}

/** Active DB path from app settings.json (same rules as get-database-path IPC). */
function getResolvedDatabasePathMain(): string {
  const userDataPath = app.getPath('userData');
  const defaultPath = path.join(userDataPath, 'database', 'pos.db');
  const settingsPath = path.join(userDataPath, 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (settings.databasePath && typeof settings.databasePath === 'string') {
        return settings.databasePath;
      }
    }
  } catch (e) {
    console.error('Error reading settings for database path:', e);
  }
  return defaultPath;
}

function deleteDatabaseFilesOnDisk(dbPath: string): void {
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }
}

/** Stop timers and drop stale DB handles before closing/deleting SQLite. */
function shutdownDatabaseServicesBeforeReset(): void {
  syncService.shutdownForReset();
  transactionSyncService.shutdown();
  posUserSyncService.shutdown();
  settingsSyncService.shutdown();
  authService.shutdown();
}

// Database operations
function getVoucherById(db: any, voucherId: string): any | null {
  if (!voucherId) return null;
  const row = db.prepare('SELECT * FROM vouchers WHERE id = ? OR cloud_id = ?').get(voucherId, voucherId);
  if (!row) return null;
  return {
    id: row.id,
    cloudId: row.cloud_id || row.id,
    name: row.name,
    isActive: row.is_active === 1,
    title: row.title || undefined,
    subtitle: row.subtitle || undefined,
    bodyText: row.body_text || undefined,
    footerText: row.footer_text || undefined,
    validityDays: row.validity_days ?? undefined,
    valueDisplayMode: row.value_display_mode || 'product_price',
    displayValue: row.display_value ?? undefined,
    printBarcode: row.print_barcode === 1,
    printQr: row.print_qr === 1,
    language: row.language || 'he',
    updatedAt: row.updated_at,
  };
}

function getIssuedVouchersForTransaction(db: any, transactionId: string): any[] {
  const rows = db.prepare('SELECT * FROM issued_vouchers WHERE transaction_id = ? ORDER BY issued_at').all(transactionId);
  return rows.map((row: any) => ({
    id: row.id,
    transactionId: row.transaction_id,
    transactionItemId: row.transaction_item_id || undefined,
    voucherId: row.voucher_id || undefined,
    productId: row.product_id || undefined,
    productName: row.product_name || undefined,
    quantity: row.quantity,
    unitValue: row.unit_value ?? undefined,
    faceValue: row.face_value ?? undefined,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at || undefined,
    status: row.status || 'issued',
    reprintCount: row.reprint_count ?? 0,
    lastPrintedAt: row.last_printed_at || undefined,
  }));
}

function saveIssuedVouchers(db: any, transactionId: string, issued: any[]): void {
  db.prepare('DELETE FROM issued_vouchers WHERE transaction_id = ?').run(transactionId);
  if (!issued || issued.length === 0) return;
  const stmt = db.prepare(`
    INSERT INTO issued_vouchers
    (id, transaction_id, transaction_item_id, voucher_id, product_id, product_name, quantity, unit_value, face_value,
     issued_at, expires_at, status, reprint_count, last_printed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const iv of issued) {
    stmt.run(
      iv.id,
      transactionId,
      iv.transactionItemId || null,
      iv.voucherId || null,
      iv.productId || null,
      iv.productName || null,
      iv.quantity ?? 1,
      iv.unitValue ?? null,
      iv.faceValue ?? null,
      iv.issuedAt,
      iv.expiresAt || null,
      iv.status || 'issued',
      iv.reprintCount ?? 0,
      iv.lastPrintedAt || null,
    );
  }
}

function incrementIssuedVoucherReprint(db: any, issuedId: string): any | null {
  const row = db.prepare('SELECT * FROM issued_vouchers WHERE id = ?').get(issuedId);
  if (!row) return null;
  const now = new Date().toISOString();
  const count = (row.reprint_count ?? 0) + 1;
  db.prepare('UPDATE issued_vouchers SET reprint_count = ?, last_printed_at = ? WHERE id = ?').run(count, now, issuedId);
  return getIssuedVouchersForTransaction(db, row.transaction_id).find((iv: any) => iv.id === issuedId) || null;
}

function getAllProducts(db: any): any[] {
  const rows = db.prepare('SELECT * FROM products ORDER BY name').all();
  return rows.map((row: any) => {
    const hasLocal =
      row.localImagePath && fs.existsSync(row.localImagePath);
    const displayImageSrc = hasLocal
      ? imageCacheService.assetUrl('product', row.id)
      : row.imageUrl || undefined;
    return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    price: row.price,
    sku: row.sku,
    categoryId: row.categoryId,
    imageUrl: row.imageUrl || undefined,
    displayImageSrc,
    inStock: row.inStock === 1,
    isAvailable: row.isAvailable === undefined ? true : row.isAvailable === 1,
    shopListed: row.shopListed === undefined || row.shopListed === null ? true : row.shopListed === 1,
    stockQuantity: 0,
    barcode: row.barcode || undefined,
    taxRate: row.taxRate || undefined,
    voucherId: row.voucherId || undefined,
    trackStock: row.track_stock === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cloud_id: row.cloud_id || undefined,
    cloudId: row.cloud_id || undefined,
  };
  });
}

function saveProduct(db: any, product: any): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO products 
    (id, name, description, price, sku, categoryId, imageUrl, inStock, isAvailable, stockQuantity, barcode, taxRate, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    product.id,
    product.name,
    product.description || null,
    product.price,
    product.sku,
    product.categoryId,
    product.imageUrl || null,
    product.inStock ? 1 : 0,
    product.isAvailable === false ? 0 : 1,
    0,
    product.barcode || null,
    product.taxRate || null,
    product.createdAt,
    product.updatedAt
  );
}

function getAllCategories(db: any): any[] {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sortOrder, name').all();
  return rows.map((row: any) => {
    const hasLocal =
      row.localImagePath && fs.existsSync(row.localImagePath);
    const displayImageSrc = hasLocal
      ? imageCacheService.assetUrl('category', row.id)
      : row.imageUrl || undefined;
    return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    color: row.color || undefined,
    imageUrl: row.imageUrl || undefined,
    displayImageSrc,
    parentId: row.parentId || undefined,
    isActive: row.isActive === 1,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cloud_id: row.cloud_id || undefined,
    cloudId: row.cloud_id || undefined,
  };
  });
}

function saveCategory(db: any, category: any): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO categories 
    (id, name, description, color, imageUrl, parentId, isActive, sortOrder, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    category.id,
    category.name,
    category.description || null,
    category.color || null,
    category.imageUrl || null,
    category.parentId || null,
    category.isActive ? 1 : 0,
    category.sortOrder,
    category.createdAt,
    category.updatedAt
  );
}

function readSettingMain(db: any, key: string): string | null {
  if (!isSqliteOpen(db)) return null;
  try {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return r ? r.value : null;
  } catch (e) {
    console.warn(`[DB] readSettingMain(${key}) failed:`, e);
    return null;
  }
}

function isCloudSyncEnabledMain(db: any): boolean {
  const v = readSettingMain(db, 'cloud_sync_enabled');
  return v === '1' || v === 'true';
}

function isSqliteOpen(db: any): boolean {
  return !!db && (typeof db.open !== 'boolean' || db.open);
}

/** MQTT topics use pos/{tenantId}/{machineId}/… — stored as cloud_tenant_id (legacy: cloud_merchant_id). */
function readMqttTenantIdMain(db: any): string | null {
  return (
    readSettingMain(db, 'cloud_tenant_id')?.trim() ||
    readSettingMain(db, 'cloud_merchant_id')?.trim() ||
    null
  );
}

function persistMachineContextMain(
  db: any,
  ctx: { tenantId: string | null; shopId: string | null },
): void {
  if (!isSqliteOpen(db)) return;
  const put = (k: string, v: string) =>
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(k, v);
  if (ctx.tenantId) {
    put('cloud_tenant_id', ctx.tenantId);
    put('cloud_merchant_id', ctx.tenantId);
  }
  if (ctx.shopId) {
    put('cloud_shop_id', ctx.shopId);
  }
}

function parseMachineMeResponse(data: unknown): { tenantId: string | null; shopId: string | null } {
  const d = (data ?? {}) as Record<string, string | null | undefined>;
  const tenantId = d.tenantId
    ? String(d.tenantId)
    : d.merchantId
      ? String(d.merchantId)
      : null;
  const shopId = d.shopId ? String(d.shopId) : null;
  return { tenantId, shopId };
}

function _doConnectMqttFromSettings(db: any): boolean {
  const host = readSettingMain(db, 'mqtt_cloud_host');
  const portStr = readSettingMain(db, 'mqtt_cloud_port');
  const tenantId = readMqttTenantIdMain(db);
  const machineId = readSettingMain(db, 'cloud_machine_id');
  const apiBaseUrl = readSettingMain(db, 'cloud_api_base');
  const accessToken = readSettingMain(db, 'cloud_access_token');
  if (
    !host?.trim() ||
    !tenantId ||
    !machineId?.trim() ||
    !apiBaseUrl?.trim() ||
    !accessToken?.trim()
  ) {
    return false;
  }
  const port = portStr ? parseInt(portStr, 10) : 1883;
  const clientId = readSettingMain(db, 'mqtt_cloud_client_id');
  const username = readSettingMain(db, 'mqtt_cloud_username');
  const password = readSettingMain(db, 'mqtt_cloud_password');
  try {
    syncService.init(db);
    syncService.connect({
      host: host.trim(),
      port: Number.isFinite(port) && port > 0 ? port : 1883,
      merchantId: tenantId,
      machineId: machineId.trim(),
      apiBaseUrl: apiBaseUrl.trim(),
      accessToken: accessToken.trim(),
      clientId: clientId || undefined,
      username: username || undefined,
      password: password || undefined,
    });
    console.log('[Cloud] MQTT reconnect attempted from stored settings');
    return true;
  } catch (e) {
    console.error('[Cloud] MQTT reconnect from DB failed:', e);
    return false;
  }
}

/**
 * Restore MQTT from SQLite after restart (`sync-connect` runs only during pairing).
 * If tenant id is missing locally, backfill once from GET /machines/me (no polling).
 */
function backfillTenantIdFromCloudOnce(db: any): void {
  if (tenantBackfillInFlight) return;
  if (!isSqliteOpen(db)) return;
  tenantBackfillInFlight = true;
  try {
    syncService.init(db);
  } catch (e) {
    tenantBackfillInFlight = false;
    console.warn('[Cloud] sync init before tenant backfill failed:', e);
    return;
  }
  syncService.cloudJson('GET', '/machines/me', null, (err, _status, data) => {
    tenantBackfillInFlight = false;
    if (err) {
      if (!cloudTenantMissingLogged) {
        cloudTenantMissingLogged = true;
        console.warn('[Cloud] /machines/me backfill failed:', err.message);
      }
      return;
    }
    const ctx = parseMachineMeResponse(data);
    if (ctx.tenantId || ctx.shopId) {
      try {
        if (isSqliteOpen(db)) {
          persistMachineContextMain(db, ctx);
          cloudTenantMissingLogged = false;
        }
      } catch (e) {
        console.warn('[Cloud] failed to persist tenant backfill:', e);
      }
    }
    const tenantId = readMqttTenantIdMain(db);
    if (tenantId) {
      _doConnectMqttFromSettings(db);
      return;
    }
    if (!cloudTenantMissingLogged) {
      cloudTenantMissingLogged = true;
      console.warn(
        '[Cloud] Paired but cloud_tenant_id is missing — re-pair or assign tenant in dashboard',
      );
    }
  });
}

function tryReconnectCloudMqttFromDb(db: any): void {
  if (!isCloudSyncEnabledMain(db)) return;
  const host = readSettingMain(db, 'mqtt_cloud_host');
  const machineId = readSettingMain(db, 'cloud_machine_id');
  const apiBaseUrl = readSettingMain(db, 'cloud_api_base');
  const accessToken = readSettingMain(db, 'cloud_access_token');
  if (!host?.trim() || !machineId?.trim() || !apiBaseUrl?.trim() || !accessToken?.trim()) {
    return;
  }

  const tenantId = readMqttTenantIdMain(db);
  if (!tenantId) {
    backfillTenantIdFromCloudOnce(db);
    return;
  }

  _doConnectMqttFromSettings(db);
}

function productToCloudPostPayload(product: any): Record<string, unknown> {
  return {
    name: product.name,
    description: product.description ?? null,
    price: Number(product.price),
    sku: product.sku,
    categoryId: product.categoryId,
    imageUrl: product.imageUrl ?? null,
    inStock: !!product.inStock,
    isAvailable: product.isAvailable !== false,
    stockQuantity: 0,
    barcode: product.barcode ?? null,
    taxRate: product.taxRate != null ? Number(product.taxRate) : null,
    catalogLevel: 'global',
  };
}

function productToCloudPutPayload(product: any): Record<string, unknown> {
  return {
    name: product.name,
    description: product.description ?? null,
    price: Number(product.price),
    sku: product.sku,
    categoryId: product.categoryId,
    imageUrl: product.imageUrl ?? null,
    inStock: !!product.inStock,
    isAvailable: product.isAvailable !== false,
    stockQuantity: 0,
    barcode: product.barcode ?? null,
    taxRate: product.taxRate != null ? Number(product.taxRate) : null,
  };
}

function categoryToCloudPostPayload(category: any): Record<string, unknown> {
  return {
    name: category.name,
    description: category.description ?? null,
    color: category.color ?? null,
    imageUrl: category.imageUrl ?? null,
    parentId: category.parentId ?? null,
    isActive: !!category.isActive,
    sortOrder: Number(category.sortOrder || 0),
    catalogLevel: 'global',
  };
}

function categoryToCloudPutPayload(category: any): Record<string, unknown> {
  return {
    name: category.name,
    description: category.description ?? null,
    color: category.color ?? null,
    imageUrl: category.imageUrl ?? null,
    parentId: category.parentId ?? null,
    isActive: !!category.isActive,
    sortOrder: Number(category.sortOrder || 0),
  };
}

function getAllUsers(db: any): any[] {
  const rows = db.prepare('SELECT * FROM users ORDER BY name').all();
  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

function saveUser(db: any, user: any): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO users 
    (id, name, email, role, isActive, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    user.id,
    user.name,
    user.email,
    user.role,
    user.isActive ? 1 : 0,
    user.createdAt,
    user.updatedAt
  );
}

function loadTransactionWithRelations(db: any, row: any): any {
  // Load customer
  let customer = undefined;
  if (row.customerId) {
    const customerRow = db.prepare('SELECT * FROM customers WHERE id = ?').get(row.customerId);
    if (customerRow) {
      customer = {
        id: customerRow.id,
        name: customerRow.name,
        email: customerRow.email || undefined,
        phone: customerRow.phone || undefined,
        address: customerRow.address ? JSON.parse(customerRow.address) : undefined,
        loyaltyPoints: customerRow.loyaltyPoints,
        createdAt: customerRow.createdAt,
        updatedAt: customerRow.updatedAt,
      };
    }
  }
  
  // Load cashier
  const cashierRow = db.prepare('SELECT * FROM users WHERE id = ?').get(row.cashierId);
  const cashier = {
    id: cashierRow.id,
    name: cashierRow.name,
    email: cashierRow.email,
    role: cashierRow.role,
    isActive: cashierRow.isActive === 1,
    createdAt: cashierRow.createdAt,
    updatedAt: cashierRow.updatedAt,
  };
  
  // Load cart items
  const itemRows = db.prepare('SELECT * FROM transaction_items WHERE transactionId = ?').all(row.id);
  const products = getAllProducts(db);
  const items = itemRows.map((itemRow: any) => {
    const product = products.find((p: any) => p.id === itemRow.productId);
    if (!product) {
      console.warn(`Product ${itemRow.productId} not found for transaction ${row.id}`);
      return null;
    }
    
    return {
      id: itemRow.id,
      productId: itemRow.productId,
      product: {
        ...product,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
      quantity: itemRow.quantity,
      unitPrice: itemRow.unitPrice,
      totalPrice: itemRow.totalPrice,
      discount: itemRow.discount || undefined,
      discountType: itemRow.discountType || undefined,
      notes: itemRow.notes || undefined,
      transactionType: itemRow.transactionType || undefined,
      lineDiscount: itemRow.lineDiscount || undefined,
    };
  }).filter(Boolean);
  
  // Calculate cart totals
  // All prices are tax-inclusive, so we need to extract tax from them
  // Get global tax rate from settings
  const taxRateStr = getSetting(db, 'globalTaxRate');
  const taxRate = taxRateStr ? parseFloat(taxRateStr) / 100 : 0.18; // Israel standard VAT 18%
  
  // Total with tax (all prices are tax-inclusive)
  const totalWithTax = items.reduce((sum: number, item: any) => sum + item.totalPrice, 0);
  const discountAmount = items.reduce((sum: number, item: any) => sum + (item.discount || 0), 0);
  const discountedTotalWithTax = totalWithTax - discountAmount;
  
  // Extract tax from tax-inclusive price
  // subtotal = price / (1 + taxRate)
  // taxAmount = price - subtotal
  const subtotal = discountedTotalWithTax / (1 + taxRate);
  const taxAmount = discountedTotalWithTax - subtotal;
  const totalAmount = discountedTotalWithTax; // Total is already tax-inclusive
  
  const cart = {
    id: row.id,
    items,
    subtotal,
    taxAmount,
    discountAmount,
    totalAmount,
    customerId: row.customerId || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  
  return {
    id: row.id,
    transactionNumber: row.transactionNumber,
    cart,
    customer,
    status: row.status,
    receiptUrl: row.receiptUrl || undefined,
    notes: row.notes || undefined,
    cashier,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    documentType: row.documentType,
    documentProductionDate: row.documentProductionDate || row.createdAt,
    branchId: row.branchId || undefined,
    documentDiscount: row.documentDiscount || undefined,
    whtDeduction: row.whtDeduction || undefined,
    amountTendered: row.amountTendered || undefined,
    changeAmount: row.changeAmount || undefined,
    refundOfTransactionId: row.refundOfTransactionId || undefined,
    paymentMethod: row.paymentMethod || undefined,
    nayaxMeta: row.nayaxMeta || undefined,
    tipAmount: row.tipAmount ?? undefined,
    tipPaymentMethod: row.tipPaymentMethod || undefined,
    issuedVouchers: getIssuedVouchersForTransaction(db, row.id),
  };
}

function getTodaysTransactions(db: any): any[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const rows = db.prepare(`
    SELECT * FROM transactions 
    WHERE datetime(createdAt) >= datetime(?) AND datetime(createdAt) < datetime(?)
    ORDER BY createdAt DESC
  `).all(today.toISOString(), tomorrow.toISOString());
  
  return rows.map((row: any) => loadTransactionWithRelations(db, row));
}

function getTransactionsByDateRange(db: any, startDate: string, endDate: string): any[] {
  const rows = db.prepare(`
    SELECT * FROM transactions 
    WHERE datetime(createdAt) >= datetime(?) AND datetime(createdAt) <= datetime(?)
    ORDER BY createdAt DESC
  `).all(startDate, endDate);
  
  return rows.map((row: any) => loadTransactionWithRelations(db, row));
}

function getTransactionsPage(db: any, options: any): { transactions: any[]; total: number } {
  const { startDate, endDate, limit = 50, offset = 0, status, searchQuery } = options;
  
  // Build WHERE clause and params
  let whereClause = '1=1';
  const params: any[] = [];
  
  if (startDate) {
    whereClause += ' AND datetime(transactions.createdAt) >= datetime(?)';
    params.push(startDate);
  }
  
  if (endDate) {
    whereClause += ' AND datetime(transactions.createdAt) <= datetime(?)';
    params.push(endDate);
  }
  
  if (status) {
    whereClause += ' AND transactions.status = ?';
    params.push(status);
  }
  
  // Add search conditions
  if (searchQuery && searchQuery.trim()) {
    const searchTerm = `%${searchQuery.trim()}%`;
    whereClause += ` AND (
      transactions.transactionNumber LIKE ? OR
      customers.name LIKE ? OR
      users.name LIKE ?
    )`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  // Build JOIN clause (always needed for search, but also safe to include always)
  const joinClause = `
    LEFT JOIN customers ON transactions.customerId = customers.id
    LEFT JOIN users ON transactions.cashierId = users.id
  `;
  
  // Get total count with JOINs and search
  const countParams = [...params];
  const countStmt = db.prepare(`
    SELECT COUNT(DISTINCT transactions.id) as count 
    FROM transactions
    ${joinClause}
    WHERE ${whereClause}
  `);
  const countResult = countStmt.get(...countParams);
  const total = countResult.count;
  
  // Get paginated results with JOINs
  const selectParams = [...params, limit, offset];
  const rows = db.prepare(`
    SELECT DISTINCT transactions.* 
    FROM transactions
    ${joinClause}
    WHERE ${whereClause}
    ORDER BY transactions.createdAt DESC
    LIMIT ? OFFSET ?
  `).all(...selectParams);
  
  const transactions = rows.map((row: any) => loadTransactionWithRelations(db, row));
  
  return { transactions, total };
}

function getRefundsForOriginal(db: any, originalTransactionId: string): any[] {
  const rows = db
    .prepare(
      'SELECT * FROM transactions WHERE refundOfTransactionId = ? ORDER BY createdAt ASC',
    )
    .all(originalTransactionId);
  return rows.map((row: any) => loadTransactionWithRelations(db, row));
}

function saveTransaction(db: any, transaction: any): void {
  const trans = db.transaction(() => {
    // Resolve current open trading day so the cloud can group transactions per shift.
    const openDay = db.prepare("SELECT id FROM trading_days WHERE status = 'open' ORDER BY openedAt DESC").get() as
      | { id: string }
      | undefined;
    const tradingDayId = transaction.tradingDayId || (openDay ? openDay.id : null);

    // Save transaction
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO transactions 
      (id, transactionNumber, customerId, status, receiptUrl, notes, cashierId, documentType, 
       documentProductionDate, branchId, documentDiscount, whtDeduction, amountTendered, changeAmount, refundOfTransactionId, paymentMethod, nayaxMeta, tradingDayId, tipAmount, tipPaymentMethod, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      transaction.id,
      transaction.transactionNumber,
      transaction.customer?.id || null,
      transaction.status,
      transaction.receiptUrl || null,
      transaction.notes || null,
      transaction.cashier.id,
      transaction.documentType,
      transaction.documentProductionDate,
      transaction.branchId || null,
      transaction.documentDiscount || null,
      transaction.whtDeduction || null,
      transaction.amountTendered ?? null,
      transaction.changeAmount ?? null,
      transaction.refundOfTransactionId || null,
      transaction.paymentMethod || null,
      transaction.nayaxMeta || null,
      tradingDayId,
      transaction.tipAmount ?? 0,
      transaction.tipPaymentMethod || null,
      transaction.createdAt,
      transaction.updatedAt
    );
    
    // Delete old items
    db.prepare('DELETE FROM transaction_items WHERE transactionId = ?').run(transaction.id);
    
    // Save items
    const itemStmt = db.prepare(`
      INSERT INTO transaction_items 
      (id, transactionId, productId, quantity, unitPrice, totalPrice, discount, discountType, transactionType, lineDiscount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const item of transaction.cart.items) {
      itemStmt.run(
        item.id,
        transaction.id,
        item.productId,
        item.quantity,
        item.unitPrice,
        item.totalPrice,
        item.discount || null,
        item.discountType || null,
        item.transactionType || null,
        item.lineDiscount || null,
        item.notes || null
      );
    }

    if (transaction.issuedVouchers && transaction.issuedVouchers.length > 0) {
      saveIssuedVouchers(db, transaction.id, transaction.issuedVouchers);
    }
  });
  
  trans();
}

function updateTransactionStatus(db: any, transactionId: string, status: string): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE transactions SET status = ?, updatedAt = ? WHERE id = ?').run(status, now, transactionId);
}

function getBusinessInfo(db: any): any | null {
  const row = db.prepare('SELECT * FROM business_info WHERE id = 1').get();
  if (!row) return null;
  return {
    vatNumber: row.vatNumber,
    companyName: row.companyName,
    companyAddress: row.companyAddress,
    companyAddressNumber: row.companyAddressNumber,
    companyCity: row.companyCity,
    companyZip: row.companyZip,
    companyRegNumber: row.companyRegNumber,
    hasBranches: row.hasBranches === 1,
    branchId: row.branchId,
    updatedAt: row.updatedAt,
  };
}

function saveBusinessInfo(db: any, info: any): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO business_info 
    (id, vatNumber, companyName, companyAddress, companyAddressNumber, companyCity, companyZip, 
     companyRegNumber, hasBranches, branchId, updatedAt)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    info.vatNumber,
    info.companyName,
    info.companyAddress,
    info.companyAddressNumber,
    info.companyCity,
    info.companyZip,
    info.companyRegNumber || null,
    info.hasBranches ? 1 : 0,
    info.branchId || null,
    new Date().toISOString()
  );
}

function getSoftwareInfo(db: any): any | null {
  const row = db.prepare('SELECT * FROM software_info WHERE id = 1').get();
  if (!row) return null;
  return {
    registrationNumber: row.registrationNumber,
    name: row.name,
    version: row.version,
    manufacturerId: row.manufacturerId,
    manufacturerName: row.manufacturerName,
    softwareType: row.softwareType,
    updatedAt: row.updatedAt,
  };
}

function saveSoftwareInfo(db: any, info: any): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO software_info 
    (id, registrationNumber, name, version, manufacturerId, manufacturerName, softwareType, updatedAt)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    info.registrationNumber,
    info.name,
    info.version,
    info.manufacturerId,
    info.manufacturerName,
    info.softwareType,
    new Date().toISOString()
  );
}

function getSetting(db: any, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(db: any, key: string, value: string): void {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  stmt.run(key, value);
}

/** randomUUID exists from Node 15.6+; older Electron runtimes need randomBytes. */
function newIntegrationLogId(): string {
  const c = crypto as typeof import('crypto');
  if (typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  const buf = c.randomBytes(16);
  buf[6] = (buf[6]! & 0x0f) | 0x40;
  buf[8] = (buf[8]! & 0x3f) | 0x80;
  const hex = buf.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function insertIntegrationLog(
  db: any,
  entry: {
    type: string;
    method: string;
    requestJson: string;
    responseJson: string | null;
    outcome: string;
  }
): void {
  const id = newIntegrationLogId();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO integration_logs (id, type, method, requestJson, responseJson, outcome, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    entry.type,
    entry.method,
    entry.requestJson,
    entry.responseJson,
    entry.outcome,
    createdAt
  );
  console.log(
    `[integration_logs] type=${entry.type} method=${entry.method} outcome=${entry.outcome}`
  );
}

/** Fire-and-forget: abort RPC runs after tick; IPC returns immediately. */
function scheduleNayaxAbortTransactionOptimistic(
  db: any,
  conn: { host: string; port: number; path: string },
  vuid: string
): void {
  setImmediate(() => {
    void runNayaxAbortTransactionBackground(db, conn, vuid).catch((err) =>
      console.error('nayax abort (background):', err)
    );
  });
}

async function runNayaxAbortTransactionBackground(
  db: any,
  conn: { host: string; port: number; path: string },
  vuid: string
): Promise<void> {
  const services = ['ashrait', 'engine'] as const;
  let rpcResult: NayaxJsonRpcResult | null = null;
  let parsed: ReturnType<typeof parseAbortTransactionResult> | null = null;
  let usedService: string | null = null;

  for (const service of services) {
    const params = [service, { vuid }];
    const attemptId = `${vuid}-abort-${service}`;
    rpcResult = await callNayaxJsonRpc({
      host: conn.host,
      port: conn.port,
      path: conn.path,
      method: 'abortTransaction',
      params,
      id: attemptId,
      timeoutMs: DEFAULT_NAYAX_ABORT_RPC_TIMEOUT_MS,
    });
    parsed = parseAbortTransactionResult(rpcResult);
    if (parsed.ok) {
      usedService = service;
      break;
    }
  }

  const requestPayload = {
    endpoint: {
      host: conn.host,
      port: conn.port,
      path: normalizeNayaxPath(conn.path),
    },
    triedServices: services,
    usedService,
    optimisticBackground: true,
    jsonrpc: { method: 'abortTransaction', vuid },
  };
  const responseForLog =
    rpcResult && rpcResult.ok === true
      ? { ok: true as const, result: rpcResult.result, id: rpcResult.id }
      : rpcResult
        ? {
            ok: false as const,
            error: rpcResult.error,
            code: rpcResult.code,
            data: rpcResult.data,
          }
        : { ok: false as const, error: 'No abort attempt' };
  if (!parsed) {
    console.error('abortTransaction background: no parsed result');
    return;
  }
  try {
    insertIntegrationLog(db, {
      type: INTEGRATION_LOG_TYPE_NAYAX,
      method: 'abortTransaction',
      requestJson: JSON.stringify(requestPayload),
      responseJson: JSON.stringify(responseForLog),
      outcome: parsed.ok ? 'success' : 'error',
    });
  } catch (logErr) {
    console.error('insertIntegrationLog (abortTransaction background):', logErr);
  }
}

function getIntegrationLogs(
  db: any,
  options: { type?: string; limit?: number; offset?: number }
): { logs: any[]; total: number } {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const type = options.type;
  let where = '1=1';
  const params: any[] = [];
  if (type) {
    where = 'type = ?';
    params.push(type);
  }
  const totalRow = db
    .prepare(`SELECT COUNT(*) as c FROM integration_logs WHERE ${where}`)
    .get(...params) as { c: number };
  const rows = db
    .prepare(
      `SELECT id, type, method, requestJson, responseJson, outcome, createdAt
       FROM integration_logs WHERE ${where}
       ORDER BY datetime(createdAt) DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  return { logs: rows, total: totalRow.c };
}

function clearIntegrationLogs(db: any, type?: string): void {
  if (type) {
    db.prepare('DELETE FROM integration_logs WHERE type = ?').run(type);
  } else {
    db.prepare('DELETE FROM integration_logs').run();
  }
}

// Trading day functions
function loadTradingDayWithRelations(db: any, row: any): any {
  const openedByUser = db.prepare('SELECT * FROM users WHERE id = ?').get(row.openedBy);
  const closedByUser = row.closedBy ? db.prepare('SELECT * FROM users WHERE id = ?').get(row.closedBy) : null;
  
  return {
    id: row.id,
    dayDate: row.dayDate,
    openedAt: row.openedAt,
    closedAt: row.closedAt || undefined,
    openingCash: row.openingCash,
    closingCash: row.closingCash || undefined,
    expectedCash: row.expectedCash || undefined,
    actualCash: row.actualCash || undefined,
    discrepancy: row.discrepancy || undefined,
    openedBy: {
      id: openedByUser.id,
      name: openedByUser.name,
      email: openedByUser.email,
      role: openedByUser.role,
      isActive: openedByUser.isActive === 1,
      createdAt: openedByUser.createdAt,
      updatedAt: openedByUser.updatedAt,
    },
    closedBy: closedByUser ? {
      id: closedByUser.id,
      name: closedByUser.name,
      email: closedByUser.email,
      role: closedByUser.role,
      isActive: closedByUser.isActive === 1,
      createdAt: closedByUser.createdAt,
      updatedAt: closedByUser.updatedAt,
    } : undefined,
    status: row.status,
    zReportData: row.zReportData ? JSON.parse(row.zReportData) : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Local calendar YYYY-MM-DD (store business day consistently; avoid UTC shift from toISOString). */
function localCalendarYMD(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getCurrentTradingDay(db: any): any | null {
  const dayDate = localCalendarYMD(new Date());

  const row = db.prepare('SELECT * FROM trading_days WHERE dayDate = ? AND status = ?').get(dayDate, 'open');
  if (!row) return null;
  
  return loadTradingDayWithRelations(db, row);
}

function getTradingDayByDate(db: any, date: string): any | null {
  const row = db.prepare('SELECT * FROM trading_days WHERE dayDate = ?').get(date);
  if (!row) return null;
  
  return loadTradingDayWithRelations(db, row);
}

function getTradingDayById(db: any, id: string): any | null {
  const row = db.prepare('SELECT * FROM trading_days WHERE id = ?').get(id);
  if (!row) return null;
  return loadTradingDayWithRelations(db, row);
}

function getTradingDaysByDateRange(db: any, startDate: string, endDate: string): any[] {
  const rows = db.prepare(`
    SELECT * FROM trading_days 
    WHERE dayDate >= ? AND dayDate <= ?
    ORDER BY dayDate DESC
  `).all(startDate, endDate);
  
  return rows.map((row: any) => loadTradingDayWithRelations(db, row));
}

function openTradingDay(db: any, data: any): void {
  const stmt = db.prepare(`
    INSERT INTO trading_days 
    (id, dayDate, openedAt, openingCash, openedBy, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const now = new Date().toISOString();
  const dayDate = localCalendarYMD(new Date());

  stmt.run(
    data.id,
    dayDate,
    now,
    data.openingCash,
    data.openedBy,
    'open',
    now,
    now
  );
}

function closeTradingDay(db: any, id: string, data: any): void {
  const stmt = db.prepare(`
    UPDATE trading_days 
    SET closedAt = ?, closingCash = ?, expectedCash = ?, actualCash = ?, 
        discrepancy = ?, closedBy = ?, status = ?, zReportData = ?, updatedAt = ?
    WHERE id = ?
  `);
  
  const now = new Date().toISOString();
  
  stmt.run(
    now,
    data.closingCash,
    data.expectedCash,
    data.actualCash,
    data.discrepancy,
    data.closedBy,
    'closed',
    data.zReportData ? JSON.stringify(data.zReportData) : null,
    now,
    id
  );
}

// ============================================================================

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

// Only one POS instance — prevents duplicate windows/MQTT connections on Windows.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  }
});

let win: BrowserWindow | null;
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] || process.env['VITE_DEV_SERVER_HOST'] || 'http://localhost:5173';

function createWindow() {
  if (win && !win.isDestroyed()) {
    win.focus();
    return;
  }

  win = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Keep disabled for security
      contextIsolation: true, // Keep enabled for security
    },
    titleBarStyle: 'default',
    show: false,
    fullscreen: true, // Start in fullscreen mode
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
    // Ensure fullscreen after load
    if (win && !win.isFullScreen()) {
      win.setFullScreen(true);
    }
  });

  // In development, load from Vite dev server
  if (process.env.IS_DEV === 'true' || !app.isPackaged) {
    console.log('Development mode detected');
    console.log('VITE_DEV_SERVER_URL:', VITE_DEV_SERVER_URL);
    console.log('IS_DEV:', process.env.IS_DEV);
    console.log('app.isPackaged:', app.isPackaged);
    
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    console.log('Production mode - loading from file');
    win.loadFile(path.join(process.env.DIST!, 'index.html'));
  }

  win.once('ready-to-show', () => {
    win?.show();
  });

  win.on('closed', () => {
    win = null;
  });
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('before-quit', () => {
  shutdownDatabaseServicesBeforeReset();
  closeDatabaseMain();
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'pos-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
]);

app.whenReady().then(() => {
  protocol.handle('pos-asset', (request: { url: string }) => {
    try {
      const parsed = new URL(request.url);
      const entityType = parsed.hostname as 'product' | 'category';
      const entityId = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
      if (entityType !== 'product' && entityType !== 'category') {
        return new Response('Not found', { status: 404 });
      }
      const filePath = imageCacheService.resolveLocalFile(entityType, entityId);
      if (!filePath) {
        return new Response('Not found', { status: 404 });
      }
      const { pathToFileURL } = require('node:url');
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });

  createWindow();

  if (powerMonitor) {
    powerMonitor.on('suspend', () => {
      try {
        pauseDatabaseForSystemSleep();
      } catch (e) {
        console.warn('[DB] pause on sleep failed:', e);
      }
    });
    powerMonitor.on('resume', () => {
      scheduleResumeDatabaseAfterSystemWake();
    });
  }
  
  // Set application menu
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Sale',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            win?.webContents.send('menu-new-sale');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
});

// Handle IPC messages
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('app-restart', () => {
  app.relaunch();
  app.quit();
  return { success: true };
});

ipcMain.handle('quit-app', () => {
  // app.quit() triggers 'before-quit', which flushes and closes the database.
  app.quit();
  return { success: true };
});

ipcMain.handle('get-heebo-font-css', () => {
  if (!app.isPackaged) return '';
  const resourcesPath = getPackagedResourcesPath(
    app.getAppPath(),
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath,
  );
  return buildHeeboFontFaceCss(resourcesPath);
});

ipcMain.handle('show-message-box', async (event, options) => {
  const { dialog } = require('electron');
  const result = await dialog.showMessageBox(win!, options);
  return result;
});

// Printer IPC handlers
ipcMain.handle('get-printers', async () => {
  try {
    const printers = win!.webContents.getPrintersAsync ? 
      await win!.webContents.getPrintersAsync() : 
      win!.webContents.getPrinters();
    console.log('Available printers:', printers.map(p => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault })));
    return printers;
  } catch (error) {
    console.error('Error getting printers:', error);
    return [];
  }
});

// Debug print preview
ipcMain.handle('show-print-preview', async (event, printerName) => {
  try {
    const testContent = `
      <html>
        <head>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
              text-align: center;
            }
            .test-content {
              border: 2px solid #333;
              padding: 20px;
              margin: 20px auto;
              max-width: 300px;
            }
          </style>
        </head>
        <body>
          <div class="test-content">
            <h2>Print Preview</h2>
            <p><strong>Hello World!</strong></p>
            <p>Printer: ${printerName || 'Default'}</p>
            <p>Date: ${new Date().toLocaleString()}</p>
            <p>POS Desktop Application</p>
            <p>This is what will be printed</p>
          </div>
        </body>
      </html>
    `;

    const previewWindow = new BrowserWindow({
      width: 400,
      height: 500,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testContent)}`);
    return { success: true };
  } catch (error) {
    console.error('Error showing preview:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('print-test', async (event, printerName) => {
  try {
    console.log('Print test requested for printer:', printerName);
    
    // 80mm thermal roll layout (matches real receipts) so the test content
    // fits within the printable width instead of overflowing an A4 page.
    const testContent = `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: ${THERMAL_PRINTABLE_WIDTH_MM}mm auto; margin: 0; }
            @media print {
              body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            * { box-sizing: border-box; }
            body {
              font-family: Arial, Helvetica, sans-serif;
              font-size: 12pt;
              margin: 0;
              padding: 3mm;
              width: 100%;
              text-align: center;
            }
            .test-content {
              border: 2px solid #000;
              padding: 8px;
              margin: 0;
            }
            h2 { margin: 0 0 6px; font-size: 14pt; }
            p { margin: 4px 0; }
          </style>
        </head>
        <body>
          <div class="test-content">
            <h2>Test Print</h2>
            <p><strong>Hello World!</strong></p>
            <p>Printer: ${printerName || 'Default'}</p>
            <p>Date: ${new Date().toLocaleString()}</p>
            <p>POS Desktop Application</p>
            <p>Test successful!</p>
          </div>
        </body>
      </html>
    `;

    const targetPrinter =
      printerName && printerName !== 'default' ? printerName : undefined;
    console.log('Sending test print to printer:', targetPrinter || '(default)');
    return await printHtmlToPrinter(testContent, targetPrinter);
    
  } catch (error) {
    console.error('Error printing:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Printable width for an 80mm thermal roll. The paper is 80mm but the head can
 * only print ~72mm; using this as the page width (instead of 80mm) prevents the
 * right edge of receipts/test prints from being clipped.
 */
const THERMAL_PRINTABLE_WIDTH_MM = 72;

/**
 * Wait until the print document is actually renderable (images + fonts loaded,
 * layout committed via two rAFs) and return the rendered content height in CSS
 * pixels. Falls back to a fixed delay if evaluation fails. Prevents the blank
 * "empty paper" prints seen on Electron 36+ when print() runs before paint.
 */
async function waitForPrintReady(printWindow: BrowserWindow): Promise<number> {
  try {
    const height = await printWindow.webContents.executeJavaScript(`
      (async () => {
        await Promise.all([
          Promise.all(
            Array.from(document.images).map((img) =>
              img.complete
                ? Promise.resolve()
                : new Promise((r) => { img.onload = img.onerror = r; }),
            ),
          ),
          document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
        ]);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const b = document.body;
        const d = document.documentElement;
        return Math.max(
          b ? b.scrollHeight : 0,
          b ? b.offsetHeight : 0,
          d ? d.scrollHeight : 0,
          d ? d.offsetHeight : 0,
        );
      })()
    `);
    return typeof height === 'number' && height > 0 ? height : 0;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return 0;
  }
}

/** Print HTML content to a named printer (silent). Omits deviceName when printerName is empty. */
async function printHtmlToPrinter(
  html: string,
  printerName?: string,
): Promise<{ success: boolean; printed?: boolean; error?: string }> {
  if (!win) {
    return { success: false, error: 'Application window not ready' };
  }

  const printers = win.webContents.getPrintersAsync
    ? await win.webContents.getPrintersAsync()
    : win.webContents.getPrinters();
  if (!printers || printers.length === 0) {
    return { success: false, error: 'No printers found' };
  }

  const printWindow = new BrowserWindow({
    show: false,
    width: 400,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Electron 36 prints blank paper when the page isn't fully laid out/painted
    // and when no explicit pageSize is supplied (the print job ends up with an
    // empty content/page size). Wait for fonts + images, then measure the
    // rendered content so we can pass a concrete pageSize below.
    const contentHeightPx = await waitForPrintReady(printWindow);

    // A thermal head on an 80mm roll can only print ~72mm wide; edge-to-edge
    // printing is physically impossible, so the page width must be the PRINTABLE
    // width, not the paper width. Sizing the page to 80mm pushes the right side
    // of the content outside the printable region and it gets clipped. Keep this
    // in sync with THERMAL_PRINTABLE_WIDTH_MM used by the HTML templates.
    const MICRONS_PER_MM = 1000;
    const MICRONS_PER_PX = 25400 / 96; // 1px = 1/96in, 1in = 25400µm
    const pageWidthMicrons = Math.round(THERMAL_PRINTABLE_WIDTH_MM * MICRONS_PER_MM);
    const pageHeightMicrons = Math.max(
      Math.round((contentHeightPx || 0) * MICRONS_PER_PX),
      Math.round(40 * MICRONS_PER_MM),
    );

    const printOptions: Record<string, unknown> = {
      silent: true,
      printBackground: true,
      color: false,
      margin: { marginType: 'none' },
      landscape: false,
      pagesPerSheet: 1,
      collate: false,
      copies: 1,
      pageSize: { width: pageWidthMicrons, height: pageHeightMicrons },
    };

    if (printerName && printerName.trim()) {
      const match = printers.find((p: { name: string }) => p.name === printerName);
      if (!match) {
        return { success: false, error: `Printer not found: ${printerName}` };
      }
      printOptions.deviceName = printerName;
    }

    return await new Promise((resolve) => {
      printWindow.webContents.print(printOptions, (success, failureReason) => {
        // Give the spooler time to receive the job before tearing down the window.
        setTimeout(() => {
          try {
            printWindow.close();
          } catch {
            /* ignore */
          }
        }, 1000);
        if (success) {
          resolve({ success: true, printed: true });
        } else {
          resolve({
            success: false,
            error: failureReason || 'Print failed',
          });
        }
      });
    });
  } catch (error: any) {
    try {
      printWindow.close();
    } catch {
      /* ignore */
    }
    return { success: false, error: error.message || 'Print failed' };
  }
}

/** @deprecated Use printHtmlToPrinter without a name for OS default. */
async function printHtmlToDefaultPrinter(html: string) {
  return printHtmlToPrinter(html);
}

const INTEGRATION_LOG_TYPE_DRAWER = 'cash_drawer';

function buildDrawerKickHtml(cashierName: string, language: 'he' | 'en'): string {
  const title = language === 'he' ? 'פתיחת מגירה' : 'Cash drawer open';
  const when = new Date().toLocaleString(language === 'he' ? 'he-IL' : 'en-IL');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 12px; font-size: 12pt; }
  </style></head><body>
    <p><strong>${title}</strong></p>
    <p>${cashierName}</p>
    <p>${when}</p>
  </body></html>`;
}

ipcMain.handle('print-receipt', async (_event, payload: ReceiptPrintPayload & { printerName?: string }) => {
  try {
    if (!payload?.transaction?.cart?.items) {
      return { success: false, error: 'Invalid receipt payload' };
    }
    const html = buildReceiptHtml(payload);
    return await printHtmlToPrinter(html, payload.printerName);
  } catch (error: any) {
    console.error('[IPC] print-receipt error:', error);
    return { success: false, error: error.message || 'Failed to print receipt' };
  }
});

ipcMain.handle(
  'open-cash-drawer',
  async (
    _event,
    payload: { printerName?: string; cashierName?: string; language?: 'he' | 'en' },
  ) => {
    const db = getDatabaseMain();
    const printerName = (payload?.printerName || '').trim();
    const cashierName = (payload?.cashierName || '').trim() || 'Cashier';
    const language = payload?.language === 'en' ? 'en' : 'he';

    if (!printerName) {
      const err = 'Drawer printer not configured';
      try {
        insertIntegrationLog(db, {
          type: INTEGRATION_LOG_TYPE_DRAWER,
          method: 'open_manual',
          requestJson: JSON.stringify({ cashierName }),
          responseJson: JSON.stringify({ error: err }),
          outcome: 'error',
        });
      } catch {
        /* ignore */
      }
      return { success: false, error: err };
    }

    const html = buildDrawerKickHtml(cashierName, language);
    const result = await printHtmlToPrinter(html, printerName);
    try {
      insertIntegrationLog(db, {
        type: INTEGRATION_LOG_TYPE_DRAWER,
        method: 'open_manual',
        requestJson: JSON.stringify({ cashierName, printerName }),
        responseJson: JSON.stringify(result),
        outcome: result.success ? 'ok' : 'error',
      });
    } catch (logErr) {
      console.error('insertIntegrationLog (open-cash-drawer):', logErr);
    }
    return result;
  },
);

ipcMain.handle('print-voucher', async (_event, payload: VoucherPrintPayload) => {
  try {
    if (!payload?.issued?.id || !payload?.voucher?.name) {
      return { success: false, error: 'Invalid voucher payload' };
    }
    const html = buildVoucherHtml(payload);
    return await printHtmlToDefaultPrinter(html);
  } catch (error: any) {
    console.error('[IPC] print-voucher error:', error);
    return { success: false, error: error.message || 'Failed to print voucher' };
  }
});

ipcMain.handle('db-get-voucher', async (_event, voucherId: string) => {
  try {
    if (!dbInstance || !voucherId) return null;
    return getVoucherById(dbInstance, voucherId);
  } catch (error: any) {
    console.error('[IPC] db-get-voucher error:', error);
    return null;
  }
});

ipcMain.handle('increment-issued-voucher-reprint', async (_event, issuedId: string) => {
  try {
    if (!dbInstance || !issuedId) return null;
    return incrementIssuedVoucherReprint(dbInstance, issuedId);
  } catch (error: any) {
    console.error('[IPC] increment-issued-voucher-reprint error:', error);
    return null;
  }
});

ipcMain.handle('db-save-issued-vouchers', async (_event, transactionId: string, issued: any[]) => {
  try {
    const db = getDatabaseMain();
    saveIssuedVouchers(db, transactionId, issued);
    try {
      transactionSyncService.enqueueTransaction(transactionId);
    } catch (e) {
      console.error('[TxSync] enqueue after issued vouchers failed', e);
    }
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] db-save-issued-vouchers error:', error);
    return { success: false, error: error.message };
  }
});

// Tax Report IPC handlers
ipcMain.handle('get-available-drives', async () => {
  try {
    const drives: string[] = [];
    
    if (process.platform === 'win32') {
      // Windows: Get available drives
      const { execSync } = require('child_process');
      try {
        const output = execSync('wmic logicaldisk get name', { encoding: 'utf-8' });
        const lines = output.split('\n').filter(line => line.trim() && line.trim() !== 'Name');
        drives.push(...lines.map(line => line.trim()).filter(Boolean));
      } catch (error) {
        console.error('Error getting Windows drives:', error);
        // Fallback to common drives
        drives.push('C:', 'D:', 'E:', 'F:');
      }
    } else {
      // macOS/Linux: Use root directory or common paths
      drives.push('/');
    }
    
    return drives.length > 0 ? drives : ['C:'];
  } catch (error) {
    console.error('Error getting drives:', error);
    return ['C:'];
  }
});

ipcMain.handle('select-export-directory', async () => {
  try {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select Export Directory',
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    return result.filePaths[0];
  } catch (error) {
    console.error('Error selecting directory:', error);
    return null;
  }
});

ipcMain.handle('generate-tax-report', async (event, options) => {
  try {
    const { transactions, businessInfo, softwareInfo, taxReportConfig, dateRange, drive, useCustomPath, globalTaxRate } = options;
    const db = getDatabaseMain();
    // Use provided globalTaxRate or get from settings
    const taxRate = globalTaxRate || (() => {
      const taxRateStr = getSetting(db, 'globalTaxRate');
      return taxRateStr ? parseFloat(taxRateStr) : 18; // Israel standard VAT 18%
    })();
    
    // Import the tax report generator (we'll need to adapt it for Node.js)
    // For now, we'll implement the core logic here
    
    // Build directory structure: <drive>/OPENFRMT/<VAT8>.<YY>/<MMDDhhmm>/
    const vat8 = businessInfo.vatNumber.substring(0, 8).padStart(8, '0');
    const year = 'year' in dateRange 
      ? String(dateRange.year).slice(-2)
      : String(dateRange.start.getFullYear()).slice(-2);
    
    const now = new Date();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    
    // If custom path is used, create OPENFRMT structure under the custom path
    // Otherwise, use drive root
    const baseDir = useCustomPath 
      ? path.join(drive, 'OPENFRMT')
      : path.join(drive, 'OPENFRMT');
    
    const businessDir = path.join(baseDir, `${vat8}.${year}`);
    const timestampDir = path.join(businessDir, `${MM}${DD}${hh}${mm}`);
    
    // Handle minute collision - if directory exists, increment minute
    let finalDir = timestampDir;
    let counter = 0;
    while (fs.existsSync(finalDir) && counter < 60) {
      const newMinute = (parseInt(mm) + counter + 1) % 60;
      const newMinuteStr = String(newMinute).padStart(2, '0');
      finalDir = path.join(businessDir, `${MM}${DD}${hh}${newMinuteStr}`);
      counter++;
    }
    
    // Create directories
    fs.mkdirSync(finalDir, { recursive: true });
    
    // Generate unique file ID
    const generateUniqueId = () => {
      const timestamp = Date.now().toString();
      const random = Math.floor(Math.random() * 1000).toString();
      return (timestamp + random).slice(-15).padStart(15, '0');
    };
    
    const uniqueId = generateUniqueId();
    
    // Format helpers
    const padRight = (str: string, len: number, pad = ' ') => {
      return (str || '').padEnd(len, pad).substring(0, len);
    };
    
    const padLeft = (str: string, len: number, pad = '0') => {
      return (str || '').padStart(len, pad).substring(0, len);
    };

    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    };

    const formatTime = (date: Date) => {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}${minutes}`;
    };
    
    // Generate BKMVDATA.TXT
    const bkmvLines: string[] = [];
    let recordNumber = 1;
    const recordCounts: Record<string, number> = {
      A100: 0,
      B110: 0,
      C100: 0,
      D110: 0,
      D120: 0,
      M100: 0,
      Z900: 0,
    };

    const vatNorm = normalizeIsraeli9Digit(String(businessInfo.vatNumber ?? ''));

    const totalSales = transactions.reduce((s: number, t: any) => {
      if (t.status === 'cancelled') return s;
      return s + Math.abs(Number(t.cart?.totalAmount ?? 0));
    }, 0);

    // A100 - Opening record
    let a100 = 'A100';
    a100 += padLeft(recordNumber.toString(), 9, '0');
    a100 += padLeft(vatNorm, 9, '0');
    a100 += padLeft(uniqueId, 15, '0');
    a100 += '&OF1.31&';
    a100 += padRight('', 50);
    bkmvLines.push(a100);
    recordCounts.A100 = 1;
    recordNumber++;

    bkmvLines.push(
      buildB110Record(vatNorm, recordNumber, businessInfo, { periodSalesTotal: totalSales })
    );
    recordCounts.B110 = 1;
    recordNumber++;

    // Map transactions by id for refund→original lookup
    const txById = new Map<string, any>(transactions.map((t: any) => [t.id, t]));

    let documentLinkSeq = 0;

    // Process transactions (sales and refunds)
    for (const transaction of transactions) {
      documentLinkSeq += 1;
      const linkId7 = formatOpenFormatLinkId(documentLinkSeq);
      const isRefund = Boolean(transaction.refundOfTransactionId);
      const originalTx = isRefund ? txById.get(transaction.refundOfTransactionId) : null;
      // POS sales always use 320 (tax invoice/receipt) — type 400 does NOT support D110 item lines.
      // Refunds use 330 (credit note).
      const docType = isRefund ? 330 : 320;

      bkmvLines.push(
        buildC100Record(transaction, String(businessInfo.vatNumber ?? ''), recordNumber, linkId7, {
          docType,
          globalTaxRate: taxRate,
        })
      );
      recordCounts.C100++;
      recordNumber++;

      let lineNum = 1;
      for (const item of transaction.cart.items) {
        bkmvLines.push(
          buildD110Record(
            transaction,
            item,
            lineNum,
            String(businessInfo.vatNumber ?? ''),
            recordNumber,
            taxRate,
            linkId7,
            {
              docType,
              baseDocType: originalTx ? padLeft(String(originalTx.documentType), 3, '0') : undefined,
              baseDocNumber: originalTx?.transactionNumber,
              baseBranchId: originalTx?.branchId
                ? padRight(String(originalTx.branchId), 7).slice(0, 7)
                : undefined,
            }
          )
        );
        recordCounts.D110++;
        recordNumber++;
        lineNum++;
      }

      bkmvLines.push(
        buildD120Record(transaction, 1, String(businessInfo.vatNumber ?? ''), recordNumber, linkId7, {
          docType,
        })
      );
      recordCounts.D120++;
      recordNumber++;
    }

    for (const p of collectUniqueProductsForM100(transactions)) {
      bkmvLines.push(buildM100Record(vatNorm, recordNumber, p));
      recordCounts.M100++;
      recordNumber++;
    }

    // Z900 - Closing record
    const totalRecords = recordNumber;
    let z900 = 'Z900';
    z900 += padLeft(recordNumber.toString(), 9, '0');
    z900 += padLeft(vatNorm, 9, '0');
    z900 += padLeft(uniqueId, 15, '0');
    z900 += '&OF1.31&';
    z900 += padLeft(totalRecords.toString(), 15, '0');
    z900 += padRight('', 50);
    bkmvLines.push(z900);
    recordCounts.Z900 = 1;
    
    // Write BKMVDATA.TXT with ISO-8859-8-i encoding
    const bkmvPath = path.join(finalDir, 'BKMVDATA.TXT');
    const bkmvContent = bkmvLines.join('\r\n') + '\r\n';
    const bkmvBuffer = iconv.encode(bkmvContent, 'iso88598');
    fs.writeFileSync(bkmvPath, bkmvBuffer);
    
    // Compress BKMVDATA.TXT
    const zipPath = path.join(finalDir, 'BKMVDATA.zip');
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => resolve(undefined));
      archive.on('error', reject);
      
      archive.pipe(output);
      archive.file(bkmvPath, { name: 'BKMVDATA.TXT' });
      archive.finalize();
    });
    
    // Generate INI.TXT
    const processDate = new Date();
    const iniLines: string[] = [];
    
    // A000 record
    let a000 = 'A000';
    a000 += padRight('', 5);
    a000 += padLeft(totalRecords.toString(), 15, '0');
    a000 += padLeft(normalizeIsraeli9Digit(String(businessInfo.vatNumber ?? '')), 9, '0');
    a000 += padLeft(uniqueId, 15, '0');
    a000 += padRight(taxReportConfig.systemCode, 8);
    a000 += padLeft(softwareInfo.registrationNumber, 8, '0');
    a000 += padRight(softwareInfo.name, 20);
    a000 += padRight(softwareInfo.version, 20);
    a000 += padLeft(normalizeIsraeli9Digit(String(softwareInfo.manufacturerId ?? '')), 9, '0');
    a000 += padRight(softwareInfo.manufacturerName, 20);
    a000 += softwareInfo.softwareType === 'single-year' ? '1' : '2';
    a000 += padRight(path.join(businessDir, path.basename(finalDir)), 50);
    a000 += taxReportConfig.accountingType;
    a000 += taxReportConfig.balancingRequired ? '1' : '0';
    a000 += padLeft(normalizeIsraeli9Digit(String(businessInfo.companyRegNumber || '00000001')), 9, '0');
    a000 += padLeft(normalizeIsraeli9Digit(String(businessInfo.withholdingFileNumber || '00000000')), 9, '0');
    a000 += padRight('', 10);
    a000 += padRight(businessInfo.companyName, 50);
    a000 += padRight(businessInfo.companyAddress, 50);
    a000 += padRight(businessInfo.companyAddressNumber, 10);
    a000 += padRight(businessInfo.companyCity, 30);
    a000 += padRight(businessInfo.companyZip, 8);
    
    if ('year' in dateRange) {
      a000 += String(dateRange.year);
      a000 += String(dateRange.year) + '0101';
      const yearEnd = new Date(dateRange.year, 11, 31);
      const endCap = yearEnd > processDate ? processDate : yearEnd;
      a000 += formatDate(endCap);
    } else {
      a000 += String(dateRange.start.getFullYear());
      a000 += formatDate(dateRange.start);
      const end = dateRange.end > processDate ? processDate : dateRange.end;
      a000 += formatDate(end);
    }
    
    a000 += formatDate(processDate);
    a000 += formatTime(processDate);
    a000 += taxReportConfig.languageCode;
    a000 += taxReportConfig.charset;
    a000 += padRight(taxReportConfig.compressionSoftware, 20);
    a000 += taxReportConfig.defaultCurrency;
    a000 += businessInfo.hasBranches ? '1' : '0';
    a000 += padRight('', 466 - a000.length);
    iniLines.push(a000);
    
    // Summary records
    for (const [recordType, count] of Object.entries(recordCounts)) {
      if (count > 0) {
        iniLines.push(recordType + padLeft(count.toString(), 15, '0'));
      }
    }
    
    // Write INI.TXT (uncompressed)
    const iniPath = path.join(finalDir, 'INI.TXT');
    const iniContent = iniLines.join('\r\n') + '\r\n';
    const iniBuffer = iconv.encode(iniContent, 'iso88598');
    fs.writeFileSync(iniPath, iniBuffer);
    
    return {
      success: true,
      filePath: finalDir,
      recordCounts,
    };
  } catch (error: any) {
    console.error('Error generating tax report:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate tax report',
    };
  }
});

ipcMain.handle('print-report-summary', async (event, summary) => {
  try {
    const summaryContent = `
      <html>
        <head>
          <style>
            @media print {
              body { 
                font-family: Arial, sans-serif; 
                padding: 20px; 
                margin: 0;
                font-size: 12pt;
              }
            }
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
            }
            h1 { margin-top: 0; }
            .summary-item { margin: 10px 0; }
            .record-counts { margin-left: 20px; }
          </style>
        </head>
        <body>
          <h1>Tax Report Summary</h1>
          <div class="summary-item">
            <strong>Status:</strong> ${summary.success ? 'Success' : 'Failed'}
          </div>
          ${summary.filePath ? `<div class="summary-item"><strong>File Path:</strong> ${summary.filePath}</div>` : ''}
          ${summary.recordCounts ? `
            <div class="summary-item">
              <strong>Record Counts:</strong>
              <ul class="record-counts">
                ${Object.entries(summary.recordCounts).map(([type, count]) => `<li>${type}: ${count}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          <div class="summary-item">
            <strong>Generated:</strong> ${new Date().toLocaleString()}
          </div>
        </body>
      </html>
    `;

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(summaryContent)}`);
    await waitForPrintReady(printWindow);

    return new Promise((resolve) => {
      printWindow.webContents.print(
        { silent: true, printBackground: true, pageSize: 'A4' },
        (success) => {
          setTimeout(() => {
            try {
              printWindow.close();
            } catch {
              /* ignore */
            }
          }, 1000);
          resolve({ success, printed: success });
        },
      );
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Database IPC handlers

ipcMain.handle('get-database-path', async () => {
  try {
    return getResolvedDatabasePathMain();
  } catch (error: any) {
    console.error('Error getting database path:', error);
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'database', 'pos.db');
  }
});

ipcMain.handle('set-database-path', async (event, dbPath: string) => {
  try {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'settings.json');
    
    let settings: any = {};
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
    
    settings.databasePath = dbPath;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    
    return { success: true };
  } catch (error: any) {
    console.error('Error setting database path:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('initialize-database', async (event, dbPath: string) => {
  try {
    initializeDatabaseMain(dbPath);
    return { success: true, path: dbPath };
  } catch (error: any) {
    console.error('Error initializing database:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('database-exists', async (event, dbPath: string) => {
  try {
    return fs.existsSync(dbPath);
  } catch (error: any) {
    return false;
  }
});

ipcMain.handle('backup-database', async (event, dbPath: string) => {
  try {
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: 'Database file does not exist' };
    }
    
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `pos-backup-${timestamp}.db`);
    
    fs.copyFileSync(dbPath, backupPath);
    
    return { success: true, backupPath };
  } catch (error: any) {
    console.error('Error backing up database:', error);
    return { success: false, error: error.message };
  }
});

/** Delete SQLite files, recreate empty schema. Disconnects MQTT/sync first. */
ipcMain.handle('reset-database', async (_event, targetPath?: string) => {
  try {
    const dbPath =
      targetPath && String(targetPath).trim() ? String(targetPath).trim() : getResolvedDatabasePathMain();
    shutdownDatabaseServicesBeforeReset();
    closeDatabaseMain();
    deleteDatabaseFilesOnDisk(dbPath);
    initializeDatabaseMain(dbPath);
    return { success: true, path: dbPath };
  } catch (error: any) {
    console.error('Error resetting database:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-database-path', async () => {
  try {
    const result = await dialog.showSaveDialog(win!, {
      title: 'Select Database Location',
      defaultPath: 'pos.db',
      filters: [
        { name: 'SQLite Database', extensions: ['db'] },
        { name: 'All Files', extensions: ['*'] }
      ],
    });
    
    if (result.canceled || !result.filePath) {
      return null;
    }
    
    return result.filePath;
  } catch (error: any) {
    console.error('Error selecting database path:', error);
    return null;
  }
});

// Database operation IPC handlers
ipcMain.handle('db-get-products', async () => {
  try {
    const db = getDatabaseMain();
    return getAllProducts(db);
  } catch (error: any) {
    console.error('Error getting products:', error);
    return [];
  }
});

ipcMain.handle('db-save-product', async (event, product: any) => {
  try {
    const db = getDatabaseMain();
    syncService.init(db);
    if (isCloudSyncEnabledMain(db) && syncService.readCloudHttpConfigFromDb()) {
      const cfg = syncService.readCloudHttpConfigFromDb()!;
      const cloudId = product.cloud_id || product.cloudId;
      const relPath = cloudId
        ? `/sync/${cfg.machineId}/products/${cloudId}`
        : `/sync/${cfg.machineId}/products`;
      const method = cloudId ? 'PUT' : 'POST';
      const body = cloudId ? productToCloudPutPayload(product) : productToCloudPostPayload(product);
      return await new Promise((resolve) => {
        syncService.cloudJson(method, relPath, body, (err: Error | null) => {
          if (err) {
            console.error('[Cloud] save product failed:', err.message);
            return resolve({ success: false, error: err.message });
          }
          syncService.pullCatalog();
          resolve({ success: true });
        });
      });
    }
    saveProduct(db, product);
    return { success: true };
  } catch (error: any) {
    console.error('Error saving product:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-categories', async () => {
  try {
    const db = getDatabaseMain();
    return getAllCategories(db);
  } catch (error: any) {
    console.error('Error getting categories:', error);
    return [];
  }
});

ipcMain.handle('db-save-category', async (event, category: any) => {
  try {
    const db = getDatabaseMain();
    syncService.init(db);
    if (isCloudSyncEnabledMain(db) && syncService.readCloudHttpConfigFromDb()) {
      const cfg = syncService.readCloudHttpConfigFromDb()!;
      const cloudId = category.cloud_id || category.cloudId;
      const relPath = cloudId
        ? `/sync/${cfg.machineId}/categories/${cloudId}`
        : `/sync/${cfg.machineId}/categories`;
      const method = cloudId ? 'PUT' : 'POST';
      const body = cloudId ? categoryToCloudPutPayload(category) : categoryToCloudPostPayload(category);
      return await new Promise((resolve) => {
        syncService.cloudJson(method, relPath, body, (err: Error | null) => {
          if (err) {
            console.error('[Cloud] save category failed:', err.message);
            return resolve({ success: false, error: err.message });
          }
          syncService.pullCatalog();
          resolve({ success: true });
        });
      });
    }
    saveCategory(db, category);
    return { success: true };
  } catch (error: any) {
    console.error('Error saving category:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-users', async () => {
  try {
    const db = getDatabaseMain();
    return getAllUsers(db);
  } catch (error: any) {
    console.error('Error getting users:', error);
    return [];
  }
});

ipcMain.handle('db-save-user', async (event, user: any) => {
  try {
    const db = getDatabaseMain();
    saveUser(db, user);
    return { success: true };
  } catch (error: any) {
    console.error('Error saving user:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-todays-transactions', async () => {
  try {
    const db = getDatabaseMain();
    return getTodaysTransactions(db);
  } catch (error: any) {
    console.error('Error getting today\'s transactions:', error);
    return [];
  }
});

ipcMain.handle('db-get-transactions-by-date-range', async (event, startDate: string, endDate: string) => {
  try {
    const db = getDatabaseMain();
    return getTransactionsByDateRange(db, startDate, endDate);
  } catch (error: any) {
    console.error('Error getting transactions by date range:', error);
    return [];
  }
});

ipcMain.handle('db-get-transactions-page', async (event, options: any) => {
  try {
    const db = getDatabaseMain();
    return getTransactionsPage(db, options);
  } catch (error: any) {
    console.error('Error getting transactions page:', error);
    return { transactions: [], total: 0 };
  }
});

ipcMain.handle('db-get-refunds-for-original', async (_event, originalTransactionId: string) => {
  try {
    const db = getDatabaseMain();
    if (!originalTransactionId) return [];
    return getRefundsForOriginal(db, originalTransactionId);
  } catch (error: any) {
    console.error('Error getting refunds for original transaction:', error);
    return [];
  }
});

ipcMain.handle('db-delete-all-transactions', async () => {
  try {
    const db = getDatabaseMain();
    db.prepare('UPDATE transactions SET refundOfTransactionId = NULL WHERE refundOfTransactionId IS NOT NULL').run();
    const info = db.prepare('DELETE FROM transactions').run();
    return { success: true, deleted: info.changes };
  } catch (error: any) {
    console.error('Error deleting all transactions:', error);
    return { success: false, error: error.message };
  }
});

function getEffectiveOnHand(db: any, productId: string): number | null {
  const product = db.prepare('SELECT id, track_stock FROM products WHERE id = ?').get(productId) as
    | { id: string; track_stock?: number }
    | undefined;
  if (!product || product.track_stock !== 1) return null;

  const level = db
    .prepare('SELECT base_quantity FROM stock_levels WHERE product_id = ?')
    .get(productId) as { base_quantity?: number } | undefined;
  const base = level?.base_quantity ?? 0;

  const unsynced = db
    .prepare(
      'SELECT COALESCE(SUM(delta), 0) AS total FROM stock_movements WHERE product_id = ? AND synced = 0',
    )
    .get(productId) as { total?: number } | undefined;
  return base + (unsynced?.total ?? 0);
}

function applySaleStockMovements(db: any, transaction: any): void {
  if (!transaction?.cart?.items?.length) return;
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO stock_movements
    (id, product_id, delta, reason, transaction_id, transaction_item_id, synced, occurred_at, created_at)
    VALUES (?, ?, ?, 'sale', ?, ?, 0, ?, ?)
  `);

  for (const item of transaction.cart.items) {
    const pid = item.productId || item.product?.id;
    if (!pid) continue;
    const product = db.prepare('SELECT track_stock FROM products WHERE id = ?').get(pid) as
      | { track_stock?: number }
      | undefined;
    if (!product || product.track_stock !== 1) continue;

    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;
    const movementId = newIntegrationLogId();
    insert.run(
      movementId,
      pid,
      -qty,
      transaction.id,
      item.id ?? null,
      transaction.createdAt || now,
      now,
    );
  }
}

function applyRefundStockMovements(db: any, transaction: any): void {
  if (!transaction?.cart?.items?.length || !transaction.refundOfTransactionId) return;
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO stock_movements
    (id, product_id, delta, reason, transaction_id, transaction_item_id, synced, occurred_at, created_at)
    VALUES (?, ?, ?, 'refund', ?, ?, 0, ?, ?)
  `);

  for (const item of transaction.cart.items) {
    const pid = item.productId || item.product?.id;
    if (!pid) continue;
    const product = db.prepare('SELECT track_stock FROM products WHERE id = ?').get(pid) as
      | { track_stock?: number }
      | undefined;
    if (!product || product.track_stock !== 1) continue;

    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;
    const movementId = newIntegrationLogId();
    insert.run(
      movementId,
      pid,
      qty,
      transaction.id,
      item.id ?? null,
      transaction.createdAt || now,
      now,
    );
  }
}

function checkStockForAdd(
  db: any,
  productId: string,
  quantity: number,
): { allowed: boolean; warn?: boolean; onHand?: number | null } {
  const onHand = getEffectiveOnHand(db, productId);
  if (onHand === null) return { allowed: true, onHand: null };

  const policyRow = db.prepare("SELECT value FROM settings WHERE key = 'outOfStockPolicy'").get() as
    | { value?: string }
    | undefined;
  const policy = policyRow?.value || 'allow';

  if (onHand - quantity >= 0) {
    return { allowed: true, onHand };
  }
  if (policy === 'block') {
    return { allowed: false, onHand };
  }
  if (policy === 'warn') {
    return { allowed: true, warn: true, onHand };
  }
  return { allowed: true, onHand };
}

ipcMain.handle('db-check-stock-for-add', async (_event, productId: string, quantity: number) => {
  try {
    const db = getDatabaseMain();
    return { success: true, ...checkStockForAdd(db, productId, quantity) };
  } catch (error: any) {
    return { success: false, allowed: true, error: error.message };
  }
});

ipcMain.handle('db-get-effective-on-hand', async (_event, productId: string) => {
  try {
    const db = getDatabaseMain();
    return { success: true, onHand: getEffectiveOnHand(db, productId) };
  } catch (error: any) {
    return { success: false, onHand: null, error: error.message };
  }
});

ipcMain.handle('db-save-transaction', async (event, transaction: any) => {
  try {
    const db = getDatabaseMain();
    // Convert dates to ISO strings for storage
    const tx = {
      ...transaction,
      createdAt: transaction.createdAt || new Date().toISOString(),
      updatedAt: transaction.updatedAt || new Date().toISOString(),
      documentProductionDate: transaction.documentProductionDate || new Date().toISOString(),
    };
    saveTransaction(db, tx);

    if (tx.status && tx.status !== 'pending') {
      try {
        if (tx.refundOfTransactionId) {
          applyRefundStockMovements(db, tx);
        } else {
          applySaleStockMovements(db, tx);
        }
      } catch (e) {
        console.error('[Stock] apply stock movements failed', e);
      }
    }

    // Real-time push: enqueue + nudge a flush. Skip business-pending rows (card capture in flight).
    if (tx.status && tx.status !== 'pending') {
      try {
        transactionSyncService.enqueueTransaction(tx.id);
      } catch (e) {
        console.error('[TxSync] enqueue after save failed', e);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error saving transaction:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-update-transaction-status', async (event, transactionId: string, status: string) => {
  try {
    const db = getDatabaseMain();
    updateTransactionStatus(db, transactionId, status);
    if (status && status !== 'pending') {
      try {
        transactionSyncService.enqueueTransaction(transactionId);
      } catch (e) {
        console.error('[TxSync] enqueue after status update failed', e);
      }
    }
    return { success: true };
  } catch (error: any) {
    console.error('Error updating transaction status:', error);
    return { success: false, error: error.message };
  }
});

// ── Cloud sync: outbox stats + manual flush + Z-close cloud barrier ────────────

ipcMain.handle('cloud-sync-stats', async () => {
  try {
    return { success: true, ...transactionSyncService.getStats() };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cloud-sync-flush', async () => {
  try {
    const r = await transactionSyncService.flushOutbox();
    return { success: r.ok, flushed: r.flushed, error: r.reason };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

/** Renderer signals it just observed `online` — drain the outbox right away. */
ipcMain.handle('cloud-sync-online-hint', async () => {
  try {
    transactionSyncService.scheduleFlush();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

/**
 * Hard barrier Z-close. Renderer passes the full Z payload + the list of expected
 * transaction ids so the server can verify nothing is missing.
 *
 * Returns:
 *   { success: true, status: 'accepted'|'duplicate' }  → renderer can write trading_days locally + purge
 *   { success: false, error }                           → leave day open, surface error
 */
ipcMain.handle('cloud-z-close', async (_event, zPayload: Record<string, unknown>) => {
  try {
    const r = await transactionSyncService.closeDayWithCloud(zPayload);
    if (r.ok) return { success: true, status: r.status, zReportId: r.zReportId };
    return { success: false, error: r.error, missingIds: r.missingIds, httpStatus: r.httpStatus };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle(
  'cloud-close-day-ack',
  async (
    _event,
    payload: {
      requestId: string;
      phase: 'received' | 'completed' | 'failed';
      zReportId?: string;
      errorCode?: string;
      errorMessage?: string;
    },
  ) => {
    try {
      const r = await transactionSyncService.postCloseDayAck(payload);
      if (r.ok) return { success: true };
      return { success: false, error: r.error };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
);

/** Purge a closed day's local transactions (called after successful Z save). */
ipcMain.handle('cloud-purge-closed-day', async (_event, tradingDayId: string) => {
  try {
    const r = transactionSyncService.purgeClosedDay(tradingDayId);
    return { success: true, deleted: r.deleted };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// ── POS users (sync + auth) ───────────────────────────────────────────────────

/** Renderer-triggered "Sync now" for pos users (Settings, Onboarding). */
ipcMain.handle('pos-users-sync-now', async () => {
  try {
    const r = await posUserSyncService.pullPosUsersImmediate();
    return r;
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
});

/** Tile-grid data for the login screen. Never includes pinHash. */
ipcMain.handle('pos-users-list-for-shop', async () => {
  try {
    return { success: true, users: authService.listForCurrentShop() };
  } catch (error: any) {
    return { success: false, error: error.message, users: [] };
  }
});

/** Verify a PIN locally. */
ipcMain.handle('pos-user-login', async (_event, pin: string) => {
  try {
    return authService.verifyPin(String(pin || ''));
  } catch (error: any) {
    return { ok: false, reason: 'invalid_pin' as const, error: error.message };
  }
});

/** Onboarding gate: do we have at least one active POS user locally? */
ipcMain.handle('pos-users-has-any', async () => {
  try {
    return { success: true, hasAny: posUserSyncService.hasAnyActive() };
  } catch (error: any) {
    return { success: false, hasAny: false, error: error.message };
  }
});

ipcMain.handle('settings-sync-now', async () => {
  try {
    return await settingsSyncService.pullSettingsImmediate();
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('db-get-business-info', async () => {
  try {
    const db = getDatabaseMain();
    return getBusinessInfo(db);
  } catch (error: any) {
    console.error('Error getting business info:', error);
    return null;
  }
});

ipcMain.handle('db-save-business-info', async (event, info: any) => {
  try {
    const db = getDatabaseMain();
    saveBusinessInfo(db, info);
    return { success: true };
  } catch (error: any) {
    console.error('Error saving business info:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-software-info', async () => {
  try {
    const db = getDatabaseMain();
    return getSoftwareInfo(db);
  } catch (error: any) {
    console.error('Error getting software info:', error);
    return null;
  }
});

ipcMain.handle('db-save-software-info', async (event, info: any) => {
  try {
    const db = getDatabaseMain();
    saveSoftwareInfo(db, info);
    return { success: true };
  } catch (error: any) {
    console.error('Error saving software info:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-setting', async (event, key: string) => {
  try {
    const db = getDatabaseMain();
    return getSetting(db, key);
  } catch (error: any) {
    // If database is not initialized, return null (default value)
    if (error.message === 'Database not initialized') {
      console.warn('Database not initialized when getting setting:', key);
      return null;
    }
    console.error('Error getting setting:', error);
    return null;
  }
});

ipcMain.handle('db-save-setting', async (event, key: string, value: string) => {
  try {
    const db = getDatabaseMain();
    setSetting(db, key, value);
    return { success: true };
  } catch (error: any) {
    // If database is not initialized, return error
    if (error.message === 'Database not initialized') {
      console.warn('Database not initialized when saving setting:', key);
      return { success: false, error: 'Database not initialized' };
    }
    console.error('Error saving setting:', error);
    return { success: false, error: error.message };
  }
});

function getNayaxConnectionFromDb(db: any): { host: string; port: number; path: string } | { error: string } {
  const hostRaw = getSetting(db, 'nayaxDeviceHost');
  const host = typeof hostRaw === 'string' ? hostRaw.trim() : '';
  if (!host) {
    return { error: 'Nayax device host is not configured' };
  }
  if (!validateNayaxHost(host)) {
    return { error: 'Invalid Nayax device host' };
  }
  const port = parseNayaxPort(getSetting(db, 'nayaxDevicePort'));
  const pathStr = normalizeNayaxPath(getSetting(db, 'nayaxSpicyPath'));
  return { host, port, path: pathStr };
}

ipcMain.handle('nayax-test-connection', async () => {
  try {
    const db = getDatabaseMain();
    const conn = getNayaxConnectionFromDb(db);
    if ('error' in conn) {
      return { ok: false as const, error: conn.error };
    }
    const requestPayload = {
      endpoint: {
        host: conn.host,
        port: conn.port,
        path: normalizeNayaxPath(conn.path),
      },
      jsonrpc: { method: 'getInfo', params: ['device'] },
    };
    const result = await callNayaxJsonRpc({
      host: conn.host,
      port: conn.port,
      path: conn.path,
      method: 'getInfo',
      params: ['device'],
      id: `test-${Date.now()}`,
      timeoutMs: DEFAULT_NAYAX_TEST_TIMEOUT_MS,
    });
    const responsePayload = result.ok
      ? { ok: true as const, result: result.result }
      : {
          ok: false as const,
          error: result.error,
          code: result.code,
          data: result.data,
        };
    try {
      insertIntegrationLog(db, {
        type: INTEGRATION_LOG_TYPE_NAYAX,
        method: 'getInfo',
        requestJson: JSON.stringify(requestPayload),
        responseJson: JSON.stringify(responsePayload),
        outcome: result.ok ? 'success' : 'error',
      });
    } catch (logErr) {
      console.error('insertIntegrationLog (getInfo):', logErr);
    }
    if (result.ok) {
      return { ok: true as const, result: result.result };
    }
    return { ok: false as const, error: result.error, code: result.code, data: result.data };
  } catch (error: any) {
    if (error.message === 'Database not initialized') {
      return { ok: false as const, error: 'Database not initialized' };
    }
    return { ok: false as const, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle(
  'nayax-do-transaction',
  async (
    _event: unknown,
    payload: { amountAgorot: number; vuid: string }
  ) => {
    const db = getDatabaseMain();
    try {
      const conn = getNayaxConnectionFromDb(db);
      if ('error' in conn) {
        try {
          insertIntegrationLog(db, {
            type: INTEGRATION_LOG_TYPE_NAYAX,
            method: 'doTransaction',
            requestJson: JSON.stringify({ stage: 'precondition', error: conn.error }),
            responseJson: null,
            outcome: 'error',
          });
        } catch (_) {
          /* ignore log failure */
        }
        return {
          approved: false,
          outcome: 'declined' as const,
          vuid: '',
          error: conn.error,
        };
      }
      const amountAgorot = Math.round(payload.amountAgorot);
      if (!Number.isFinite(amountAgorot) || amountAgorot < 1) {
        try {
          insertIntegrationLog(db, {
            type: INTEGRATION_LOG_TYPE_NAYAX,
            method: 'doTransaction',
            requestJson: JSON.stringify({ stage: 'precondition', amountAgorot: payload.amountAgorot }),
            responseJson: null,
            outcome: 'error',
          });
        } catch (_) {
          /* ignore */
        }
        return {
          approved: false,
          outcome: 'declined' as const,
          vuid: '',
          error: 'Invalid transaction amount',
        };
      }
      const vuidRaw = typeof payload.vuid === 'string' ? payload.vuid.trim() : '';
      if (!vuidRaw) {
        try {
          insertIntegrationLog(db, {
            type: INTEGRATION_LOG_TYPE_NAYAX,
            method: 'doTransaction',
            requestJson: JSON.stringify({ stage: 'precondition', error: 'Missing vuid' }),
            responseJson: null,
            outcome: 'error',
          });
        } catch (_) {
          /* ignore */
        }
        return {
          approved: false,
          outcome: 'declined' as const,
          vuid: '',
          error: 'vuid is required (use pending transaction id)',
        };
      }
      const vuid = vuidRaw;
      const params = [
        'ashrait',
        {
          vuid,
          tranType: 1,
          tranCode: 1,
          creditTerms: 1,
          amount: amountAgorot,
          currency: '376',
        },
      ];
      const requestPayload = {
        endpoint: {
          host: conn.host,
          port: conn.port,
          path: normalizeNayaxPath(conn.path),
        },
        jsonrpc: { method: 'doTransaction', params, id: vuid },
      };
      const rpcResult = await callNayaxJsonRpc({
        host: conn.host,
        port: conn.port,
        path: conn.path,
        method: 'doTransaction',
        params,
        id: vuid,
        timeoutMs: DEFAULT_NAYAX_TRANSACTION_TIMEOUT_MS,
      });
      const responseForLog =
        rpcResult.ok === true
          ? { ok: true as const, result: rpcResult.result, id: rpcResult.id }
          : {
              ok: false as const,
              error: rpcResult.error,
              code: rpcResult.code,
              data: rpcResult.data,
            };
      const parsed = parseAshraitDoTransactionResult(rpcResult);
      try {
        insertIntegrationLog(db, {
          type: INTEGRATION_LOG_TYPE_NAYAX,
          method: 'doTransaction',
          requestJson: JSON.stringify(requestPayload),
          responseJson: JSON.stringify(responseForLog),
          outcome: parsed.outcome,
        });
      } catch (logErr) {
        console.error('insertIntegrationLog (doTransaction):', logErr);
      }
      if (parsed.approved) {
        return {
          approved: true,
          outcome: parsed.outcome,
          vuid,
          result: rpcResult.ok ? rpcResult.result : undefined,
          statusCode: parsed.statusCode,
          statusMessage: parsed.statusMessage,
          message: parsed.message,
        };
      }
      return {
        approved: false,
        outcome: parsed.outcome,
        vuid,
        error: parsed.message,
        statusCode: parsed.statusCode,
        statusMessage: parsed.statusMessage,
        result: rpcResult.ok ? rpcResult.result : undefined,
      };
    } catch (error: any) {
      if (error.message === 'Database not initialized') {
        return { approved: false, outcome: 'declined' as const, vuid: '', error: 'Database not initialized' };
      }
      try {
        insertIntegrationLog(db, {
          type: INTEGRATION_LOG_TYPE_NAYAX,
          method: 'doTransaction',
          requestJson: JSON.stringify({ stage: 'exception' }),
          responseJson: JSON.stringify({ error: error.message }),
          outcome: 'error',
        });
      } catch (_) {
        /* ignore */
      }
      return {
        approved: false,
        outcome: 'declined' as const,
        vuid: '',
        error: error.message || 'Unknown error',
      };
    }
  }
);

ipcMain.handle(
  'nayax-do-refund',
  async (
    _event: unknown,
    payload: { amountAgorot: number; vuid: string; originalTransactionId: string },
  ) => {
    const db = getDatabaseMain();
    try {
      const conn = getNayaxConnectionFromDb(db);
      if ('error' in conn) {
        return {
          approved: false,
          outcome: 'declined' as const,
          vuid: '',
          error: conn.error,
        };
      }
      const amountAgorot = Math.round(payload.amountAgorot);
      if (!Number.isFinite(amountAgorot) || amountAgorot < 1) {
        return {
          approved: false,
          outcome: 'declined' as const,
          vuid: '',
          error: 'Invalid refund amount',
        };
      }
      const vuidRaw = typeof payload.vuid === 'string' ? payload.vuid.trim() : '';
      const originalTransactionId =
        typeof payload.originalTransactionId === 'string'
          ? payload.originalTransactionId.trim()
          : '';
      if (!vuidRaw || !originalTransactionId) {
        return {
          approved: false,
          outcome: 'declined' as const,
          vuid: '',
          error: 'vuid and originalTransactionId are required',
        };
      }
      const params = [
        'ashrait',
        {
          vuid: vuidRaw,
          tranType: 53,
          tranCode: 1,
          creditTerms: 1,
          amount: amountAgorot,
          currency: '376',
          originalTransactionId,
        },
      ];
      const requestPayload = {
        endpoint: {
          host: conn.host,
          port: conn.port,
          path: normalizeNayaxPath(conn.path),
        },
        jsonrpc: { method: 'doTransaction', params, id: vuidRaw },
      };
      const rpcResult = await callNayaxJsonRpc({
        host: conn.host,
        port: conn.port,
        path: conn.path,
        method: 'doTransaction',
        params,
        id: vuidRaw,
        timeoutMs: DEFAULT_NAYAX_TRANSACTION_TIMEOUT_MS,
      });
      const responseForLog =
        rpcResult.ok === true
          ? { ok: true as const, result: rpcResult.result, id: rpcResult.id }
          : {
              ok: false as const,
              error: rpcResult.error,
              code: rpcResult.code,
              data: rpcResult.data,
            };
      const parsed = parseAshraitDoTransactionResult(rpcResult);
      try {
        insertIntegrationLog(db, {
          type: INTEGRATION_LOG_TYPE_NAYAX,
          method: 'doTransactionRefund',
          requestJson: JSON.stringify(requestPayload),
          responseJson: JSON.stringify(responseForLog),
          outcome: parsed.outcome,
        });
      } catch (logErr) {
        console.error('insertIntegrationLog (doTransactionRefund):', logErr);
      }
      if (parsed.approved) {
        return {
          approved: true,
          outcome: parsed.outcome,
          vuid: vuidRaw,
          result: rpcResult.ok ? rpcResult.result : undefined,
          statusCode: parsed.statusCode,
          statusMessage: parsed.statusMessage,
          message: parsed.message,
        };
      }
      return {
        approved: false,
        outcome: parsed.outcome,
        vuid: vuidRaw,
        error: parsed.message,
        statusCode: parsed.statusCode,
        statusMessage: parsed.statusMessage,
        result: rpcResult.ok ? rpcResult.result : undefined,
      };
    } catch (error: any) {
      if (error.message === 'Database not initialized') {
        return { approved: false, outcome: 'declined' as const, vuid: '', error: 'Database not initialized' };
      }
      return {
        approved: false,
        outcome: 'declined' as const,
        vuid: '',
        error: error.message || 'Unknown error',
      };
    }
  },
);

ipcMain.handle(
  'nayax-abort-transaction',
  async (_event: unknown, payload: { vuid: string }) => {
    const db = getDatabaseMain();
    try {
      const conn = getNayaxConnectionFromDb(db);
      if ('error' in conn) {
        try {
          insertIntegrationLog(db, {
            type: INTEGRATION_LOG_TYPE_NAYAX,
            method: 'abortTransaction',
            requestJson: JSON.stringify({ stage: 'precondition', error: conn.error }),
            responseJson: null,
            outcome: 'error',
          });
        } catch (_) {
          /* ignore */
        }
        return { ok: false as const, error: conn.error };
      }
      const vuidRaw = typeof payload.vuid === 'string' ? payload.vuid.trim() : '';
      if (!vuidRaw) {
        try {
          insertIntegrationLog(db, {
            type: INTEGRATION_LOG_TYPE_NAYAX,
            method: 'abortTransaction',
            requestJson: JSON.stringify({ stage: 'precondition', error: 'Missing vuid' }),
            responseJson: null,
            outcome: 'error',
          });
        } catch (_) {
          /* ignore */
        }
        return { ok: false as const, error: 'vuid is required' };
      }
      const vuid = vuidRaw;
      scheduleNayaxAbortTransactionOptimistic(db, conn, vuid);
      return { ok: true as const, dispatched: true };
    } catch (error: any) {
      if (error.message === 'Database not initialized') {
        return { ok: false as const, error: 'Database not initialized' };
      }
      try {
        insertIntegrationLog(db, {
          type: INTEGRATION_LOG_TYPE_NAYAX,
          method: 'abortTransaction',
          requestJson: JSON.stringify({ stage: 'exception' }),
          responseJson: JSON.stringify({ error: error.message }),
          outcome: 'error',
        });
      } catch (_) {
        /* ignore */
      }
      return { ok: false as const, error: error.message || 'Unknown error' };
    }
  }
);

ipcMain.handle(
  'db-get-integration-logs',
  async (_e: unknown, options: { type?: string; limit?: number; offset?: number }) => {
    try {
      const db = getDatabaseMain();
      return getIntegrationLogs(db, options || {});
    } catch (error: any) {
      console.error('db-get-integration-logs:', error);
      return { logs: [], total: 0 };
    }
  }
);

ipcMain.handle('db-clear-integration-logs', async (_e: unknown, type?: string) => {
  try {
    const db = getDatabaseMain();
    clearIntegrationLogs(db, type);
    return { success: true as const };
  } catch (error: any) {
    console.error('db-clear-integration-logs:', error);
    return { success: false as const, error: error.message };
  }
});

// Trading day IPC handlers
ipcMain.handle('db-get-current-trading-day', async () => {
  try {
    const db = getDatabaseMain();
    return getCurrentTradingDay(db);
  } catch (error: any) {
    console.error('Error getting current trading day:', error);
    return null;
  }
});

ipcMain.handle('db-get-trading-day-by-date', async (event, date: string) => {
  try {
    const db = getDatabaseMain();
    return getTradingDayByDate(db, date);
  } catch (error: any) {
    console.error('Error getting trading day by date:', error);
    return null;
  }
});

ipcMain.handle('db-get-trading-day-by-id', async (_event, id: string) => {
  try {
    const db = getDatabaseMain();
    return getTradingDayById(db, id);
  } catch (error: any) {
    console.error('Error getting trading day by id:', error);
    return null;
  }
});

ipcMain.handle('db-get-trading-days-by-date-range', async (event, startDate: string, endDate: string) => {
  try {
    const db = getDatabaseMain();
    return getTradingDaysByDateRange(db, startDate, endDate);
  } catch (error: any) {
    console.error('Error getting trading days by date range:', error);
    return [];
  }
});

ipcMain.handle('db-open-trading-day', async (event, data: any) => {
  try {
    const db = getDatabaseMain();
    openTradingDay(db, data);
    return { success: true };
  } catch (error: any) {
    console.error('Error opening trading day:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-close-trading-day', async (event, id: string, data: any) => {
  try {
    const db = getDatabaseMain();
    closeTradingDay(db, id, data);
    return { success: true };
  } catch (error: any) {
    console.error('Error closing trading day:', error);
    return { success: false, error: error.message };
  }
});

// ── Cloud Sync IPC handlers ───────────────────────────────────────────────────

ipcMain.handle(
  'cloud-pairing-validate',
  async (
    _event,
    payload: { apiBaseUrl: string; code: string; machineName?: string },
  ): Promise<Record<string, unknown>> => {
    try {
      if (!payload?.apiBaseUrl?.trim() || !payload?.code?.trim()) {
        return { success: false, error: 'API URL and pairing code are required' };
      }
      const r = await postPairingValidate(payload.apiBaseUrl, {
        code: payload.code.trim(),
        machine_name: payload.machineName?.trim() || undefined,
      });
      if (!r.ok) {
        return { success: false, error: r.error, statusCode: r.statusCode };
      }
      const d = r.data;
      return {
        success: true,
        ...pairingCredentialsFromValidateData(d, payload.apiBaseUrl),
      };
    } catch (e: any) {
      console.error('[IPC] cloud-pairing-validate error:', e);
      return { success: false, error: e?.message || 'Pairing failed' };
    }
  },
);

ipcMain.handle(
  'cloud-device-register',
  async (
    _event,
    payload: { apiBaseUrl: string; machineName?: string },
  ): Promise<Record<string, unknown>> => {
    try {
      if (!payload?.apiBaseUrl?.trim()) {
        return { success: false, error: 'API URL is required' };
      }
      const r = await postDeviceRegister(payload.apiBaseUrl, {
        machine_name: payload.machineName?.trim() || undefined,
      });
      if (!r.ok) {
        return { success: false, error: r.error, statusCode: r.statusCode };
      }
      const d = r.data;
      return {
        success: true,
        deviceNonce: String(d.deviceNonce ?? ''),
        expiresAt: String(d.expiresAt ?? ''),
        apiBaseUrl: normalizeApiBaseUrl(payload.apiBaseUrl),
      };
    } catch (e: any) {
      console.error('[IPC] cloud-device-register error:', e);
      return { success: false, error: e?.message || 'Register failed' };
    }
  },
);

ipcMain.handle(
  'cloud-device-poll-status',
  async (
    _event,
    payload: { apiBaseUrl: string; deviceNonce: string },
  ): Promise<Record<string, unknown>> => {
    try {
      if (!payload?.apiBaseUrl?.trim() || !payload?.deviceNonce?.trim()) {
        return { success: false, error: 'API URL and device nonce are required' };
      }
      const r = await getDevicePollStatus(payload.apiBaseUrl, payload.deviceNonce.trim());
      if (!r.ok) {
        if (r.statusCode === 410) {
          return { success: true, status: 'gone', error: r.error };
        }
        return { success: false, error: r.error, statusCode: r.statusCode };
      }
      if (r.data.status === 'waiting') {
        return { success: true, status: 'waiting' };
      }
      const creds = pairingCredentialsFromValidateData(r.data, payload.apiBaseUrl);
      return { success: true, status: 'credentials', ...creds };
    } catch (e: any) {
      console.error('[IPC] cloud-device-poll-status error:', e);
      return { success: false, error: e?.message || 'Poll failed' };
    }
  },
);

ipcMain.handle('sync-connect', async (_event, config: any) => {
  try {
    const db = getDatabaseMain();
    syncService.init(db);
    const put = (k: string, v: string) =>
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(k, v);
    if (config.apiBaseUrl) put('cloud_api_base', String(config.apiBaseUrl));
    if (config.accessToken) put('cloud_access_token', String(config.accessToken));
    if (config.machineId) put('cloud_machine_id', String(config.machineId));
    if (config.machineCode) put('cloud_machine_code', String(config.machineCode));
    const tenantId = String(config.tenantId ?? config.merchantId ?? '').trim();
    if (!tenantId) {
      return { success: false, error: 'tenantId is required — pair again from onboarding' };
    }
    put('cloud_tenant_id', tenantId);
    put('cloud_merchant_id', tenantId);
    if (config.shopId != null && String(config.shopId).trim()) {
      put('cloud_shop_id', String(config.shopId));
    }
    put('cloud_sync_enabled', '1');
    if (config.host) put('mqtt_cloud_host', String(config.host));
    if (config.port != null) put('mqtt_cloud_port', String(config.port));
    if (config.clientId != null && config.clientId !== '')
      put('mqtt_cloud_client_id', String(config.clientId));
    if (config.username != null && config.username !== '')
      put('mqtt_cloud_username', String(config.username));
    if (config.password != null && config.password !== '')
      put('mqtt_cloud_password', String(config.password));

    syncService.connect({
      host: String(config.host),
      port: Number(config.port) || 1883,
      merchantId: tenantId || String(config.merchantId || ''),
      machineId: String(config.machineId),
      apiBaseUrl: String(config.apiBaseUrl),
      accessToken: String(config.accessToken),
      clientId: config.clientId,
      username: config.username,
      password: config.password,
    });
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] sync-connect error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-disconnect', async () => {
  try {
    syncService.disconnect();
    const db = getDatabaseMain();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_sync_enabled', '0')").run();
    const clear = (key: string) =>
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, '');
    clear('mqtt_cloud_client_id');
    clear('mqtt_cloud_username');
    clear('mqtt_cloud_password');
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] sync-disconnect error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Hard reset of cloud pairing. Used by the onboarding "Re-pair this register"
 * flow when the operator wants to bind this machine to a different shop or
 * fix an incorrect pairing. Disconnects MQTT, wipes all cloud_* / mqtt_cloud_*
 * settings, and clears the local pos_users roster so the next pairing pulls a
 * fresh roster for the new shop.
 */
ipcMain.handle('cloud-unpair', async () => {
  try {
    syncService.disconnect();
    const db = getDatabaseMain();
    const clear = (key: string) =>
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, '');
    const cloudKeys = [
      'cloud_sync_enabled',
      'cloud_api_base',
      'cloud_access_token',
      'cloud_machine_id',
      'cloud_machine_code',
      'cloud_tenant_id',
      'cloud_merchant_id',
      'cloud_shop_id',
      'mqtt_cloud_host',
      'mqtt_cloud_port',
      'mqtt_cloud_client_id',
      'mqtt_cloud_username',
      'mqtt_cloud_password',
    ];
    for (const k of cloudKeys) clear(k);
    // Drop sync watermarks so a re-pair to a different shop / machine starts
    // from a clean slate. Keeping the old `cloud_last_*` values would make
    // the next delta pull skip rows the new shop's roster needs (the bug
    // surfaced as "0 users" in the onboarding wizard after re-pairing).
    db.prepare("DELETE FROM settings WHERE key IN ('cloud_last_sync', 'cloud_last_pos_users_sync')").run();
    db.prepare('DELETE FROM pos_users').run();
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] cloud-unpair error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-pull-catalog', async () => {
  try {
    const db = getDatabaseMain();
    syncService.init(db);
    const result = await syncService.pullCatalogImmediate();
    return {
      success: result.ok,
      error: result.error,
      products: result.products,
      categories: result.categories,
      status: syncService.getStatus(),
    };
  } catch (error: any) {
    console.error('[IPC] sync-pull-catalog error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-refresh-machine-context', async () => {
  try {
    const db = getDatabaseMain();
    syncService.init(db);
    return await new Promise((resolve) => {
      syncService.cloudJson('GET', '/machines/me', null, (err: Error | null, _s?: number, data?: unknown) => {
        if (err) {
          return resolve({ success: false, error: err.message });
        }
        const ctx = parseMachineMeResponse(data);
        try {
          if (isSqliteOpen(db) && (ctx.tenantId || ctx.shopId)) {
            persistMachineContextMain(db, ctx);
          }
        } catch (persistErr) {
          console.warn('[Cloud] sync-refresh-machine-context persist failed:', persistErr);
        }
        resolve({
          success: true,
          tenantId: ctx.tenantId,
          merchantId: ctx.tenantId,
          shopId: ctx.shopId,
        });
      });
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-get-status', async () => {
  try {
    return { success: true, status: syncService.getStatus() };
  } catch (error: any) {
    console.error('[IPC] sync-get-status error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-enqueue', async (_event, data: {
  entityType: 'product' | 'category';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  payload: Record<string, unknown> | null;
  cloudId: string | null;
  updatedAt: string;
}) => {
  try {
    syncService.enqueue(data.entityType, data.entityId, data.action, data.payload, data.cloudId, data.updatedAt);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] sync-enqueue error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-flush-queue', async () => {
  try {
    syncService.flushQueue();
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] sync-flush-queue error:', error);
    return { success: false, error: error.message };
  }
});
