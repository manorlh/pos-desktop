import * as fs from "fs";
import * as iconv from "iconv-lite";
import * as path from "path";

// padding helpers
function padRight(str: string, length: number, padChar = " "): string {
  return str.padEnd(length, padChar).substring(0, length);
}
function padLeft(str: string, length: number, padChar = "0"): string {
  return str.padStart(length, padChar).substring(0, length);
}

// --- INI.TXT ---
function generateINI(totalRecords: number): string[] {
  const businessVat = "123456789";
  const uniqueId = "000000000000123"; // must be unique each run
  const softwareLicense = "51436457";

  const lines: string[] = [];

  // A000 record - according to specifications (466 characters)
  let a000 =
    "A000" + // Record Code (4)
    padRight("", 5) + // Reserved (5)
    padLeft(totalRecords.toString(), 15, "0") + // Total Records (15)
    padLeft(businessVat, 9, "0") + // Business VAT (9)
    padLeft(uniqueId, 15, "0") + // Unique Identifier (15)
    "&OF1.31&" + // System Code (8)
    padLeft(softwareLicense, 8, "0") + // Software Registration Number (8)
    padRight("POS System", 20) + // Software Name (20)
    padRight("1.0.0", 20) + // Software Version (20)
    padLeft("987654321", 9, "0") + // Developer VAT (9)
    padRight("Developer Name", 20) + // Developer Name (20)
    "1" + // Software Type (1) - Single-year
    padRight("./output/", 50) + // Output Path (50)
    "1" + // Accounting Type (1) - Single
    "1" + // Balancing Required (1) - Transaction
    padLeft(businessVat, 9, "0") + // Company ID (9)
    padLeft("000000001", 9, "0") + // Deduction File Number (9)
    padRight("My Company Ltd", 50) + // Business Name (50)
    padRight("Main Street", 50) + // Address - Street (50)
    padRight("123", 10) + // Address - House No. (10)
    padRight("Tel Aviv", 30) + // Address - City (30)
    padRight("12345", 8) + // Address - ZIP (8)
    "2025" + // Fiscal Year (4)
    "20250101" + // Date Range Start (8)
    "20251231" + // Date Range End (8)
    "20250914" + // Process Start Date (8)
    "1648" + // Process Start Time (4)
    "0" + // Language Code (1) - Hebrew
    "1" + // Charset (1) - ISO-8859-8-i
    padRight("WinZip", 20) + // Compression Software (20)
    "ILS" + // Default Currency (3)
    "0" + // Has Branches (1) - No
    padRight("", 466 - 412); // Fill to exactly 466 characters
  lines.push(a000);

  // summary counts - based on actual records generated
  lines.push("A100" + padLeft("1", 15, "0"));  // 1 A100 record
  lines.push("B110" + padLeft("1", 15, "0"));  // 1 B110 record
  lines.push("C100" + padLeft("50", 15, "0")); // 50 C100 records
  lines.push("Z900" + padLeft("1", 15, "0"));  // 1 Z900 record

  return lines;
}

// --- BKMVDATA.TXT ---
let recordCounter = 0;
function nextRecNum(): string {
  recordCounter++;
  return padLeft(recordCounter.toString(), 9, "0");
}

