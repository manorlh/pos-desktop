"use strict";
const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const iconv = require("iconv-lite");
const __dirname$1 = path.dirname(__filename);
const projectRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname$1, "..");
const betterSqlite3Path = path.join(projectRoot, "node_modules", "better-sqlite3");
const Database = require(betterSqlite3Path);
let dbInstance = null;
function createSchema(db) {
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
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
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_createdAt ON transactions(createdAt);
    CREATE INDEX IF NOT EXISTS idx_transactions_transactionNumber ON transactions(transactionNumber);
    CREATE INDEX IF NOT EXISTS idx_transactions_customerId ON transactions(customerId);
    CREATE INDEX IF NOT EXISTS idx_transaction_items_transactionId ON transaction_items(transactionId);
    CREATE INDEX IF NOT EXISTS idx_products_categoryId ON products(categoryId);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
  `);
}
function initializeDatabaseMain(dbPath) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (e) {
    }
  }
  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");
  createSchema(dbInstance);
  return dbInstance;
}
function getDatabaseMain() {
  if (!dbInstance) {
    throw new Error("Database not initialized");
  }
  return dbInstance;
}
function getAllProducts(db) {
  const rows = db.prepare("SELECT * FROM products ORDER BY name").all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description || void 0,
    price: row.price,
    sku: row.sku,
    categoryId: row.categoryId,
    imageUrl: row.imageUrl || void 0,
    inStock: row.inStock === 1,
    stockQuantity: row.stockQuantity,
    barcode: row.barcode || void 0,
    taxRate: row.taxRate || void 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}
function saveProduct(db, product) {
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
function getAllCategories(db) {
  const rows = db.prepare("SELECT * FROM categories ORDER BY sortOrder, name").all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description || void 0,
    color: row.color || void 0,
    imageUrl: row.imageUrl || void 0,
    parentId: row.parentId || void 0,
    isActive: row.isActive === 1,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}
function saveCategory(db, category) {
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
function getAllUsers(db) {
  const rows = db.prepare("SELECT * FROM users ORDER BY name").all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}
function saveUser(db, user) {
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
function loadTransactionWithRelations(db, row) {
  let customer = void 0;
  if (row.customerId) {
    const customerRow = db.prepare("SELECT * FROM customers WHERE id = ?").get(row.customerId);
    if (customerRow) {
      customer = {
        id: customerRow.id,
        name: customerRow.name,
        email: customerRow.email || void 0,
        phone: customerRow.phone || void 0,
        address: customerRow.address ? JSON.parse(customerRow.address) : void 0,
        loyaltyPoints: customerRow.loyaltyPoints,
        createdAt: customerRow.createdAt,
        updatedAt: customerRow.updatedAt
      };
    }
  }
  const cashierRow = db.prepare("SELECT * FROM users WHERE id = ?").get(row.cashierId);
  const cashier = {
    id: cashierRow.id,
    name: cashierRow.name,
    email: cashierRow.email,
    role: cashierRow.role,
    isActive: cashierRow.isActive === 1,
    createdAt: cashierRow.createdAt,
    updatedAt: cashierRow.updatedAt
  };
  const itemRows = db.prepare("SELECT * FROM transaction_items WHERE transactionId = ?").all(row.id);
  const products = getAllProducts(db);
  const items = itemRows.map((itemRow) => {
    const product = products.find((p) => p.id === itemRow.productId);
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
        updatedAt: product.updatedAt
      },
      quantity: itemRow.quantity,
      unitPrice: itemRow.unitPrice,
      totalPrice: itemRow.totalPrice,
      discount: itemRow.discount || void 0,
      discountType: itemRow.discountType || void 0,
      notes: itemRow.notes || void 0,
      transactionType: itemRow.transactionType || void 0,
      lineDiscount: itemRow.lineDiscount || void 0
    };
  }).filter(Boolean);
  const taxRateStr = getSetting(db, "globalTaxRate");
  const taxRate = taxRateStr ? parseFloat(taxRateStr) / 100 : 0.08;
  const totalWithTax = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountAmount = items.reduce((sum, item) => sum + (item.discount || 0), 0);
  const discountedTotalWithTax = totalWithTax - discountAmount;
  const subtotal = discountedTotalWithTax / (1 + taxRate);
  const taxAmount = discountedTotalWithTax - subtotal;
  const totalAmount = discountedTotalWithTax;
  const cart = {
    id: row.id,
    items,
    subtotal,
    taxAmount,
    discountAmount,
    totalAmount,
    customerId: row.customerId || void 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
  return {
    id: row.id,
    transactionNumber: row.transactionNumber,
    cart,
    customer,
    status: row.status,
    receiptUrl: row.receiptUrl || void 0,
    notes: row.notes || void 0,
    cashier,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    documentType: row.documentType,
    documentProductionDate: row.documentProductionDate || row.createdAt,
    branchId: row.branchId || void 0,
    documentDiscount: row.documentDiscount || void 0,
    whtDeduction: row.whtDeduction || void 0,
    amountTendered: row.amountTendered || void 0,
    changeAmount: row.changeAmount || void 0
  };
}
function getTodaysTransactions(db) {
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const rows = db.prepare(`
    SELECT * FROM transactions 
    WHERE datetime(createdAt) >= datetime(?) AND datetime(createdAt) < datetime(?)
    ORDER BY createdAt DESC
  `).all(today.toISOString(), tomorrow.toISOString());
  return rows.map((row) => loadTransactionWithRelations(db, row));
}
function getTransactionsByDateRange(db, startDate, endDate) {
  const rows = db.prepare(`
    SELECT * FROM transactions 
    WHERE datetime(createdAt) >= datetime(?) AND datetime(createdAt) <= datetime(?)
    ORDER BY createdAt DESC
  `).all(startDate, endDate);
  return rows.map((row) => loadTransactionWithRelations(db, row));
}
function getTransactionsPage(db, options) {
  const { startDate, endDate, limit = 50, offset = 0, status } = options;
  let whereClause = "1=1";
  const params = [];
  if (startDate) {
    whereClause += " AND datetime(createdAt) >= datetime(?)";
    params.push(startDate);
  }
  if (endDate) {
    whereClause += " AND datetime(createdAt) <= datetime(?)";
    params.push(endDate);
  }
  if (status) {
    whereClause += " AND status = ?";
    params.push(status);
  }
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM transactions WHERE ${whereClause}`);
  const countResult = countStmt.get(...params);
  const total = countResult.count;
  params.push(limit, offset);
  const rows = db.prepare(`
    SELECT * FROM transactions 
    WHERE ${whereClause}
    ORDER BY createdAt DESC
    LIMIT ? OFFSET ?
  `).all(...params);
  const transactions = rows.map((row) => loadTransactionWithRelations(db, row));
  return { transactions, total };
}
function saveTransaction(db, transaction) {
  const trans = db.transaction(() => {
    var _a;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO transactions 
      (id, transactionNumber, customerId, status, receiptUrl, notes, cashierId, documentType, 
       documentProductionDate, branchId, documentDiscount, whtDeduction, amountTendered, changeAmount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      transaction.id,
      transaction.transactionNumber,
      ((_a = transaction.customer) == null ? void 0 : _a.id) || null,
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
    db.prepare("DELETE FROM transaction_items WHERE transactionId = ?").run(transaction.id);
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
    if (transaction.status === "completed") {
      for (const item of transaction.cart.items) {
        const product = db.prepare("SELECT stockQuantity FROM products WHERE id = ?").get(item.productId);
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
            (/* @__PURE__ */ new Date()).toISOString(),
            item.productId
          );
        }
      }
    }
  });
  trans();
}
function getBusinessInfo(db) {
  const row = db.prepare("SELECT * FROM business_info WHERE id = 1").get();
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
    updatedAt: row.updatedAt
  };
}
function saveBusinessInfo(db, info) {
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
    (/* @__PURE__ */ new Date()).toISOString()
  );
}
function getSoftwareInfo(db) {
  const row = db.prepare("SELECT * FROM software_info WHERE id = 1").get();
  if (!row) return null;
  return {
    registrationNumber: row.registrationNumber,
    name: row.name,
    version: row.version,
    manufacturerId: row.manufacturerId,
    manufacturerName: row.manufacturerName,
    softwareType: row.softwareType,
    updatedAt: row.updatedAt
  };
}
function saveSoftwareInfo(db, info) {
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
    (/* @__PURE__ */ new Date()).toISOString()
  );
}
function getSetting(db, key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}
function setSetting(db, key, value) {
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  stmt.run(key, value);
}
process.env.DIST = path.join(__dirname$1, "../dist");
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, "../public");
let win;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"] || process.env["VITE_DEV_SERVER_HOST"] || "http://localhost:5173";
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1e3,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      nodeIntegration: false,
      // Keep disabled for security
      contextIsolation: true
      // Keep enabled for security
    },
    titleBarStyle: "default",
    show: false,
    fullscreen: true
    // Start in fullscreen mode
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
    if (win && !win.isFullScreen()) {
      win.setFullScreen(true);
    }
  });
  if (process.env.IS_DEV === "true" || !app.isPackaged) {
    console.log("Development mode detected");
    console.log("VITE_DEV_SERVER_URL:", VITE_DEV_SERVER_URL);
    console.log("IS_DEV:", process.env.IS_DEV);
    console.log("app.isPackaged:", app.isPackaged);
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    console.log("Production mode - loading from file");
    win.loadFile(path.join(process.env.DIST, "index.html"));
  }
  win.once("ready-to-show", () => {
    win == null ? void 0 : win.show();
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  createWindow();
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "New Sale",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            win == null ? void 0 : win.webContents.send("menu-new-sale");
          }
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
});
ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});
ipcMain.handle("show-message-box", async (event, options) => {
  const { dialog: dialog2 } = require("electron");
  const result = await dialog2.showMessageBox(win, options);
  return result;
});
ipcMain.handle("get-printers", async () => {
  try {
    const printers = win.webContents.getPrintersAsync ? await win.webContents.getPrintersAsync() : win.webContents.getPrinters();
    console.log("Available printers:", printers.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault })));
    return printers;
  } catch (error) {
    console.error("Error getting printers:", error);
    return [];
  }
});
ipcMain.handle("show-print-preview", async (event, printerName) => {
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
            <p>Printer: ${printerName || "Default"}</p>
            <p>Date: ${(/* @__PURE__ */ new Date()).toLocaleString()}</p>
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
    console.error("Error showing preview:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("print-test", async (event, printerName) => {
  try {
    console.log("Print test requested for printer:", printerName);
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
            <p>Printer: ${printerName || "Default"}</p>
            <p>Date: ${(/* @__PURE__ */ new Date()).toLocaleString()}</p>
            <p>POS Desktop Application</p>
            <p>Test successful!</p>
          </div>
        </body>
      </html>
    `;
    const printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    console.log("Loading content into print window...");
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testContent)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const printOptions = {
      silent: true,
      // Changed to true to avoid print dialog
      printBackground: true,
      color: false,
      margin: {
        marginType: "minimum"
      },
      landscape: false,
      pagesPerSheet: 1,
      collate: false,
      copies: 1
    };
    if (printerName && printerName !== "default") {
      printOptions.deviceName = printerName;
      console.log("Using specific printer:", printerName);
    } else {
      console.log("Using default printer");
    }
    console.log("Sending to printer with options:", printOptions);
    return new Promise((resolve) => {
      printWindow.webContents.print(printOptions, (success, failureReason) => {
        console.log("Print result - Success:", success, "Reason:", failureReason);
        printWindow.close();
        if (success) {
          resolve({ success: true, printed: true });
        } else {
          resolve({ success: false, error: failureReason || "Print failed" });
        }
      });
    });
  } catch (error) {
    console.error("Error printing:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("get-available-drives", async () => {
  try {
    const drives = [];
    if (process.platform === "win32") {
      const { execSync } = require("child_process");
      try {
        const output = execSync("wmic logicaldisk get name", { encoding: "utf-8" });
        const lines = output.split("\n").filter((line) => line.trim() && line.trim() !== "Name");
        drives.push(...lines.map((line) => line.trim()).filter(Boolean));
      } catch (error) {
        console.error("Error getting Windows drives:", error);
        drives.push("C:", "D:", "E:", "F:");
      }
    } else {
      drives.push("/");
    }
    return drives.length > 0 ? drives : ["C:"];
  } catch (error) {
    console.error("Error getting drives:", error);
    return ["C:"];
  }
});
ipcMain.handle("select-export-directory", async () => {
  try {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Select Export Directory"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  } catch (error) {
    console.error("Error selecting directory:", error);
    return null;
  }
});
ipcMain.handle("generate-tax-report", async (event, options) => {
  try {
    const { transactions, businessInfo, softwareInfo, taxReportConfig, dateRange, drive, useCustomPath, globalTaxRate } = options;
    const db = getDatabaseMain();
    const taxRate = globalTaxRate || (() => {
      const taxRateStr = getSetting(db, "globalTaxRate");
      return taxRateStr ? parseFloat(taxRateStr) : 8;
    })();
    const vat8 = businessInfo.vatNumber.substring(0, 8).padStart(8, "0");
    const year = "year" in dateRange ? String(dateRange.year).slice(-2) : String(dateRange.start.getFullYear()).slice(-2);
    const now = /* @__PURE__ */ new Date();
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const DD = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const baseDir = useCustomPath ? path.join(drive, "OPENFRMT") : path.join(drive, "OPENFRMT");
    const businessDir = path.join(baseDir, `${vat8}.${year}`);
    const timestampDir = path.join(businessDir, `${MM}${DD}${hh}${mm}`);
    let finalDir = timestampDir;
    let counter = 0;
    while (fs.existsSync(finalDir) && counter < 60) {
      const newMinute = (parseInt(mm) + counter + 1) % 60;
      const newMinuteStr = String(newMinute).padStart(2, "0");
      finalDir = path.join(businessDir, `${MM}${DD}${hh}${newMinuteStr}`);
      counter++;
    }
    fs.mkdirSync(finalDir, { recursive: true });
    const generateUniqueId = () => {
      const timestamp = Date.now().toString();
      const random = Math.floor(Math.random() * 1e3).toString();
      return (timestamp + random).slice(-15).padStart(15, "0");
    };
    const uniqueId = generateUniqueId();
    const padRight = (str, len, pad = " ") => {
      return (str || "").padEnd(len, pad).substring(0, len);
    };
    const padLeft = (str, len, pad = "0") => {
      return (str || "").padStart(len, pad).substring(0, len);
    };
    const formatAmount = (value, len = 15) => {
      const absValue = Math.abs(value);
      const integerPart = Math.floor(absValue);
      const decimalPart = Math.round((absValue - integerPart) * 100);
      const integerStr = padLeft(integerPart.toString(), 12, "0");
      const decimalStr = padLeft(decimalPart.toString(), 2, "0");
      const sign = value < 0 ? "-" : "+";
      return integerStr + decimalStr + sign;
    };
    const formatDate = (date) => {
      const year2 = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year2}${month}${day}`;
    };
    const formatTime = (date) => {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${hours}${minutes}`;
    };
    const bkmvLines = [];
    let recordNumber = 1;
    const recordCounts = {
      A100: 0,
      C100: 0,
      D110: 0,
      D120: 0,
      Z900: 0
    };
    let a100 = "A100";
    a100 += padLeft(recordNumber.toString(), 9, "0");
    a100 += padLeft(businessInfo.vatNumber, 9, "0");
    a100 += padLeft(uniqueId, 15, "0");
    a100 += "&OF1.31&";
    a100 += padRight("", 50);
    bkmvLines.push(a100);
    recordCounts.A100 = 1;
    recordNumber++;
    for (const transaction of transactions) {
      let c100 = "C100";
      c100 += padLeft(recordNumber.toString(), 9, "0");
      c100 += padLeft(businessInfo.vatNumber, 9, "0");
      c100 += padRight("", 9);
      c100 += padLeft(transaction.documentType.toString(), 3, "0");
      c100 += padRight(transaction.transactionNumber, 20);
      c100 += formatDate(transaction.documentProductionDate);
      c100 += padRight("", 250);
      c100 += transaction.documentDiscount ? formatAmount(-Math.abs(transaction.documentDiscount), 15) : padRight("", 15);
      c100 += padRight("", 45);
      c100 += transaction.whtDeduction ? formatAmount(Math.abs(transaction.whtDeduction), 12) : padRight("", 12);
      c100 += padRight("", 26);
      c100 += formatDate(transaction.createdAt);
      c100 += transaction.branchId ? padRight(transaction.branchId, 7) : padRight("", 7);
      c100 += padRight("", 444 - c100.length);
      bkmvLines.push(c100);
      recordCounts.C100++;
      recordNumber++;
      let lineNum = 1;
      for (const item of transaction.cart.items) {
        let d110 = "D110";
        d110 += padLeft(recordNumber.toString(), 9, "0");
        d110 += padLeft(businessInfo.vatNumber, 9, "0");
        d110 += padRight("", 9);
        d110 += padLeft(transaction.documentType.toString(), 3, "0");
        d110 += padRight(transaction.transactionNumber, 20);
        d110 += padLeft(lineNum.toString(), 4, "0");
        d110 += padRight("", 3);
        d110 += padRight("", 20);
        d110 += String(item.transactionType || 2);
        d110 += padRight(item.product.sku || "", 20);
        d110 += padRight(item.product.name, 30);
        d110 += padRight("", 50);
        d110 += padRight("", 30);
        d110 += padRight("", 20);
        const qtyInteger = Math.floor(item.quantity);
        const qtyDecimal = Math.round((item.quantity - qtyInteger) * 1e4);
        d110 += padLeft(qtyInteger.toString(), 12, "0") + padLeft(qtyDecimal.toString(), 4, "0") + "+";
        d110 += formatAmount(item.unitPrice, 15);
        d110 += item.lineDiscount ? formatAmount(-Math.abs(item.lineDiscount), 15) : padRight("", 15);
        d110 += formatAmount(item.totalPrice, 15);
        const vatPercent = Math.round(taxRate);
        d110 += padLeft(vatPercent.toString(), 2, "0");
        d110 += transaction.branchId ? padRight(transaction.branchId, 7) : padRight("", 7);
        d110 += formatDate(transaction.createdAt);
        d110 += padRight("", 339 - d110.length);
        bkmvLines.push(d110);
        recordCounts.D110++;
        recordNumber++;
        lineNum++;
      }
      const paymentTypeMap = {
        "cash": 1,
        "check": 2,
        "card": 3,
        "digital": 4,
        "gift_card": 9
      };
      const paymentType = paymentTypeMap[transaction.paymentDetails.method.type] || 9;
      let d120 = "D120";
      d120 += padLeft(recordNumber.toString(), 9, "0");
      d120 += padLeft(businessInfo.vatNumber, 9, "0");
      d120 += padRight("", 9);
      d120 += padLeft(transaction.documentType.toString(), 3, "0");
      d120 += padRight(transaction.transactionNumber, 20);
      d120 += padLeft("1", 4, "0");
      d120 += String(paymentType);
      d120 += transaction.paymentDetails.method.type === "check" && transaction.paymentDetails.bankNumber ? padLeft(transaction.paymentDetails.bankNumber, 10, "0") : padRight("", 10);
      d120 += padRight("", 10);
      d120 += padRight("", 15);
      d120 += padRight("", 10);
      d120 += padRight("", 8);
      d120 += formatAmount(transaction.paymentDetails.amount, 15);
      d120 += padRight("", 1);
      d120 += padRight("", 20);
      d120 += transaction.paymentDetails.method.type === "card" && transaction.paymentDetails.creditTransactionType ? String(transaction.paymentDetails.creditTransactionType) : padRight("", 1);
      d120 += transaction.branchId ? padRight(transaction.branchId, 7) : padRight("", 7);
      d120 += formatDate(transaction.createdAt);
      d120 += padRight("", 7);
      d120 += padRight("", 222 - d120.length);
      bkmvLines.push(d120);
      recordCounts.D120++;
      recordNumber++;
    }
    const totalRecords = recordNumber;
    let z900 = "Z900";
    z900 += padLeft(recordNumber.toString(), 9, "0");
    z900 += padLeft(businessInfo.vatNumber, 9, "0");
    z900 += padLeft(uniqueId, 15, "0");
    z900 += "&OF1.31&";
    z900 += padLeft(totalRecords.toString(), 15, "0");
    z900 += padRight("", 50);
    bkmvLines.push(z900);
    recordCounts.Z900 = 1;
    const bkmvPath = path.join(finalDir, "BKMVDATA.TXT");
    const bkmvContent = bkmvLines.join("\r\n") + "\r\n";
    const bkmvBuffer = iconv.encode(bkmvContent, "iso88598");
    fs.writeFileSync(bkmvPath, bkmvBuffer);
    const zipPath = path.join(finalDir, "BKMVDATA.zip");
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", () => resolve(void 0));
      archive.on("error", reject);
      archive.pipe(output);
      archive.file(bkmvPath, { name: "BKMVDATA.TXT" });
      archive.finalize();
    });
    const processDate = /* @__PURE__ */ new Date();
    const iniLines = [];
    let a000 = "A000";
    a000 += padRight("", 5);
    a000 += padLeft(totalRecords.toString(), 15, "0");
    a000 += padLeft(businessInfo.vatNumber, 9, "0");
    a000 += padLeft(uniqueId, 15, "0");
    a000 += padRight(taxReportConfig.systemCode, 8);
    a000 += padLeft(softwareInfo.registrationNumber, 8, "0");
    a000 += padRight(softwareInfo.name, 20);
    a000 += padRight(softwareInfo.version, 20);
    a000 += padLeft(softwareInfo.manufacturerId, 9, "0");
    a000 += padRight(softwareInfo.manufacturerName, 20);
    a000 += softwareInfo.softwareType === "single-year" ? "1" : "2";
    a000 += padRight(path.join(businessDir, path.basename(finalDir)), 50);
    a000 += taxReportConfig.accountingType;
    a000 += taxReportConfig.balancingRequired ? "1" : "0";
    a000 += padLeft(businessInfo.vatNumber, 9, "0");
    a000 += padLeft(businessInfo.companyRegNumber || "000000001", 9, "0");
    a000 += padRight(businessInfo.companyName, 50);
    a000 += padRight(businessInfo.companyAddress, 50);
    a000 += padRight(businessInfo.companyAddressNumber, 10);
    a000 += padRight(businessInfo.companyCity, 30);
    a000 += padRight(businessInfo.companyZip, 8);
    if ("year" in dateRange) {
      a000 += String(dateRange.year);
      a000 += String(dateRange.year) + "0101";
      a000 += String(dateRange.year) + "1231";
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
    a000 += businessInfo.hasBranches ? "1" : "0";
    a000 += padRight("", 466 - a000.length);
    iniLines.push(a000);
    for (const [recordType, count] of Object.entries(recordCounts)) {
      if (count > 0) {
        iniLines.push(recordType + padLeft(count.toString(), 15, "0"));
      }
    }
    const iniPath = path.join(finalDir, "INI.TXT");
    const iniContent = iniLines.join("\r\n") + "\r\n";
    const iniBuffer = iconv.encode(iniContent, "iso88598");
    fs.writeFileSync(iniPath, iniBuffer);
    return {
      success: true,
      filePath: finalDir,
      recordCounts
    };
  } catch (error) {
    console.error("Error generating tax report:", error);
    return {
      success: false,
      error: error.message || "Failed to generate tax report"
    };
  }
});
ipcMain.handle("print-report-summary", async (event, summary) => {
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
            <strong>Status:</strong> ${summary.success ? "Success" : "Failed"}
          </div>
          ${summary.filePath ? `<div class="summary-item"><strong>File Path:</strong> ${summary.filePath}</div>` : ""}
          ${summary.recordCounts ? `
            <div class="summary-item">
              <strong>Record Counts:</strong>
              <ul class="record-counts">
                ${Object.entries(summary.recordCounts).map(([type, count]) => `<li>${type}: ${count}</li>`).join("")}
              </ul>
            </div>
          ` : ""}
          <div class="summary-item">
            <strong>Generated:</strong> ${(/* @__PURE__ */ new Date()).toLocaleString()}
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
    await new Promise((resolve) => setTimeout(resolve, 500));
    return new Promise((resolve) => {
      printWindow.webContents.print({ silent: true }, (success) => {
        printWindow.close();
        resolve({ success, printed: success });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle("get-database-path", async () => {
  try {
    const userDataPath = app.getPath("userData");
    const defaultPath = path.join(userDataPath, "database", "pos.db");
    const settingsPath = path.join(userDataPath, "settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      if (settings.databasePath) {
        return settings.databasePath;
      }
    }
    return defaultPath;
  } catch (error) {
    console.error("Error getting database path:", error);
    const userDataPath = app.getPath("userData");
    return path.join(userDataPath, "database", "pos.db");
  }
});
ipcMain.handle("set-database-path", async (event, dbPath) => {
  try {
    const userDataPath = app.getPath("userData");
    const settingsPath = path.join(userDataPath, "settings.json");
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
    settings.databasePath = dbPath;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (error) {
    console.error("Error setting database path:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("initialize-database", async (event, dbPath) => {
  try {
    initializeDatabaseMain(dbPath);
    return { success: true, path: dbPath };
  } catch (error) {
    console.error("Error initializing database:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("database-exists", async (event, dbPath) => {
  try {
    return fs.existsSync(dbPath);
  } catch (error) {
    return false;
  }
});
ipcMain.handle("backup-database", async (event, dbPath) => {
  try {
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: "Database file does not exist" };
    }
    const backupDir = path.join(path.dirname(dbPath), "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `pos-backup-${timestamp}.db`);
    fs.copyFileSync(dbPath, backupPath);
    return { success: true, backupPath };
  } catch (error) {
    console.error("Error backing up database:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("select-database-path", async () => {
  try {
    const result = await dialog.showSaveDialog(win, {
      title: "Select Database Location",
      defaultPath: "pos.db",
      filters: [
        { name: "SQLite Database", extensions: ["db"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return result.filePath;
  } catch (error) {
    console.error("Error selecting database path:", error);
    return null;
  }
});
ipcMain.handle("db-get-products", async () => {
  try {
    const db = getDatabaseMain();
    return getAllProducts(db);
  } catch (error) {
    console.error("Error getting products:", error);
    return [];
  }
});
ipcMain.handle("db-save-product", async (event, product) => {
  try {
    const db = getDatabaseMain();
    saveProduct(db, product);
    return { success: true };
  } catch (error) {
    console.error("Error saving product:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("db-get-categories", async () => {
  try {
    const db = getDatabaseMain();
    return getAllCategories(db);
  } catch (error) {
    console.error("Error getting categories:", error);
    return [];
  }
});
ipcMain.handle("db-save-category", async (event, category) => {
  try {
    const db = getDatabaseMain();
    saveCategory(db, category);
    return { success: true };
  } catch (error) {
    console.error("Error saving category:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("db-get-users", async () => {
  try {
    const db = getDatabaseMain();
    return getAllUsers(db);
  } catch (error) {
    console.error("Error getting users:", error);
    return [];
  }
});
ipcMain.handle("db-save-user", async (event, user) => {
  try {
    const db = getDatabaseMain();
    saveUser(db, user);
    return { success: true };
  } catch (error) {
    console.error("Error saving user:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("db-get-todays-transactions", async () => {
  try {
    const db = getDatabaseMain();
    return getTodaysTransactions(db);
  } catch (error) {
    console.error("Error getting today's transactions:", error);
    return [];
  }
});
ipcMain.handle("db-get-transactions-by-date-range", async (event, startDate, endDate) => {
  try {
    const db = getDatabaseMain();
    return getTransactionsByDateRange(db, startDate, endDate);
  } catch (error) {
    console.error("Error getting transactions by date range:", error);
    return [];
  }
});
ipcMain.handle("db-get-transactions-page", async (event, options) => {
  try {
    const db = getDatabaseMain();
    return getTransactionsPage(db, options);
  } catch (error) {
    console.error("Error getting transactions page:", error);
    return { transactions: [], total: 0 };
  }
});
ipcMain.handle("db-save-transaction", async (event, transaction) => {
  try {
    const db = getDatabaseMain();
    const tx = {
      ...transaction,
      createdAt: transaction.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: transaction.updatedAt || (/* @__PURE__ */ new Date()).toISOString(),
      documentProductionDate: transaction.documentProductionDate || (/* @__PURE__ */ new Date()).toISOString()
    };
    saveTransaction(db, tx);
    return { success: true };
  } catch (error) {
    console.error("Error saving transaction:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("db-get-business-info", async () => {
  try {
    const db = getDatabaseMain();
    return getBusinessInfo(db);
  } catch (error) {
    console.error("Error getting business info:", error);
    return null;
  }
});
ipcMain.handle("db-save-business-info", async (event, info) => {
  try {
    const db = getDatabaseMain();
    saveBusinessInfo(db, info);
    return { success: true };
  } catch (error) {
    console.error("Error saving business info:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("db-get-software-info", async () => {
  try {
    const db = getDatabaseMain();
    return getSoftwareInfo(db);
  } catch (error) {
    console.error("Error getting software info:", error);
    return null;
  }
});
ipcMain.handle("db-save-software-info", async (event, info) => {
  try {
    const db = getDatabaseMain();
    saveSoftwareInfo(db, info);
    return { success: true };
  } catch (error) {
    console.error("Error saving software info:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("db-get-setting", async (event, key) => {
  try {
    const db = getDatabaseMain();
    return getSetting(db, key);
  } catch (error) {
    if (error.message === "Database not initialized") {
      console.warn("Database not initialized when getting setting:", key);
      return null;
    }
    console.error("Error getting setting:", error);
    return null;
  }
});
ipcMain.handle("db-save-setting", async (event, key, value) => {
  try {
    const db = getDatabaseMain();
    setSetting(db, key, value);
    return { success: true };
  } catch (error) {
    if (error.message === "Database not initialized") {
      console.warn("Database not initialized when saving setting:", key);
      return { success: false, error: "Database not initialized" };
    }
    console.error("Error saving setting:", error);
    return { success: false, error: error.message };
  }
});
