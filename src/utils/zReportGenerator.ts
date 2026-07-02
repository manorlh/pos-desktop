import type { Transaction, ZReportData } from '@/types/index';

/**
 * Generate Z-Report data from transactions for a trading day.
 * Merchandise totals exclude tips; cash drawer math includes cash tips via net tendered.
 */
export function generateZReport(
  transactions: Transaction[],
  openingCash: number,
  actualCash?: number
): ZReportData {
  let totalSales = 0;
  let totalRefunds = 0;
  let totalItems = 0;
  let cardSales = 0;
  let netCashInDrawer = 0;
  let taxCollected = 0;
  let totalTips = 0;
  let cashTips = 0;
  let cardTips = 0;

  const completedTransactions = transactions.filter((t) => t.status === 'completed');

  for (const transaction of completedTransactions) {
    const goods = transaction.cart.totalAmount;
    const tip = transaction.tipAmount ?? 0;

    totalSales += goods;
    totalItems += transaction.cart.items.reduce((sum, item) => sum + item.quantity, 0);
    taxCollected += transaction.cart.taxAmount || 0;

    if (tip > 0) {
      totalTips += tip;
      const tipMethod = transaction.tipPaymentMethod ?? transaction.paymentMethod ?? 'cash';
      if (tipMethod === 'cash') cashTips += tip;
      else cardTips += tip;
    }

    if (transaction.paymentMethod === 'cash') {
      const tendered = transaction.amountTendered ?? goods + tip;
      const change = transaction.changeAmount ?? 0;
      netCashInDrawer += tendered - change;
    } else if (transaction.paymentMethod === 'card') {
      cardSales += goods;
    }
  }

  const cashSales = netCashInDrawer;
  const expectedCash = openingCash + cashSales;
  const actualCashAmount = actualCash ?? expectedCash;
  const discrepancy = actualCashAmount - expectedCash;

  return {
    totalSales,
    totalRefunds,
    totalTransactions: completedTransactions.length,
    totalItems,
    cashSales,
    cardSales,
    taxCollected,
    totalTips,
    cashTips,
    cardTips,
    openingCash,
    expectedCash,
    actualCash: actualCashAmount,
    discrepancy,
  };
}
