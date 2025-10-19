const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');

/**
 * Helpers to format fields to the spec:
 * - numeric fields: right-aligned, padded with leading zeros
 * - alphanumeric fields: left-aligned, padded with spaces
 * - decimal fields: represented with v notation (e.g., 9(12)v99 -> integer part 12, 2 decimal digits)
 *
 * NOTE: this is a compact helper subset. Extend validators and edge-cases as needed.
 */

function padLeft(str, length, padChar = '0') {
  str = str == null ? '' : String(str);
  if (str.length >= length) return str.slice(-length);
  return padChar.repeat(length - str.length) + str;
}
function padRight(str, length, padChar = ' ') {
  str = str == null ? '' : String(str);
  if (str.length >= length) return str.slice(0, length);
  return str + padChar.repeat(length - str.length);
}

/**
 * Format numeric field with decimal configuration.
 * integerLen: number of integer digits.
 * decimals: number of decimals.
 * sign handling: spec shows some signed examples (value+ or value-). For simplicity we'll use sign suffix (+/-) optionally.
 */
function formatDecimalField(value, integerLen, decimals) {
  // value is Number or string numeric
  const num = Number(value || 0);
  const sign = num < 0 ? '-' : '+'; // we'll follow spec example of trailing sign if needed
  const abs = Math.abs(num);
  const scaled = Math.round(abs * Math.pow(10, decimals));
  const totalLen = integerLen + decimals;
  const digits = padLeft(String(scaled), totalLen, '0'); // combined digits
  // many fields are represented without a sign character but with negative sign appended behind number (per doc examples)
  // We'll return digits + sign (but adjust depending on field definition later)
  return digits + sign;
}

/**
 * Format according to type metadata: { type: 'X' or '9', len: N, decimals: D? , align: 'left'|'right', allowSign: boolean }
 */
function formatField(value, meta) {
  const type = meta.type; // 'X' or '9' or 'V' style
  const len = meta.len;
  if (type === 'X') {
    return padRight(value == null ? '' : value, len, ' ');
  } else if (type === '9') {
    // numeric field, pad with zeros left
    const s = value == null || value === '' ? '' : String(value);
    return padLeft(s, len, '0');
  } else if (type === 'decimal') {
    // meta: integerLen, decimals, signSuffix boolean
    const formatted = formatDecimalField(value, meta.integerLen, meta.decimals);
    if (meta.signSuffix) {
      // formatted already contains sign at the end
      // if the spec expects no trailing sign, adjust as needed
      return padLeft(formatted, meta.integerLen + meta.decimals + 1, '0');
    } else {
      // remove sign
      return padLeft(formatted.slice(0, meta.integerLen + meta.decimals), meta.integerLen + meta.decimals, '0');
    }
  } else {
    return padRight(value == null ? '' : String(value), len, ' ');
  }
}

/**
 * Join fields into a fixed-length record string then append CRLF.
 * recordSpec: array of metas like { name, type, len, ... }
 * data: object mapping field name -> value
 */
function buildRecord(recordSpec, data) {
  let rec = '';
  for (const f of recordSpec) {
    const val = data[f.name];
    rec += formatField(val, f);
  }
  // ensure CR+LF as required by the spec
  return rec + '\r\n';
}

/**
 * Basic record definitions for common types (A100, Z900, C100, D110, D120, B100, B110, M100)
 * The definitions below are a practical subset of the spec fields (the spec has many).
 * Extend fields to exactly match columns & lengths from the PDF if you need full compliance.
 */