function generateBKMV(): string[] {
  const lines: string[] = [];

  // A100 (header) - according to specifications
  const businessVat = "123456789";
  const uniqueId = "000000000000123"; // must match INI.1004
  
  let a100 = 
    "A100" + // Record Code (4)
    nextRecNum() + // Record Serial (9)
    padLeft(businessVat, 9, "0") + // VAT (9)
    padLeft(uniqueId, 15, "0") + // Unique ID (15)
    "&OF1.31&" + // System Code (8)
    padRight("", 50); // Future Use (50)
  lines.push(a100);

  // B110 record - based on valid file
  let b110 = 
    "B110" + 
    nextRecNum() + 
    "         " + // 9 spaces
    "99999999" + // field 1
    "       " + // 7 spaces
    "99999999" + // field 2
    "                                          " + // 42 spaces
    "~9~" + // field 3
    "            " + // 12 spaces
    "~9~" + // field 4
    "                                                                                                                                                                            " + // 108 spaces
    "+00000000000000" + // field 5
    "+00000011292110" + // field 6
    "+0000000000000000000000000001" + // field 7
    "      " + // 6 spaces
    "+00000000000000" + // field 8
    "                   "; // 19 spaces
  lines.push(b110);

  // Generate multiple C100 records to better match the expected format
  // Based on the valid file, we need many more records
  const recordTypes = [
    { type: "30500111000001000000", desc: "INV" },
    { type: "30500109000001000000", desc: "INV" },
    { type: "40000111000001000000", desc: "INP" },
    { type: "40000109000001000000", desc: "INP" },
    { type: "30500108000001000000", desc: "INV" },
    { type: "30500115000001000000", desc: "INV" },
    { type: "30500112000001000000", desc: "INV" },
    { type: "40000108000001000000", desc: "INP" },
    { type: "40000115000001000000", desc: "INP" },
    { type: "40000112000001000000", desc: "INP" },
    { type: "40000113000001000000", desc: "INP" },
    { type: "40000114000001000000", desc: "INP" },
    { type: "40000110000001000000", desc: "INP" },
    { type: "33000108000001000000", desc: "REP" }
  ];

  // Generate 50 C100 records to better match the expected format
  for (let i = 0; i < 50; i++) {
    const recordType = recordTypes[i % recordTypes.length];
    const amount = Math.floor(Math.random() * 100000) + 1000; // Random amount between 10.00 and 1000.00 ILS
    const vat = Math.floor(amount * 0.17); // 17% VAT
    const gross = amount + vat;
    
    let c100 = 
      "C100" + 
      nextRecNum() + 
      "         " + // 9 spaces
      recordType.type + // field 1
      "   " + // 3 spaces
      "20250912181899999999" + // field 2
      "                                                                                                                                                                                            " + // 108 spaces
      "00000000020250913" + // field 3
      "+00000000000000" + // field 4
      "   " + // 3 spaces
      "+" + padLeft(amount.toString(), 15, "0") + // field 5
      "+00000000000000" + // field 6
      "+" + padLeft(amount.toString(), 15, "0") + // field 7
      "+" + padLeft(vat.toString(), 15, "0") + // field 8
      "+" + padLeft(gross.toString(), 15, "0") + // field 9
      "+0000000000099999999" + // field 10
      "                 " + // 17 spaces
      "0202509131" + // field 11
      "      " + // 6 spaces
      "1" + // field 12
      "        " + // 8 spaces
      padLeft((i + 1).toString(), 7, "0") + // field 13
      "             "; // 13 spaces
    lines.push(c100);
  }

  // Z900 (closing record) - according to specifications
  let z900 = 
    "Z900" + // Record Code (4)
    nextRecNum() + // Record Serial (9)
    padLeft(businessVat, 9, "0") + // VAT (9)
    padLeft(uniqueId, 15, "0") + // Unique ID (15)
    "&OF1.31&" + // System Code (8)
    padLeft(recordCounter.toString(), 15, "0") + // Total Records Count (15)
    padRight("", 50); // Future Use (50)
  lines.push(z900);

  return lines;
}

// write ISO 8859-8-i file
function writeFileISO8859(filePath: string, lines: string[]): void {
  const content = lines.join("\r\n") + "\r\n";
  const buffer = iconv.encode(content, "iso88598");
  fs.writeFileSync(filePath, buffer);
}

// main
function main() {
  const outDir = path.join(__dirname, "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  recordCounter = 0;
  const bkmv = generateBKMV();
  const ini = generateINI(bkmv.length);

  writeFileISO8859(path.join(outDir, "INI.TXT"), ini);
  writeFileISO8859(path.join(outDir, "BKMVDATA.TXT"), bkmv);

  console.log("Generated INI.TXT and BKMVDATA.TXT in", outDir);
}
main();
