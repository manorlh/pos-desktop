import { create } from 'zustand';
import type { Transaction, PaymentMethod, PaymentDetails, Cart, Customer, User } from '../types/index';
import { generateUUID } from '../utils/uuid';

interface TransactionStore {
  transactions: Transaction[];
  paymentMethods: PaymentMethod[];
  currentUser: User | null;
  addTransaction: (
    cart: Cart, 
    paymentDetails: PaymentDetails, 
    customer?: Customer
  ) => Promise<Transaction>;
  getTransactionById: (id: string) => Transaction | undefined;
  getTransactionsByDate: (date: Date) => Transaction[];
  getTransactionsByDateRange: (startDate: Date, endDate: Date) => Transaction[];
  getTodaysTransactions: () => Transaction[];
  setPaymentMethods: (methods: PaymentMethod[]) => void;
  setCurrentUser: (user: User) => void;
  generateTransactionNumber: () => string;
}

export const useTransactionStore = create<TransactionStore>((set, get) => ({
  transactions: [],
  paymentMethods: [],
  currentUser: null,

  addTransaction: async (
    cart: Cart,
    paymentDetails: PaymentDetails,
    customer?: Customer
  ): Promise<Transaction> => {
    const { transactions, currentUser, generateTransactionNumber } = get();
    
    if (!currentUser) {
      throw new Error('No user logged in');
    }

    const now = new Date();
    
    // Determine document type: 305 for invoice (with customer), 400 for receipt (no customer)
    const documentType = customer ? 305 : 400;

    const transaction: Transaction = {
      id: generateUUID(),
      transactionNumber: generateTransactionNumber(),
      cart,
      customer,
      paymentMethod: paymentDetails.method,
      paymentDetails,
      status: 'completed',
      cashier: currentUser,
      createdAt: now,
      updatedAt: now,
      // Tax Authority fields
      documentType,
      documentProductionDate: now, // System-determined
      documentDiscount: cart.discountAmount > 0 ? cart.discountAmount : undefined,
      // branchId and whtDeduction can be set later if needed
    };

    set({
      transactions: [...transactions, transaction]
    });

    return transaction;
  },

  getTransactionById: (id: string) => {
    const { transactions } = get();
    return transactions.find(transaction => transaction.id === id);
  },

  getTransactionsByDate: (date: Date) => {
    const { transactions } = get();
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    return transactions.filter(transaction => {
      const transactionDate = new Date(transaction.createdAt);
      return transactionDate >= targetDate && transactionDate < nextDate;
    });
  },

  getTransactionsByDateRange: (startDate: Date, endDate: Date) => {
    const { transactions } = get();
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return transactions.filter(transaction => {
      const transactionDate = new Date(transaction.createdAt);
      return transactionDate >= start && transactionDate <= end;
    });
  },

  getTodaysTransactions: () => {
    const today = new Date();
    return get().getTransactionsByDate(today);
  },

  setPaymentMethods: (methods: PaymentMethod[]) => {
    set({ paymentMethods: methods });
  },

  setCurrentUser: (user: User) => {
    set({ currentUser: user });
  },

  generateTransactionNumber: () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const timestamp = now.getTime().toString().slice(-6);
    
    return `POS${year}${month}${day}${timestamp}`;
  },
}));