const INI_SPEC = [
  { name: 'recordCode', type: 'X', len: 4 },   // A000 / etc.
  { name: 'future1', type: 'X', len: 5 },      // reserved
  { name: 'totalRecordsLabel', type: '9', len: 15 }, // placeholder to be overwritten later
  { name: 'vatNumber', type: '9', len: 9 },
  { name: 'mainId', type: '9', len: 15 }, // unique main id
  { name: 'systemConst', type: 'X', len: 8 }, // &OF1.31&
  { name: 'swRegNumber', type: '9', len: 8 },
  { name: 'swName', type: 'X', len: 20 },
  { name: 'swVersion', type: 'X', len: 20 },
  { name: 'manufacturerId', type: '9', len: 9 },
  { name: 'manufacturerName', type: 'X', len: 20 },
  { name: 'swType', type: '9', len: 1 }, // 1=single-year,2=multi-year
  { name: 'outPath', type: 'X', len: 50 },
  { name: 'acctType', type: '9', len: 1 }, // 0,1,2 etc
  { name: 'needTrialBalance', type: '9', len: 1 }, // 0/1
  { name: 'companyRegNum', type: '9', len: 9 }, // company registry number
  { name: 'withholdingCase', type: '9', len: 9 }, // etc
  { name: 'future2', type: 'X', len: 10 },
  { name: 'companyName', type: 'X', len: 50 },
  { name: 'companyAddr', type: 'X', len: 50 },
  { name: 'companyAddrNo', type: 'X', len: 10 },
  { name: 'companyCity', type: 'X', len: 30 },
  { name: 'companyZip', type: 'X', len: 8 },
  { name: 'fiscalYear', type: '9', len: 4 },
  { name: 'rangeFrom', type: '9', len: 8 }, // YYYYMMDD
  { name: 'rangeTo', type: '9', len: 8 },   // YYYYMMDD
  { name: 'procDate', type: '9', len: 8 },  // YYYYMMDD
  { name: 'procTime', type: '9', len: 4 },  // hhmm
  { name: 'langCode', type: '9', len: 1 },  // 0=Heb,1=Ar,2=Other
  { name: 'charSet', type: '9', len: 1 },   // 0..2 per spec
  { name: 'archiveSwName', type: 'X', len: 20 },
  { name: 'future3', type: 'X', len: 0 },   // placeholder to align with spec
  { name: 'currency', type: 'X', len: 3 },  // ILS default
  { name: 'hasBranches', type: '9', len: 1 },
  { name: 'future4', type: 'X', len: 46 }
];

const A100_SPEC = [
  { name: 'recordCode', type: 'X', len: 4 },     // "A100"
  { name: 'recNo', type: '9', len: 9 },
  { name: 'vatNumber', type: '9', len: 9 },
  { name: 'mainId', type: '9', len: 15 },
  { name: 'systemConst', type: 'X', len: 8 },
  { name: 'future', type: 'X', len: 50 },
];

const Z900_SPEC = [
  { name: 'recordCode', type: 'X', len: 4 },     // "Z900"
  { name: 'recNo', type: '9', len: 9 },
  { name: 'vatNumber', type: '9', len: 9 },
  { name: 'mainId', type: '9', len: 15 },
  { name: 'systemConst', type: 'X', len: 8 },
  { name: 'totalRecords', type: '9', len: 15 },
  { name: 'future', type: 'X', len: 50 }
];

const C100_SPEC = [
  { name: 'recordCode', type: 'X', len: 4 }, // "C100"
  { name: 'recNo', type: '9', len: 9 },
  { name: 'vatNumber', type: '9', len: 9 },
  { name: 'docType', type: '9', len: 3 },    // per annex table
  { name: 'docNumber', type: 'X', len: 20 },
  { name: 'docDate', type: '9', len: 8 },   // YYYYMMDD
  { name: 'docTime', type: '9', len: 4 },   // hhmm
  { name: 'clientName', type: 'X', len: 50 },
  { name: 'clientAddr', type: 'X', len: 30 },
  { name: 'clientZip', type: 'X', len: 8 },
  { name: 'country', type: 'X', len: 30 },
  { name: 'currencyAmount', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'currencyCode', type: 'X', len: 3 },
  { name: 'amountBeforeDiscount', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'discount', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'amountWithoutVat', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'vatAmount', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'totalAmount', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'withholding', type: 'decimal', integerLen: 9, decimals: 2, signSuffix: false, len: 12 },
  { name: 'clientKey', type: 'X', len: 15 },
  { name: 'matchField', type: 'X', len: 10 },
  { name: 'isCancelled', type: 'X', len: 1 },
  { name: 'docDate2', type: '9', len: 8 }, // date on doc, duplication per spec
  { name: 'branchId', type: 'X', len: 7 },
  { name: 'userName', type: 'X', len: 9 },
  { name: 'linkField', type: '9', len: 7 },
];

