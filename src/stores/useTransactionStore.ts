import { create } from 'zustand';
import type { Transaction, Cart, Customer, User } from '../types/index';
import { generateUUID } from '../utils/uuid';
import { useTradingDayStore } from './useTradingDayStore';
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
}));
