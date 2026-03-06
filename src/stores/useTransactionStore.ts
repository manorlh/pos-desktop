import { create } from 'zustand';
import type { Transaction, Cart, CartItem, Customer, User } from '../types/index';
import { generateUUID } from '../utils/uuid';
import { useTradingDayStore } from './useTradingDayStore';
import { useSettingsStore } from './useSettingsStore';
// Database operations will be added via IPC later
// import { 
//   getDatabase,
//   saveTransaction, 
//   getTodaysTransactions, 
//   getTransactionsByDateRange,
//   getTransactionsPage 
// } from '../database/database';

interface CashPaymentDetails {
  amountTendered: number;
  changeAmount: number;
}

interface TransactionStore {
  transactions: Transaction[]; // Only today's transactions in memory
  currentUser: User | null;
  addTransaction: (
    cart: Cart, 
    paymentDetails: CashPaymentDetails, 
    customer?: Customer
  ) => Promise<Transaction>;
  getTransactionById: (id: string) => Transaction | undefined;
  getTransactionsByDate: (date: Date) => Transaction[];
  getTransactionsByDateRange: (startDate: Date, endDate: Date) => Promise<Transaction[]>;
  getTodaysTransactions: () => Transaction[];
  loadTransactionsPage: (page: number, limit: number, filters?: any) => Promise<{ transactions: Transaction[]; total: number }>;
  setCurrentUser: (user: User) => void;
  generateTransactionNumber: () => string;
  loadTodaysTransactions: () => Promise<void>;
  createRefundTransaction: (
    originalTransaction: Transaction,
    options: { fullRefund: boolean; partialItems?: { itemId: string; quantity: number }[]; amountReturned?: number }
  ) => Promise<Transaction>;
  updateTransactionStatus: (transactionId: string, status: Transaction['status']) => Promise<void>;
}