const D110_SPEC = [
  { name: 'recordCode', type: 'X', len: 4 }, // "D110"
  { name: 'recNo', type: '9', len: 9 },
  { name: 'vatNumber', type: '9', len: 9 },
  { name: 'docType', type: '9', len: 3 },
  { name: 'docNumber', type: 'X', len: 20 },
  { name: 'lineNumber', type: '9', len: 4 },
  { name: 'baseDocType', type: '9', len: 3 },
  { name: 'baseDocNumber', type: 'X', len: 20 },
  { name: 'lineSku', type: 'X', len: 20 },
  { name: 'description', type: 'X', len: 30 },
  { name: 'manufacturer', type: 'X', len: 50 },
  { name: 'serial', type: 'X', len: 30 },
  { name: 'unit', type: 'X', len: 20 },
  { name: 'quantity', type: 'decimal', integerLen: 12, decimals: 4, signSuffix: false, len: 17 },
  { name: 'unitPrice', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'lineDiscount', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'lineTotal', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'vatPercent', type: 'decimal', integerLen: 2, decimals: 2, signSuffix: false, len: 2 },
  { name: 'branchId', type: 'X', len: 7 },
  { name: 'docDate', type: '9', len: 8 },
  { name: 'linkField', type: '9', len: 7 }
];

const D120_SPEC = [
  { name: 'recordCode', type: 'X', len: 4 }, // "D120"
  { name: 'recNo', type: '9', len: 9 },
  { name: 'vatNumber', type: '9', len: 9 },
  { name: 'docType', type: '9', len: 3 }, // receipt type
  { name: 'docNumber', type: 'X', len: 20 },
  { name: 'lineNumber', type: '9', len: 4 },
  { name: 'payType', type: '9', len: 1 }, // 1 cash, 2 check, 3 cc...
  { name: 'bankNum', type: '9', len: 10 },
  { name: 'branchNum', type: '9', len: 10 },
  { name: 'accountNum', type: '9', len: 15 },
  { name: 'checkNum', type: '9', len: 10 },
  { name: 'dueDate', type: '9', len: 8 },
  { name: 'amount', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'acquirerCode', type: '9', len: 1 },
  { name: 'acquirerName', type: 'X', len: 20 },
  { name: 'ccType', type: '9', len: 1 },
  { name: 'branchId', type: 'X', len: 7 },
  { name: 'docDate', type: '9', len: 8 },
  { name: 'linkField', type: '9', len: 7 }
];

const B100_SPEC = [
  { name: 'recordCode', type: 'X', len: 4 }, // "B100"
  { name: 'recNo', type: '9', len: 9 },
  { name: 'vatNumber', type: '9', len: 9 },
  { name: 'trxNumber', type: '9', len: 10 },
  { name: 'trxLine', type: '9', len: 5 },
  { name: 'bookNumber', type: '9', len: 8 },
  { name: 'ref', type: 'X', len: 20 },
  { name: 'refDocType', type: '9', len: 3 },
  { name: 'refDocNum', type: 'X', len: 20 },
  { name: 'items', type: 'X', len: 50 },
  { name: 'date', type: '9', len: 8 },
  { name: 'valueDate', type: '9', len: 8 },
  { name: 'account', type: 'X', len: 15 },
  { name: 'contraAccount', type: 'X', len: 15 },
  { name: 'debitCreditSign', type: '9', len: 1 }, // 1=debit,2=credit
  { name: 'amountLocal', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'amountForeign', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'qty', type: 'decimal', integerLen: 9, decimals: 2, signSuffix: false, len: 11 },
  { name: 'match1', type: 'X', len: 10 },
  { name: 'match2', type: 'X', len: 10 },
  { name: 'branchId', type: 'X', len: 7 },
  { name: 'enteredDate', type: '9', len: 8 },
  { name: 'user', type: 'X', len: 9 }
];

const B110_SPEC = [
  { name: 'recordCode', type: 'X', len: 4 }, // "B110"
  { name: 'recNo', type: '9', len: 9 },
  { name: 'vatNumber', type: '9', len: 9 },
  { name: 'accountKey', type: 'X', len: 15 },
  { name: 'accountName', type: 'X', len: 50 },
  { name: 'trialBalanceCode', type: 'X', len: 15 },
  { name: 'trialBalanceDesc', type: 'X', len: 30 },
  { name: 'clientAddr', type: 'X', len: 50 },
  { name: 'openingBalance', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'totalDebit', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'totalCredit', type: 'decimal', integerLen: 12, decimals: 2, signSuffix: false, len: 15 },
  { name: 'classificationCode', type: '9', len: 4 },
  { name: 'supplierCustomerId', type: '9', len: 9 },
  { name: 'branchId', type: 'X', len: 7 },
  { name: 'future', type: 'X', len: 50 }
];

