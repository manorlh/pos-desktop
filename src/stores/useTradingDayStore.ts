import { create } from 'zustand';
import type { TradingDay } from '@/types/index';
import { generateUUID } from '@/utils/uuid';

interface TradingDayStore {
  currentTradingDay: TradingDay | null;
  isLoading: boolean;
  isDayOpen: boolean;
  loadCurrentTradingDay: () => Promise<void>;
  openDay: (openingCash: number, userId: string) => Promise<void>;
  closeDay: (closingCash: number, userId: string) => Promise<TradingDay>;
  getTradingDayByDate: (date: Date) => Promise<TradingDay | null>;
  getTradingDaysByDateRange: (start: Date, end: Date) => Promise<TradingDay[]>;
}

export const useTradingDayStore = create<TradingDayStore>((set, get) => ({
  currentTradingDay: null,
  isLoading: true,
  isDayOpen: false,

  loadCurrentTradingDay: async () => {
    set({ isLoading: true });
    try {
      if (window.electronAPI) {
        const tradingDayData = await window.electronAPI.dbGetCurrentTradingDay();
        if (tradingDayData) {
          // Convert date strings to Date objects
          const tradingDay: TradingDay = {
            ...tradingDayData,
            dayDate: new Date(tradingDayData.dayDate + 'T00:00:00'),
            openedAt: new Date(tradingDayData.openedAt),
            closedAt: tradingDayData.closedAt ? new Date(tradingDayData.closedAt) : undefined,
            openedBy: {
              ...tradingDayData.openedBy,
              createdAt: new Date(tradingDayData.openedBy.createdAt),
              updatedAt: new Date(tradingDayData.openedBy.updatedAt),
            },
            closedBy: tradingDayData.closedBy ? {
              ...tradingDayData.closedBy,
              createdAt: new Date(tradingDayData.closedBy.createdAt),
              updatedAt: new Date(tradingDayData.closedBy.updatedAt),
            } : undefined,
            createdAt: new Date(tradingDayData.createdAt),
            updatedAt: new Date(tradingDayData.updatedAt),
          };
          set({ 
            currentTradingDay: tradingDay, 
            isDayOpen: tradingDay.status === 'open',
            isLoading: false 
          });
        } else {
          set({ 
            currentTradingDay: null, 
            isDayOpen: false,
            isLoading: false 
          });
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load current trading day:', error);
      set({ isLoading: false });
    }
  },

  openDay: async (openingCash: number, userId: string) => {
    try {
      if (window.electronAPI) {
        const id = generateUUID();
        const result = await window.electronAPI.dbOpenTradingDay({
          id,
          openingCash,
          openedBy: userId,
        });
        
        if (result.success) {
          // Reload the current trading day
          await get().loadCurrentTradingDay();
        } else {
          throw new Error(result.error || 'Failed to open trading day');
        }
      } else {
        throw new Error('Electron API not available');
      }
    } catch (error) {
      console.error('Failed to open trading day:', error);
      throw error;
    }
  },

  closeDay: async (closingCash: number, userId: string): Promise<TradingDay> => {
    const { currentTradingDay } = get();
    if (!currentTradingDay || currentTradingDay.status !== 'open') {
      throw new Error('No open trading day to close');
    }

    try {
      if (window.electronAPI) {
        // Get today's transactions to calculate Z-Report
        const transactionsData = await window.electronAPI.dbGetTodaysTransactions();
        
        // Convert dates and reconstruct Transaction objects
        const transactions = transactionsData.map((tx: any) => ({
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
        
        // Import zReportGenerator
        const { generateZReport } = await import('@/utils/zReportGenerator');
        const zReportData = generateZReport(
          transactions,
          currentTradingDay.openingCash,
          closingCash
        );

        const expectedCash = currentTradingDay.openingCash + zReportData.cashSales;
        const discrepancy = closingCash - expectedCash;

        const result = await window.electronAPI.dbCloseTradingDay(currentTradingDay.id, {
          closingCash,
          expectedCash,
          actualCash: closingCash,
          discrepancy,
          closedBy: userId,
          zReportData,
        });

        if (result.success) {
          // Get the closed trading day by date (since it's now closed, getCurrentTradingDay won't find it)
          const today = new Date();
          const dayDate = today.toISOString().split('T')[0];
          const closedDayData = await window.electronAPI.dbGetTradingDayByDate(dayDate);
          
          if (!closedDayData) {
            throw new Error('Failed to retrieve closed trading day');
          }
          
          // Convert dates and reconstruct TradingDay object
          const closedDay: TradingDay = {
            ...closedDayData,
            dayDate: new Date(closedDayData.dayDate + 'T00:00:00'),
            openedAt: new Date(closedDayData.openedAt),
            closedAt: closedDayData.closedAt ? new Date(closedDayData.closedAt) : undefined,
            openedBy: {
              ...closedDayData.openedBy,
              createdAt: new Date(closedDayData.openedBy.createdAt),
              updatedAt: new Date(closedDayData.openedBy.updatedAt),
            },
            closedBy: closedDayData.closedBy ? {
              ...closedDayData.closedBy,
              createdAt: new Date(closedDayData.closedBy.createdAt),
              updatedAt: new Date(closedDayData.closedBy.updatedAt),
            } : undefined,
            createdAt: new Date(closedDayData.createdAt),
            updatedAt: new Date(closedDayData.updatedAt),
          };
          
          // Update store state
          set({ 
            currentTradingDay: closedDay, 
            isDayOpen: false 
          });
          
          return closedDay;
        } else {
          throw new Error(result.error || 'Failed to close trading day');
        }
      } else {
        throw new Error('Electron API not available');
      }
    } catch (error) {
      console.error('Failed to close trading day:', error);
      throw error;
    }
  },

  getTradingDayByDate: async (date: Date): Promise<TradingDay | null> => {
    try {
      if (window.electronAPI) {
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const tradingDayData = await window.electronAPI.dbGetTradingDayByDate(dateStr);
        
        if (tradingDayData) {
          // Convert date strings to Date objects
          return {
            ...tradingDayData,
            dayDate: new Date(tradingDayData.dayDate + 'T00:00:00'),
            openedAt: new Date(tradingDayData.openedAt),
            closedAt: tradingDayData.closedAt ? new Date(tradingDayData.closedAt) : undefined,
            openedBy: {
              ...tradingDayData.openedBy,
              createdAt: new Date(tradingDayData.openedBy.createdAt),
              updatedAt: new Date(tradingDayData.openedBy.updatedAt),
            },
            closedBy: tradingDayData.closedBy ? {
              ...tradingDayData.closedBy,
              createdAt: new Date(tradingDayData.closedBy.createdAt),
              updatedAt: new Date(tradingDayData.closedBy.updatedAt),
            } : undefined,
            createdAt: new Date(tradingDayData.createdAt),
            updatedAt: new Date(tradingDayData.updatedAt),
          };
        }
        return null;
      } else {
        return null;
      }
    } catch (error) {
      console.error('Failed to get trading day by date:', error);
      return null;
    }
  },

  getTradingDaysByDateRange: async (start: Date, end: Date): Promise<TradingDay[]> => {
    try {
      if (window.electronAPI) {
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        const tradingDaysData = await window.electronAPI.dbGetTradingDaysByDateRange(startStr, endStr);
        
        return tradingDaysData.map((td: any) => ({
          ...td,
          dayDate: new Date(td.dayDate + 'T00:00:00'),
          openedAt: new Date(td.openedAt),
          closedAt: td.closedAt ? new Date(td.closedAt) : undefined,
          openedBy: {
            ...td.openedBy,
            createdAt: new Date(td.openedBy.createdAt),
            updatedAt: new Date(td.openedBy.updatedAt),
          },
          closedBy: td.closedBy ? {
            ...td.closedBy,
            createdAt: new Date(td.closedBy.createdAt),
            updatedAt: new Date(td.closedBy.updatedAt),
          } : undefined,
          createdAt: new Date(td.createdAt),
          updatedAt: new Date(td.updatedAt),
        }));
      } else {
        return [];
      }
    } catch (error) {
      console.error('Failed to get trading days by date range:', error);
      return [];
    }
  },
}));

