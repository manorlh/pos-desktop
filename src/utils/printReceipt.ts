import type { ReceiptPrintPayload } from './receiptTemplate';
import type { Transaction } from '@/types';
import {
  resolveEffectivePrinters,
  shouldUseDrawerPrinter,
  type EffectivePrinterNames,
  type ReceiptPrintOutcome,
} from './printerRouting';
import { useSettingsStore } from '@/stores/useSettingsStore';

function getEffectivePrintersFromStore(): EffectivePrinterNames {
  const s = useSettingsStore.getState();
  return resolveEffectivePrinters({
    receiptPrinterName: s.receiptPrinterName,
    drawerPrinterName: s.drawerPrinterName,
    localReceiptPrinterName: s.localReceiptPrinterName,
    localDrawerPrinterName: s.localDrawerPrinterName,
  });
}

export type PrintReceiptOptions = {
  /**
   * Never route to the drawer printer even for cash transactions.
   * Used for receipt copies/reprints, which must not re-open the cash drawer.
   */
  forceReceiptPrinter?: boolean;
};

/**
 * Print a receipt, routing to the drawer printer when the transaction has a cash component.
 * Falls back to the receipt printer if the drawer printer is missing or fails.
 */
export async function printReceiptForTransaction(
  payload: ReceiptPrintPayload,
  tx: Transaction,
  t: (key: string, vars?: Record<string, string>) => string,
  printers?: EffectivePrinterNames,
  options?: PrintReceiptOptions,
): Promise<ReceiptPrintOutcome> {
  if (!window.electronAPI?.printReceipt) {
    return { receiptError: t('receipt.printFailed'), drawerWarning: null };
  }

  const { receiptPrinterName, drawerPrinterName } = printers ?? getEffectivePrintersFromStore();
  const useDrawer = options?.forceReceiptPrinter ? false : shouldUseDrawerPrinter(tx);
  let targetPrinter = useDrawer ? drawerPrinterName : receiptPrinterName;
  let drawerWarning: string | null = null;

  if (useDrawer && !drawerPrinterName) {
    drawerWarning = t('printer.drawerNotConfigured');
    targetPrinter = receiptPrinterName;
  }

  const attempt = async (printerName?: string) =>
    window.electronAPI!.printReceipt({ ...payload, printerName });

  let result = await attempt(targetPrinter);

  if (!result.success && useDrawer && drawerPrinterName && targetPrinter === drawerPrinterName) {
    const fallback = await attempt(receiptPrinterName);
    if (fallback.success) {
      return {
        receiptError: null,
        drawerWarning: drawerWarning ?? result.error ?? t('printer.drawerOpenFailed'),
      };
    }
    return {
      receiptError: fallback.error || t('receipt.printFailed'),
      drawerWarning,
    };
  }

  if (!result.success) {
    return { receiptError: result.error || t('receipt.printFailed'), drawerWarning };
  }

  return { receiptError: null, drawerWarning };
}
