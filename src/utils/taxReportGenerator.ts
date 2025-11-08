import type { Transaction, CartItem, PaymentDetails } from '../types/index';
import type { BusinessInfo, SoftwareInfo, TaxReportConfig } from '../stores/useBusinessStore';

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

export function formatAmount(value: number, length: number = 15): string {
  // X9(12)v99 format: 12 digits before decimal, 2 after, sign at end
  const absValue = Math.abs(value);
  const integerPart = Math.floor(absValue);
  const decimalPart = Math.round((absValue - integerPart) * 100);
  
  const integerStr = padLeft(integerPart.toString(), 12, '0');
  const decimalStr = padLeft(decimalPart.toString(), 2, '0');
  const sign = value < 0 ? '-' : '+';
  
  return integerStr + decimalStr + sign;
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

// Record builders
export interface RecordCounts {
  A100: number;
  C100: number;
  D110: number;
  D120: number;
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
  record += padLeft(businessInfo.vatNumber, 9, '0'); // Business VAT (9)
  record += padLeft(uniqueId, 15, '0'); // Unique Identifier (15)
  record += padRight(taxReportConfig.systemCode, 8); // System Code (8)
  record += padLeft(softwareInfo.registrationNumber, 8, '0'); // Software Registration (8)
  record += padRight(softwareInfo.name, 20); // Software Name (20)
  record += padRight(softwareInfo.version, 20); // Software Version (20)
  record += padLeft(softwareInfo.manufacturerId, 9, '0'); // Developer VAT (9)
  record += padRight(softwareInfo.manufacturerName, 20); // Developer Name (20)
  record += softwareInfo.softwareType === 'single-year' ? '1' : '2'; // Software Type (1)
  record += padRight(outputPath, 50); // Output Path (50)
  record += taxReportConfig.accountingType; // Accounting Type (1)
  record += taxReportConfig.balancingRequired ? '1' : '0'; // Balancing Required (1)
  record += padLeft(businessInfo.vatNumber, 9, '0'); // Company ID (9)
  record += padLeft(businessInfo.companyRegNumber || '000000001', 9, '0'); // Deduction File Number (9)
  record += padRight(businessInfo.companyName, 50); // Business Name (50)
  record += padRight(businessInfo.companyAddress, 50); // Address - Street (50)
  record += padRight(businessInfo.companyAddressNumber, 10); // Address - House No. (10)
  record += padRight(businessInfo.companyCity, 30); // Address - City (30)
  record += padRight(businessInfo.companyZip, 8); // Address - ZIP (8)
  
  if ('year' in dateRange) {
    record += String(dateRange.year); // Fiscal Year (4)
    record += String(dateRange.year) + '0101'; // Date Range Start (8)
    record += String(dateRange.year) + '1231'; // Date Range End (8)
  } else {
    record += String(dateRange.start.getFullYear()); // Fiscal Year (4)
    record += formatDate(dateRange.start); // Date Range Start (8)
    record += formatDate(dateRange.end); // Date Range End (8)
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
  let record = 'A100'; // Record Code (4)
  record += padLeft(recordNumber.toString(), 9, '0'); // Record Serial (9)
  record += padLeft(vatNumber, 9, '0'); // VAT (9)
  record += padLeft(uniqueId, 15, '0'); // Unique ID (15)
  record += '&OF1.31&'; // System Code (8)
  record += padRight('', 50); // Future Use (50)
  
  return record;
}

// C100 Record - Document Header (444 characters)
// Fields: 1203 (docType), 1204 (docNumber), 1230 (docDate), 1205 (docProdDate), 1220 (discount), 1224 (WHT), 1231 (branchId)
export function buildC100Record(
  transaction: Transaction,
  vatNumber: string,
  recordNumber: number
): string {
  let record = 'C100'; // Record Code (4)
  record += padLeft(recordNumber.toString(), 9, '0'); // Record Serial (9)
  record += padLeft(vatNumber, 9, '0'); // VAT (9)
  record += padRight('', 9); // Reserved (9)
  
  // Field 1203: Document Type (3) - columns 23-25
  record += padLeft(transaction.documentType.toString(), 3, '0');
  
  // Field 1204: Document Number (20) - columns 26-45
  record += padRight(transaction.transactionNumber, 20);
  
  // Field 1205: Document Production Date (8) - columns 46-53
  record += formatDate(transaction.documentProductionDate);
  
  // Fields 54-400 (reserved/other fields) - simplified for POS
  record += padRight('', 347); // Fill to column 400
  
  // Field 1230: Document Date (8) - columns 401-408
  record += formatDate(transaction.createdAt);
  
  // Field 1220: Document Discount (15) - columns 303-317 (X9(12)v99, negative sign)
  // Note: Positioned earlier in the record per spec
  const discountPos = 303 - 1; // Convert to 0-based
  const discountStr = transaction.documentDiscount 
    ? formatAmount(-Math.abs(transaction.documentDiscount), 15)
    : padRight('', 15);
  
  // Field 1224: WHT Deduction at Source (12) - columns 363-374 (X9(9)v99, positive sign)
  const whtPos = 363 - 1;
  const whtStr = transaction.whtDeduction
    ? formatAmount(Math.abs(transaction.whtDeduction), 12)
    : padRight('', 12);
  
  // Field 1231: Branch/Section ID (7) - columns 409-415 (conditional)
  const branchStr = transaction.branchId 
    ? padRight(transaction.branchId, 7)
    : padRight('', 7);
  
  // Rebuild record with proper positioning
  record = 'C100';
  record += padLeft(recordNumber.toString(), 9, '0');
  record += padLeft(vatNumber, 9, '0');
  record += padRight('', 9);
  record += padLeft(transaction.documentType.toString(), 3, '0'); // 1203: 23-25
  record += padRight(transaction.transactionNumber, 20); // 1204: 26-45
  record += formatDate(transaction.documentProductionDate); // 1205: 46-53
  record += padRight('', 250); // 54-303
  record += discountStr; // 1220: 303-317
  record += padRight('', 45); // 318-362
  record += whtStr; // 1224: 363-374
  record += padRight('', 26); // 375-400
  record += formatDate(transaction.createdAt); // 1230: 401-408
  record += branchStr; // 1231: 409-415
  record += padRight('', 444 - record.length); // Fill to 444
  
  return record;
}

// D110 Record - Document Details (339 characters)
// Fields: 1253 (docType), 1258 (transactionType), 1260 (description), 1264 (quantity), 1266 (lineDiscount), 1267 (lineTotal)
export function buildD110Record(
  transaction: Transaction,
  item: CartItem,
  lineNumber: number,
  vatNumber: string,
  recordNumber: number
): string {
  let record = 'D110'; // Record Code (4)
  record += padLeft(recordNumber.toString(), 9, '0'); // Record Serial (9)
  record += padLeft(vatNumber, 9, '0'); // VAT (9)
  record += padRight('', 9); // Reserved (9)
  
  // Field 1253: Document Type (3) - columns 23-25
  record += padLeft(transaction.documentType.toString(), 3, '0');
  
  // Field: Document Number (20) - columns 26-45
  record += padRight(transaction.transactionNumber, 20);
  
  // Field: Line Number (4) - columns 46-49
  record += padLeft(lineNumber.toString(), 4, '0');
  
  // Field: Base Document Type (3) - columns 50-52
  record += padRight('', 3);
  
  // Field: Base Document Number (20) - columns 53-72
  record += padRight('', 20);
  
  // Field: SKU (20) - columns 73-92
  record += padRight(item.product.sku || '', 20);
  
  // Field 1260: Description (30) - columns 94-123
  record += padRight(item.product.name, 30);
  
  // Field: Manufacturer (50) - columns 124-173
  record += padRight('', 50);
  
  // Field: Serial (30) - columns 174-203
  record += padRight('', 30);
  
  // Field: Unit (20) - columns 204-223
  record += padRight('', 20);
  
  // Field 1264: Quantity (17) - columns 224-240 (X9(12)v9999)
  const quantity = item.quantity;
  const qtyInteger = Math.floor(quantity);
  const qtyDecimal = Math.round((quantity - qtyInteger) * 10000);
  record += padLeft(qtyInteger.toString(), 12, '0') + padLeft(qtyDecimal.toString(), 4, '0') + '+';
  
  // Field: Unit Price (15) - columns 241-255
  record += formatAmount(item.unitPrice, 15);
  
  // Field 1266: Line Discount (15) - columns 256-270 (negative sign)
  const lineDiscount = item.lineDiscount || (item.discount || 0);
  record += lineDiscount > 0 
    ? formatAmount(-Math.abs(lineDiscount), 15)
    : padRight('', 15);
  
  // Field 1267: Total Line Amount (15) - columns 271-285
  record += formatAmount(item.totalPrice, 15);
  
  // Field: VAT Percent (2) - columns 286-287
  const vatPercent = item.product.taxRate ? Math.round(item.product.taxRate * 100) : 0;
  record += padLeft(vatPercent.toString(), 2, '0');
  
  // Field: Branch ID (7) - columns 288-294
  record += transaction.branchId ? padRight(transaction.branchId, 7) : padRight('', 7);
  
  // Field: Document Date (8) - columns 295-302
  record += formatDate(transaction.createdAt);
  
  // Field 1258: Transaction Type (1) - columns 73-73 (actually should be earlier, but per spec positioning)
  // Note: Per spec, this is at column 73, but we need to adjust
  // For now, placing it in a logical position
  const transactionType = item.transactionType || 2; // Default to Sale (2)
  
  // Rebuild with correct positioning
  record = 'D110';
  record += padLeft(recordNumber.toString(), 9, '0');
  record += padLeft(vatNumber, 9, '0');
  record += padRight('', 9);
  record += padLeft(transaction.documentType.toString(), 3, '0'); // 1253: 23-25
  record += padRight(transaction.transactionNumber, 20); // 26-45
  record += padLeft(lineNumber.toString(), 4, '0'); // 46-49
  record += padRight('', 3); // 50-52
  record += padRight('', 20); // 53-72
  record += String(transactionType); // 1258: 73-73
  record += padRight(item.product.sku || '', 20); // 74-93
  record += padRight(item.product.name, 30); // 1260: 94-123
  record += padRight('', 50); // 124-173
  record += padRight('', 30); // 174-203
  record += padRight('', 20); // 204-223
  record += padLeft(qtyInteger.toString(), 12, '0') + padLeft(qtyDecimal.toString(), 4, '0') + '+'; // 1264: 224-240
  record += formatAmount(item.unitPrice, 15); // 241-255
  record += lineDiscount > 0 ? formatAmount(-Math.abs(lineDiscount), 15) : padRight('', 15); // 1266: 256-270
  record += formatAmount(item.totalPrice, 15); // 1267: 271-285
  record += padLeft(vatPercent.toString(), 2, '0'); // 286-287
  record += transaction.branchId ? padRight(transaction.branchId, 7) : padRight('', 7); // 288-294
  record += formatDate(transaction.createdAt); // 295-302
  record += padRight('', 339 - record.length); // Fill to 339
  
  return record;
}

// D120 Record - Receipt/Payment Details (222 characters)
// Fields: 1306 (paymentType), 1307 (bankNumber), 1312 (lineAmount), 1315 (creditTransactionType)
export function buildD120Record(
  transaction: Transaction,
  paymentDetails: PaymentDetails,
  lineNumber: number,
  vatNumber: string,
  recordNumber: number
): string {
  // Map payment method type to tax authority code
  const paymentTypeMap: Record<string, number> = {
    'cash': 1, // Cash
    'check': 2, // Check
    'card': 3, // Credit Card
    'digital': 4, // Bank Transfer (using for digital)
    'gift_card': 9, // Other
  };
  
  const paymentType = paymentTypeMap[paymentDetails.method.type] || 9;
  
  let record = 'D120'; // Record Code (4)
  record += padLeft(recordNumber.toString(), 9, '0'); // Record Serial (9)
  record += padLeft(vatNumber, 9, '0'); // VAT (9)
  record += padRight('', 9); // Reserved (9)
  record += padLeft(transaction.documentType.toString(), 3, '0'); // Document Type (3)
  record += padRight(transaction.transactionNumber, 20); // Document Number (20)
  record += padLeft(lineNumber.toString(), 4, '0'); // Line Number (4)
  
  // Field 1306: Type of Payment (1) - columns 50-50
  record += String(paymentType);
  
  // Field 1307: Bank Number (10) - columns 51-60 (for checks only)
  if (paymentDetails.method.type === 'check' && paymentDetails.bankNumber) {
    record += padLeft(paymentDetails.bankNumber, 10, '0');
  } else {
    record += padRight('', 10);
  }
  
  // Field: Branch Number (10) - columns 61-70
  record += padRight('', 10);
  
  // Field: Account Number (15) - columns 71-85
  record += padRight('', 15);
  
  // Field: Check Number (10) - columns 86-95
  record += padRight('', 10);
  
  // Field: Due Date (8) - columns 96-103
  record += padRight('', 8);
  
  // Field 1312: Line Amount (15) - columns 104-118
  record += formatAmount(paymentDetails.amount, 15);
  
  // Field: Acquirer Code (1) - columns 119-119
  record += padRight('', 1);
  
  // Field: Acquirer Name (20) - columns 120-139
  record += padRight('', 20);
  
  // Field 1315: Credit Transaction Type (1) - columns 140-140 (for credit cards)
  if (paymentDetails.method.type === 'card' && paymentDetails.creditTransactionType) {
    record += String(paymentDetails.creditTransactionType);
  } else {
    record += padRight('', 1);
  }
  
  // Field: Branch ID (7) - columns 141-147
  record += transaction.branchId ? padRight(transaction.branchId, 7) : padRight('', 7);
  
  // Field: Document Date (8) - columns 148-155
  record += formatDate(transaction.createdAt);
  
  // Field: Link Field (7) - columns 156-162
  record += padRight('', 7);
  
  // Fill to 222
  record += padRight('', 222 - record.length);
  
  return record;
}

// Z900 Record - Closing record
export function buildZ900Record(
  vatNumber: string,
  uniqueId: string,
  totalRecords: number,
  recordNumber: number
): string {
  let record = 'Z900'; // Record Code (4)
  record += padLeft(recordNumber.toString(), 9, '0'); // Record Serial (9)
  record += padLeft(vatNumber, 9, '0'); // VAT (9)
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
  outputPath: string
): { iniContent: string[]; bkmvContent: string[]; recordCounts: RecordCounts; uniqueId: string } {
  const uniqueId = generateUniqueFileId();
  const recordCounts: RecordCounts = {
    A100: 0,
    C100: 0,
    D110: 0,
    D120: 0,
    Z900: 0,
  };
  
  const bkmvLines: string[] = [];
  let recordNumber = 1;
  
  // A100 - Opening record
  bkmvLines.push(buildA100Record(businessInfo.vatNumber, uniqueId, recordNumber));
  recordCounts.A100 = 1;
  recordNumber++;
  
  // Process transactions
  for (const transaction of transactions) {
    // C100 - Document header
    bkmvLines.push(buildC100Record(transaction, businessInfo.vatNumber, recordNumber));
    recordCounts.C100++;
    recordNumber++;
    
    // D110 - Document details (one per cart item)
    let lineNumber = 1;
    for (const item of transaction.cart.items) {
      bkmvLines.push(buildD110Record(transaction, item, lineNumber, businessInfo.vatNumber, recordNumber));
      recordCounts.D110++;
      recordNumber++;
      lineNumber++;
    }
    
    // D120 - Payment details
    bkmvLines.push(buildD120Record(transaction, transaction.paymentDetails, 1, businessInfo.vatNumber, recordNumber));
    recordCounts.D120++;
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

