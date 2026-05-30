/**
 * Thermal receipt HTML (RTL Hebrew layout). Used by Electron print-receipt IPC.
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
    regNumber: 'ח.פ.',
    phone: 'טלפון:',
    logoPlaceholder: '[LOGO]',
    footerPlaceholder: '[FOOTER]',
    supportPlaceholder: '[SUPPORT PHONE]',
  },
  en: {
    docTitle: 'Tax invoice / receipt',
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

function formatMoney(amount: number): string {
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
  if (digits.length >= 4) return digits.slice(-6);
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

export function buildReceiptHtml(payload: ReceiptPrintPayload): string {
  const language: ReceiptLanguage = payload.language === 'en' ? 'en' : 'he';
  const L = LABELS[language];
  const { transaction, businessInfo, globalTaxRate } = payload;
  const categoryNames = payload.categoryNames ?? {};
  const printedAt = payload.printedAt ?? new Date().toISOString();
  const issueDate = transaction.documentProductionDate;

  const addressLine = [
    businessInfo.companyAddress,
    businessInfo.companyAddressNumber,
    businessInfo.companyCity,
    businessInfo.companyZip,
  ]
    .filter(Boolean)
    .join(' ');

  const regNo = businessInfo.companyRegNumber || businessInfo.vatNumber || '—';
  const docNum = displayDocNumber(transaction.transactionNumber);
  const cashierName = transaction.cashier?.name || '—';
  const paymentLabel =
    transaction.paymentMethod === 'card' ? L.paymentCard : L.paymentCash;
  const paymentAmount =
    transaction.paymentMethod === 'cash'
      ? (transaction.amountTendered ?? transaction.cart.totalAmount)
      : transaction.cart.totalAmount;

  const vatPercent = (globalTaxRate * 100).toFixed(1);
  const beforeVat = transaction.cart.subtotal;
  const vatAmount = transaction.cart.taxAmount;
  const totalAmount = transaction.cart.totalAmount;

  const itemGroups = groupItemsByCategory(transaction.cart.items, categoryNames, L.defaultCategory);

  const itemRows = itemGroups
    .map(
      (group) => `
      <tr><td colspan="4" class="category-row">${esc(group.categoryName)}</td></tr>
      ${group.items
        .map(
          (item) => `
        <tr>
          <td class="col-item">${esc(item.product.name)}</td>
          <td class="col-qty">${item.quantity}</td>
          <td class="col-price">${formatMoney(item.unitPrice)}</td>
          <td class="col-total">${formatMoney(item.totalPrice)}</td>
        </tr>`,
        )
        .join('')}`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="${language}" dir="rtl">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    @media print {
      body { margin: 0; padding: 0; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      color: #000;
      margin: 0 auto;
      padding: 4px;
      max-width: 302px;
      width: 100%;
    }
    .logo {
      text-align: center;
      font-weight: bold;
      font-size: 14px;
      border: 1px dashed #999;
      padding: 8px;
      margin-bottom: 6px;
    }
    .business { margin-bottom: 6px; }
    .business .name { font-weight: bold; font-size: 12px; }
    .business .line { font-size: 10px; }
    .business-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
    }
    .doc-title {
      text-align: center;
      font-weight: bold;
      font-size: 12px;
      margin: 8px 0 2px;
    }
    .doc-number {
      text-align: center;
      font-size: 18px;
      font-weight: bold;
      margin: 4px 0 8px;
    }
    .dates {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      margin-bottom: 6px;
      gap: 8px;
    }
    .dates .label { font-weight: bold; }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      text-align: center;
      font-size: 10px;
      margin-bottom: 8px;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 4px 0;
    }
    .meta-grid .label { font-weight: bold; display: block; }
    table.items {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 4px;
    }
    table.items th {
      border-bottom: 1px dashed #000;
      padding: 2px 1px;
      font-weight: bold;
    }
    table.items td {
      padding: 2px 1px;
      vertical-align: top;
    }
    .category-row {
      font-weight: bold;
      padding-top: 4px !important;
    }
    .col-item { text-align: right; width: 42%; }
    .col-qty { text-align: center; width: 12%; }
    .col-price { text-align: center; width: 23%; }
    .col-total { text-align: left; width: 23%; }
    .dash { border-top: 1px dashed #000; margin: 6px 0; }
    .totals { font-size: 10px; }
    .totals .row {
      display: flex;
      justify-content: space-between;
      padding: 1px 0;
    }
    .totals .row.payment {
      font-weight: bold;
      margin-top: 4px;
      border-top: 1px dashed #000;
      padding-top: 4px;
    }
    .footer {
      text-align: center;
      font-size: 10px;
      margin-top: 10px;
      border-top: 1px dashed #999;
      padding-top: 6px;
    }
  </style>
</head>
<body>
  <div class="logo">${esc(L.logoPlaceholder)}</div>

  <div class="business">
    <div class="name">${esc(businessInfo.companyName)}</div>
    ${addressLine ? `<div class="line">${esc(addressLine)}</div>` : ''}
    <div class="business-row">
      <span>${esc(L.regNumber)} ${esc(regNo)}</span>
      <span>${esc(L.phone)} —</span>
    </div>
  </div>

  <div class="doc-title">${esc(L.docTitle)}</div>
  <div class="doc-number">${esc(docNum)}</div>

  <div class="dates">
    <div>
      <span class="label">${esc(L.issueDate)}</span><br />
      ${esc(formatDateTime(issueDate, language))}
    </div>
    <div style="text-align: left;">
      <span class="label">${esc(L.printTime)}</span><br />
      ${esc(formatDateTime(printedAt, language))}
    </div>
  </div>

  <div class="meta-grid">
    <div><span class="label">${esc(L.table)}</span>0</div>
    <div><span class="label">${esc(L.waiter)}</span>${esc(cashierName)}</div>
    <div><span class="label">${esc(L.order)}</span>${esc(docNum)}</div>
    <div><span class="label">${esc(L.diners)}</span>1</div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th class="col-item">${esc(L.colItem)}</th>
        <th class="col-qty">${esc(L.colQty)}</th>
        <th class="col-price">${esc(L.colPrice)}</th>
        <th class="col-total">${esc(L.colTotal)}</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="dash"></div>

  <div class="totals">
    <div class="row"><span>${esc(L.totalItems)}</span><span>${formatMoney(totalAmount)}</span></div>
    <div class="row"><span>${esc(L.beforeVat)}</span><span>${formatMoney(beforeVat)}</span></div>
    <div class="row"><span>${esc(L.vat)} ${vatPercent}%</span><span>${formatMoney(vatAmount)}</span></div>
    <div class="row payment"><span>${esc(paymentLabel)}</span><span>${formatMoney(paymentAmount)}</span></div>
  </div>

  <div class="footer">
    <div>${esc(L.footerPlaceholder)}</div>
    <div>${esc(L.supportPlaceholder)}</div>
  </div>
</body>
</html>`;
}
