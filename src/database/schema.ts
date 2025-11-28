// Database type will be provided at runtime

export interface DatabaseSchema {
  products: ProductRow;
  categories: CategoryRow;
  transactions: TransactionRow;
  transaction_items: TransactionItemRow;
  customers: CustomerRow;
  users: UserRow;
  settings: SettingRow;
  business_info: BusinessInfoRow;
  software_info: SoftwareInfoRow;
}

export interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sku: string;
  categoryId: string;
  imageUrl: string | null;
  inStock: number; // SQLite uses 0/1 for boolean
  stockQuantity: number;
  barcode: string | null;
  taxRate: number | null;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  imageUrl: string | null;
  parentId: string | null;
  isActive: number; // SQLite uses 0/1 for boolean
  sortOrder: number;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface TransactionRow {
  id: string;
  transactionNumber: string;
  customerId: string | null;
  status: string; // 'pending' | 'completed' | 'cancelled' | 'refunded' | 'partial_refund'
  receiptUrl: string | null;
  notes: string | null;
  cashierId: string;
  documentType: number; // 305 for invoice, 400 for receipt
  documentProductionDate: string; // ISO string
  branchId: string | null;
  documentDiscount: number | null;
  whtDeduction: number | null;
  amountTendered: number | null; // Cash amount tendered
  changeAmount: number | null; // Change given
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface TransactionItemRow {
  id: string;
  transactionId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount: number | null;
  discountType: string | null; // 'percentage' | 'fixed'
  transactionType: number | null; // 1=Service, 2=Sale, 3=Service+Sale
  lineDiscount: number | null;
  notes: string | null;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null; // JSON string
  loyaltyPoints: number;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string; // 'admin' | 'manager' | 'cashier'
  isActive: number; // SQLite uses 0/1 for boolean
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface SettingRow {
  key: string;
  value: string; // JSON string for complex values
}

export interface BusinessInfoRow {
  id: number; // Always 1
  vatNumber: string;
  companyName: string;
  companyAddress: string;
  companyAddressNumber: string;
  companyCity: string;
  companyZip: string;
  companyRegNumber: string | null;
  hasBranches: number; // SQLite uses 0/1 for boolean
  branchId: string | null;
  updatedAt: string; // ISO string
}

export interface SoftwareInfoRow {
  id: number; // Always 1
  registrationNumber: string;
  name: string;
  version: string;
  manufacturerId: string;
  manufacturerName: string;
  softwareType: string; // 'single-year' | 'multi-year'
  updatedAt: string; // ISO string
}

export function createSchema(db: any): void {
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

  // Transactions table (cash-only, no payment_methods table)
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

  // Business info table (single row)
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

  // Software info table (single row)
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

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_createdAt ON transactions(createdAt);
    CREATE INDEX IF NOT EXISTS idx_transactions_transactionNumber ON transactions(transactionNumber);
    CREATE INDEX IF NOT EXISTS idx_transactions_customerId ON transactions(customerId);
    CREATE INDEX IF NOT EXISTS idx_transaction_items_transactionId ON transaction_items(transactionId);
    CREATE INDEX IF NOT EXISTS idx_products_categoryId ON products(categoryId);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
  `);
}

