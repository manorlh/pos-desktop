import type { ReceiptPrintPayload, ReceiptLanguage } from './receiptTemplate';

interface SampleReceiptOptions {
  language?: ReceiptLanguage;
  businessInfo?: Partial<ReceiptPrintPayload['businessInfo']>;
  globalTaxRate?: number;
}

/**
 * Build a realistic, deterministic receipt payload for the printer test /
 * preview so the full layout (header, items, totals, footer) can be verified
 * without running a real transaction.
 */
export function buildSampleReceiptPayload(
  options: SampleReceiptOptions = {},
): ReceiptPrintPayload {
  const language: ReceiptLanguage = options.language === 'en' ? 'en' : 'he';
  const globalTaxRate = options.globalTaxRate ?? 0.17;
  const he = language === 'he';

  const items = [
    {
      productId: 'sample-1',
      product: { name: he ? 'קפה הפוך' : 'Cappuccino', categoryId: 'drinks' },
      quantity: 2,
      unitPrice: 12,
      totalPrice: 24,
    },
    {
      productId: 'sample-2',
      product: { name: he ? 'קרואסון חמאה' : 'Butter croissant', categoryId: 'bakery' },
      quantity: 1,
      unitPrice: 15,
      totalPrice: 15,
    },
    {
      productId: 'sample-3',
      product: { name: he ? 'מיץ תפוזים סחוט' : 'Fresh orange juice', categoryId: 'drinks' },
      quantity: 1,
      unitPrice: 18,
      totalPrice: 18,
    },
  ];

  const totalAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);
  const subtotal = Math.round((totalAmount / (1 + globalTaxRate)) * 100) / 100;
  const taxAmount = Math.round((totalAmount - subtotal) * 100) / 100;

  return {
    language,
    globalTaxRate,
    printedAt: new Date().toISOString(),
    isCopy: false,
    categoryNames: {
      drinks: he ? 'משקאות' : 'Drinks',
      bakery: he ? 'מאפים' : 'Bakery',
    },
    businessInfo: {
      companyName: he ? 'חנות לדוגמה' : 'Demo Store',
      vatNumber: '123456789',
      companyRegNumber: '514000000',
      companyAddress: he ? 'רחוב הדוגמה' : 'Sample St.',
      companyAddressNumber: '10',
      companyCity: he ? 'תל אביב' : 'Tel Aviv',
      companyZip: '6100000',
      ...options.businessInfo,
    },
    transaction: {
      transactionNumber: '1001',
      documentProductionDate: new Date().toISOString(),
      paymentMethod: 'cash',
      amountTendered: 100,
      changeAmount: 100 - totalAmount,
      tipAmount: 0,
      cashier: { name: he ? 'ישראל ישראלי' : 'John Doe' },
      cart: {
        items,
        subtotal,
        taxAmount,
        totalAmount,
      },
    },
  };
}