const M100_SPEC = [
  { name: 'recordCode', type: 'X', len: 4 }, // "M100"
  { name: 'recNo', type: '9', len: 9 },
  { name: 'vatNumber', type: '9', len: 9 },
  { name: 'skuUniversal', type: 'X', len: 20 },
  { name: 'supplierSku', type: 'X', len: 20 },
  { name: 'internalSku', type: 'X', len: 20 },
  { name: 'itemName', type: 'X', len: 50 },
  { name: 'categoryCode', type: 'X', len: 10 },
  { name: 'categoryDesc', type: 'X', len: 30 },
  { name: 'unitDesc', type: 'X', len: 20 },
  { name: 'openingQty', type: 'decimal', integerLen: 9, decimals: 0, signSuffix: false, len: 9 },
  { name: 'totalIn', type: 'decimal', integerLen: 9, decimals: 0, signSuffix: false, len: 9 },
  { name: 'totalOut', type: 'decimal', integerLen: 9, decimals: 0, signSuffix: false, len: 9 },
  { name: 'endingCost', type: 'decimal', integerLen: 8, decimals: 2, signSuffix: false, len: 10 },
  { name: 'endingCostReserved', type: 'decimal', integerLen: 8, decimals: 2, signSuffix: false, len: 10 },
  { name: 'future', type: 'X', len: 50 }
];

/**
 * Utility to generate the specific directory path:
 * OPENFRMT\<first8_of_vat>.<YY>\MMDDhhmm\
 */
function buildOutputPath(rootFolder, vatNumber) {
  const now = new Date();
  const YY = String(now.getFullYear()).slice(2);
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const first8 = String(vatNumber).padStart(8, '0').slice(0, 8);
  const folder1 = `OPENFRMT\\${first8}.${YY}`;
  const folder2 = `${MM}${DD}${hh}${mm}`;
  const outDir = path.join(rootFolder, folder1, folder2);
  return { outDir, folder1, folder2, timestamp: `${MM}${DD}${hh}${mm}` };
}

/**
 * Create INI.TXT content - using a subset of fields. The spec wants exactly one record.
 */
function createIniTxt(data) {
  // prepare default values for unspecified fields
  const recData = {
    recordCode: 'A000',
    future1: '',
    totalRecordsLabel: '', // will be set by closure later if needed
    vatNumber: data.vatNumber || '',
    mainId: data.mainId || padLeft(String(Math.floor(Math.random() * 1e15)), 15, '0'),
    systemConst: '&OF1.31&',
    swRegNumber: data.swRegNumber || '',
    swName: data.swName || '',
    swVersion: data.swVersion || '',
    manufacturerId: data.manufacturerId || '',
    manufacturerName: data.manufacturerName || '',
    swType: data.swType || '1',
    outPath: data.outPath || '',
    acctType: data.acctType || '1',
    needTrialBalance: data.needTrialBalance || '1',
    companyRegNum: data.companyRegNum || '',
    withholdingCase: data.withholdingCase || '',
    future2: '',
    companyName: data.companyName || '',
    companyAddr: data.companyAddr || '',
    companyAddrNo: data.companyAddrNo || '',
    companyCity: data.companyCity || '',
    companyZip: data.companyZip || '',
    fiscalYear: data.fiscalYear || '',
    rangeFrom: data.rangeFrom || '',
    rangeTo: data.rangeTo || '',
    procDate: data.procDate || '',
    procTime: data.procTime || '',
    langCode: data.langCode || '0',
    charSet: data.charSet || '0',
    archiveSwName: data.archiveSwName || '',
    future3: '',
    currency: data.currency || 'ILS',
    hasBranches: data.hasBranches ? '1' : '0',
    future4: ''
  };

  return buildRecord(INI_SPEC, recData);
}

/**
 * Build BKMVDATA lines from provided arrays:
 * - opening (A100)
 * - documents headers (C100) and details (D110)
 * - receipts (D120)
 * - journal entries (B100)
 * - accounts (B110)
 * - inventory items (M100)
 * - closing (Z900)
 *
 * The function expects arrays for each record type (optional).
 */
