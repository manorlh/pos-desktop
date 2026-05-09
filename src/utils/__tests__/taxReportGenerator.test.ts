import { describe, it, expect } from 'vitest';
import {
  padRight,
  padLeft,
  formatAmount,
  formatAmount12,
  formatQuantitySigned,
  formatDate,
  formatTime,
  formatOpenFormatLinkId,
  buildA100Record,
  buildB110Record,
  buildC100Record,
  buildD110Record,
  buildD120Record,
  buildM100Record,
  buildZ900Record,
  buildSummaryRecord,
  generateTaxReport,
  collectUniqueProductsForM100,
} from '../taxReportGenerator';
import type { Transaction, Cart, CartItem, Product } from '../../types/index';
import type { BusinessInfo } from '../../stores/useBusinessStore';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-03-27T14:00:00');

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Test Product',
    price: 59.00,
    sku: 'TST-001',
    categoryId: 'cat-1',
    inStock: true,
    stockQuantity: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  const product = makeProduct(overrides.product ? overrides.product as Partial<Product> : {});
  return {
    id: 'item-1',
    productId: product.id,
    product,
    quantity: 1,
    unitPrice: product.price,
    totalPrice: product.price,
    ...overrides,
    product, // ensure product is always the full object
  };
}

function makeCart(items: CartItem[], taxRate = 0.18): Cart {
  const totalWithTax = items.reduce((s, i) => s + i.totalPrice, 0);
  const discountAmount = items.reduce((s, i) => s + (i.discount || 0), 0);
  const discountedTotal = totalWithTax - discountAmount;
  const subtotal = discountedTotal / (1 + taxRate);
  const taxAmount = discountedTotal - subtotal;
  return {
    id: 'cart-1',
    items,
    subtotal,
    taxAmount,
    discountAmount,
    totalAmount: discountedTotal,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const item1 = makeCartItem({
    id: 'item-1',
    product: makeProduct({ id: 'p1', sku: 'TST-001', name: 'Widget A', price: 59.00 }) as any,
    unitPrice: 59.00,
    totalPrice: 59.00,
  });
  const item2 = makeCartItem({
    id: 'item-2',
    product: makeProduct({ id: 'p2', sku: 'TST-002', name: 'Widget B', price: 29.50 }) as any,
    unitPrice: 29.50,
    totalPrice: 29.50,
  });
  const cart = makeCart([item1, item2]);
  return {
    id: 'tx-1',
    transactionNumber: 'INV260327000001',
    cart,
    status: 'completed' as any,
    cashier: { id: 'user-1', name: 'Cashier', email: '', role: 'cashier' } as any,
    createdAt: NOW,
    updatedAt: NOW,
    documentType: 320,
    documentProductionDate: NOW,
    ...overrides,
  };
}

const BUSINESS_INFO: BusinessInfo = {
  vatNumber: '123456789',
  companyName: 'Test Company',
  companyAddress: 'Main Street',
  companyAddressNumber: '10',
  companyCity: 'Tel Aviv',
  companyZip: '6100000',
  companyRegNumber: '514000000',
  withholdingFileNumber: '000000000',
  hasBranches: false,
} as BusinessInfo;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

describe('Formatting helpers', () => {
  describe('padRight', () => {
    it('pads short strings with spaces', () => {
      expect(padRight('AB', 5)).toBe('AB   ');
    });
    it('truncates long strings', () => {
      expect(padRight('ABCDEF', 4)).toBe('ABCD');
    });
  });

  describe('padLeft', () => {
    it('pads short strings with zeros', () => {
      expect(padLeft('42', 5)).toBe('00042');
    });
    it('truncates long strings', () => {
      expect(padLeft('123456', 4)).toBe('1234');
    });
  });

  describe('formatAmount (X9(12)v99 = 15 chars)', () => {
    it('returns exactly 15 characters', () => {
      expect(formatAmount(0)).toHaveLength(15);
      expect(formatAmount(123.45)).toHaveLength(15);
      expect(formatAmount(-99999.99)).toHaveLength(15);
    });

    it('uses + prefix for positive values', () => {
      expect(formatAmount(56.98)).toBe('+00000000005698');
    });

    it('uses - prefix for negative values', () => {
      expect(formatAmount(-12.50)).toBe('-00000000001250');
    });

    it('handles zero', () => {
      expect(formatAmount(0)).toBe('+00000000000000');
    });

    it('sign is always the FIRST character (prefix, not suffix)', () => {
      const result = formatAmount(1.00);
      expect(result[0]).toMatch(/[+-]/);
      expect(result.slice(1)).toMatch(/^\d+$/);
    });

    it('rounds to agorot (2 decimal places)', () => {
      expect(formatAmount(1.50)).toBe('+00000000000150');
      expect(formatAmount(1.999)).toBe('+00000000000200');
    });
  });

  describe('formatAmount12 (X9(9)v99 = 12 chars)', () => {
    it('returns exactly 12 characters', () => {
      expect(formatAmount12(0)).toHaveLength(12);
    });

    it('formats correctly with sign prefix', () => {
      expect(formatAmount12(42.50)).toBe('+00000004250');
      expect(formatAmount12(-10.00)).toBe('-00000001000');
    });
  });

  describe('formatQuantitySigned (X9(12)v9999 = 17 chars)', () => {
    it('returns exactly 17 characters', () => {
      expect(formatQuantitySigned(0)).toHaveLength(17);
      expect(formatQuantitySigned(5)).toHaveLength(17);
    });

    it('scales by 10000 (4 decimal places)', () => {
      expect(formatQuantitySigned(1)).toBe('+0000000000010000');
      expect(formatQuantitySigned(2.5)).toBe('+0000000000025000');
    });

    it('uses sign prefix', () => {
      expect(formatQuantitySigned(-3)[0]).toBe('-');
    });
  });

  describe('formatDate', () => {
    it('formats as YYYYMMDD', () => {
      expect(formatDate(new Date('2026-03-27'))).toBe('20260327');
    });
  });

  describe('formatTime', () => {
    it('formats as HHMM', () => {
      expect(formatTime(new Date('2026-03-27T14:05:00'))).toBe('1405');
    });
  });

  describe('formatOpenFormatLinkId', () => {
    it('returns 7-digit zero-padded string', () => {
      expect(formatOpenFormatLinkId(1)).toBe('0000001');
      expect(formatOpenFormatLinkId(999)).toBe('0000999');
    });
  });
});

// ---------------------------------------------------------------------------
// Record length tests
// ---------------------------------------------------------------------------

describe('Record lengths (fixed per spec)', () => {
  const vat = '123456789';
  const uid = '000000000000001';
  const tx = makeTransaction();
  const linkId = '0000001';

  it('A100 = 95 chars', () => {
    expect(buildA100Record(vat, uid, 1)).toHaveLength(95);
  });

  it('B110 = 376 chars', () => {
    expect(buildB110Record(vat, 2, BUSINESS_INFO)).toHaveLength(376);
  });

  it('C100 = 444 chars', () => {
    expect(buildC100Record(tx, vat, 3, linkId)).toHaveLength(444);
  });

  it('D110 = 339 chars', () => {
    expect(buildD110Record(tx, tx.cart.items[0], 1, vat, 4, 18, linkId)).toHaveLength(339);
  });

  it('D120 = 222 chars', () => {
    expect(buildD120Record(tx, 1, vat, 5, linkId)).toHaveLength(222);
  });

  it('M100 = 298 chars', () => {
    expect(buildM100Record(vat, 6, { sku: 'TST-001', name: 'Widget' })).toHaveLength(298);
  });

  it('Z900 = 110 chars', () => {
    expect(buildZ900Record(vat, uid, 10, 7)).toHaveLength(110);
  });
});

// ---------------------------------------------------------------------------
// C100 field math: validator checks 1221 = 1219 + 1220 and 1223 = 1221 + 1222
// ---------------------------------------------------------------------------

describe('C100 field arithmetic', () => {
  function parseC100Fields(record: string) {
    return {
      f1219: record.substring(287, 302),
      f1220: record.substring(302, 317),
      f1221: record.substring(317, 332),
      f1222: record.substring(332, 347),
      f1223: record.substring(347, 362),
    };
  }

  function signedToNumber(s: string): number {
    const sign = s[0] === '-' ? -1 : 1;
    return sign * parseInt(s.slice(1), 10);
  }

  it('1221 = 1219 + 1220 (no discount)', () => {
    const tx = makeTransaction();
    const record = buildC100Record(tx, '123456789', 1, '0000001', { globalTaxRate: 18 });
    const f = parseC100Fields(record);
    const v1219 = signedToNumber(f.f1219);
    const v1220 = signedToNumber(f.f1220);
    const v1221 = signedToNumber(f.f1221);
    expect(v1221).toBe(v1219 + v1220);
  });

  it('1223 = 1221 + 1222', () => {
    const tx = makeTransaction();
    const record = buildC100Record(tx, '123456789', 1, '0000001', { globalTaxRate: 18 });
    const f = parseC100Fields(record);
    const v1221 = signedToNumber(f.f1221);
    const v1222 = signedToNumber(f.f1222);
    const v1223 = signedToNumber(f.f1223);
    expect(v1223).toBe(v1221 + v1222);
  });

  it('1219 is excluding VAT (less than total including VAT)', () => {
    const tx = makeTransaction();
    const record = buildC100Record(tx, '123456789', 1, '0000001', { globalTaxRate: 18 });
    const f = parseC100Fields(record);
    const v1219 = signedToNumber(f.f1219);
    const v1223 = signedToNumber(f.f1223);
    expect(v1219).toBeLessThan(v1223);
    expect(v1219).toBeGreaterThan(0);
  });

  it('1220 is zero when no document discount', () => {
    const tx = makeTransaction();
    const record = buildC100Record(tx, '123456789', 1, '0000001', { globalTaxRate: 18 });
    const f = parseC100Fields(record);
    expect(f.f1220).toBe('+00000000000000');
  });

  it('with document discount: 1220 is negative, math still holds', () => {
    const tx = makeTransaction({ documentDiscount: 10 });
    const record = buildC100Record(tx, '123456789', 1, '0000001', { globalTaxRate: 18 });
    const f = parseC100Fields(record);
    const v1219 = signedToNumber(f.f1219);
    const v1220 = signedToNumber(f.f1220);
    const v1221 = signedToNumber(f.f1221);
    expect(v1220).toBeLessThan(0);
    expect(v1221).toBe(v1219 + v1220);
  });
});

// ---------------------------------------------------------------------------
// Document type: 320 for sales, 330 for refunds
// ---------------------------------------------------------------------------

describe('Document types', () => {
  function getDocType(record: string): string {
    return record.substring(22, 25);
  }

  it('C100 uses 320 for regular sales', () => {
    const tx = makeTransaction();
    const record = buildC100Record(tx, '123456789', 1, '0000001', { docType: 320 });
    expect(getDocType(record)).toBe('320');
  });

  it('C100 uses 330 for refunds', () => {
    const tx = makeTransaction({ refundOfTransactionId: 'orig-tx-1' });
    const record = buildC100Record(tx, '123456789', 1, '0000001', { docType: 330 });
    expect(getDocType(record)).toBe('330');
  });

  it('D110 doc type matches C100 doc type', () => {
    const tx = makeTransaction();
    const c100 = buildC100Record(tx, '123456789', 1, '0000001', { docType: 320 });
    const d110 = buildD110Record(tx, tx.cart.items[0], 1, '123456789', 2, 18, '0000001', { docType: 320 });
    expect(getDocType(d110)).toBe(getDocType(c100));
  });

  it('D120 doc type matches C100 doc type', () => {
    const tx = makeTransaction();
    const c100 = buildC100Record(tx, '123456789', 1, '0000001', { docType: 320 });
    const d120 = buildD120Record(tx, 1, '123456789', 2, '0000001', { docType: 320 });
    expect(getDocType(d120)).toBe(getDocType(c100));
  });
});

// ---------------------------------------------------------------------------
// D110/D120 linking: matching fields with C100
// ---------------------------------------------------------------------------

describe('D110/D120 linking to C100', () => {
  const tx = makeTransaction();
  const vat = '123456789';
  const link = '0000001';

  function getDocNo(record: string): string { return record.substring(25, 45); }
  function getC100Date1230(record: string): string { return record.substring(400, 408); }
  function getC100Link1234(record: string): string { return record.substring(424, 431); }
  function getD110Date1272(record: string): string { return record.substring(296, 304); }
  function getD110Link1273(record: string): string { return record.substring(304, 311); }
  function getD120Date1322(record: string): string { return record.substring(147, 155); }
  function getD120Link1323(record: string): string { return record.substring(155, 162); }

  it('D110 document number matches C100', () => {
    const c100 = buildC100Record(tx, vat, 1, link);
    const d110 = buildD110Record(tx, tx.cart.items[0], 1, vat, 2, 18, link);
    expect(getDocNo(d110)).toBe(getDocNo(c100));
  });

  it('D110 date (1272) matches C100 date (1230)', () => {
    const c100 = buildC100Record(tx, vat, 1, link);
    const d110 = buildD110Record(tx, tx.cart.items[0], 1, vat, 2, 18, link);
    expect(getD110Date1272(d110)).toBe(getC100Date1230(c100));
  });

  it('D110 link (1273) matches C100 link (1234)', () => {
    const c100 = buildC100Record(tx, vat, 1, link);
    const d110 = buildD110Record(tx, tx.cart.items[0], 1, vat, 2, 18, link);
    expect(getD110Link1273(d110)).toBe(getC100Link1234(c100));
  });

  it('D120 document number matches C100', () => {
    const c100 = buildC100Record(tx, vat, 1, link);
    const d120 = buildD120Record(tx, 1, vat, 2, link);
    expect(getDocNo(d120)).toBe(getDocNo(c100));
  });

  it('D120 date (1322) matches C100 date (1230)', () => {
    const c100 = buildC100Record(tx, vat, 1, link);
    const d120 = buildD120Record(tx, 1, vat, 2, link);
    expect(getD120Date1322(d120)).toBe(getC100Date1230(c100));
  });

  it('D120 link (1323) matches C100 link (1234)', () => {
    const c100 = buildC100Record(tx, vat, 1, link);
    const d120 = buildD120Record(tx, 1, vat, 2, link);
    expect(getD120Link1323(d120)).toBe(getC100Link1234(c100));
  });
});

// ---------------------------------------------------------------------------
// D110 VAT rate field (1268) — 9(2)v99 at cols 286–289
// ---------------------------------------------------------------------------

describe('D110 VAT rate field 1268', () => {
  it('defaults to 18% (1800) when globalTaxRate=18', () => {
    const tx = makeTransaction();
    const d110 = buildD110Record(tx, tx.cart.items[0], 1, '123456789', 1, 18, '0000001');
    const vatField = d110.substring(285, 289);
    expect(vatField).toBe('1800');
  });

  it('uses provided rate', () => {
    const tx = makeTransaction();
    const d110 = buildD110Record(tx, tx.cart.items[0], 1, '123456789', 1, 17, '0000001');
    const vatField = d110.substring(285, 289);
    expect(vatField).toBe('1700');
  });
});

// ---------------------------------------------------------------------------
// Record code prefixes
// ---------------------------------------------------------------------------

describe('Record code prefixes', () => {
  it('A100 starts with "A100"', () => {
    expect(buildA100Record('123456789', '000000000000001', 1).substring(0, 4)).toBe('A100');
  });

  it('B110 starts with "B110"', () => {
    expect(buildB110Record('123456789', 1, BUSINESS_INFO).substring(0, 4)).toBe('B110');
  });

  it('C100 starts with "C100"', () => {
    expect(buildC100Record(makeTransaction(), '123456789', 1, '0000001').substring(0, 4)).toBe('C100');
  });

  it('D110 starts with "D110"', () => {
    const tx = makeTransaction();
    expect(buildD110Record(tx, tx.cart.items[0], 1, '123456789', 1, 18, '0000001').substring(0, 4)).toBe('D110');
  });

  it('D120 starts with "D120"', () => {
    expect(buildD120Record(makeTransaction(), 1, '123456789', 1, '0000001').substring(0, 4)).toBe('D120');
  });

  it('M100 starts with "M100"', () => {
    expect(buildM100Record('123456789', 1, { sku: 'X', name: 'Y' }).substring(0, 4)).toBe('M100');
  });

  it('Z900 starts with "Z900"', () => {
    expect(buildZ900Record('123456789', '000000000000001', 10, 1).substring(0, 4)).toBe('Z900');
  });
});

// ---------------------------------------------------------------------------
// generateTaxReport integration
// ---------------------------------------------------------------------------

describe('generateTaxReport', () => {
  const softwareInfo = {
    name: 'POS Desktop',
    version: '1.0.0',
    registrationNumber: '12345678',
    manufacturerId: '987654321',
    manufacturerName: 'Dev Co',
    softwareType: 'multi-year' as const,
  };

  const taxReportConfig = {
    systemCode: '&OF1.31&',
    accountingType: '1',
    balancingRequired: false,
    languageCode: '0',
    charset: '1',
    compressionSoftware: 'zip',
    defaultCurrency: 'ILS',
  };

  function makeSaleTransaction(id: string, num: string): Transaction {
    return makeTransaction({ id, transactionNumber: num });
  }

  it('produces correct record ordering: A100, B110, [C100, D110..., D120]..., M100..., Z900', () => {
    const txs = [makeSaleTransaction('tx-1', 'INV001'), makeSaleTransaction('tx-2', 'INV002')];
    const result = generateTaxReport(txs, BUSINESS_INFO, softwareInfo, taxReportConfig, { year: 2026 }, '/tmp', 18);

    const codes = result.bkmvContent.map((line) => line.substring(0, 4));
    expect(codes[0]).toBe('A100');
    expect(codes[1]).toBe('B110');

    // Each tx: C100 + 2 D110 + D120
    expect(codes[2]).toBe('C100');
    expect(codes[3]).toBe('D110');
    expect(codes[4]).toBe('D110');
    expect(codes[5]).toBe('D120');
    expect(codes[6]).toBe('C100');
    expect(codes[7]).toBe('D110');
    expect(codes[8]).toBe('D110');
    expect(codes[9]).toBe('D120');

    // M100 records follow
    const m100Start = codes.indexOf('M100');
    expect(m100Start).toBeGreaterThan(9);

    // Z900 is last
    expect(codes[codes.length - 1]).toBe('Z900');
  });

  it('record counts are accurate', () => {
    const txs = [makeSaleTransaction('tx-1', 'INV001')];
    const result = generateTaxReport(txs, BUSINESS_INFO, softwareInfo, taxReportConfig, { year: 2026 }, '/tmp', 18);

    expect(result.recordCounts.A100).toBe(1);
    expect(result.recordCounts.B110).toBe(1);
    expect(result.recordCounts.C100).toBe(1);
    expect(result.recordCounts.D110).toBe(2); // 2 items per tx
    expect(result.recordCounts.D120).toBe(1);
    expect(result.recordCounts.M100).toBeGreaterThanOrEqual(1);
    expect(result.recordCounts.Z900).toBe(1);
  });

  it('uses docType 320 for sales, 330 for refunds', () => {
    const sale = makeSaleTransaction('tx-sale', 'INV001');
    const refund = makeTransaction({
      id: 'tx-refund',
      transactionNumber: 'RFD001',
      refundOfTransactionId: 'tx-sale',
    });
    const result = generateTaxReport([sale, refund], BUSINESS_INFO, softwareInfo, taxReportConfig, { year: 2026 }, '/tmp', 18);

    const c100Records = result.bkmvContent.filter((l) => l.startsWith('C100'));
    expect(c100Records[0].substring(22, 25)).toBe('320');
    expect(c100Records[1].substring(22, 25)).toBe('330');
  });

  it('INI content starts with A000 and has summary lines', () => {
    const txs = [makeSaleTransaction('tx-1', 'INV001')];
    const result = generateTaxReport(txs, BUSINESS_INFO, softwareInfo, taxReportConfig, { year: 2026 }, '/tmp', 18);

    expect(result.iniContent[0].substring(0, 4)).toBe('A000');
    const summaryTypes = result.iniContent.slice(1).map((l) => l.substring(0, 4));
    expect(summaryTypes).toContain('A100');
    expect(summaryTypes).toContain('C100');
    expect(summaryTypes).toContain('D110');
    expect(summaryTypes).toContain('Z900');
  });

  it('all record lengths are correct in generated output', () => {
    const txs = [makeSaleTransaction('tx-1', 'INV001')];
    const result = generateTaxReport(txs, BUSINESS_INFO, softwareInfo, taxReportConfig, { year: 2026 }, '/tmp', 18);

    const expectedLengths: Record<string, number> = {
      A100: 95, B110: 376, C100: 444, D110: 339, D120: 222, M100: 298, Z900: 110,
    };

    for (const line of result.bkmvContent) {
      const code = line.substring(0, 4);
      const expected = expectedLengths[code];
      if (expected) {
        expect(line).toHaveLength(expected);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// collectUniqueProductsForM100
// ---------------------------------------------------------------------------

describe('collectUniqueProductsForM100', () => {
  it('returns unique products from non-cancelled transactions', () => {
    const tx1 = makeTransaction({ id: 'tx-1', status: 'completed' as any });
    const tx2 = makeTransaction({ id: 'tx-2', status: 'cancelled' as any });
    const products = collectUniqueProductsForM100([tx1, tx2]);
    expect(products.length).toBe(2); // Only from tx1
  });

  it('deduplicates products across transactions', () => {
    const tx1 = makeTransaction({ id: 'tx-1' });
    const tx2 = makeTransaction({ id: 'tx-2' }); // same products
    const products = collectUniqueProductsForM100([tx1, tx2]);
    expect(products.length).toBe(2); // deduplicated
  });
});

// ---------------------------------------------------------------------------
// buildSummaryRecord
// ---------------------------------------------------------------------------

describe('buildSummaryRecord', () => {
  it('formats as TYPE + 15-digit zero-padded count', () => {
    expect(buildSummaryRecord('C100', 42)).toBe('C100000000000000042');
    expect(buildSummaryRecord('C100', 42)).toHaveLength(19);
  });
});
