const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const iconv = require('iconv-lite');

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
      inStock INTEGER NOT NULL DEFAULT 1,
      stockQuantity INTEGER NOT NULL DEFAULT 0,
      barcode TEXT,
      taxRate REAL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (categoryId) REFERENCES categories(id)
    )
  `);

  // Categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      imageUrl TEXT,
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

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_createdAt ON transactions(createdAt);
    CREATE INDEX IF NOT EXISTS idx_transactions_transactionNumber ON transactions(transactionNumber);
    CREATE INDEX IF NOT EXISTS idx_transactions_customerId ON transactions(customerId);
    CREATE INDEX IF NOT EXISTS idx_transaction_items_transactionId ON transaction_items(transactionId);
    CREATE INDEX IF NOT EXISTS idx_products_categoryId ON products(categoryId);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
  `);
}

function initializeDatabaseMain(dbPath: string): any {
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (e) {
      // Ignore
    }
  }

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  
  createSchema(dbInstance);
  
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
    dbInstance.close();
    dbInstance = null;
  }
}

// Database operations
function getAllProducts(db: any): any[] {
  const rows = db.prepare('SELECT * FROM products ORDER BY name').all();
  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    price: row.price,
    sku: row.sku,
    categoryId: row.categoryId,
    imageUrl: row.imageUrl || undefined,
    inStock: row.inStock === 1,
    stockQuantity: row.stockQuantity,
    barcode: row.barcode || undefined,
    taxRate: row.taxRate || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

function saveProduct(db: any, product: any): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO products 
    (id, name, description, price, sku, categoryId, imageUrl, inStock, stockQuantity, barcode, taxRate, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    product.stockQuantity,
    product.barcode || null,
    product.taxRate || null,
    product.createdAt,
    product.updatedAt
  );
}

