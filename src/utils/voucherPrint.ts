import type { BusinessInfo } from '@/stores/useBusinessStore';
import type { IssuedVoucher, Voucher } from '@/types';
import type { VoucherPrintPayload } from './voucherTemplate';

export function buildVoucherPrintPayload(
  issued: IssuedVoucher,
  voucher: Voucher,
  businessInfo: BusinessInfo,
  options?: { isCopy?: boolean; transactionNumber?: string },
): VoucherPrintPayload {
  return {
    issued: {
      id: issued.id,
      productName: issued.productName || '',
      quantity: issued.quantity,
      unitValue: issued.unitValue,
      faceValue: issued.faceValue,
      issuedAt: issued.issuedAt,
      expiresAt: issued.expiresAt,
      transactionNumber: options?.transactionNumber,
    },
    voucher: {
      name: voucher.name,
      title: voucher.title,
      subtitle: voucher.subtitle,
      bodyText: voucher.bodyText,
      footerText: voucher.footerText,
      valueDisplayMode: voucher.valueDisplayMode,
      displayValue: voucher.displayValue,
      printBarcode: voucher.printBarcode,
      printQr: voucher.printQr,
      language: voucher.language,
    },
    businessInfo: {
      companyName: businessInfo.companyName,
      vatNumber: businessInfo.vatNumber,
      companyCity: businessInfo.companyCity,
    },
    isCopy: options?.isCopy ?? false,
    printedAt: new Date().toISOString(),
  };
}

export function computeExpiresAt(validityDays: number | undefined, issuedAt: Date): string | undefined {
  if (!validityDays || validityDays <= 0) return undefined;
  const d = new Date(issuedAt);
  d.setDate(d.getDate() + validityDays);
  return d.toISOString();
}

export function computeFaceValue(
  voucher: Voucher,
  unitPrice: number,
  quantity: number,
): { unitValue: number; faceValue: number } {
  if (voucher.valueDisplayMode === 'fixed' && voucher.displayValue != null) {
    return { unitValue: voucher.displayValue, faceValue: voucher.displayValue };
  }
  if (voucher.valueDisplayMode === 'none') {
    return { unitValue: unitPrice, faceValue: unitPrice * quantity };
  }
  return { unitValue: unitPrice, faceValue: unitPrice * quantity };
}
