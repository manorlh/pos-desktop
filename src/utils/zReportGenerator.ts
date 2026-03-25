import type { Transaction, ZReportData } from '@/types/index';

/**
 * Generate Z-Report data from transactions for a trading day
 */
export function generateZReport(
  transactions: Transaction[],
  openingCash: number,
  actualCash?: number
): ZReportData {
  let totalSales = 0;
  let totalItems = 0;
  let cashSales = 0;
  let taxCollected = 0;

  const completedTransactions = transactions.filter((t) => t.status === 'completed');

  for (const transaction of completedTransactions) {
    totalSales += transaction.cart.totalAmount;
    totalItems += transaction.cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cashSales += transaction.amountTendered || 0;
    taxCollected += transaction.cart.taxAmount || 0;
  }

  const expectedCash = openingCash + cashSales;
  const actualCashAmount = actualCash ?? expectedCash;
  const discrepancy = actualCashAmount - expectedCash;

  return {
    totalSales,
    totalTransactions: completedTransactions.length,
    totalItems,
    cashSales,
    taxCollected,
    openingCash,
    expectedCash,
    actualCash: actualCashAmount,
    discrepancy,
    // Transactions are stored in the transactions table and can be queried by dayDate if needed
  };
}

