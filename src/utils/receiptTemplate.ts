/**
 * Thermal receipt HTML (RTL Hebrew layout). Used by Electron print-receipt IPC.
 *
 * Typography targets ~203 DPI / 80mm rolls (Font A ≈ 12×24 dots → 12pt body).
 */

export type ReceiptLanguage = 'he' | 'en';

export interface ReceiptPrintPayload {
  transaction: SerializedReceiptTransaction;
  businessInfo: {
    vatNumber: string;
    companyName: string;
    companyAddress: string;
    companyAddressNumber?: string;
    companyCity: string;
    companyZip?: string;
    companyRegNumber?: string;
  };
  globalTaxRate: number;
  language?: ReceiptLanguage;
  categoryNames?: Record<string, string>;
  printedAt?: string;
}

export interface SerializedReceiptTransaction {
  transactionNumber: string;
  documentProductionDate: string;
  paymentMethod?: 'cash' | 'card';
  amountTendered?: number;
  changeAmount?: number;
  cashier: { name: string };
  cart: {
    items: Array<{
      productId: string;
      product: { name: string; categoryId: string };
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
  };
}

const LABELS = {
  he: {
    docTitle: 'חשבונית מס/קבלה',
    docSource: 'מקור',
    systemLabel: 'POS-DATA',
    issueDate: 'תאריך הנפקת חשבונית:',
    printTime: 'זמן הדפסה:',
    table: 'שולחן',
    waiter: 'מלצר/ית',
    order: 'הזמנה',
    diners: 'סועדים',
    colItem: 'תאור פריט',
    colQty: "יח'",
    colPrice: 'מחיר',
    colTotal: 'סה"כ',
    defaultCategory: 'רגיל',
    totalItems: 'סה"כ פריטים לתשלום',
    beforeVat: 'סה"כ לפני מע"מ',
    vat: 'מע"מ',
    paymentCash: 'מזומן',
    paymentCard: 'כרטיס אשראי',
    changeDue: 'עודף',
    regNumber: 'ח.פ.',
    phone: 'טלפון:',
    logoPlaceholder: '[LOGO]',
    footerPlaceholder: '[FOOTER]',
    supportPlaceholder: '[SUPPORT PHONE]',
  },
  en: {
    docTitle: 'Tax invoice / receipt',
    docSource: 'Original',
    systemLabel: 'POS-DATA',
    issueDate: 'Invoice date:',
    printTime: 'Print time:',
    table: 'Table',
    waiter: 'Cashier',
    order: 'Order',
    diners: 'Diners',
    colItem: 'Item',
    colQty: 'Qty',
    colPrice: 'Price',
    colTotal: 'Total',
    defaultCategory: 'Regular',
    totalItems: 'Total items',
    beforeVat: 'Subtotal before VAT',
    vat: 'VAT',
    paymentCash: 'Cash',
    paymentCard: 'Credit card',
    changeDue: 'Change',
    regNumber: 'Reg. no.',
    phone: 'Phone:',
    logoPlaceholder: '[LOGO]',
    footerPlaceholder: '[FOOTER]',
    supportPlaceholder: '[SUPPORT PHONE]',
  },
} as const;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Line items — whole shekels without decimal when possible (matches thermal receipts). */
function formatItemMoney(amount: number): string {
  if (Math.abs(amount - Math.round(amount)) < 0.001) {
    return `${Math.round(amount)} ₪`;
  }
  return `${amount.toFixed(1)} ₪`;
}

/** Totals — one decimal place. */
function formatTotalMoney(amount: number): string {
  return `${amount.toFixed(1)} ₪`;
}

function formatDateTime(iso: string, language: ReceiptLanguage): string {
  const d = new Date(iso);
  const locale = language === 'he' ? 'he-IL' : 'en-GB';
  const date = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${date} ${time}`;
}

function displayDocNumber(transactionNumber: string): string {
  const digits = transactionNumber.replace(/\D/g, '');
  if (digits.length >= 1) return digits.slice(-6);
  return transactionNumber;
}

function groupItemsByCategory(
  items: SerializedReceiptTransaction['cart']['items'],
  categoryNames: Record<string, string>,
  defaultCategory: string,
): Array<{ categoryName: string; items: SerializedReceiptTransaction['cart']['items'] }> {
  const groups = new Map<string, SerializedReceiptTransaction['cart']['items']>();
  for (const item of items) {
    const catId = item.product.categoryId;
    const catName = (catId && categoryNames[catId]) || defaultCategory;
    const list = groups.get(catName) ?? [];
    list.push(item);
    groups.set(catName, list);
  }
  return Array.from(groups.entries()).map(([categoryName, groupItems]) => ({
    categoryName,
    items: groupItems,
  }));
}

function buildAddressLines(businessInfo: ReceiptPrintPayload['businessInfo']): string[] {
  const lines: string[] = [];
  if (businessInfo.companyName) lines.push(businessInfo.companyName);
  const street = [businessInfo.companyAddress, businessInfo.companyAddressNumber].filter(Boolean).join(' ');
  if (street) lines.push(street);
  const cityLine = [businessInfo.companyCity, businessInfo.companyZip].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  return lines;
}

export function buildReceiptHtml(payload: ReceiptPrintPayload): string {
  const language: ReceiptLanguage = payload.language === 'en' ? 'en' : 'he';
  const L = LABELS[language];
  const { transaction, businessInfo, globalTaxRate } = payload;
  const categoryNames = payload.categoryNames ?? {};
  const printedAt = payload.printedAt ?? new Date().toISOString();
  const issueDate = transaction.documentProductionDate;

  const addressLines = buildAddressLines(businessInfo);
  const regNo = businessInfo.companyRegNumber || businessInfo.vatNumber || '—';
  const docNum = displayDocNumber(transaction.transactionNumber);
  const cashierName = transaction.cashier?.name || '—';
  const paymentLabel =
    transaction.paymentMethod === 'card' ? L.paymentCard : L.paymentCash;
  const paymentAmount =
    transaction.paymentMethod === 'cash'
      ? (transaction.amountTendered ?? transaction.cart.totalAmount)
      : transaction.cart.totalAmount;
  const changeAmount = transaction.changeAmount ?? 0;

  const vatPercent = (globalTaxRate * 100).toFixed(1);
  const beforeVat = transaction.cart.subtotal;
  const vatAmount = transaction.cart.taxAmount;
  const totalAmount = transaction.cart.totalAmount;

  const itemGroups = groupItemsByCategory(transaction.cart.items, categoryNames, L.defaultCategory);

  const categorySections = itemGroups
    .map((group) => {
      const rows = group.items
        .map(
          (item) => `
        <tr>
          <td class="col-item">${esc(item.product.name)}</td>
          <td class="col-qty">${item.quantity}</td>
          <td class="col-price">${formatItemMoney(item.unitPrice)}</td>
          <td class="col-total">${formatItemMoney(item.totalPrice)}</td>
        </tr>`,
        )
        .join('');

      return `
      <div class="category-banner">${esc(group.categoryName)}</div>
      <table class="items">
        <thead>
          <tr>
            <th class="col-item">${esc(L.colItem)}</th>
            <th class="col-qty">${esc(L.colQty)}</th>
            <th class="col-price">${esc(L.colPrice)}</th>
            <th class="col-total">${esc(L.colTotal)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    })
    .join('');

