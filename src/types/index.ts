export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  sku: string;
  categoryId: string;
  imageUrl?: string;
  inStock: boolean;
  stockQuantity: number;
  barcode?: string;
  taxRate?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  imageUrl?: string;
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
  paymentMethod: PaymentMethod;
  paymentDetails: PaymentDetails;
  status: TransactionStatus;
  receiptUrl?: string;
  notes?: string;
  cashier: User;
  createdAt: Date;
  updatedAt: Date;
  // Tax Authority fields
  documentType: number; // 305 for invoice, 400 for receipt
  documentProductionDate: Date; // System-determined, cannot be changed
  branchId?: string; // 7 characters, conditional if hasBranches=true
  documentDiscount?: number; // Negative sign for discounts
  whtDeduction?: number; // Positive sign, for receipts only (Withholding Tax)
}

export interface PaymentMethod {
  id: string;
  type: 'cash' | 'card' | 'digital' | 'check' | 'gift_card';
  name: string;
  isActive: boolean;
}

export interface PaymentDetails {
  method: PaymentMethod;
  amount: number;
  amountTendered?: number;
  changeAmount?: number;
  cardLastFour?: string;
  cardType?: string;
  authorizationCode?: string;
  transactionId?: string;
  // Tax Authority fields
  bankNumber?: string; // For checks (10 digits)
  creditTransactionType?: 1 | 2 | 3 | 4; // For credit cards: 1=Regular, 2=Installments, 3=Credit, 4=Deferred Charge
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
  paymentBreakdown: Array<{
    method: PaymentMethod;
    count: number;
    amount: number;
  }>;
}

export interface Receipt {
  id: string;
  transaction: Transaction;
  template: 'standard' | 'compact' | 'detailed';
  printedAt?: Date;
  emailSent?: boolean;
}
