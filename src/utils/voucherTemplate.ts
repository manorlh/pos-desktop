/**
 * Thermal voucher (שובר) HTML — RTL Hebrew layout, 80mm roll.
 */

export type VoucherLanguage = 'he' | 'en';

export interface VoucherPrintPayload {
  issued: {
    id: string;
    productName: string;
    quantity: number;
    unitValue?: number;
    faceValue?: number;
    issuedAt: string;
    expiresAt?: string;
    transactionNumber?: string;
  };
  voucher: {
    title?: string;
    name: string;
    subtitle?: string;
    bodyText?: string;
    footerText?: string;
    valueDisplayMode: 'product_price' | 'fixed' | 'none';
    displayValue?: number;
    printBarcode: boolean;
    printQr: boolean;
    language?: string;
  };
  businessInfo: {
    companyName: string;
    vatNumber?: string;
    companyCity?: string;
  };
  isCopy?: boolean;
  printedAt?: string;
}

const LABELS = {
  he: {
    docTitle: 'שובר',
    docSource: 'מקור',
    docCopy: 'העתק',
    item: 'פריט',
    qty: "כמות",
    value: 'ערך',
    serial: 'מספר שובר',
    issued: 'תאריך הנפקה',
    expires: 'בתוקף עד',
    tx: 'עסקה',
  },
  en: {
    docTitle: 'Voucher',
    docSource: 'Original',
    docCopy: 'Copy',
    item: 'Item',
    qty: 'Qty',
    value: 'Value',
    serial: 'Voucher no.',
    issued: 'Issued',
    expires: 'Valid until',
    tx: 'Transaction',
  },
};

export function formatShortSerial(uuid: string): string {
  const compact = uuid.replace(/-/g, '').toUpperCase();
  return compact.slice(-12).match(/.{1,4}/g)?.join('-') ?? compact.slice(-12);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '';
  return `₪${n.toFixed(2)}`;
}

function formatDate(iso: string, lang: VoucherLanguage): string {
  try {
    return new Date(iso).toLocaleString(lang === 'he' ? 'he-IL' : 'en-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function resolveDisplayValue(payload: VoucherPrintPayload): string {
  const { voucher, issued } = payload;
  if (voucher.valueDisplayMode === 'none') return '';
  if (voucher.valueDisplayMode === 'fixed' && voucher.displayValue != null) {
    return formatMoney(voucher.displayValue);
  }
  if (issued.faceValue != null) return formatMoney(issued.faceValue);
  if (issued.unitValue != null) return formatMoney(issued.unitValue * issued.quantity);
  return '';
}

export function buildVoucherHtml(payload: VoucherPrintPayload): string {
  const lang: VoucherLanguage = payload.voucher.language === 'en' ? 'en' : 'he';
  const L = LABELS[lang];
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const title = payload.voucher.title || payload.voucher.name;
  const shortSerial = formatShortSerial(payload.issued.id);
  const fullSerial = payload.issued.id;
  const valueStr = resolveDisplayValue(payload);
  const printedAt = payload.printedAt ? formatDate(payload.printedAt, lang) : formatDate(new Date().toISOString(), lang);
  const docLabel = payload.isCopy ? L.docCopy : L.docSource;
  const qtyLine = `${escapeHtml(payload.issued.productName)} × ${payload.issued.quantity}`;
  const valueLine = valueStr ? ` — ${valueStr}` : '';

  const codeBlock =
    payload.voucher.printBarcode || payload.voucher.printQr
      ? `<div class="serial-block">
          <div class="serial-short">${escapeHtml(shortSerial)}</div>
          <div class="serial-full">${escapeHtml(fullSerial)}</div>
        </div>`
      : `<div class="serial-short">${escapeHtml(shortSerial)}</div>`;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 2mm; size: 80mm auto; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Heebo', Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.35;
      width: 72mm;
      max-width: 72mm;
      margin: 0 auto;
      color: #000;
      direction: ${dir};
      text-align: center;
    }
    .company { font-weight: 700; font-size: 13pt; margin-bottom: 4px; }
    .title { font-size: 16pt; font-weight: 700; margin: 8px 0 4px; }
    .subtitle { font-size: 11pt; margin-bottom: 6px; }
    .item-box {
      border: 1px dashed #000;
      padding: 8px 6px;
      margin: 10px 0;
      text-align: ${dir === 'rtl' ? 'right' : 'left'};
    }
    .item-label { font-size: 10pt; color: #333; }
    .item-value { font-size: 13pt; font-weight: 700; margin-top: 4px; }
    .serial-block { margin: 10px 0; }
    .serial-short { font-size: 18pt; font-weight: 700; letter-spacing: 2px; font-family: monospace; }
    .serial-full { font-size: 8pt; font-family: monospace; word-break: break-all; margin-top: 4px; color: #333; }
    .meta { font-size: 10pt; text-align: ${dir === 'rtl' ? 'right' : 'left'}; margin: 6px 0; }
    .body { font-size: 10pt; text-align: ${dir === 'rtl' ? 'right' : 'left'}; white-space: pre-wrap; margin: 8px 0; }
    .footer { font-size: 9pt; margin-top: 8px; color: #444; }
    .doc-label { font-size: 11pt; font-weight: 700; margin-top: 10px; border-top: 1px solid #000; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="company">${escapeHtml(payload.businessInfo.companyName)}</div>
  <div class="title">${escapeHtml(title)}</div>
  ${payload.voucher.subtitle ? `<div class="subtitle">${escapeHtml(payload.voucher.subtitle)}</div>` : ''}
  <div class="item-box">
    <div class="item-label">${L.item}</div>
    <div class="item-value">${qtyLine}${valueLine}</div>
  </div>
  ${valueStr && payload.voucher.valueDisplayMode !== 'none' ? `<div class="meta"><strong>${L.value}:</strong> ${valueStr}</div>` : ''}
  <div class="meta"><strong>${L.serial}:</strong></div>
  ${codeBlock}
  <div class="meta"><strong>${L.issued}:</strong> ${formatDate(payload.issued.issuedAt, lang)}</div>
  ${payload.issued.expiresAt ? `<div class="meta"><strong>${L.expires}:</strong> ${formatDate(payload.issued.expiresAt, lang)}</div>` : ''}
  ${payload.issued.transactionNumber ? `<div class="meta"><strong>${L.tx}:</strong> ${escapeHtml(payload.issued.transactionNumber)}</div>` : ''}
  ${payload.voucher.bodyText ? `<div class="body">${escapeHtml(payload.voucher.bodyText)}</div>` : ''}
  ${payload.voucher.footerText ? `<div class="footer">${escapeHtml(payload.voucher.footerText)}</div>` : ''}
  <div class="doc-label">${docLabel}</div>
  <div class="footer" style="margin-top:4px;">${printedAt}</div>
</body>
</html>`;
}