function createBkmvData({
  vatNumber,
  mainId,
  openingRecords = [],
  docHeaders = [],
  docDetails = [],
  receipts = [],
  journalEntries = [],
  accounts = [],
  items = []
}) {
  const lines = [];
  let recNo = 1;

  // Opening record A100
  const a100 = buildRecord(A100_SPEC, {
    recordCode: 'A100',
    recNo,
    vatNumber,
    mainId,
    systemConst: '&OF1.31&',
    future: ''
  });
  lines.push(a100);
  recNo++;

  // Add documents headers (C100)
  for (const dh of docHeaders) {
    const rec = buildRecord(C100_SPEC, Object.assign({
      recordCode: 'C100',
      recNo,
      vatNumber
    }, dh));
    lines.push(rec);
    recNo++;
  }

  // details D110
  for (const dd of docDetails) {
    const rec = buildRecord(D110_SPEC, Object.assign({
      recordCode: 'D110',
      recNo,
      vatNumber
    }, dd));
    lines.push(rec);
    recNo++;
  }

  // receipts D120
  for (const r of receipts) {
    const rec = buildRecord(D120_SPEC, Object.assign({
      recordCode: 'D120',
      recNo,
      vatNumber
    }, r));
    lines.push(rec);
    recNo++;
  }

  // journal entries B100
  for (const j of journalEntries) {
    const rec = buildRecord(B100_SPEC, Object.assign({
      recordCode: 'B100',
      recNo,
      vatNumber
    }, j));
    lines.push(rec);
    recNo++;
  }

  // accounts B110
  for (const a of accounts) {
    const rec = buildRecord(B110_SPEC, Object.assign({
      recordCode: 'B110',
      recNo,
      vatNumber
    }, a));
    lines.push(rec);
    recNo++;
  }

  // inventory items M100
  for (const it of items) {
    const rec = buildRecord(M100_SPEC, Object.assign({
      recordCode: 'M100',
      recNo,
      vatNumber
    }, it));
    lines.push(rec);
    recNo++;
  }

  // Closing record Z900 - total records count included
  const totalRecords = recNo; // spec expects "total records including opening and closing"
  const z900 = buildRecord(Z900_SPEC, {
    recordCode: 'Z900',
    recNo,
    vatNumber,
    mainId,
    systemConst: '&OF1.31&',
    totalRecords: String(totalRecords).padStart(15, '0'),
    future: ''
  });
  lines.push(z900);

  return lines.join(''); // lines already include CRLF endings
}

/**
 * Write files as ISO-8859-8-i (Hebrew) per spec using iconv-lite.
 */
function writeFileIso88598i(filePath, content) {
  // iconv-lite supports 'iso-8859-8' which is close; 'iso-8859-8-i' is visual vs logical difference for presentation.
  // We will use 'iso-8859-8' with iconv-lite. If you need exact 'iso-8859-8-i' you may need a specialized encoder.
  const buf = iconv.encode(content, 'iso-8859-8');
  fs.writeFileSync(filePath, buf);
}

/**
 * Create zip archive containing BKMVDATA.TXT (zipped with that name).
 */
async function zipBkmvData(sourceTxtPath, destZipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve(archive.pointer()));
    archive.on('error', err => reject(err));
    archive.pipe(output);
    archive.file(sourceTxtPath, { name: 'BKMVDATA.TXT' });
    archive.finalize();
  });
}

/**
 * Top-level function to generate the folder, INI.TXT and BKMVDATA.TXT and zip it.
 */