function getAllCategories(db: any): any[] {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sortOrder, name').all();
  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    color: row.color || undefined,
    imageUrl: row.imageUrl || undefined,
    parentId: row.parentId || undefined,
    isActive: row.isActive === 1,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
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
  const taxRate = taxRateStr ? parseFloat(taxRateStr) / 100 : 0.08; // Default to 8% if not set
  
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
  const { startDate, endDate, limit = 50, offset = 0, status } = options;
  
  let whereClause = '1=1';
  const params: any[] = [];
  
  if (startDate) {
    whereClause += ' AND datetime(createdAt) >= datetime(?)';
    params.push(startDate);
  }
  
  if (endDate) {
    whereClause += ' AND datetime(createdAt) <= datetime(?)';
    params.push(endDate);
  }
  
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  
  // Get total count
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM transactions WHERE ${whereClause}`);
  const countResult = countStmt.get(...params);
  const total = countResult.count;
  
  // Get paginated results
  params.push(limit, offset);
  const rows = db.prepare(`
    SELECT * FROM transactions 
    WHERE ${whereClause}
    ORDER BY createdAt DESC
    LIMIT ? OFFSET ?
  `).all(...params);
  
  const transactions = rows.map((row: any) => loadTransactionWithRelations(db, row));
  
  return { transactions, total };
}

function saveTransaction(db: any, transaction: any): void {
  const trans = db.transaction(() => {
    // Save transaction
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO transactions 
      (id, transactionNumber, customerId, status, receiptUrl, notes, cashierId, documentType, 
       documentProductionDate, branchId, documentDiscount, whtDeduction, amountTendered, changeAmount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      transaction.amountTendered || null,
      transaction.changeAmount || null,
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
    
    // Update product stock quantities if transaction is completed
    if (transaction.status === 'completed') {
      for (const item of transaction.cart.items) {
        // Get current stock
        const product = db.prepare('SELECT stockQuantity FROM products WHERE id = ?').get(item.productId);
        if (product) {
          const newStockQuantity = Math.max(0, product.stockQuantity - item.quantity);
          const updateProductStock = db.prepare(`
            UPDATE products 
            SET stockQuantity = ?,
                inStock = ?,
                updatedAt = ?
            WHERE id = ?
          `);
          
          updateProductStock.run(
            newStockQuantity,
            newStockQuantity > 0 ? 1 : 0,
            new Date().toISOString(),
            item.productId
          );
        }
      }
    }
  });
  
  trans();
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

let win: BrowserWindow | null;
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] || process.env['VITE_DEV_SERVER_HOST'] || 'http://localhost:5173';

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
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

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  createWindow();
  
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
    
    // Create a simple HTML content for testing
    const testContent = `
      <html>
        <head>
          <style>
            @media print {
              body { 
                font-family: Arial, sans-serif; 
                padding: 10px; 
                margin: 0;
                font-size: 12pt;
              }
              .test-content {
                border: 2px solid #000;
                padding: 15px;
                margin: 0;
                text-align: center;
              }
              h2 { margin-top: 0; }
            }
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

    // Create a hidden window for printing
    const printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    console.log('Loading content into print window...');
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testContent)}`);
    
    // Wait a moment for content to load
    await new Promise(resolve => setTimeout(resolve, 500));

    const printOptions = {
      silent: true,  // Changed to true to avoid print dialog
      printBackground: true,
      color: false,
      margin: {
        marginType: 'minimum'
      },
      landscape: false,
      pagesPerSheet: 1,
      collate: false,
      copies: 1
    };

    if (printerName && printerName !== 'default') {
      printOptions.deviceName = printerName;
      console.log('Using specific printer:', printerName);
    } else {
      console.log('Using default printer');
    }

    console.log('Sending to printer with options:', printOptions);
    
    // Try to print
    return new Promise((resolve) => {
      printWindow.webContents.print(printOptions, (success, failureReason) => {
        console.log('Print result - Success:', success, 'Reason:', failureReason);
        printWindow.close();
        
        if (success) {
          resolve({ success: true, printed: true });
        } else {
          resolve({ success: false, error: failureReason || 'Print failed' });
        }
      });
    });
    
  } catch (error) {
    console.error('Error printing:', error);
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
      return taxRateStr ? parseFloat(taxRateStr) : 8; // Default to 8% if not set
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
    
    const formatAmount = (value: number, len = 15) => {
      const absValue = Math.abs(value);
      const integerPart = Math.floor(absValue);
      const decimalPart = Math.round((absValue - integerPart) * 100);
      const integerStr = padLeft(integerPart.toString(), 12, '0');
      const decimalStr = padLeft(decimalPart.toString(), 2, '0');
      const sign = value < 0 ? '-' : '+';
      return integerStr + decimalStr + sign;
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
      C100: 0,
      D110: 0,
      D120: 0,
      Z900: 0,
    };
    
    // A100 - Opening record
    let a100 = 'A100';
    a100 += padLeft(recordNumber.toString(), 9, '0');
    a100 += padLeft(businessInfo.vatNumber, 9, '0');
    a100 += padLeft(uniqueId, 15, '0');
    a100 += '&OF1.31&';
    a100 += padRight('', 50);
    bkmvLines.push(a100);
    recordCounts.A100 = 1;
    recordNumber++;
    
    // Process transactions - simplified version
    // In production, use the full taxReportGenerator utility
    for (const transaction of transactions) {
      // C100 - Document header (simplified)
      let c100 = 'C100';
      c100 += padLeft(recordNumber.toString(), 9, '0');
      c100 += padLeft(businessInfo.vatNumber, 9, '0');
      c100 += padRight('', 9);
      c100 += padLeft(transaction.documentType.toString(), 3, '0');
      c100 += padRight(transaction.transactionNumber, 20);
      c100 += formatDate(transaction.documentProductionDate);
      c100 += padRight('', 250);
      c100 += transaction.documentDiscount ? formatAmount(-Math.abs(transaction.documentDiscount), 15) : padRight('', 15);
      c100 += padRight('', 45);
      c100 += transaction.whtDeduction ? formatAmount(Math.abs(transaction.whtDeduction), 12) : padRight('', 12);
      c100 += padRight('', 26);
      c100 += formatDate(transaction.createdAt);
      c100 += transaction.branchId ? padRight(transaction.branchId, 7) : padRight('', 7);
      c100 += padRight('', 444 - c100.length);
      bkmvLines.push(c100);
      recordCounts.C100++;
      recordNumber++;
      
      // D110 - Document details (simplified)
      let lineNum = 1;
      for (const item of transaction.cart.items) {
        let d110 = 'D110';
        d110 += padLeft(recordNumber.toString(), 9, '0');
        d110 += padLeft(businessInfo.vatNumber, 9, '0');
        d110 += padRight('', 9);
        d110 += padLeft(transaction.documentType.toString(), 3, '0');
        d110 += padRight(transaction.transactionNumber, 20);
        d110 += padLeft(lineNum.toString(), 4, '0');
        d110 += padRight('', 3);
        d110 += padRight('', 20);
        d110 += String(item.transactionType || 2);
        d110 += padRight(item.product.sku || '', 20);
        d110 += padRight(item.product.name, 30);
        d110 += padRight('', 50);
        d110 += padRight('', 30);
        d110 += padRight('', 20);
        const qtyInteger = Math.floor(item.quantity);
        const qtyDecimal = Math.round((item.quantity - qtyInteger) * 10000);
        d110 += padLeft(qtyInteger.toString(), 12, '0') + padLeft(qtyDecimal.toString(), 4, '0') + '+';
        d110 += formatAmount(item.unitPrice, 15);
        d110 += item.lineDiscount ? formatAmount(-Math.abs(item.lineDiscount), 15) : padRight('', 15);
        d110 += formatAmount(item.totalPrice, 15);
        // Use global tax rate (already retrieved at function start)
        const vatPercent = Math.round(taxRate);
        d110 += padLeft(vatPercent.toString(), 2, '0');
        d110 += transaction.branchId ? padRight(transaction.branchId, 7) : padRight('', 7);
        d110 += formatDate(transaction.createdAt);
        d110 += padRight('', 339 - d110.length);
        bkmvLines.push(d110);
        recordCounts.D110++;
        recordNumber++;
        lineNum++;
      }
      
      // D120 - Payment details (simplified)
      const paymentTypeMap: Record<string, number> = {
        'cash': 1,
        'check': 2,
        'card': 3,
        'digital': 4,
        'gift_card': 9,
      };
      const paymentType = paymentTypeMap[transaction.paymentDetails.method.type] || 9;
      
      let d120 = 'D120';
      d120 += padLeft(recordNumber.toString(), 9, '0');
      d120 += padLeft(businessInfo.vatNumber, 9, '0');
      d120 += padRight('', 9);
      d120 += padLeft(transaction.documentType.toString(), 3, '0');
      d120 += padRight(transaction.transactionNumber, 20);
      d120 += padLeft('1', 4, '0');
      d120 += String(paymentType);
      d120 += transaction.paymentDetails.method.type === 'check' && transaction.paymentDetails.bankNumber
        ? padLeft(transaction.paymentDetails.bankNumber, 10, '0')
        : padRight('', 10);
      d120 += padRight('', 10);
      d120 += padRight('', 15);
      d120 += padRight('', 10);
      d120 += padRight('', 8);
      d120 += formatAmount(transaction.paymentDetails.amount, 15);
      d120 += padRight('', 1);
      d120 += padRight('', 20);
      d120 += transaction.paymentDetails.method.type === 'card' && transaction.paymentDetails.creditTransactionType
        ? String(transaction.paymentDetails.creditTransactionType)
        : padRight('', 1);
      d120 += transaction.branchId ? padRight(transaction.branchId, 7) : padRight('', 7);
      d120 += formatDate(transaction.createdAt);
      d120 += padRight('', 7);
      d120 += padRight('', 222 - d120.length);
      bkmvLines.push(d120);
      recordCounts.D120++;
      recordNumber++;
    }
    
    // Z900 - Closing record
    const totalRecords = recordNumber;
    let z900 = 'Z900';
    z900 += padLeft(recordNumber.toString(), 9, '0');
    z900 += padLeft(businessInfo.vatNumber, 9, '0');
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
    a000 += padLeft(businessInfo.vatNumber, 9, '0');
    a000 += padLeft(uniqueId, 15, '0');
    a000 += padRight(taxReportConfig.systemCode, 8);
    a000 += padLeft(softwareInfo.registrationNumber, 8, '0');
    a000 += padRight(softwareInfo.name, 20);
    a000 += padRight(softwareInfo.version, 20);
    a000 += padLeft(softwareInfo.manufacturerId, 9, '0');
    a000 += padRight(softwareInfo.manufacturerName, 20);
    a000 += softwareInfo.softwareType === 'single-year' ? '1' : '2';
    a000 += padRight(path.join(businessDir, path.basename(finalDir)), 50);
    a000 += taxReportConfig.accountingType;
    a000 += taxReportConfig.balancingRequired ? '1' : '0';
    a000 += padLeft(businessInfo.vatNumber, 9, '0');
    a000 += padLeft(businessInfo.companyRegNumber || '000000001', 9, '0');
    a000 += padRight(businessInfo.companyName, 50);
    a000 += padRight(businessInfo.companyAddress, 50);
    a000 += padRight(businessInfo.companyAddressNumber, 10);
    a000 += padRight(businessInfo.companyCity, 30);
    a000 += padRight(businessInfo.companyZip, 8);
    
    if ('year' in dateRange) {
      a000 += String(dateRange.year);
      a000 += String(dateRange.year) + '0101';
      a000 += String(dateRange.year) + '1231';
    } else {
      a000 += String(dateRange.start.getFullYear());
      a000 += formatDate(dateRange.start);
      a000 += formatDate(dateRange.end);
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
    await new Promise(resolve => setTimeout(resolve, 500));

    return new Promise((resolve) => {
      printWindow.webContents.print({ silent: true }, (success) => {
        printWindow.close();
        resolve({ success, printed: success });
      });
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Database IPC handlers

ipcMain.handle('get-database-path', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const defaultPath = path.join(userDataPath, 'database', 'pos.db');
    
    // Try to read from settings
    const settingsPath = path.join(userDataPath, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (settings.databasePath) {
        return settings.databasePath;
      }
    }
    
    return defaultPath;
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
    return { success: true };
  } catch (error: any) {
    console.error('Error saving transaction:', error);
    return { success: false, error: error.message };
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
