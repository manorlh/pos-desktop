import { safeRequireDatabase, isDatabaseAvailable } from './database-safe';
import { createSchema } from './schema';
import type { 
  ProductRow, 
  CategoryRow, 
  TransactionRow, 
  TransactionItemRow,
  CustomerRow,
  UserRow,
  SettingRow,
  BusinessInfoRow,
  SoftwareInfoRow
} from './schema';
import type { Product, Category, Transaction, CartItem, Customer, User } from '../types/index';

type Database = any; // Will be set when database is available
let dbInstance: any | null = null;

export function initializeDatabase(dbPath: string): any {
  if (!isDatabaseAvailable()) {
    throw new Error('Database not available. better-sqlite3 module could not be loaded.');
  }

  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (e) {
      // Ignore close errors
    }
  }

  const DB = safeRequireDatabase();
  dbInstance = new DB(dbPath);
  dbInstance.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
  dbInstance.pragma('foreign_keys = ON'); // Enable foreign key constraints
  
  createSchema(dbInstance);
  
  return dbInstance;
}

export function getDatabase(): any {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// Product operations
export function getAllProducts(db: any): Product[] {
  const rows = db.prepare('SELECT * FROM products ORDER BY name').all() as ProductRow[];
  return rows.map(row => ({
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
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

export function saveProduct(db: any, product: Product): void {
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
    product.createdAt.toISOString(),
    product.updatedAt.toISOString()
  );
}

// Category operations
export function getAllCategories(db: any): Category[] {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sortOrder, name').all() as CategoryRow[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    color: row.color || undefined,
    imageUrl: row.imageUrl || undefined,
    parentId: row.parentId || undefined,
    isActive: row.isActive === 1,
    sortOrder: row.sortOrder,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

export function saveCategory(db: any, category: Category): void {
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
    category.createdAt.toISOString(),
    category.updatedAt.toISOString()
  );
}

// Transaction operations (with pagination)
export interface TransactionQueryOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  status?: string;
}

export function getTransactionsPage(
  db: any,
  options: TransactionQueryOptions = {}
): { transactions: Transaction[]; total: number } {
  const { startDate, endDate, limit = 50, offset = 0, status } = options;
  
  let whereClause = '1=1';
  const params: any[] = [];
  
  if (startDate) {
    whereClause += ' AND datetime(createdAt) >= datetime(?)';
    params.push(startDate.toISOString());
  }
  
  if (endDate) {
    whereClause += ' AND datetime(createdAt) <= datetime(?)';
    params.push(endDate.toISOString());
  }
  
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  
  // Get total count
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM transactions WHERE ${whereClause}`);
  const countResult = countStmt.get(...params) as { count: number };
  const total = countResult.count;
  
  // Get paginated results
  params.push(limit, offset);
  const rows = db.prepare(`
    SELECT * FROM transactions 
    WHERE ${whereClause}
    ORDER BY createdAt DESC
    LIMIT ? OFFSET ?
  `).all(...params) as TransactionRow[];
  
  // Load related data
  const transactions: Transaction[] = [];
  for (const row of rows) {
    const transaction = loadTransactionWithRelations(db, row);
    transactions.push(transaction);
  }
  
  return { transactions, total };
}

function loadTransactionWithRelations(db: any, row: TransactionRow): Transaction {
  // Load customer
  let customer: Customer | undefined;
  if (row.customerId) {
    const customerRow = db.prepare('SELECT * FROM customers WHERE id = ?').get(row.customerId) as CustomerRow | undefined;
    if (customerRow) {
      customer = {
        id: customerRow.id,
        name: customerRow.name,
        email: customerRow.email || undefined,
        phone: customerRow.phone || undefined,
        address: customerRow.address ? JSON.parse(customerRow.address) : undefined,
        loyaltyPoints: customerRow.loyaltyPoints,
        createdAt: new Date(customerRow.createdAt),
        updatedAt: new Date(customerRow.updatedAt),
      };
    }
  }
  
  // Load cashier
  const cashierRow = db.prepare('SELECT * FROM users WHERE id = ?').get(row.cashierId) as UserRow;
  const cashier: User = {
    id: cashierRow.id,
    name: cashierRow.name,
    email: cashierRow.email,
    role: cashierRow.role as 'admin' | 'manager' | 'cashier',
    isActive: cashierRow.isActive === 1,
    createdAt: new Date(cashierRow.createdAt),
    updatedAt: new Date(cashierRow.updatedAt),
  };
  
  // Load cart items
  const itemRows = db.prepare('SELECT * FROM transaction_items WHERE transactionId = ?').all(row.id) as TransactionItemRow[];
  const products = getAllProducts(db);
  const items: CartItem[] = itemRows.map(itemRow => {
    const product = products.find(p => p.id === itemRow.productId);
    if (!product) throw new Error(`Product ${itemRow.productId} not found`);
    
    return {
      id: itemRow.id,
      productId: itemRow.productId,
      product,
      quantity: itemRow.quantity,
      unitPrice: itemRow.unitPrice,
      totalPrice: itemRow.totalPrice,
      discount: itemRow.discount || undefined,
      discountType: itemRow.discountType as 'percentage' | 'fixed' | undefined,
      notes: itemRow.notes || undefined,
      transactionType: itemRow.transactionType as 1 | 2 | 3 | undefined,
      lineDiscount: itemRow.lineDiscount || undefined,
    };
  });
  
  // Calculate cart totals
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxAmount = items.reduce((sum, item) => {
    const taxRate = item.product.taxRate || 0;
    return sum + (item.totalPrice * taxRate / 100);
  }, 0);
  const discountAmount = items.reduce((sum, item) => sum + (item.discount || 0), 0);
  const totalAmount = subtotal + taxAmount - discountAmount;
  
  const cart = {
    id: row.id,
    items,
    subtotal,
    taxAmount,
    discountAmount,
    totalAmount,
    customerId: row.customerId || undefined,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
  
  return {
    id: row.id,
    transactionNumber: row.transactionNumber,
    cart,
    customer,
    status: row.status as Transaction['status'],
    receiptUrl: row.receiptUrl || undefined,
    notes: row.notes || undefined,
    cashier,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    documentType: row.documentType,
    documentProductionDate: new Date(row.documentProductionDate),
    branchId: row.branchId || undefined,
    documentDiscount: row.documentDiscount || undefined,
    whtDeduction: row.whtDeduction || undefined,
    amountTendered: row.amountTendered || undefined,
    changeAmount: row.changeAmount || undefined,
  };
}

export function saveTransaction(db: any, transaction: Transaction): void {
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
      transaction.documentProductionDate.toISOString(),
      transaction.branchId || null,
      transaction.documentDiscount || null,
      transaction.whtDeduction || null,
      transaction.amountTendered || null,
      transaction.changeAmount || null,
      transaction.createdAt.toISOString(),
      transaction.updatedAt.toISOString()
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
  });
  
  trans();
}

export function getTodaysTransactions(db: any): Transaction[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const { transactions } = getTransactionsPage(db, {
    startDate: today,
    endDate: tomorrow,
    limit: 1000, // Load all today's transactions
  });
  
  return transactions;
}

export function getTransactionsByDateRange(db: any, startDate: Date, endDate: Date): Transaction[] {
  const { transactions } = getTransactionsPage(db, {
    startDate,
    endDate,
    limit: 10000, // Large limit for reports
  });
  
  return transactions;
}

// User operations
export function getAllUsers(db: any): User[] {
  const rows = db.prepare('SELECT * FROM users ORDER BY name').all() as UserRow[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as 'admin' | 'manager' | 'cashier',
    isActive: row.isActive === 1,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

export function saveUser(db: any, user: User): void {
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
    user.createdAt.toISOString(),
    user.updatedAt.toISOString()
  );
}

// Customer operations
export function saveCustomer(db: any, customer: Customer): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO customers 
    (id, name, email, phone, address, loyaltyPoints, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    customer.id,
    customer.name,
    customer.email || null,
    customer.phone || null,
    customer.address ? JSON.stringify(customer.address) : null,
    customer.loyaltyPoints || 0,
    customer.createdAt.toISOString(),
    customer.updatedAt.toISOString()
  );
}

// Settings operations
export function getSetting(db: any, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as SettingRow | undefined;
  return row?.value || null;
}

export function setSetting(db: any, key: string, value: string): void {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  stmt.run(key, value);
}

// Business info operations
export function getBusinessInfo(db: any): BusinessInfoRow | null {
  return db.prepare('SELECT * FROM business_info WHERE id = 1').get() as BusinessInfoRow | null;
}

export function saveBusinessInfo(db: any, info: any): void {
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

// Software info operations
export function getSoftwareInfo(db: any): SoftwareInfoRow | null {
  return db.prepare('SELECT * FROM software_info WHERE id = 1').get() as SoftwareInfoRow | null;
}

export function saveSoftwareInfo(db: any, info: any): void {
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

