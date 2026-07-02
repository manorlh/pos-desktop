import { describe, expect, it } from 'vitest';
import { resolveEffectivePrinters, shouldUseDrawerPrinter } from './printerRouting';
import type { Transaction } from '@/types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: '1',
    transactionNumber: '1001',
    cart: { id: 'c', items: [], subtotal: 0, taxAmount: 0, discountAmount: 0, totalAmount: 0, createdAt: new Date(), updatedAt: new Date() },
    status: 'completed',
    cashier: { id: 'u', name: 'Test', email: '', role: 'cashier', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    createdAt: new Date(),
    updatedAt: new Date(),
    documentType: 320,
    documentProductionDate: new Date(),
    ...partial,
  };
}

describe('shouldUseDrawerPrinter', () => {
  it('uses drawer for cash sales', () => {
    expect(shouldUseDrawerPrinter(tx({ paymentMethod: 'cash' }))).toBe(true);
  });

  it('uses drawer for card sale with cash tip', () => {
    expect(
      shouldUseDrawerPrinter(tx({ paymentMethod: 'card', tipAmount: 5, tipPaymentMethod: 'cash' })),
    ).toBe(true);
  });

  it('does not use drawer for card-only sale', () => {
    expect(shouldUseDrawerPrinter(tx({ paymentMethod: 'card' }))).toBe(false);
  });
});

describe('resolveEffectivePrinters', () => {
  it('prefers local override over cloud', () => {
    expect(
      resolveEffectivePrinters({
        receiptPrinterName: 'BB',
        drawerPrinterName: 'BBILL',
        localReceiptPrinterName: 'LocalBB',
        localDrawerPrinterName: '',
      }),
    ).toEqual({ receiptPrinterName: 'LocalBB', drawerPrinterName: 'BBILL' });
  });
});
