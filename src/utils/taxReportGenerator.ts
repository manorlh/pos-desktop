import type { Transaction, CartItem } from '../types/index';
import type { BusinessInfo, SoftwareInfo, TaxReportConfig } from '../stores/useBusinessStore';
import { normalizeIsraeli9Digit } from './israeliTaxId';

// Formatting helpers
export function padRight(str: string, length: number, padChar = ' '): string {
  return str.padEnd(length, padChar).substring(0, length);
}

export function padLeft(str: string, length: number, padChar = '0'): string {
  return str.padStart(length, padChar).substring(0, length);
}

export function formatNumeric(value: number | string, length: number): string {
  const numStr = Math.abs(Number(value)).toString();
  return padLeft(numStr, length, '0');
}

export function formatAlphanumeric(value: string, length: number): string {
  return padRight(value || '', length, ' ');
}

/**
 * X9(12)v99 → 15 chars: sign PREFIX + 14 digits (12 integer + 2 decimal).
 * Per horaot §2.4: "-12345.65" → "-1234565"; "+1245.65" → "+0124565"
 */
export function formatAmount(value: number, _length: number = 15): string {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '+';
  const agorot = Math.round(Math.abs(n) * 100);
  return sign + padLeft(String(agorot), 14, '0');
}

/** X9(9)v99 → 12 chars: sign PREFIX + 11 digits (9 integer + 2 decimal). */
export function formatAmount12(value: number): string {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '+';
  const agorot = Math.round(Math.abs(n) * 100);
  return sign + padLeft(String(agorot), 11, '0');
}

