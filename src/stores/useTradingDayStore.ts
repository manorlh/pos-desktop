import { create } from 'zustand';
import type { TradingDay } from '@/types/index';
import { generateUUID } from '@/utils/uuid';

/** YYYY-MM-DD in local calendar — matches SQLite `trading_days.dayDate` when that date was chosen in local TZ. */
function toLocalCalendarYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface TradingDayStore {
  currentTradingDay: TradingDay | null;
  isLoading: boolean;
  isDayOpen: boolean;
  loadCurrentTradingDay: () => Promise<void>;
  openDay: (openingCash: number, userId: string) => Promise<void>;
  closeDay: (closingCash: number, userId: string, closeDayRequestId?: string) => Promise<TradingDay>;
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

  closeDay: async (closingCash: number, userId: string, closeDayRequestId?: string): Promise<TradingDay> => {
    const { currentTradingDay } = get();
    if (!currentTradingDay || currentTradingDay.status !== 'open') {
      throw new Error('No open trading day to close');
    }
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    // 1. Pending-tx guard (independent of network) — block if any business pending tx exists.
    const transactionsData = await window.electronAPI.dbGetTodaysTransactions();
    const pendingTx = (transactionsData as any[]).filter((tx) => tx.status === 'pending');
    if (pendingTx.length > 0) {
      throw new Error('z-close.pending-transactions-exist');
    }

    // 2. Build Z-report from local transactions.
    const transactions = (transactionsData as any[]).map((tx: any) => ({
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
      customer: tx.customer
        ? {
            ...tx.customer,
            createdAt: new Date(tx.customer.createdAt),
            updatedAt: new Date(tx.customer.updatedAt),
          }
        : undefined,
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
      tipAmount: tx.tipAmount,
      tipPaymentMethod: tx.tipPaymentMethod,
      paymentMethod: tx.paymentMethod,
    }));

    const { generateZReport } = await import('@/utils/zReportGenerator');
    const zReportData = generateZReport(
      transactions,
      currentTradingDay.openingCash,
      closingCash,
    );

    const expectedCash = currentTradingDay.openingCash + zReportData.cashSales;
    const discrepancy = closingCash - expectedCash;

    // 3. Hard barrier — flush outbox then POST z-report. If anything fails, leave day open.
    const dayDateStr = toLocalCalendarYMD(currentTradingDay.dayDate);
    const cloudResult = await window.electronAPI.cloudZClose({
      tradingDayId: currentTradingDay.id,
      dayDate: dayDateStr,
      openedAt: currentTradingDay.openedAt.toISOString(),
      closedAt: new Date().toISOString(),
      openingCash: currentTradingDay.openingCash,
      closingCash,
      expectedCash,
      actualCash: closingCash,
      discrepancy,
      openedBy: currentTradingDay.openedBy?.name || userId,
      closedBy: userId,
      totalSales: zReportData.totalSales,
      totalRefunds: zReportData.totalRefunds,
      totalCashSales: zReportData.cashSales,
      totalCardSales: zReportData.cardSales,
      totalTips: zReportData.totalTips,
      totalCashTips: zReportData.cashTips,
      totalCardTips: zReportData.cardTips,
      transactionsCount: transactions.length,
      transactionIds: transactions.map((t) => t.id),
      payload: zReportData as unknown as Record<string, unknown>,
      ...(closeDayRequestId ? { closeDayRequestId } : {}),
    });

    if (!cloudResult.success) {
      console.error('[Z-close] cloud barrier failed:', cloudResult);
      if (closeDayRequestId && window.electronAPI.cloudCloseDayAck) {
        void window.electronAPI.cloudCloseDayAck({
          requestId: closeDayRequestId,
          phase: 'failed',
          errorCode: 'cloud_barrier_failed',
          errorMessage: cloudResult.error || 'unknown',
        });
      }
      // Keep machine-readable code so UI can translate.
      throw new Error('z-close.cloud-required:' + (cloudResult.error || 'unknown'));
    }

    // 4. On cloud success — write trading_days locally, then purge synced txs.
    const result = await window.electronAPI.dbCloseTradingDay(currentTradingDay.id, {
      closingCash,
      expectedCash,
      actualCash: closingCash,
      discrepancy,
      closedBy: userId,
      zReportData,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to close trading day');
    }

    try {
      const purge = await window.electronAPI.cloudPurgeClosedDay(currentTradingDay.id);
      console.log('[Z-close] purged local transactions:', purge);
    } catch (e) {
      console.error('[Z-close] purge failed (non-fatal, day already closed):', e);
    }

    const closedDayData = await window.electronAPI.dbGetTradingDayById(currentTradingDay.id);
    if (!closedDayData) {
      throw new Error('Failed to retrieve closed trading day');
    }

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
      closedBy: closedDayData.closedBy
        ? {
            ...closedDayData.closedBy,
            createdAt: new Date(closedDayData.closedBy.createdAt),
            updatedAt: new Date(closedDayData.closedBy.updatedAt),
          }
        : undefined,
      createdAt: new Date(closedDayData.createdAt),
      updatedAt: new Date(closedDayData.updatedAt),
    };

    set({
      currentTradingDay: closedDay,
      isDayOpen: false,
    });

    if (closeDayRequestId && window.electronAPI.cloudCloseDayAck) {
      void window.electronAPI.cloudCloseDayAck({
        requestId: closeDayRequestId,
        phase: 'completed',
        zReportId: cloudResult.zReportId,
      });
    }

    return closedDay;
  },

  getTradingDayByDate: async (date: Date): Promise<TradingDay | null> => {
    try {
      if (window.electronAPI) {
        const dateStr = toLocalCalendarYMD(date);
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
        const startStr = toLocalCalendarYMD(start);
        const endStr = toLocalCalendarYMD(end);
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

