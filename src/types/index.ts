export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  sku: string;
  categoryId: string;
  imageUrl?: string;
  /** Offline-first image src (pos-asset:// or remote URL). */
  displayImageSrc?: string;
  inStock: boolean;
  /** Cloud merchandising toggle: false = show on till but not sellable. */
  isAvailable: boolean;
  /** False when cloud assortment marks product hidden for this shop. */
  shopListed?: boolean;
  /** Not used on POS; SQLite column kept for schema; always 0. */
  stockQuantity: number;
  barcode?: string;
  taxRate?: number;
  voucherId?: string;
  trackStock?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ValueDisplayMode = 'product_price' | 'fixed' | 'none';

export interface Voucher {
  id: string;
  cloudId?: string;
  name: string;
  isActive: boolean;
  title?: string;
  subtitle?: string;
  bodyText?: string;
  footerText?: string;
  validityDays?: number;
  valueDisplayMode: ValueDisplayMode;
  displayValue?: number;
  printBarcode: boolean;
  printQr: boolean;
  language?: string;
  updatedAt: string;
}

export interface IssuedVoucher {
  id: string;
  transactionId: string;
  transactionItemId?: string;
  voucherId?: string;
  productId?: string;
  productName?: string;
  quantity: number;
  unitValue?: number;
  faceValue?: number;
  issuedAt: string;
  expiresAt?: string;
  status: 'issued' | 'voided' | 'redeemed';
  reprintCount: number;
  lastPrintedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  imageUrl?: string;
  displayImageSrc?: string;
  parentId?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount?: number;
  discountType?: 'percentage' | 'fixed';
  notes?: string;
  // Tax Authority fields
  transactionType?: 1 | 2 | 3; // 1=Service, 2=Sale (Macher), 3=Service+Sale
  lineDiscount?: number; // Negative sign for discounts
}

export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  customerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: Address;
  loyaltyPoints?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface Transaction {
  id: string;
  transactionNumber: string;
  cart: Cart;
  customer?: Customer;
  status: TransactionStatus;
  receiptUrl?: string;
  notes?: string;
  cashier: User;
  createdAt: Date;
  updatedAt: Date;
  // Tax Authority fields
  documentType: number; // 320 = tax invoice/receipt, 330 = credit note (refund)
  documentProductionDate: Date; // System-determined, cannot be changed
  branchId?: string; // 7 characters, conditional if hasBranches=true
  documentDiscount?: number; // Negative sign for discounts
  whtDeduction?: number; // Positive sign, for receipts only (Withholding Tax)
  // Payment: cash and/or Nayax card terminal
  paymentMethod?: 'cash' | 'card';
  /** JSON string: vuid + device response subset for audit */
  nayaxMeta?: string;
  amountTendered?: number; // Cash amount tendered
  changeAmount?: number; // Change given
  tipAmount?: number;
  tipPaymentMethod?: 'cash' | 'card';
  // Refund link: when set, this transaction is a refund (credit) document for the original sale
  refundOfTransactionId?: string;
  issuedVouchers?: IssuedVoucher[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TransactionStatus = 'pending' | 'completed' | 'cancelled' | 'refunded' | 'partial_refund';

export interface DailySummary {
  date: Date;
  totalSales: number;
  totalTransactions: number;
  totalItems: number;
  averageTicket: number;
  topProducts: Array<{
    product: Product;
    quantitySold: number;
    revenue: number;
  }>;
  // Cash-only: no payment breakdown needed
}

export interface Receipt {
  id: string;
  transaction: Transaction;
  template: 'standard' | 'compact' | 'detailed';
  printedAt?: Date;
  emailSent?: boolean;
}

export interface TradingDay {
  id: string;
  dayDate: Date;
  openedAt: Date;
  closedAt?: Date;
  openingCash: number;
  closingCash?: number;
  expectedCash?: number;
  actualCash?: number;
  discrepancy?: number;
  openedBy: User;
  closedBy?: User;
  status: 'open' | 'closed';
  zReportData?: ZReportData;
  createdAt: Date;
  updatedAt: Date;
}

export interface ZReportData {
  totalSales: number;
  totalTransactions: number;
  totalItems: number;
  cashSales: number;
  cardSales?: number;
  taxCollected: number;
  totalTips: number;
  cashTips: number;
  cardTips: number;
  totalRefunds?: number;
  openingCash: number;
  expectedCash: number;
  actualCash: number;
  discrepancy: number;
  // Transactions are stored in the transactions table and can be queried by dayDate if needed
}
