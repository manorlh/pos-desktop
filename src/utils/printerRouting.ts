import type { Transaction } from '@/types';

/** True when the sale/refund has any cash component that should kick the drawer. */
export function shouldUseDrawerPrinter(tx: Transaction): boolean {
  if (tx.paymentMethod === 'cash') return true;
  if ((tx.tipAmount ?? 0) > 0 && tx.tipPaymentMethod === 'cash') return true;
  return false;
}

export type EffectivePrinterNames = {
  receiptPrinterName: string | undefined;
  drawerPrinterName: string | undefined;
};

export function resolveEffectivePrinters(settings: {
  receiptPrinterName: string;
  drawerPrinterName: string;
  localReceiptPrinterName: string;
  localDrawerPrinterName: string;
}): EffectivePrinterNames {
  const receipt =
    settings.localReceiptPrinterName.trim() ||
    settings.receiptPrinterName.trim() ||
    undefined;
  const drawer =
    settings.localDrawerPrinterName.trim() ||
    settings.drawerPrinterName.trim() ||
    undefined;
  return { receiptPrinterName: receipt, drawerPrinterName: drawer };
}

export type ReceiptPrintOutcome = {
  receiptError: string | null;
  drawerWarning: string | null;
};