  const businessLinesHtml = addressLines
    .map((line, i) => `<div class="biz-line${i === 0 ? ' biz-name' : ''}">${esc(line)}</div>`)
    .join('');

  const changeRow =
    transaction.paymentMethod === 'cash' && changeAmount > 0
      ? `<div class="row payment"><span>${esc(L.changeDue)}</span><span>${formatTotalMoney(changeAmount)}</span></div>`
      : '';

  return `<!DOCTYPE html>
<html lang="${language}" dir="rtl">
<head>
  <meta charset="utf-8" />
  <style>
    /* 80mm roll — printable ~72mm; Font A body ≈ 12pt @ 203 DPI */
    @page { size: 80mm auto; margin: 2mm; }
    @media print {
      body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12pt;
      line-height: 1.4;
      color: #000;
      margin: 0 auto;
      padding: 3mm;
      max-width: 72mm;
      width: 100%;
    }

    /* ── Header: logo left, business right ── */
    .header-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 4px;
    }
    .logo-box {
      flex: 0 0 28%;
      min-height: 52px;
      border: 1px dashed #666;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 10pt;
      text-align: center;
      padding: 4px;
    }
    .business-block {
      flex: 1;
      text-align: right;
    }
    .biz-name { font-weight: bold; font-size: 12pt; }
    .biz-line { font-size: 11pt; line-height: 1.35; }

    .header-legal {
      display: flex;
      justify-content: space-between;
      font-size: 11pt;
      margin-bottom: 6px;
    }

    /* ── Doc block: POS-DATA + number | title + מקור ── */
    .doc-block {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 4px;
      gap: 8px;
    }
    .doc-left {
      text-align: center;
      flex: 0 0 35%;
    }
    .system-label {
      font-size: 11pt;
      font-weight: bold;
      letter-spacing: 0.02em;
    }
    .doc-number {
      font-size: 22pt;
      font-weight: bold;
      line-height: 1.1;
      margin-top: 2px;
    }
    .doc-right {
      flex: 1;
      text-align: right;
    }
    .doc-title {
      font-weight: bold;
      font-size: 12pt;
    }
    .doc-source {
      font-size: 12pt;
      margin-top: 2px;
    }

    /* ── Dates ── */
    .dates-row {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      font-size: 11pt;
      margin-bottom: 6px;
    }
    .date-cell { flex: 1; }
    .date-cell .label { font-weight: bold; display: block; font-size: 11pt; }
    .date-cell .value { display: block; font-size: 11pt; margin-top: 1px; }
    .date-cell.print { text-align: left; }

    /* ── Meta grid ── */
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      text-align: center;
      font-size: 11pt;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 4px 0;
      margin-bottom: 6px;
    }
    .meta-grid .label { font-weight: bold; display: block; font-size: 11pt; }
    .meta-grid .value { display: block; font-size: 12pt; margin-top: 2px; }

    /* ── Category banner (centered bold, like example) ── */
    .category-banner {
      text-align: center;
      font-weight: bold;
      font-size: 14pt;
      margin: 8px 0 4px;
    }

    /* ── Items table ── */
    table.items {
      width: 100%;
      border-collapse: collapse;
      font-size: 12pt;
      margin-bottom: 4px;
    }
    table.items th {
      border-bottom: 1px dashed #000;
      padding: 3px 2px;
      font-weight: bold;
      font-size: 12pt;
    }
    table.items td {
      padding: 3px 2px;
      vertical-align: top;
      font-size: 12pt;
    }
    .col-item { text-align: right; width: 40%; }
    .col-qty { text-align: center; width: 14%; }
    .col-price { text-align: center; width: 23%; white-space: nowrap; }
    .col-total { text-align: left; width: 23%; white-space: nowrap; }

    .dash {
      border: none;
      border-top: 1px dashed #000;
      margin: 6px 0;
      height: 0;
    }

    /* ── Totals ── */
    .totals { font-size: 12pt; }
    .totals .row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      gap: 8px;
    }
    .totals .row span:last-child { white-space: nowrap; }
    .totals .row.payment {
      font-weight: bold;
      margin-top: 4px;
      border-top: 1px dashed #000;
      padding-top: 4px;
    }

    /* ── Footer ── */
    .footer {
      text-align: center;
      font-size: 11pt;
      margin-top: 10px;
      border-top: 1px dashed #666;
      padding-top: 6px;
      line-height: 1.45;
    }
  </style>
</head>
<body>
  <div class="header-row">
    <div class="logo-box">${esc(L.logoPlaceholder)}</div>
    <div class="business-block">
      ${businessLinesHtml}
    </div>
  </div>

  <div class="header-legal">
    <span>${esc(L.regNumber)} ${esc(regNo)}</span>
    <span>${esc(L.phone)} —</span>
  </div>

  <div class="doc-block">
    <div class="doc-left">
      <div class="system-label">${esc(L.systemLabel)}</div>
      <div class="doc-number">${esc(docNum)}</div>
    </div>
    <div class="doc-right">
      <div class="doc-title">${esc(L.docTitle)}</div>
      <div class="doc-source">${esc(L.docSource)}</div>
    </div>
  </div>

  <div class="dates-row">
    <div class="date-cell">
      <span class="label">${esc(L.issueDate)}</span>
      <span class="value">${esc(formatDateTime(issueDate, language))}</span>
    </div>
    <div class="date-cell print">
      <span class="label">${esc(L.printTime)}</span>
      <span class="value">${esc(formatDateTime(printedAt, language))}</span>
    </div>
  </div>

  <div class="meta-grid">
    <div><span class="label">${esc(L.table)}</span><span class="value">0</span></div>
    <div><span class="label">${esc(L.waiter)}</span><span class="value">${esc(cashierName)}</span></div>
    <div><span class="label">${esc(L.order)}</span><span class="value">${esc(docNum)}</span></div>
    <div><span class="label">${esc(L.diners)}</span><span class="value">1</span></div>
  </div>

  ${categorySections}

  <hr class="dash" />

  <div class="totals">
    <div class="row"><span>${esc(L.totalItems)}</span><span>${formatTotalMoney(totalAmount)}</span></div>
    <div class="row"><span>${esc(L.beforeVat)}</span><span>${formatTotalMoney(beforeVat)}</span></div>
    <div class="row"><span>${esc(L.vat)} ${vatPercent}%</span><span>${formatTotalMoney(vatAmount)}</span></div>
    <div class="row payment"><span>${esc(paymentLabel)}</span><span>${formatTotalMoney(paymentAmount)}</span></div>
    ${changeRow}
  </div>

  <div class="footer">
    <div>${esc(L.footerPlaceholder)}</div>
    <div>${esc(L.supportPlaceholder)}</div>
  </div>
</body>
</html>`;
}
