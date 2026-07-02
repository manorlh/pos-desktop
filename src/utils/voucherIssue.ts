import type { BusinessInfo } from '@/stores/useBusinessStore';
import type { IssuedVoucher, Transaction, Voucher } from '@/types';
import { generateUUID } from '@/utils/uuid';
import {
  buildVoucherPrintPayload,
  computeExpiresAt,
  computeFaceValue,
} from '@/utils/voucherPrint';

/** Discriminated failure so the UI can show an accurate, translated message. */
export type VoucherIssueFailure =
  | { code: 'template_missing'; productName: string }
  | { code: 'print_failed'; productName: string; detail?: string };

export async function issueAndPrintVouchersForTransaction(
  tx: Transaction,
  businessInfo: BusinessInfo,
): Promise<{ issued: IssuedVoucher[]; error: VoucherIssueFailure | null }> {
  if (!window.electronAPI?.printVoucher || !window.electronAPI?.dbGetVoucher) {
    return { issued: [], error: null };
  }

  const voucherLines = tx.cart.items.filter((item) => item.product.voucherId);
  if (voucherLines.length === 0) {
    return { issued: [], error: null };
  }

  const issued: IssuedVoucher[] = [];
  const now = new Date();
  const nowIso = now.toISOString();

  for (const item of voucherLines) {
    const voucherId = item.product.voucherId!;
    const voucher = (await window.electronAPI.dbGetVoucher(voucherId)) as Voucher | null;
    if (!voucher || !voucher.isActive) {
      return {
        issued,
        error: { code: 'template_missing', productName: item.product.name },
      };
    }

    const { unitValue, faceValue } = computeFaceValue(voucher, item.unitPrice, item.quantity);
    const issuedRow: IssuedVoucher = {
      id: generateUUID(),
      transactionId: tx.id,
      transactionItemId: item.id,
      voucherId: voucher.cloudId || voucher.id,
      productId: item.productId,
      productName: item.product.name,
      quantity: item.quantity,
      unitValue,
      faceValue,
      issuedAt: nowIso,
      expiresAt: computeExpiresAt(voucher.validityDays, now),
      status: 'issued',
      reprintCount: 0,
      lastPrintedAt: nowIso,
    };

    const payload = buildVoucherPrintPayload(issuedRow, voucher, businessInfo, {
      isCopy: false,
      transactionNumber: tx.transactionNumber,
    });

    const result = await window.electronAPI.printVoucher(payload);
    if (!result.success) {
      return {
        issued,
        error: {
          code: 'print_failed',
          productName: item.product.name,
          detail: result.error || undefined,
        },
      };
    }

    issued.push(issuedRow);
  }

  if (issued.length > 0 && window.electronAPI?.dbSaveIssuedVouchers) {
    await window.electronAPI.dbSaveIssuedVouchers(tx.id, issued);
  }

  return { issued, error: null };
}

export async function reprintVoucher(
  issued: IssuedVoucher,
  voucher: Voucher,
  businessInfo: BusinessInfo,
  transactionNumber?: string,
): Promise<string | null> {
  if (!window.electronAPI?.printVoucher) {
    return 'Print not available';
  }

  const updated = await window.electronAPI.incrementIssuedVoucherReprint?.(issued.id);
  const row = (updated as IssuedVoucher | null) ?? {
    ...issued,
    reprintCount: (issued.reprintCount ?? 0) + 1,
  };

  const payload = buildVoucherPrintPayload(row, voucher, businessInfo, {
    isCopy: true,
    transactionNumber,
  });
  const result = await window.electronAPI.printVoucher(payload);
  if (!result.success) {
    return result.error || 'Voucher reprint failed';
  }
  return null;
}
