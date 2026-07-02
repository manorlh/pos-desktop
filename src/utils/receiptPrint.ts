import type { Transaction } from '@/types';
import type { BusinessInfo } from '@/stores/useBusinessStore';
import type { Category } from '@/types';
import type { ReceiptPrintPayload, SerializedReceiptTransaction } from './receiptTemplate';

function serializeTransaction(tx: Transaction): SerializedReceiptTransaction {
  return {
    transactionNumber: tx.transactionNumber,
    documentProductionDate: tx.documentProductionDate.toISOString(),
    paymentMethod: tx.paymentMethod,
    amountTendered: tx.amountTendered,
    changeAmount: tx.changeAmount,
    tipAmount: tx.tipAmount,
    tipPaymentMethod: tx.tipPaymentMethod,
    cashier: { name: tx.cashier.name },
    cart: {
      subtotal: tx.cart.subtotal,
      taxAmount: tx.cart.taxAmount,
      totalAmount: tx.cart.totalAmount,
      items: tx.cart.items.map((item) => ({
        productId: item.productId,
        product: {
          name: item.product.name,
          categoryId: item.product.categoryId,
        },
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
    },
  };
}

export function buildReceiptPrintPayload(
  tx: Transaction,
  businessInfo: BusinessInfo,
  globalTaxRate: number,
  language: 'he' | 'en',
  categories: Category[],
  options?: { isCopy?: boolean; originalDocNumber?: string },
): ReceiptPrintPayload {
  const categoryNames: Record<string, string> = {};
  for (const c of categories) {
    categoryNames[c.id] = c.name;
  }

  const isRefund = Boolean(tx.refundOfTransactionId) || tx.documentType === 330;

  return {
    transaction: serializeTransaction(tx),
    businessInfo: {
      vatNumber: businessInfo.vatNumber,
      companyName: businessInfo.companyName,
      companyAddress: businessInfo.companyAddress,
      companyAddressNumber: businessInfo.companyAddressNumber,
      companyCity: businessInfo.companyCity,
      companyZip: businessInfo.companyZip,
      companyRegNumber: businessInfo.companyRegNumber,
    },
    globalTaxRate,
    language,
    categoryNames,
    printedAt: new Date().toISOString(),
    isCopy: options?.isCopy ?? false,
    isRefund,
    originalDocNumber: options?.originalDocNumber,
  };
}