/** X9(12)v9999 → 17 chars: sign PREFIX + 16 digits (12 integer + 4 decimal). */
export function formatQuantitySigned(value: number): string {
  const n = Number(value || 0);
  const sign = n < 0 ? '-' : '+';
  const scaled = Math.round(Math.abs(n) * 10000);
  return sign + padLeft(String(Math.min(scaled, 10 ** 16 - 1)), 16, '0');
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}${minutes}`;
}

export function generateUniqueFileId(): string {
  // Generate 15-digit unique ID
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000).toString();
  const combined = (timestamp + random).slice(-15);
  return padLeft(combined, 15, '0');
}

/** OPEN FORMAT fields 1234 / 1273 / 1323: 7-digit numeric link (right-justified, leading zeros). */
export function formatOpenFormatLinkId(sequence: number): string {
  const n = Math.abs(Math.floor(sequence)) % 10_000_000;
  return padLeft(String(n), 7, '0');
}

/** Convert tax-inclusive shekels to net (ex-VAT) for D110 1265/1267. */
function grossShekelsToNet(gross: number, taxRatePercent: number): number {
  const r = taxRatePercent / 100;
  if (!Number.isFinite(gross) || r <= 0) return gross;
  return gross / (1 + r);
}

// Record builders
export interface RecordCounts {
  A100: number;
  B110: number;
  C100: number;
  D110: number;
  D120: number;
  M100: number;
  Z900: number;
  [key: string]: number;
}

// A000 Record - INI.TXT header (466 characters)
export function buildA000Record(
  businessInfo: BusinessInfo,
  softwareInfo: SoftwareInfo,
  taxReportConfig: TaxReportConfig,
  totalRecords: number,
  uniqueId: string,
  dateRange: { start: Date; end: Date } | { year: number },
  outputPath: string,
  processDate: Date
): string {
  const vat8 = businessInfo.vatNumber.substring(0, 8).padStart(8, '0');
  const year = 'year' in dateRange 
    ? String(dateRange.year).slice(-2)
    : String(dateRange.start.getFullYear()).slice(-2);
  
  let record = 'A000'; // Record Code (4)
  record += padRight('', 5); // Reserved (5)
  record += padLeft(totalRecords.toString(), 15, '0'); // Total Records (15)
  record += padLeft(normalizeIsraeli9Digit(businessInfo.vatNumber), 9, '0'); // 1003 עוסק מורשה
  record += padLeft(uniqueId, 15, '0'); // Unique Identifier (15)
  record += padRight(taxReportConfig.systemCode, 8); // System Code (8)
  record += padLeft(softwareInfo.registrationNumber, 8, '0'); // Software Registration (8)
  record += padRight(softwareInfo.name, 20); // Software Name (20)
  record += padRight(softwareInfo.version, 20); // Software Version (20)
  record += padLeft(normalizeIsraeli9Digit(softwareInfo.manufacturerId), 9, '0'); // 1009 יצרן
  record += padRight(softwareInfo.manufacturerName, 20); // Developer Name (20)
  record += softwareInfo.softwareType === 'single-year' ? '1' : '2'; // Software Type (1)
  record += padRight(outputPath, 50); // Output Path (50)
  record += taxReportConfig.accountingType; // Accounting Type (1)
  record += taxReportConfig.balancingRequired ? '1' : '0'; // Balancing Required (1)
  record += padLeft(normalizeIsraeli9Digit(businessInfo.companyRegNumber || '00000001'), 9, '0'); // 1015 חברה ברשם
  record += padLeft(normalizeIsraeli9Digit(businessInfo.withholdingFileNumber || '00000000'), 9, '0'); // 1016 תיק ניכויים
  record += padRight('', 10); // future2 (10)
  record += padRight(businessInfo.companyName, 50); // Business Name (50)
  record += padRight(businessInfo.companyAddress, 50); // Address - Street (50)
  record += padRight(businessInfo.companyAddressNumber, 10); // Address - House No. (10)
  record += padRight(businessInfo.companyCity, 30); // Address - City (30)
  record += padRight(businessInfo.companyZip, 8); // Address - ZIP (8)
  
  if ('year' in dateRange) {
    record += String(dateRange.year); // Fiscal Year (4)
    record += String(dateRange.year) + '0101'; // Date Range Start (8)
    const yearEnd = new Date(dateRange.year, 11, 31);
    const endCap = yearEnd > processDate ? processDate : yearEnd;
    record += formatDate(endCap); // Date Range End (8) — not after process date
  } else {
    record += String(dateRange.start.getFullYear()); // Fiscal Year (4)
    record += formatDate(dateRange.start); // Date Range Start (8)
    const end = dateRange.end > processDate ? processDate : dateRange.end;
    record += formatDate(end); // Date Range End (8)
  }
  
  record += formatDate(processDate); // Process Start Date (8)
  record += formatTime(processDate); // Process Start Time (4)
  record += taxReportConfig.languageCode; // Language Code (1)
  record += taxReportConfig.charset; // Charset (1)
  record += padRight(taxReportConfig.compressionSoftware, 20); // Compression Software (20)
  record += taxReportConfig.defaultCurrency; // Default Currency (3)
  record += businessInfo.hasBranches ? '1' : '0'; // Has Branches (1)
  record += padRight('', 466 - record.length); // Fill to exactly 466 characters
  
  return record;
}

// A100 Record - BKMVDATA opening record
export function buildA100Record(
  vatNumber: string,
  uniqueId: string,
  recordNumber: number
): string {
  const vat = normalizeIsraeli9Digit(vatNumber);
  let record = 'A100'; // Record Code (4)
  record += padLeft(recordNumber.toString(), 9, '0'); // Record Serial (9)
  record += padLeft(vat, 9, '0'); // VAT (9)
  record += padLeft(uniqueId, 15, '0'); // Unique ID (15)
  record += '&OF1.31&'; // System Code (8)
  record += padRight('', 50); // Future Use (50)
  
  return record;
}

/** B110 — horaot §4.7, record length 376 (not 297). Fields 1407–1413 must precede 1414–1416. */
const B110_RECORD_LEN = 376;

export function buildB110Record(
  vatNumber: string,
  recordNumber: number,
  businessInfo: BusinessInfo,
  options?: { periodSalesTotal?: number }
): string {
  const vat = normalizeIsraeli9Digit(vatNumber);
  const sales = options?.periodSalesTotal ?? 0;
  let record = 'B110';
  record += padLeft(recordNumber.toString(), 9, '0');
  record += padLeft(vat, 9, '0');
  record += padRight('000000000001500', 15);
  record += padRight(businessInfo.companyName || 'Account', 50);
  record += padRight('000000000000150', 15);
  record += padRight('קופה', 30);
  record += padRight(businessInfo.companyAddress || '', 50);
  record += padRight(businessInfo.companyAddressNumber || '', 10);
  record += padRight(businessInfo.companyCity || '', 30);
  record += padRight((businessInfo.companyZip || '').replace(/\D/g, '').slice(0, 8), 8);
  record += padRight('ישראל', 30);
  record += padRight('IL', 2);
  record += padRight('', 15);                                 // 1413: cols 263–277
  record += formatAmount(0);                                   // 1414: cols 278–292 X9(12)v99
  record += formatAmount(Math.abs(sales));                     // 1415: cols 293–307 X9(12)v99
  record += formatAmount(0);                                   // 1416: cols 308–322 X9(12)v99
  record += padLeft('0001', 4, '0');                           // 1417: cols 323–326
  record += padLeft('0', 9, '0');                              // 1419: cols 327–335
  record += padRight('', 7);                                   // 1421: cols 336–342 X(7)
  record += formatAmount(0);                                   // 1422: cols 343–357 X9(12)v99
  record += padRight('', 3);                                   // 1423: cols 358–360
  record += padRight('', 16);                                  // 1424: cols 361–376
  record = padRight(record, B110_RECORD_LEN, ' ');
  return record.slice(0, B110_RECORD_LEN);
}

const M100_RECORD_LEN = 298;

/** M100 — פריט במלאי (horaot §4.8). Minimal row for POS items (no live inventory). */
export function buildM100Record(
  vatNumber: string,
  recordNumber: number,
  product: { sku: string; name: string }
): string {
  const vat = normalizeIsraeli9Digit(vatNumber);
  let r = 'M100';
  r += padLeft(String(recordNumber), 9, '0');
  r += padLeft(vat, 9, '0');
  r += padRight(product.sku || '', 20);
  r += padRight('', 20);
  r += padRight(product.sku || '', 20);
  r += padRight(product.name || '', 50);
  r += padRight('', 10);
  r += padRight('', 30);
  r += padRight('יחידה', 20);                                 // 1459: cols 173–192
  r += formatAmount12(0);                                      // 1460: cols 193–204 X9(9)v99
  r += formatAmount12(0);                                      // 1461: cols 205–216 X9(9)v99
  r += formatAmount12(0);                                      // 1462: cols 217–228 X9(9)v99
  r += padLeft('0', 10, '0');
  r += padLeft('0', 10, '0');
  r += padRight('', 50);
  r = padRight(r, M100_RECORD_LEN, ' ');
  return r.slice(0, M100_RECORD_LEN);
}

/** One M100 row per distinct product in non-cancelled transactions (inventory master). */
export function collectUniqueProductsForM100(
  transactions: Transaction[]
): { sku: string; name: string }[] {
  const map = new Map<string, { sku: string; name: string }>();
  for (const t of transactions) {
    if (t.status === 'cancelled') continue;
    for (const item of t.cart?.items ?? []) {
      const key =
        item.product?.id ||
        item.productId ||
        `${item.product?.sku ?? ''}|${item.product?.name ?? ''}`;
      if (map.has(key)) continue;
      map.set(key, {
        sku: item.product?.sku ?? '',
        name: item.product?.name ?? '',
      });
    }
  }
  return [...map.values()];
}

/** C100 per horaot §4.3 — exact 444 columns (field 1234 = cols 425–431, not end of record). */
export function buildC100Record(
  transaction: Transaction,
  vatNumber: string,
  recordNumber: number,
  linkId7: string,
  options?: { docType?: number; globalTaxRate?: number }
): string {
  const vat = normalizeIsraeli9Digit(vatNumber);
  const cart = transaction.cart;
  const docType = options?.docType ?? transaction.documentType;
  const taxRate = (options?.globalTaxRate != null ? options.globalTaxRate / 100 : 0) || 0.18;
  const docProductionDate =
    transaction.documentProductionDate != null
      ? transaction.documentProductionDate instanceof Date
        ? transaction.documentProductionDate
        : new Date(transaction.documentProductionDate as unknown as string)
      : new Date(transaction.createdAt as unknown as string);
  const docDiscGross = Number(transaction.documentDiscount ?? 0);
  const docDiscExclVat = docDiscGross > 0 ? docDiscGross / (1 + taxRate) : 0;
  const docDateStr = formatDate(docProductionDate);
  const addr = transaction.customer?.address;
  const f1207 = padRight(transaction.customer?.name?.trim() || 'לקוח כללי', 50);
  const f1208 = padRight(addr?.street?.trim() || '', 50);
  const f1209 = padRight('', 10);
  const f1210 = padRight(addr?.city?.trim() || '', 30);
  const f1211 = padRight((addr?.zipCode || '').replace(/\D/g, '').slice(0, 8), 8);
  const f1212 = padRight(
    addr?.country && addr.country.trim().length > 2 ? addr.country.trim() : 'ישראל',
    30
  );
  const f1213 = padRight('IL', 2); // ISO 3166-1 alpha-2 (נספח 3)
  const f1214 = padRight((transaction.customer?.phone || '').replace(/\D/g, '').slice(0, 15), 15);
  const custVatRaw = (transaction.customer as { vatNumber?: string } | undefined)?.vatNumber;
  const f1215 = padLeft(
    custVatRaw ? normalizeIsraeli9Digit(custVatRaw.replace(/\D/g, '')) : '000000000',
    9,
    '0'
  );
  const f1216 = docDateStr;                                   // 1216: cols 262–269
  const f1217 = formatAmount(0);                               // 1217: cols 270–284 X9(12)v99
  const f1218 = padRight('ILS', 3);                            // 1218: cols 285–287
  const f1219 = formatAmount(cart.subtotal);                    // 1219: cols 288–302 excl VAT, before doc discount
  const f1220 = formatAmount(docDiscExclVat > 0 ? -docDiscExclVat : 0); // 1220: cols 303–317 doc discount (negative)
  const f1221 = formatAmount(cart.subtotal - docDiscExclVat);  // 1221: cols 318–332 = 1219 + 1220
  const f1222 = formatAmount(cart.taxAmount);                  // 1222: cols 333–347 X9(12)v99
  const f1223 = formatAmount(cart.totalAmount);                // 1223: cols 348–362 X9(12)v99
  const wht = transaction.whtDeduction ? Number(transaction.whtDeduction) : 0;
  const f1224 = formatAmount12(wht);                           // 1224: cols 363–374 X9(9)v99
  const seqKey = padLeft(String(recordNumber % 10_000_000_000_000), 15, '0').slice(-15);
  const f1225 = padRight(seqKey, 15);
  const f1226 = padRight('', 10);
  const f1228 = transaction.status === 'cancelled' ? '1' : '0';
  const f1230 = docDateStr;
  const f1231 = transaction.branchId ? padRight(transaction.branchId, 7) : padRight('', 7);
  const f1233 = padRight(transaction.cashier?.name || '', 9);
  const link = padLeft(linkId7.replace(/\D/g, '').slice(-7) || '0', 7, '0');
  const f1235 = padRight('', 13);

  let record = '';
  record += 'C100';
  record += padLeft(String(recordNumber), 9, '0');
  record += padLeft(vat, 9, '0');
  record += padLeft(String(docType), 3, '0');
  record += padRight(transaction.transactionNumber, 20);
  record += docDateStr;
  record += formatTime(docProductionDate);
  record += f1207;
  record += f1208;
  record += f1209;
  record += f1210;
  record += f1211;
  record += f1212;
  record += f1213;
  record += f1214;
  record += f1215;
  record += f1216;
  record += f1217;
  record += f1218;
  record += f1219;
  record += f1220;
  record += f1221;
  record += f1222;
  record += f1223;
  record += f1224;
  record += f1225;
  record += f1226;
  record += f1228;
  record += f1230;
  record += f1231;
  record += f1233;
  record += link;
  record += f1235;
  return record.slice(0, 444);
}

// D110 — 339 chars per horaot §4.4 (field 1258 col 73 before SKU; 1273 cols 305–311; 1274 312–318)
export function buildD110Record(
  transaction: Transaction,
  item: CartItem,
  lineNumber: number,
  vatNumber: string,
  recordNumber: number,
  globalTaxRate: number | undefined,
  linkId7: string,
  options?: {
    docType?: number;
    baseDocType?: string;
    baseDocNumber?: string;
    baseBranchId?: string;
  }
): string {
  const vat = normalizeIsraeli9Digit(vatNumber);
  const lineDiscount = item.lineDiscount || (item.discount || 0);
  const docType = options?.docType ?? transaction.documentType;
  const baseDt = padLeft((options?.baseDocType ?? '').replace(/\D/g, '').slice(0, 3), 3, '0');
  const baseNum = padRight(options?.baseDocNumber ?? '', 20);
  const ratePct = globalTaxRate != null && !Number.isNaN(globalTaxRate) ? globalTaxRate : 18;
  const vatFour = padLeft(String(Math.round(ratePct * 100)), 4, '0');
  const docProductionDate =
    transaction.documentProductionDate != null
      ? transaction.documentProductionDate instanceof Date
        ? transaction.documentProductionDate
        : new Date(transaction.documentProductionDate as unknown as string)
      : new Date(transaction.createdAt as unknown as string);
  const tt = String(Math.min(3, Math.max(1, item.transactionType ?? 2)));
  const netUnit = grossShekelsToNet(Number(item.unitPrice), ratePct);
  const netLine = grossShekelsToNet(Number(item.totalPrice), ratePct);
  const netDisc = lineDiscount ? grossShekelsToNet(Math.abs(Number(lineDiscount)), ratePct) : 0;
  const link = padLeft(linkId7.replace(/\D/g, '').slice(-7) || '0', 7, '0');
  const f1274 = options?.baseBranchId
    ? padRight(options.baseBranchId, 7)
    : padRight('', 7);

  let record = 'D110';
  record += padLeft(recordNumber.toString(), 9, '0');
  record += padLeft(vat, 9, '0');
  record += padLeft(String(docType), 3, '0');
  record += padRight(transaction.transactionNumber, 20);
  record += padLeft(lineNumber.toString(), 4, '0');
  record += baseDt;
  record += baseNum;
  record += tt;
  record += padRight(item.product.sku || '', 20);
  record += padRight(item.product.name, 30);
  record += padRight('', 50);
  record += padRight('', 30);
  record += padRight('', 20);
  record += formatQuantitySigned(Number(item.quantity));        // 1264: cols 224–240 X9(12)v9999
  record += formatAmount(netUnit);                             // 1265: cols 241–255 X9(12)v99
  record += formatAmount(lineDiscount ? -Math.abs(netDisc) : 0); // 1266: cols 256–270 X9(12)v99
  record += formatAmount(netLine);                             // 1267: cols 271–285 X9(12)v99
  record += vatFour;
  record += transaction.branchId ? padRight(transaction.branchId, 7) : padRight('', 7);
  record += formatDate(docProductionDate);
  record += link;
  record += f1274;
  record += padRight('', 21);
  return record.slice(0, 339);
}

// D120 — 222 chars per horaot §4.5 (1322 document date 148–155; 1323 link 156–162)
export function buildD120Record(
  transaction: Transaction,
  lineNumber: number,
  vatNumber: string,
  recordNumber: number,
  linkId7: string,
  options?: { docType?: number }
): string {
  const paymentAmount = Number(transaction.cart?.totalAmount ?? 0);
  const paymentType = transaction.paymentMethod === 'card' ? 3 : 1;
  const docType = options?.docType ?? transaction.documentType;
  const docProductionDate =
    transaction.documentProductionDate != null
      ? transaction.documentProductionDate instanceof Date
        ? transaction.documentProductionDate
        : new Date(transaction.documentProductionDate as unknown as string)
      : new Date(transaction.createdAt as unknown as string);
  const vat = normalizeIsraeli9Digit(vatNumber);
  const docDateStr = formatDate(docProductionDate);
  const link = padLeft(linkId7.replace(/\D/g, '').slice(-7) || '0', 7, '0');

  let record = 'D120';
  record += padLeft(recordNumber.toString(), 9, '0');
  record += padLeft(vat, 9, '0');
  record += padLeft(String(docType), 3, '0');
  record += padRight(transaction.transactionNumber, 20);
  record += padLeft(lineNumber.toString(), 4, '0');
  record += String(paymentType);
  record += padLeft('0', 10, '0');
  record += padLeft('0', 10, '0');
  record += padLeft('0', 15, '0');
  record += padLeft('0', 10, '0');
  record += padLeft('0', 8, '0');
  record += formatAmount(paymentAmount);                        // 1312: cols 104–118 X9(12)v99
  record += '0';
  record += padRight('', 20);
  record += '0';
  record += transaction.branchId ? padRight(transaction.branchId, 7) : padRight('', 7);
  record += docDateStr;
  record += link;
  record += padRight('', 60);
  return record.slice(0, 222);
}

// Z900 Record - Closing record
export function buildZ900Record(
  vatNumber: string,
  uniqueId: string,
  totalRecords: number,
  recordNumber: number
): string {
  const vat = normalizeIsraeli9Digit(vatNumber);
  let record = 'Z900'; // Record Code (4)
  record += padLeft(recordNumber.toString(), 9, '0'); // Record Serial (9)
  record += padLeft(vat, 9, '0'); // VAT (9)
  record += padLeft(uniqueId, 15, '0'); // Unique ID (15)
  record += '&OF1.31&'; // System Code (8)
  record += padLeft(totalRecords.toString(), 15, '0'); // Total Records Count (15)
  record += padRight('', 50); // Future Use (50)
  
  return record;
}

// Generate summary records for INI.TXT (1050 records)
export function buildSummaryRecord(recordType: string, count: number): string {
  return recordType + padLeft(count.toString(), 15, '0');
}

// Main generator function
export function generateTaxReport(
  transactions: Transaction[],
  businessInfo: BusinessInfo,
  softwareInfo: SoftwareInfo,
  taxReportConfig: TaxReportConfig,
  dateRange: { start: Date; end: Date } | { year: number },
  outputPath: string,
  globalTaxRate?: number // Tax rate as percentage, e.g., 18 for 18%
): { iniContent: string[]; bkmvContent: string[]; recordCounts: RecordCounts; uniqueId: string } {
  const uniqueId = generateUniqueFileId();
  const recordCounts: RecordCounts = {
    A100: 0,
    B110: 0,
    C100: 0,
    D110: 0,
    D120: 0,
    M100: 0,
    Z900: 0,
  };
  
  const bkmvLines: string[] = [];
  let recordNumber = 1;

  const totalSales = transactions.reduce((s, t) => {
    if (t.status === 'cancelled') return s;
    return s + Math.abs(Number(t.cart?.totalAmount ?? 0));
  }, 0);

  // A100 - Opening record
  bkmvLines.push(buildA100Record(businessInfo.vatNumber, uniqueId, recordNumber));
  recordCounts.A100 = 1;
  recordNumber++;

  // B110 — chart of accounts (required by tax authority for bookkeeping export)
  bkmvLines.push(
    buildB110Record(businessInfo.vatNumber, recordNumber, businessInfo, { periodSalesTotal: totalSales })
  );
  recordCounts.B110 = 1;
  recordNumber++;
  
  const txById = new Map<string, Transaction>(transactions.map((t) => [t.id, t]));
  let documentLinkSeq = 0;

  for (const transaction of transactions) {
    documentLinkSeq += 1;
    const linkId7 = formatOpenFormatLinkId(documentLinkSeq);
    const isRefund = Boolean(transaction.refundOfTransactionId);
    const originalTx = isRefund ? txById.get(transaction.refundOfTransactionId!) : null;
    const docType = isRefund ? 330 : 320;

    bkmvLines.push(buildC100Record(transaction, businessInfo.vatNumber, recordNumber, linkId7, {
      docType,
      globalTaxRate,
    }));
    recordCounts.C100++;
    recordNumber++;
    
    let lineNumber = 1;
    for (const item of transaction.cart.items) {
      bkmvLines.push(buildD110Record(transaction, item, lineNumber, businessInfo.vatNumber, recordNumber, globalTaxRate, linkId7, {
        docType,
        baseDocType: originalTx ? padLeft(String(originalTx.documentType), 3, '0') : undefined,
        baseDocNumber: originalTx?.transactionNumber,
        baseBranchId: originalTx?.branchId
          ? padRight(String(originalTx.branchId), 7).slice(0, 7)
          : undefined,
      }));
      recordCounts.D110++;
      recordNumber++;
      lineNumber++;
    }
    
    bkmvLines.push(buildD120Record(transaction, 1, businessInfo.vatNumber, recordNumber, linkId7, {
      docType,
    }));
    recordCounts.D120++;
    recordNumber++;
  }

  for (const p of collectUniqueProductsForM100(transactions)) {
    bkmvLines.push(buildM100Record(businessInfo.vatNumber, recordNumber, p));
    recordCounts.M100++;
    recordNumber++;
  }

  // Z900 - Closing record
  const totalRecords = recordNumber;
  bkmvLines.push(buildZ900Record(businessInfo.vatNumber, uniqueId, totalRecords, recordNumber));
  recordCounts.Z900 = 1;
  recordNumber++;
  
  // Generate INI.TXT content
  const processDate = new Date();
  const iniLines: string[] = [];
  
  // A000 record
  iniLines.push(buildA000Record(
    businessInfo,
    softwareInfo,
    taxReportConfig,
    totalRecords,
    uniqueId,
    dateRange,
    outputPath,
    processDate
  ));
  
  // Summary records (1050 format)
  for (const [recordType, count] of Object.entries(recordCounts)) {
    if (count > 0) {
      iniLines.push(buildSummaryRecord(recordType, count));
    }
  }
  
  return {
    iniContent: iniLines,
    bkmvContent: bkmvLines,
    recordCounts,
    uniqueId,
  };
}

