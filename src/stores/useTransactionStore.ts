import { create } from 'zustand';
import type { Transaction, Cart, CartItem, Customer, User } from '../types/index';
import {
  encodeRefundSourceItemNote,
  extractNayaxOriginalTransactionId,
  getRemainingQtyByOriginalItem,
  hasRemainingRefundable,
  hydrateTransactionFromDb,
} from '../utils/refundHelpers';
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

type TipExtras = { tipAmount?: number; tipPaymentMethod?: 'cash' | 'card' };

export type PaymentDetails =
  | ({ mode: 'cash'; amountTendered: number; changeAmount: number } & TipExtras)
  | ({ mode: 'card'; nayaxMeta: string } & TipExtras);

function applyTipFields(tx: Transaction, tip?: TipExtras): Transaction {
  const amt = tip?.tipAmount;
  if (amt == null || amt <= 0) return tx;
  return {
    ...tx,
    tipAmount: amt,
    tipPaymentMethod:
      tip?.tipPaymentMethod ?? (tx.paymentMethod === 'card' ? 'card' : 'cash'),
  };
}

function serializeTransactionForDb(transaction: Transaction) {
  return {
    ...transaction,
    cart: {
      ...transaction.cart,
      items: transaction.cart.items.map((item) => ({
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
    customer: transaction.customer
      ? {
          ...transaction.customer,
          createdAt: transaction.customer.createdAt.toISOString(),
          updatedAt: transaction.customer.updatedAt.toISOString(),
        }
      : undefined,
    cashier: {
      ...transaction.cashier,
      createdAt: transaction.cashier.createdAt.toISOString(),
      updatedAt: transaction.cashier.updatedAt.toISOString(),
    },
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
    documentProductionDate: transaction.documentProductionDate.toISOString(),
  };
}

/**
 * `transaction_items.id` is a global PRIMARY KEY. Cancelled/abandoned card attempts
 * keep old rows in SQLite; the POS cart still has the same line `CartItem.id`s, so a
 * retry would violate UNIQUE. Each pending card save gets its own line UUIDs.
 */
function cloneCartWithFreshLineItemIds(cart: Cart): Cart {
  const now = new Date();
  return {
    ...cart,
    id: generateUUID(),
    items: cart.items.map((item) => ({
      ...item,
      id: generateUUID(),
    })),
    updatedAt: now,
  };
}

interface TransactionStore {
  transactions: Transaction[]; // Only today's transactions in memory
  currentUser: User | null;
  addTransaction: (
    cart: Cart, 
    paymentDetails: PaymentDetails, 
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
  deleteAllTransactions: () => Promise<{ success: boolean; deleted?: number; error?: string }>;
  loadRefundsForOriginal: (originalTransactionId: string) => Promise<Transaction[]>;
  createRefundTransaction: (
    originalTransaction: Transaction,
    options: { fullRefund: boolean; partialItems?: { itemId: string; quantity: number }[]; amountReturned?: number }
  ) => Promise<Transaction>;
  updateTransactionStatus: (transactionId: string, status: Transaction['status']) => Promise<void>;
  createPendingCardTransaction: (
    cart: Cart,
    customer?: Customer,
    tip?: TipExtras,
  ) => Promise<Transaction>;
  completePendingCardTransaction: (transactionId: string, nayaxMeta: string) => Promise<Transaction>;
  cancelPendingTransaction: (transactionId: string) => Promise<void>;
}

export const useTransactionStore = create<TransactionStore>((set, get) => ({
  transactions: [],
  currentUser: null,

  addTransaction: async (
    cart: Cart,
    paymentDetails: PaymentDetails,
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
    
    // 320 = חשבונית מס/קבלה (tax invoice/receipt): POS sales always have items + payment
    const documentType = 320;

    const transaction = applyTipFields(
      {
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
        paymentMethod: paymentDetails.mode === 'card' ? 'card' : 'cash',
        nayaxMeta: paymentDetails.mode === 'card' ? paymentDetails.nayaxMeta : undefined,
        amountTendered: paymentDetails.mode === 'cash' ? paymentDetails.amountTendered : undefined,
        changeAmount: paymentDetails.mode === 'cash' ? paymentDetails.changeAmount : undefined,
      },
      paymentDetails,
    );

    // Save to database via IPC
    try {
      if (window.electronAPI) {
        await window.electronAPI.dbSaveTransaction(serializeTransactionForDb(transaction));
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

  createPendingCardTransaction: async (
    cart: Cart,
    customer?: Customer,
    tip?: TipExtras,
  ): Promise<Transaction> => {
    const { currentUser, generateTransactionNumber } = get();

    if (!currentUser) {
      throw new Error('No user logged in');
    }

    const { isDayOpen } = useTradingDayStore.getState();
    if (!isDayOpen) {
      throw new Error('Cannot process transaction: Day is closed');
    }

    const now = new Date();
    const documentType = 320;
    const cartForSave = cloneCartWithFreshLineItemIds(cart);

    const transaction = applyTipFields(
      {
        id: generateUUID(),
        transactionNumber: generateTransactionNumber(),
        cart: cartForSave,
        customer,
        status: 'pending',
        cashier: currentUser,
        createdAt: now,
        updatedAt: now,
        documentType,
        documentProductionDate: now,
        documentDiscount: cartForSave.discountAmount > 0 ? cartForSave.discountAmount : undefined,
        paymentMethod: 'card',
      },
      tip,
    );

    if (!window.electronAPI) {
      throw new Error('Database not available');
    }
    const saveResult = await window.electronAPI.dbSaveTransaction(serializeTransactionForDb(transaction));
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Failed to save pending transaction');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const transactionDate = new Date(transaction.createdAt);
    transactionDate.setHours(0, 0, 0, 0);
    if (transactionDate.getTime() === today.getTime()) {
      set((state) => ({
        transactions: [transaction, ...state.transactions],
      }));
    }

    return transaction;
  },

  completePendingCardTransaction: async (
    transactionId: string,
    nayaxMeta: string
  ): Promise<Transaction> => {
    const existing = get().getTransactionById(transactionId);
    if (!existing) {
      throw new Error('Transaction not found');
    }
    if (existing.status !== 'pending') {
      throw new Error('Transaction is not pending');
    }

    const now = new Date();
    const completed: Transaction = {
      ...existing,
      status: 'completed',
      nayaxMeta,
      paymentMethod: 'card',
      updatedAt: now,
    };

    if (!window.electronAPI) {
      throw new Error('Database not available');
    }
    const saveResult = await window.electronAPI.dbSaveTransaction(serializeTransactionForDb(completed));
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Failed to complete transaction');
    }

    set((state) => ({
      transactions: state.transactions.map((t) => (t.id === transactionId ? completed : t)),
    }));

    return completed;
  },

  cancelPendingTransaction: async (transactionId: string): Promise<void> => {
    const t = get().getTransactionById(transactionId);
    if (!t || t.status !== 'pending') {
      return;
    }
    await get().updateTransactionStatus(transactionId, 'cancelled');
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
          paymentMethod: tx.paymentMethod,
          nayaxMeta: tx.nayaxMeta,
          tipAmount: tx.tipAmount,
          tipPaymentMethod: tx.tipPaymentMethod,
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
          paymentMethod: tx.paymentMethod,
          nayaxMeta: tx.nayaxMeta,
          tipAmount: tx.tipAmount,
          tipPaymentMethod: tx.tipPaymentMethod,
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

  deleteAllTransactions: async () => {
    if (!window.electronAPI?.dbDeleteAllTransactions) {
      return { success: false, error: 'Not available' };
    }
    const result = await window.electronAPI.dbDeleteAllTransactions();
    if (result.success) {
      set({ transactions: [] });
    }
    return result;
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
          paymentMethod: tx.paymentMethod,
          nayaxMeta: tx.nayaxMeta,
          tipAmount: tx.tipAmount,
          tipPaymentMethod: tx.tipPaymentMethod,
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

  loadRefundsForOriginal: async (originalTransactionId: string): Promise<Transaction[]> => {
    if (!window.electronAPI?.dbGetRefundsForOriginal) return [];
    const rows = await window.electronAPI.dbGetRefundsForOriginal(originalTransactionId);
    return rows.map((row) => hydrateTransactionFromDb(row));
  },

  createRefundTransaction: async (
    originalTransaction: Transaction,
    options: { fullRefund: boolean; partialItems?: { itemId: string; quantity: number }[]; amountReturned?: number }
  ): Promise<Transaction> => {
    const { currentUser, generateTransactionNumber } = get();
    if (!currentUser) throw new Error('No user logged in');
    const { isDayOpen, currentTradingDay } = useTradingDayStore.getState();
    if (!isDayOpen) throw new Error('Cannot process refund: Day is closed');

    // Cross-day refunds are out of scope for this PR — original tx may already have
    // been purged after Z-close. Allow only same-day refunds.
    const todayStr = new Date().toISOString().slice(0, 10);
    const origDay = new Date(originalTransaction.createdAt).toISOString().slice(0, 10);
    const isSameDay = origDay === todayStr && currentTradingDay
      ? new Date(originalTransaction.createdAt) >= currentTradingDay.openedAt
      : origDay === todayStr;
    if (!isSameDay) {
      throw new Error('refund.cross-day-not-supported');
    }

    if (!isSameDay) {
      throw new Error('refund.cross-day-not-supported');
    }

    const priorRefunds = await get().loadRefundsForOriginal(originalTransaction.id);
    const remaining = getRemainingQtyByOriginalItem(originalTransaction, priorRefunds);
    if (!hasRemainingRefundable(originalTransaction, priorRefunds)) {
      throw new Error('refund.nothing-remaining');
    }

    let items: CartItem[];
    if (options.fullRefund) {
      items = originalTransaction.cart.items
        .map((item) => {
          const qty = remaining[item.id] ?? 0;
          if (qty <= 0) return null;
          const ratio = item.quantity > 0 ? qty / item.quantity : 0;
          const totalPrice = item.unitPrice * qty - (item.lineDiscount || 0) * ratio;
          return {
            ...item,
            id: generateUUID(),
            quantity: qty,
            totalPrice,
            lineDiscount: item.lineDiscount ? (item.lineDiscount * qty) / item.quantity : undefined,
            notes: encodeRefundSourceItemNote(item.id),
          };
        })
        .filter(Boolean) as CartItem[];
    } else if (options.partialItems?.length) {
      items = options.partialItems
        .map(({ itemId, quantity }) => {
          const originalItem = originalTransaction.cart.items.find((i) => i.id === itemId);
          if (!originalItem || quantity <= 0) return null;
          const maxQty = remaining[originalItem.id] ?? 0;
          const qty = Math.min(quantity, maxQty);
          if (qty <= 0) return null;
          const totalPrice =
            originalItem.unitPrice * qty -
            (originalItem.lineDiscount || 0) * (qty / originalItem.quantity);
          return {
            id: generateUUID(),
            productId: originalItem.productId,
            product: originalItem.product,
            quantity: qty,
            unitPrice: originalItem.unitPrice,
            totalPrice,
            discount: originalItem.discount,
            discountType: originalItem.discountType,
            notes: encodeRefundSourceItemNote(originalItem.id),
            transactionType: originalItem.transactionType,
            lineDiscount: originalItem.lineDiscount
              ? (originalItem.lineDiscount * qty) / originalItem.quantity
              : undefined,
          } as CartItem;
        })
        .filter(Boolean) as CartItem[];
    } else {
      throw new Error('Partial refund requires partialItems');
    }

    if (items.length === 0) {
      throw new Error('refund.nothing-remaining');
    }

    const taxRate = (useSettingsStore.getState().globalTaxRate ?? 0.18) as number;
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
    const refundId = generateUUID();
    const isCardRefund = originalTransaction.paymentMethod === 'card';
    let refundNayaxMeta: string | undefined;

    if (isCardRefund) {
      const originalTxnId = extractNayaxOriginalTransactionId(originalTransaction.nayaxMeta);
      if (!originalTxnId) {
        throw new Error('refund.card-missing-original-txn');
      }
      if (!window.electronAPI?.nayaxDoRefund) {
        throw new Error('refund.card-not-configured');
      }
      const amountAgorot = Math.round(amountReturned * 100);
      const res = await window.electronAPI.nayaxDoRefund({
        amountAgorot,
        vuid: refundId,
        originalTransactionId: originalTxnId,
      });
      if (!res.approved) {
        throw new Error(res.error || res.statusMessage || 'refund.card-declined');
      }
      refundNayaxMeta = JSON.stringify({
        vuid: res.vuid,
        result: res.result,
        outcome: res.outcome,
        statusCode: res.statusCode,
        refundOfTransactionId: originalTransaction.id,
        originalNayaxTransactionId: originalTxnId,
      });
    }

    const refundTransaction: Transaction = {
      id: refundId,
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
      paymentMethod: isCardRefund ? 'card' : 'cash',
      amountTendered: amountReturned,
      changeAmount: 0,
      refundOfTransactionId: originalTransaction.id,
      nayaxMeta: refundNayaxMeta,
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
        hasRemainingRefundable(originalTransaction, [
          ...priorRefunds,
          refundTransaction,
        ])
          ? 'partial_refund'
          : 'refunded',
      );
    }

    const newOriginalStatus = hasRemainingRefundable(originalTransaction, [
      ...priorRefunds,
      refundTransaction,
    ])
      ? 'partial_refund'
      : 'refunded';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const txDate = new Date(refundTransaction.createdAt);
    txDate.setHours(0, 0, 0, 0);
    if (txDate.getTime() === today.getTime()) {
      set((state) => ({
        transactions: [
          refundTransaction,
          ...state.transactions.map((t) =>
            t.id === originalTransaction.id
              ? { ...t, status: newOriginalStatus, updatedAt: new Date() }
              : t,
          ),
        ],
      }));
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