export const useTransactionStore = create<TransactionStore>((set, get) => ({
  transactions: [],
  currentUser: null,

  addTransaction: async (
    cart: Cart,
    paymentDetails: CashPaymentDetails,
    customer?: Customer
  ): Promise<Transaction> => {
    const { currentUser, generateTransactionNumber } = get();
    
    if (!currentUser) {
      throw new Error('No user logged in');
    }

    // Check if trading day is open
    const { isDayOpen } = useTradingDayStore.getState();
    if (!isDayOpen) {
      throw new Error('Cannot process transaction: Day is closed');
    }

    const now = new Date();
    
    // Determine document type: 305 for invoice (with customer), 400 for receipt (no customer)
    const documentType = customer ? 305 : 400;

    const transaction: Transaction = {
      id: generateUUID(),
      transactionNumber: generateTransactionNumber(),
      cart,
      customer,
      status: 'completed',
      cashier: currentUser,
      createdAt: now,
      updatedAt: now,
      // Tax Authority fields
      documentType,
      documentProductionDate: now, // System-determined
      documentDiscount: cart.discountAmount > 0 ? cart.discountAmount : undefined,
      // Cash payment fields
      amountTendered: paymentDetails.amountTendered,
      changeAmount: paymentDetails.changeAmount,
    };

    // Save to database via IPC
    try {
      if (window.electronAPI) {
        await window.electronAPI.dbSaveTransaction({
          ...transaction,
          cart: {
            ...transaction.cart,
            items: transaction.cart.items.map(item => ({
              ...item,
              product: {
                ...item.product,
                createdAt: item.product.createdAt.toISOString(),
                updatedAt: item.product.updatedAt.toISOString(),
              },
            })),
            createdAt: transaction.cart.createdAt.toISOString(),
            updatedAt: transaction.cart.updatedAt.toISOString(),
          },
          customer: transaction.customer ? {
            ...transaction.customer,
            createdAt: transaction.customer.createdAt.toISOString(),
            updatedAt: transaction.customer.updatedAt.toISOString(),
          } : undefined,
          cashier: {
            ...transaction.cashier,
            createdAt: transaction.cashier.createdAt.toISOString(),
            updatedAt: transaction.cashier.updatedAt.toISOString(),
          },
          createdAt: transaction.createdAt.toISOString(),
          updatedAt: transaction.updatedAt.toISOString(),
          documentProductionDate: transaction.documentProductionDate.toISOString(),
        });
      }
    } catch (error) {
      console.error('Failed to save transaction to database:', error);
    }
    
    // Add to in-memory store if it's today's transaction
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const transactionDate = new Date(transaction.createdAt);
    transactionDate.setHours(0, 0, 0, 0);
    
    if (transactionDate.getTime() === today.getTime()) {
      set((state) => ({
        transactions: [transaction, ...state.transactions]
      }));
    }

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

  getTransactionsByDateRange: async (startDate: Date, endDate: Date): Promise<Transaction[]> => {
    try {
      if (window.electronAPI) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        
        const transactionsData = await window.electronAPI.dbGetTransactionsByDateRange(
          start.toISOString(),
          end.toISOString()
        );
        
        // Convert dates and reconstruct Transaction objects
        return transactionsData.map((tx: any) => ({
          id: tx.id,
          transactionNumber: tx.transactionNumber,
          cart: {
            ...tx.cart,
            items: tx.cart.items.map((item: any) => ({
              ...item,
              product: {
                ...item.product,
                createdAt: new Date(item.product.createdAt),
                updatedAt: new Date(item.product.updatedAt),
              },
            })),
            createdAt: new Date(tx.cart.createdAt),
            updatedAt: new Date(tx.cart.updatedAt),
          },
          customer: tx.customer ? {
            ...tx.customer,
            createdAt: new Date(tx.customer.createdAt),
            updatedAt: new Date(tx.customer.updatedAt),
          } : undefined,
          status: tx.status,
          receiptUrl: tx.receiptUrl,
          notes: tx.notes,
          cashier: {
            ...tx.cashier,
            createdAt: new Date(tx.cashier.createdAt),
            updatedAt: new Date(tx.cashier.updatedAt),
          },
          createdAt: new Date(tx.createdAt),
          updatedAt: new Date(tx.updatedAt),
          documentType: tx.documentType,
          documentProductionDate: new Date(tx.documentProductionDate),
          branchId: tx.branchId,
          documentDiscount: tx.documentDiscount,
          whtDeduction: tx.whtDeduction,
          amountTendered: tx.amountTendered,
          changeAmount: tx.changeAmount,
          refundOfTransactionId: tx.refundOfTransactionId,
        }));
      } else {
        // Fallback to in-memory
        const { transactions } = get();
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        return transactions.filter(transaction => {
          const transactionDate = new Date(transaction.createdAt);
          return transactionDate >= start && transactionDate <= end;
        });
      }
    } catch (error) {
      console.error('Failed to get transactions by date range:', error);
      // Fallback to in-memory
      const { transactions } = get();
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      return transactions.filter(transaction => {
        const transactionDate = new Date(transaction.createdAt);
        return transactionDate >= start && transactionDate <= end;
      });
    }
  },

  getTodaysTransactions: () => {
    const { transactions } = get();
    return transactions;
  },

  loadTransactionsPage: async (page: number, limit: number = 50, filters?: any) => {
    try {
      if (window.electronAPI) {
        const offset = (page - 1) * limit;
        const options: any = {
          limit,
          offset,
          ...filters,
        };
        
        if (filters?.startDate) {
          options.startDate = filters.startDate.toISOString();
        }
        if (filters?.endDate) {
          options.endDate = filters.endDate.toISOString();
        }
        if (filters?.searchQuery) {
          options.searchQuery = filters.searchQuery;
        }
        if (filters?.status) {
          options.status = filters.status;
        }
        
        const result = await window.electronAPI.dbGetTransactionsPage(options);
        
        // Convert dates and reconstruct Transaction objects
        const transactions: Transaction[] = result.transactions.map((tx: any) => ({
          id: tx.id,
          transactionNumber: tx.transactionNumber,
          cart: {
            ...tx.cart,
            items: tx.cart.items.map((item: any) => ({
              ...item,
              product: {
                ...item.product,
                createdAt: new Date(item.product.createdAt),
                updatedAt: new Date(item.product.updatedAt),
              },
            })),
            createdAt: new Date(tx.cart.createdAt),
            updatedAt: new Date(tx.cart.updatedAt),
          },
          customer: tx.customer ? {
            ...tx.customer,
            createdAt: new Date(tx.customer.createdAt),
            updatedAt: new Date(tx.customer.updatedAt),
          } : undefined,
          status: tx.status,
          receiptUrl: tx.receiptUrl,
          notes: tx.notes,
          cashier: {
            ...tx.cashier,
            createdAt: new Date(tx.cashier.createdAt),
            updatedAt: new Date(tx.cashier.updatedAt),
          },
          createdAt: new Date(tx.createdAt),
          updatedAt: new Date(tx.updatedAt),
          documentType: tx.documentType,
          documentProductionDate: new Date(tx.documentProductionDate),
          branchId: tx.branchId,
          documentDiscount: tx.documentDiscount,
          whtDeduction: tx.whtDeduction,
          amountTendered: tx.amountTendered,
          changeAmount: tx.changeAmount,
          refundOfTransactionId: tx.refundOfTransactionId,
        }));
        
        return { transactions, total: result.total };
      } else {
        return { transactions: [], total: 0 };
      }
    } catch (error) {
      console.error('Failed to load transactions page:', error);
      return { transactions: [], total: 0 };
    }
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

  loadTodaysTransactions: async () => {
    try {
      if (window.electronAPI) {
        const transactionsData = await window.electronAPI.dbGetTodaysTransactions();
        // Convert dates and reconstruct Transaction objects
        const transactions: Transaction[] = transactionsData.map((tx: any) => ({
          id: tx.id,
          transactionNumber: tx.transactionNumber,
          cart: {
            ...tx.cart,
            items: tx.cart.items.map((item: any) => ({
              ...item,
              product: {
                ...item.product,
                createdAt: new Date(item.product.createdAt),
                updatedAt: new Date(item.product.updatedAt),
              },
            })),
            createdAt: new Date(tx.cart.createdAt),
            updatedAt: new Date(tx.cart.updatedAt),
          },
          customer: tx.customer ? {
            ...tx.customer,
            createdAt: new Date(tx.customer.createdAt),
            updatedAt: new Date(tx.customer.updatedAt),
          } : undefined,
          status: tx.status,
          receiptUrl: tx.receiptUrl,
          notes: tx.notes,
          cashier: {
            ...tx.cashier,
            createdAt: new Date(tx.cashier.createdAt),
            updatedAt: new Date(tx.cashier.updatedAt),
          },
          createdAt: new Date(tx.createdAt),
          updatedAt: new Date(tx.updatedAt),
          documentType: tx.documentType,
          documentProductionDate: new Date(tx.documentProductionDate),
          branchId: tx.branchId,
          documentDiscount: tx.documentDiscount,
          whtDeduction: tx.whtDeduction,
          amountTendered: tx.amountTendered,
          changeAmount: tx.changeAmount,
          refundOfTransactionId: tx.refundOfTransactionId,
        }));
        set({ transactions });
      } else {
        set({ transactions: [] });
      }
    } catch (error) {
      console.error('Failed to load today\'s transactions:', error);
      set({ transactions: [] });
    }
  },

  createRefundTransaction: async (
    originalTransaction: Transaction,
    options: { fullRefund: boolean; partialItems?: { itemId: string; quantity: number }[]; amountReturned?: number }
  ): Promise<Transaction> => {
    const { currentUser, generateTransactionNumber } = get();
    if (!currentUser) throw new Error('No user logged in');
    const { isDayOpen } = useTradingDayStore.getState();
    if (!isDayOpen) throw new Error('Cannot process refund: Day is closed');

    let items: CartItem[];
    if (options.fullRefund) {
      items = originalTransaction.cart.items.map((item) => ({
        ...item,
        id: generateUUID(),
        quantity: item.quantity,
        totalPrice: item.totalPrice,
      }));
    } else if (options.partialItems?.length) {
      items = options.partialItems
        .map(({ itemId, quantity }) => {
          const originalItem = originalTransaction.cart.items.find((i) => i.id === itemId);
          if (!originalItem || quantity <= 0) return null;
          const qty = Math.min(quantity, originalItem.quantity);
          const totalPrice = originalItem.unitPrice * qty - (originalItem.lineDiscount || 0) * (qty / originalItem.quantity);
          return {
            id: generateUUID(),
            productId: originalItem.productId,
            product: originalItem.product,
            quantity: qty,
            unitPrice: originalItem.unitPrice,
            totalPrice,
            discount: originalItem.discount,
            discountType: originalItem.discountType,
            notes: originalItem.notes,
            transactionType: originalItem.transactionType,
            lineDiscount: originalItem.lineDiscount ? (originalItem.lineDiscount * qty) / originalItem.quantity : undefined,
          } as CartItem;
        })
        .filter(Boolean) as CartItem[];
    } else {
      throw new Error('Partial refund requires partialItems');
    }

    const taxRate = (useSettingsStore.getState().globalTaxRate ?? 0.08) as number;
    const totalAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);
    const discountAmount = items.reduce((sum, i) => sum + (i.discount || 0), 0);
    const totalWithTax = totalAmount;
    const subtotal = totalWithTax / (1 + taxRate);
    const taxAmount = totalWithTax - subtotal;

    const now = new Date();
    const cart: Cart = {
      id: generateUUID(),
      items,
      subtotal,
      taxAmount,
      discountAmount,
      totalAmount,
      customerId: originalTransaction.customer?.id,
      createdAt: now,
      updatedAt: now,
    };

    const amountReturned = options.amountReturned ?? cart.totalAmount;
    const refundTransaction: Transaction = {
      id: generateUUID(),
      transactionNumber: generateTransactionNumber(),
      cart,
      customer: originalTransaction.customer,
      status: 'completed',
      cashier: currentUser,
      createdAt: now,
      updatedAt: now,
      documentType: 330,
      documentProductionDate: now,
      branchId: originalTransaction.branchId,
      documentDiscount: cart.discountAmount > 0 ? cart.discountAmount : undefined,
      amountTendered: amountReturned,
      changeAmount: 0,
      refundOfTransactionId: originalTransaction.id,
    };

    if (window.electronAPI) {
      await window.electronAPI.dbSaveTransaction({
        ...refundTransaction,
        cart: {
          ...refundTransaction.cart,
          items: refundTransaction.cart.items.map((item) => ({
            ...item,
            product: {
              ...item.product,
              createdAt: item.product.createdAt.toISOString(),
              updatedAt: item.product.updatedAt.toISOString(),
            },
          })),
          createdAt: refundTransaction.cart.createdAt.toISOString(),
          updatedAt: refundTransaction.cart.updatedAt.toISOString(),
        },
        customer: refundTransaction.customer
          ? {
              ...refundTransaction.customer,
              createdAt: refundTransaction.customer.createdAt.toISOString(),
              updatedAt: refundTransaction.customer.updatedAt.toISOString(),
            }
          : undefined,
        cashier: {
          ...refundTransaction.cashier,
          createdAt: refundTransaction.cashier.createdAt.toISOString(),
          updatedAt: refundTransaction.cashier.updatedAt.toISOString(),
        },
        createdAt: refundTransaction.createdAt.toISOString(),
        updatedAt: refundTransaction.updatedAt.toISOString(),
        documentProductionDate: refundTransaction.documentProductionDate.toISOString(),
      });
      await window.electronAPI.dbUpdateTransactionStatus(
        originalTransaction.id,
        options.fullRefund ? 'refunded' : 'partial_refund'
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const txDate = new Date(refundTransaction.createdAt);
    txDate.setHours(0, 0, 0, 0);
    if (txDate.getTime() === today.getTime()) {
      set((state) => ({ transactions: [refundTransaction, ...state.transactions] }));
    }
    return refundTransaction;
  },

  updateTransactionStatus: async (transactionId: string, status: Transaction['status']): Promise<void> => {
    if (window.electronAPI) {
      const result = await window.electronAPI.dbUpdateTransactionStatus(transactionId, status);
      if (!result.success) throw new Error(result.error);
    }
    set((state) => ({
      transactions: state.transactions.map((t) =>
        t.id === transactionId ? { ...t, status, updatedAt: new Date() } : t
      ),
    }));
  },
}));