async function generateOpenFormat(opts) {
  const rootFolder = opts.rootFolder || process.cwd();
  const vat = opts.vatNumber || '00223344';
  const mainId = opts.mainId || padLeft(String(Math.floor(Math.random() * 1e9)), 15, '0');

  const { outDir, folder1, folder2 } = buildOutputPath(rootFolder, vat);
  fs.mkdirSync(outDir, { recursive: true });

  // Build INI.TXT
  const procDate = new Date();
  const iniContent = createIniTxt({
    vatNumber: vat,
    mainId,
    swRegNumber: opts.swRegNumber || '00000001',
    swName: opts.swName || 'MyPOS',
    swVersion: opts.swVersion || '1.0.0',
    manufacturerId: opts.manufacturerId || '000000001',
    manufacturerName: opts.manufacturerName || 'MyCompany',
    swType: opts.swType || '1',
    outPath: `${folder1}\\${folder2}`,
    acctType: opts.acctType || '2',
    needTrialBalance: opts.needTrialBalance ? '1' : '0',
    companyRegNum: opts.companyRegNum || '',
    companyName: opts.companyName || 'Sample Store',
    companyAddr: opts.companyAddr || 'Some St 1',
    companyCity: opts.companyCity || 'Tel Aviv',
    companyZip: opts.companyZip || '12345',
    fiscalYear: String(procDate.getFullYear()),
    rangeFrom: opts.rangeFrom || '',
    rangeTo: opts.rangeTo || '',
    procDate: `${procDate.getFullYear()}${String(procDate.getMonth()+1).padStart(2,'0')}${String(procDate.getDate()).padStart(2,'0')}`,
    procTime: `${String(procDate.getHours()).padStart(2,'0')}${String(procDate.getMinutes()).padStart(2,'0')}`,
    langCode: '0',
    charSet: '0',
    archiveSwName: 'zip',
    currency: 'ILS',
    hasBranches: opts.hasBranches || false
  });

  // Example content arrays (you will supply real transactions)
  const bkmvContent = createBkmvData({
    vatNumber: vat,
    mainId,
    openingRecords: [],
    docHeaders: opts.docHeaders || [],
    docDetails: opts.docDetails || [],
    receipts: opts.receipts || [],
    journalEntries: opts.journalEntries || [],
    accounts: opts.accounts || [],
    items: opts.items || []
  });

  // Write INI.TXT and BKMVDATA.TXT using correct encoding
  const iniPath = path.join(outDir, 'INI.TXT');
  const bkmvPath = path.join(outDir, 'BKMVDATA.TXT');

  writeFileIso88598i(iniPath, iniContent);
  writeFileIso88598i(bkmvPath, bkmvContent);

  // Zip BKMVDATA.TXT (some older specs want the BKMVDATA.TXT inside a zipped archive)
  const zipPath = path.join(outDir, 'BKMVDATA.zip');
  await zipBkmvData(bkmvPath, zipPath);

  return {
    outDir,
    iniPath,
    bkmvPath,
    zipPath
  };
}

/**
 * Example usage when run standalone:
 * node openformat-generator.js
 */
if (require.main === module) {
  (async () => {
    try {
      const result = await generateOpenFormat({
        rootFolder: path.join(process.cwd(), 'openformat_out'),
        vatNumber: '00223344',
        swName: 'MyPOS',
        swVersion: '0.1.0',
        companyName: 'Sample Store LTD',
        docHeaders: [
          // One sample document header (C100)
          {
            docType: '305', // invoice tax code (example)
            docNumber: 'INV-0001',
            docDate: '20250911',
            docTime: '1025',
            clientName: 'John Customer',
            clientAddr: 'Main St 5',
            clientZip: '12345',
            country: 'IL',
            currencyAmount: 1000.00,
            currencyCode: 'ILS',
            amountBeforeDiscount: 1000.00,
            discount: 0.00,
            amountWithoutVat: 900.00,
            vatAmount: 100.00,
            totalAmount: 1000.00,
            withholding: 0.00,
            clientKey: 'CUST-01',
            matchField: '',
            isCancelled: '0',
            docDate2: '20250911',
            branchId: '',
            userName: 'operator',
            linkField: '1'
          }
        ],
        docDetails: [
          {
            docType: '305',
            docNumber: 'INV-0001',
            lineNumber: '1',
            description: 'Burger',
            unit: 'unit',
            quantity: 2,
            unitPrice: 200,
            lineDiscount: 0,
            lineTotal: 400,
            vatPercent: 17,
            docDate: '20250911',
            branchId: ''
          }
        ],
        receipts: [
          // optional receipts (D120)
        ],
        journalEntries: [
          // optional B100 entries
        ],
        accounts: [
          // optional B110
        ],
        items: [
          // optional M100 inventory items
          {
            skuUniversal: 'BRG001',
            supplierSku: 'BRG001-SUP',
            internalSku: 'BRG001-INT',
            itemName: 'Burger',
            categoryCode: 'FOOD',
            categoryDesc: 'Food Items',
            unitDesc: 'Unit',
            openingQty: 10,
            totalIn: 100,
            totalOut: 90,
            endingCost: 20.00,
            endingCostReserved: 0.00
          }
        ]
      });

      console.log('Generated openformat files at:', result.outDir);
      console.log('INI.TXT ->', result.iniPath);
      console.log('BKMVDATA.TXT ->', result.bkmvPath);
      console.log('BKMVDATA.zip ->', result.zipPath);
    } catch (err) {
      console.error('Error generating openformat files:', err);
    }
  })();
}

module.exports = {
  generateOpenFormat,
  createIniTxt,
  createBkmvData
};
