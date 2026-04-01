#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Standalone mock OPEN FORMAT file generator.
 * Writes INI.TXT + BKMVDATA.TXT directly with controlled test data.
 * Field positions follow horaot_131 v1.31 exactly.
 *
 * Usage:
 *   node scripts/mock-openformat.js [--out=<dir>] [--vat=123456782]
 */
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const archiver = require('archiver');

// ─── Formatting primitives ───────────────────────────────────────────────────

function padR(str, len, ch = ' ') {
  return String(str ?? '').padEnd(len, ch).slice(0, len);
}

function padL(str, len, ch = '0') {
  return String(str ?? '').padStart(len, ch).slice(0, len);
}

function fmtDate(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * X9(12)v99 → 15 chars: sign prefix + 12 integer digits + 2 decimal digits.
 * Per spec section 2.4: "-12345.65" → "-1234565"; "+1245.65" → "+0124565"
 */
function xs15(v) {
  const n = Number(v) || 0;
  const sign = n < 0 ? '-' : '+';
  const agorot = Math.round(Math.abs(n) * 100);
  return sign + padL(String(agorot), 14, '0');
}

/** X9(9)v99 → 12 chars: sign prefix + 9 integer + 2 decimal. */
function xs12(v) {
  const n = Number(v) || 0;
  const sign = n < 0 ? '-' : '+';
  const agorot = Math.round(Math.abs(n) * 100);
  return sign + padL(String(agorot), 11, '0');
}

/** X9(12)v9999 → 17 chars: sign prefix + 12 integer + 4 decimal. */
function xq17(v) {
  const n = Number(v) || 0;
  const sign = n < 0 ? '-' : '+';
  const scaled = Math.round(Math.abs(n) * 10000);
  return sign + padL(String(scaled), 16, '0');
}

function makeUniqueId() {
  const t = Date.now().toString();
  const r = String(Math.floor(Math.random() * 1000));
  return padL((t + r).slice(-15), 15, '0');
}

// ─── Record builders (column positions from horaot_131 §3–§4) ────────────────

/** A100 — opening record, 95 chars (§4.1) */
function buildA100(vat, uid, recNo) {
  let r = 'A100';                           // 1100: cols 1–4
  r += padL(recNo, 9);                      // 1101: cols 5–13
  r += padL(vat, 9);                        // 1102: cols 14–22
  r += padL(uid, 15);                       // 1103: cols 23–37
  r += '&OF1.31&';                          // 1104: cols 38–45
  r += padR('', 50);                        // 1105: cols 46–95
  return r; // 95 chars
}

/**
 * B110 — chart-of-accounts record, 376 chars (§4.7).
 * Column layout verified against spec table.
 */
function buildB110(vat, recNo, biz, periodSales) {
  let r = 'B110';                           // 1400: cols 1–4
  r += padL(recNo, 9);                      // 1401: cols 5–13
  r += padL(vat, 9);                        // 1402: cols 14–22
  r += padR('000000000001500', 15);         // 1403: cols 23–37
  r += padR(biz.name, 50);                  // 1404: cols 38–87
  r += padR('000000000000150', 15);         // 1405: cols 88–102
  r += padR('קופה', 30);                    // 1406: cols 103–132
  r += padR(biz.street, 50);               // 1407: cols 133–182
  r += padR(biz.house, 10);                // 1408: cols 183–192
  r += padR(biz.city, 30);                 // 1409: cols 193–222
  r += padR(biz.zip, 8);                   // 1410: cols 223–230
  r += padR('ישראל', 30);                   // 1411: cols 231–260
  r += padR('IL', 2);                       // 1412: cols 261–262
  r += padR('', 15);                        // 1413: cols 263–277
  r += xs15(0);                             // 1414: cols 278–292  X9(12)v99
  r += xs15(Math.abs(periodSales));         // 1415: cols 293–307  X9(12)v99
  r += xs15(0);                             // 1416: cols 308–322  X9(12)v99
  r += padL('1', 4);                        // 1417: cols 323–326  9(4)
  r += padL('0', 9);                        // 1419: cols 327–335  9(9)
  r += padR('', 7);                         // 1421: cols 336–342  X(7)
  r += xs15(0);                             // 1422: cols 343–357  X9(12)v99
  r += padR('', 3);                         // 1423: cols 358–360  X(3)
  r += padR('', 16);                        // 1424: cols 361–376  X(16)
  return padR(r, 376); // 376 chars
}

/**
 * C100 — document header, 444 chars (§4.3).
 * Column layout: spec page 12. Note 1227/1229/1232 are cancelled (0-len).
 */
function buildC100(tx, vat, recNo) {
  let r = 'C100';                           // 1200: cols 1–4
  r += padL(recNo, 9);                      // 1201: cols 5–13
  r += padL(vat, 9);                        // 1202: cols 14–22
  r += padL(tx.docType, 3);                 // 1203: cols 23–25
  r += padR(tx.docNo, 20);                  // 1204: cols 26–45
  r += fmtDate(tx.docDate);                 // 1205: cols 46–53
  r += fmtTime(tx.docDate);                 // 1206: cols 54–57
  r += padR('לקוח כללי', 50);               // 1207: cols 58–107
  r += padR('', 50);                        // 1208: cols 108–157
  r += padR('', 10);                        // 1209: cols 158–167
  r += padR('', 30);                        // 1210: cols 168–197
  r += padR('', 8);                         // 1211: cols 198–205
  r += padR('ישראל', 30);                   // 1212: cols 206–235
  r += padR('IL', 2);                       // 1213: cols 236–237
  r += padR('', 15);                        // 1214: cols 238–252
  r += padL('000000000', 9);                // 1215: cols 253–261
  r += fmtDate(tx.docDate);                 // 1216: cols 262–269
  r += xs15(0);                             // 1217: cols 270–284  X9(12)v99
  r += padR('ILS', 3);                      // 1218: cols 285–287
  r += xs15(tx.beforeDiscount);             // 1219: cols 288–302  X9(12)v99
  r += xs15(-(tx.discount || 0));           // 1220: cols 303–317  X9(12)v99 (discount = negative)
  r += xs15(tx.subtotal);                   // 1221: cols 318–332  X9(12)v99
  r += xs15(tx.tax);                        // 1222: cols 333–347  X9(12)v99
  r += xs15(tx.total);                      // 1223: cols 348–362  X9(12)v99
  r += xs12(tx.wht || 0);                   // 1224: cols 363–374  X9(9)v99
  r += padR(padL(recNo, 15), 15);           // 1225: cols 375–389
  r += padR('', 10);                        // 1226: cols 390–399
  // 1227: cancelled (0 len)
  r += '0';                                 // 1228: col 400       X(1)
  // 1229: cancelled (0 len)
  r += fmtDate(tx.docDate);                 // 1230: cols 401–408
  r += padR('', 7);                         // 1231: cols 409–415
  // 1232: cancelled (0 len)
  r += padR('CASHIER', 9);                  // 1233: cols 416–424
  r += padL(tx.link, 7);                    // 1234: cols 425–431  9(7)
  r += padR('', 13);                        // 1235: cols 432–444
  return padR(r, 444); // 444 chars
}

/**
 * D110 — document detail line, 339 chars (§4.4).
 * Column layout: spec page 13.
 */
function buildD110(tx, line, vat, recNo) {
  let r = 'D110';                           // 1250: cols 1–4
  r += padL(recNo, 9);                      // 1251: cols 5–13
  r += padL(vat, 9);                        // 1252: cols 14–22
  r += padL(tx.docType, 3);                 // 1253: cols 23–25
  r += padR(tx.docNo, 20);                  // 1254: cols 26–45
  r += padL(line.lineNo, 4);                // 1255: cols 46–49
  r += padL('', 3);                         // 1256: cols 50–52
  r += padR('', 20);                        // 1257: cols 53–72
  r += '2';                                 // 1258: col 73
  r += padR(line.sku, 20);                  // 1259: cols 74–93
  r += padR(line.name, 30);                 // 1260: cols 94–123
  r += padR('', 50);                        // 1261: cols 124–173
  r += padR('', 30);                        // 1262: cols 174–203
  r += padR('', 20);                        // 1263: cols 204–223
  r += xq17(line.qty);                      // 1264: cols 224–240  X9(12)v9999
  r += xs15(line.unitNet);                  // 1265: cols 241–255  X9(12)v99
  r += xs15(line.discount ? -Math.abs(line.discount) : 0); // 1266: cols 256–270
  r += xs15(line.lineNet);                  // 1267: cols 271–285  X9(12)v99
  r += padL('1800', 4);                     // 1268: cols 286–289  9(2)v99
  // 1269: cancelled (0 len)
  r += padR('', 7);                         // 1270: cols 290–296
  // 1271: cancelled (0 len)
  r += fmtDate(tx.docDate);                 // 1272: cols 297–304
  r += padL(tx.link, 7);                    // 1273: cols 305–311  9(7)
  r += padR('', 7);                         // 1274: cols 312–318
  r += padR('', 21);                        // 1275: cols 319–339
  return padR(r, 339); // 339 chars
}

/**
 * D120 — payment detail, 222 chars (§4.5).
 * Column layout: spec page 14.
 */
function buildD120(tx, vat, recNo) {
  let r = 'D120';                           // 1300: cols 1–4
  r += padL(recNo, 9);                      // 1301: cols 5–13
  r += padL(vat, 9);                        // 1302: cols 14–22
  r += padL(tx.docType, 3);                 // 1303: cols 23–25
  r += padR(tx.docNo, 20);                  // 1304: cols 26–45
  r += padL('1', 4);                        // 1305: cols 46–49
  r += '1';                                 // 1306: col 50  (1=cash)
  r += padL('0', 10);                       // 1307: cols 51–60
  r += padL('0', 10);                       // 1308: cols 61–70
  r += padL('0', 15);                       // 1309: cols 71–85
  r += padL('0', 10);                       // 1310: cols 86–95
  r += padL('0', 8);                        // 1311: cols 96–103
  r += xs15(tx.total);                      // 1312: cols 104–118  X9(12)v99
  r += '0';                                 // 1313: col 119
  r += padR('', 20);                        // 1314: cols 120–139
  r += '0';                                 // 1315: col 140
  // 1316-1319: cancelled (0 len each)
  r += padR('', 7);                         // 1320: cols 141–147
  // 1321: cancelled (0 len)
  r += fmtDate(tx.docDate);                 // 1322: cols 148–155
  r += padL(tx.link, 7);                    // 1323: cols 156–162  9(7)
  r += padR('', 60);                        // 1324: cols 163–222
  return padR(r, 222); // 222 chars
}

/**
 * M100 — inventory item, 298 chars (§4.8).
 * Column layout: spec page 17.
 */
function buildM100(vat, recNo, product) {
  let r = 'M100';                           // 1450: cols 1–4
  r += padL(recNo, 9);                      // 1451: cols 5–13
  r += padL(vat, 9);                        // 1452: cols 14–22
  r += padR(product.sku, 20);               // 1453: cols 23–42
  r += padR('', 20);                        // 1454: cols 43–62
  r += padR(product.sku, 20);               // 1455: cols 63–82
  r += padR(product.name, 50);              // 1456: cols 83–132
  r += padR('', 10);                        // 1457: cols 133–142
  r += padR('', 30);                        // 1458: cols 143–172
  r += padR('יחידה', 20);                   // 1459: cols 173–192
  r += xs12(0);                             // 1460: cols 193–204  X9(9)v99
  r += xs12(0);                             // 1461: cols 205–216  X9(9)v99
  r += xs12(0);                             // 1462: cols 217–228  X9(9)v99
  r += padL('0', 10);                       // 1463: cols 229–238  9(8)v99
  r += padL('0', 10);                       // 1464: cols 239–248  9(8)v99
  r += padR('', 50);                        // 1465: cols 249–298
  return padR(r, 298); // 298 chars
}

/** Z900 — closing record, 110 chars (§4.2) */
function buildZ900(vat, uid, totalRecords, recNo) {
  let r = 'Z900';                           // 1150: cols 1–4
  r += padL(recNo, 9);                      // 1151: cols 5–13
  r += padL(vat, 9);                        // 1152: cols 14–22
  r += padL(uid, 15);                       // 1153: cols 23–37
  r += '&OF1.31&';                          // 1154: cols 38–45
  r += padL(totalRecords, 15);              // 1155: cols 46–60
  r += padR('', 50);                        // 1156: cols 61–110
  return r; // 110 chars
}

/** A000 — INI.TXT header, 466 chars (§3.1) */
function buildA000(vat, uid, totalRecords, biz, outPath) {
  const now = new Date();
  let r = 'A000';                           // 1000: cols 1–4
  r += padR('', 5);                         // 1001: cols 5–9
  r += padL(totalRecords, 15);              // 1002: cols 10–24
  r += padL(vat, 9);                        // 1003: cols 25–33
  r += padL(uid, 15);                       // 1004: cols 34–48
  r += '&OF1.31&';                          // 1005: cols 49–56
  r += padL('1', 8);                        // 1006: cols 57–64
  r += padR('POS Desktop', 20);             // 1007: cols 65–84
  r += padR('mock-1.0', 20);                // 1008: cols 85–104
  r += padL('987654324', 9);                // 1009: cols 105–113
  r += padR('Developer Name', 20);          // 1010: cols 114–133
  r += '2';                                 // 1011: col 134
  r += padR(outPath, 50);                   // 1012: cols 135–184
  r += '1';                                 // 1013: col 185
  r += '0';                                 // 1014: col 186
  r += padL(vat, 9);                        // 1015: cols 187–195
  r += padL('000000000', 9);                // 1016: cols 196–204
  r += padR('', 10);                        // 1017: cols 205–214
  r += padR(biz.name, 50);                  // 1018: cols 215–264
  r += padR(biz.street, 50);               // 1019: cols 265–314
  r += padR(biz.house, 10);                // 1020: cols 315–324
  r += padR(biz.city, 30);                 // 1021: cols 325–354
  r += padR(biz.zip, 8);                   // 1022: cols 355–362
  r += String(now.getFullYear());           // 1023: cols 363–366
  r += `${now.getFullYear()}0101`;          // 1024: cols 367–374
  r += fmtDate(now);                        // 1025: cols 375–382
  r += fmtDate(now);                        // 1026: cols 383–390
  r += fmtTime(now);                        // 1027: cols 391–394
  r += '0';                                 // 1028: col 395  (0=Hebrew)
  r += '1';                                 // 1029: col 396  (1=ISO-8859-8-i)
  r += padR('zip', 20);                     // 1030: cols 397–416
  // 1031: cancelled
  r += 'ILS';                               // 1032: cols 417–419
  // 1033: cancelled
  r += '0';                                 // 1034: col 420
  r += padR('', 46);                        // 1035: cols 421–466
  return padR(r, 466); // 466 chars
}

// ─── Zip helper ──────────────────────────────────────────────────────────────

async function writeZip(bkmvPath, zipPath) {
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    out.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(out);
    archive.file(bkmvPath, { name: 'BKMVDATA.TXT' });
    archive.finalize();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const vat = arg('vat', '123456782').replace(/\D/g, '').slice(0, 9);
  const year2 = String(new Date().getFullYear()).slice(-2);
  const stamp = (() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  })();
  const baseOut = arg('out', path.join(process.cwd(), 'mock-openformat-output'));
  const targetDir = path.join(baseOut, 'OPENFRMT', `${vat.slice(0, 8)}.${year2}`, stamp);
  fs.mkdirSync(targetDir, { recursive: true });

  const uid = makeUniqueId();
  const biz = { name: 'My Company Ltd', street: 'Main Street', house: '123', city: 'Tel Aviv', zip: '12345' };

  const VAT_RATE = 0.18;
  const DOC_TYPE = '320'; // חשבונית מס/קבלה — needs both D110 (items) + D120 (payment)

  const catalog = [
    { sku: 'ELC-EAR-BLU', name: 'Bluetooth Earbuds',  price: 49.90 },
    { sku: 'FRH-SAL-CSR', name: 'Caesar Salad',       price: 42.00 },
    { sku: 'BEV-COF-LG',  name: 'Coffee - Large',     price: 18.00 },
    { sku: 'BEV-COF-MD',  name: 'Coffee - Medium',    price: 14.00 },
    { sku: 'BEV-TEA-GR',  name: 'Green Tea',          price: 12.00 },
    { sku: 'FRH-BRD-WH',  name: 'White Bread',        price:  9.90 },
    { sku: 'FRH-MLK-1L',  name: 'Milk 1L',            price:  6.90 },
    { sku: 'ELC-CHG-USB',  name: 'USB Charger',       price: 35.00 },
    { sku: 'ELC-CBL-LTN',  name: 'Lightning Cable',   price: 29.90 },
    { sku: 'FRH-EGG-12',  name: 'Eggs 12-pack',       price: 15.90 },
    { sku: 'BEV-JCE-ORG',  name: 'Orange Juice',      price: 11.90 },
    { sku: 'FRH-BTR-200',  name: 'Butter 200g',       price:  8.50 },
    { sku: 'FRH-YGT-VAN',  name: 'Vanilla Yogurt',    price:  5.90 },
    { sku: 'ELC-PWR-BNK',  name: 'Power Bank 10000',  price: 89.90 },
    { sku: 'BEV-WTR-1.5',  name: 'Water 1.5L',        price:  4.90 },
    { sku: 'FRH-APL-1KG',  name: 'Apples 1kg',        price: 12.90 },
    { sku: 'FRH-BNN-1KG',  name: 'Bananas 1kg',       price:  7.90 },
    { sku: 'ELC-EAR-WRD',  name: 'Wired Earphones',   price: 19.90 },
    { sku: 'BEV-SOD-CAN',  name: 'Soda Can',          price:  6.00 },
    { sku: 'FRH-CHZ-250',  name: 'Cheese 250g',       price: 22.90 },
  ];

  const TX_COUNT = 500;
  const baseDate = new Date('2026-01-01T08:00:00');
  const txs = [];
  for (let i = 0; i < TX_COUNT; i++) {
    const txDate = new Date(baseDate.getTime() + i * 3600000 * 1.5);
    const item1 = catalog[i % catalog.length];
    const item2 = catalog[(i + 7) % catalog.length];
    const net1 = +(item1.price / (1 + VAT_RATE)).toFixed(2);
    const net2 = +(item2.price / (1 + VAT_RATE)).toFixed(2);
    const subtotal = +(net1 + net2).toFixed(2);
    const tax = +((item1.price + item2.price) - subtotal).toFixed(2);
    const total = +(item1.price + item2.price).toFixed(2);
    txs.push({
      docNo: `INV${String(txDate.getFullYear()).slice(-2)}${padL(String(txDate.getMonth() + 1), 2)}${padL(String(txDate.getDate()), 2)}${padL(String(i + 1), 6)}`,
      docType: DOC_TYPE,
      docDate: txDate,
      subtotal, tax, total,
      beforeDiscount: subtotal, discount: 0, wht: 0,
      link: padL(String(i + 1), 7),
      lines: [
        { lineNo: 1, sku: item1.sku, name: item1.name, qty: 1, unitNet: net1, discount: 0, lineNet: net1 },
        { lineNo: 2, sku: item2.sku, name: item2.name, qty: 1, unitNet: net2, discount: 0, lineNet: net2 },
      ],
    });
  }

  const products = catalog.map((c) => ({ sku: c.sku, name: c.name }));

  const bkmv = [];
  const counts = { A100: 0, B110: 0, C100: 0, D110: 0, D120: 0, M100: 0, Z900: 0 };
  let rec = 1;

  bkmv.push(buildA100(vat, uid, rec)); counts.A100++; rec++;
  bkmv.push(buildB110(vat, rec, biz, txs.reduce((s, t) => s + t.total, 0))); counts.B110++; rec++;

  for (const tx of txs) {
    bkmv.push(buildC100(tx, vat, rec)); counts.C100++; rec++;
    for (const line of tx.lines) {
      bkmv.push(buildD110(tx, line, vat, rec)); counts.D110++; rec++;
    }
    bkmv.push(buildD120(tx, vat, rec)); counts.D120++; rec++;
  }

  for (const p of products) {
    bkmv.push(buildM100(vat, rec, p)); counts.M100++; rec++;
  }

  const totalRecords = rec;
  bkmv.push(buildZ900(vat, uid, totalRecords, rec)); counts.Z900++;

  const outPath = path.join(baseOut, 'OPENFRMT', `${vat.slice(0, 8)}.${year2}`);
  const iniLines = [buildA000(vat, uid, totalRecords, biz, outPath)];
  for (const [type, count] of Object.entries(counts)) {
    if (count > 0) iniLines.push(type + padL(count, 15));
  }

  const bkmvPath = path.join(targetDir, 'BKMVDATA.TXT');
  const iniPath = path.join(targetDir, 'INI.TXT');
  fs.writeFileSync(bkmvPath, iconv.encode(bkmv.join('\r\n') + '\r\n', 'iso88598'));
  fs.writeFileSync(iniPath, iconv.encode(iniLines.join('\r\n') + '\r\n', 'iso88598'));
  await writeZip(bkmvPath, path.join(targetDir, 'BKMVDATA.zip'));

  // Verify record lengths
  for (const [i, line] of bkmv.entries()) {
    const code = line.slice(0, 4);
    const expected = { A100: 95, B110: 376, C100: 444, D110: 339, D120: 222, M100: 298, Z900: 110 }[code];
    if (expected && line.length !== expected) {
      console.error(`ERROR: Line ${i + 1} ${code} is ${line.length} chars, expected ${expected}`);
    }
  }

  console.log(`Mock files generated: ${targetDir}`);
  console.log('Counts:', counts);
}

main().catch((err) => { console.error(err); process.exit(1); });
