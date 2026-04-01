# Israel Tax Authority OPEN FORMAT (ממשק פתוח) — Rules for LLMs

This file documents the rules and lessons learned for generating valid OPEN FORMAT files
per the Israel Tax Authority specification (horaot_131 v1.31). These files are validated
by the authority's simulator and must pass without errors.

## Reference Files

- **Spec PDF**: `horaot_131 (1).pdf` in the project root — the single source of truth.
- **Golden mock**: `scripts/mock-openformat.js` — standalone Node script that generates
  valid OPEN FORMAT files with mock data. Passed the simulator. Use as reference for
  field positions, formatting, and column alignment.
- **App generator**: `src/utils/taxReportGenerator.ts` — the production TypeScript
  generator used by the Electron app.
- **Electron IPC path**: `electron/main.ts` — contains the IPC handler that calls
  the builder functions with real DB data.

## File Structure

```
[Drive]:\OPENFRMT\[VAT8].[YY]\[MMDDhhmm]\
  INI.TXT        — header file (A000 record + record-type counts)
  BKMVDATA.TXT   — transactional data (A100, B110, C100, D110, D120, M100, Z900)
  BKMVDATA.zip   — compressed copy of BKMVDATA.TXT
```

## Encoding

- Character set: **ISO-8859-8** (logical Hebrew), encode with `iconv-lite` using `'iso88598'`.
- Line endings: `\r\n` (CRLF).
- Hebrew characters are single-byte in ISO-8859-8 — `String.padEnd()` counts correctly.

## Numeric Formatting Rules (CRITICAL)

These rules caused the most bugs. Follow exactly:

| Spec notation  | Meaning                                     | Example                        |
|----------------|---------------------------------------------|--------------------------------|
| `9(n)`         | Digits only, right-justified, leading zeros | `9(9)` → `000000001`          |
| `X9(n)vNN`     | **Sign PREFIX** (`+`/`-`) + digits, no `.`  | `X9(12)v99` = 15 chars total  |
| `X(n)`         | Alphanumeric, left-justified, trailing spaces | `X(20)` → `"Hello               "` |

### Sign-prefix formatters

```
X9(12)v99  → 15 chars: sign + 14 digits (12 integer + 2 decimal as agorot)
             Example: 56.98 → "+00000000005698"
             Example: -12.50 → "-00000000001250"

X9(9)v99   → 12 chars: sign + 11 digits

X9(12)v9999 → 17 chars: sign + 16 digits (12 integer + 4 decimal)
              Used for quantity field 1264 in D110.
```

**NEVER put the sign at the end.** The sign character is always the FIRST character.

## Record Types and Lengths

| Record | Length | Description                           |
|--------|--------|---------------------------------------|
| A000   | 466    | INI.TXT header                        |
| A100   | 95     | BKMVDATA opening record               |
| B110   | 376    | Chart of accounts                     |
| C100   | 444    | Document header                       |
| D110   | 339    | Document detail line (items)          |
| D120   | 222    | Payment/receipt detail                |
| M100   | 298    | Inventory item                        |
| Z900   | 110    | Closing record                        |

Always verify record lengths match exactly. Off-by-one errors cascade into column
misalignment for all subsequent fields.

## Document Types (field 1203/1253/1303)

| Code | Hebrew                    | English                  | Required records       |
|------|---------------------------|--------------------------|------------------------|
| 320  | חשבונית מס / קבלה         | Tax invoice / receipt    | C100 + D110 + D120     |
| 330  | חשבונית מס זיכוי          | Credit note (refund)     | C100 + D110 + D120     |
| 400  | קבלה                      | Receipt only             | C100 + D120 only       |

**POS sales MUST use type 320** (not 400) because they have both items (D110) and
payment (D120). Using 400 with D110 records causes "no matching C100 header" errors
because the validator does not associate D110 with receipt-type documents.

## C100 Field Math (CRITICAL — validator checks arithmetic)

The validator computes expected values and compares to what you provide:

```
1219 = total before document discount, EXCLUDING VAT
1220 = document discount (NEGATIVE sign, excl VAT)
1221 = 1219 + 1220    ← VALIDATOR CHECKS THIS
1222 = VAT amount
1223 = 1221 + 1222    ← VALIDATOR CHECKS THIS (total incl VAT)
```

**Common mistake**: Setting 1219 to the total INCLUDING VAT. Field 1219 must be
the net amount (excl VAT) before any document-level discount. Line-level discounts
are already reflected in D110 field 1267 and should NOT be added back.

In the app: `1219 = cart.subtotal` (which is excl VAT, after line discounts).

## D110/D120 Linking to C100

The validator matches detail records to their C100 header using these fields.
ALL must be identical between C100 and its D110/D120 records:

| C100 field | D110 field | D120 field | Description        |
|------------|------------|------------|--------------------|
| 1203       | 1253       | 1303       | Document type      |
| 1204       | 1254       | 1304       | Document number    |
| 1230       | 1272       | 1322       | Document date      |
| 1234       | 1273       | 1323       | Link ID (7 digits) |

If ANY of these don't match byte-for-byte, the validator reports
"no matching document header record found".

## Record Ordering

Each C100 must be immediately followed by its D110 and D120 records:

```
C100 (doc 1)
D110 (doc 1, line 1)
D110 (doc 1, line 2)
D120 (doc 1)
C100 (doc 2)
D110 (doc 2, line 1)
...
```

## Simulator Requirements

- **Minimum 2000 records** in BKMVDATA.TXT (including all record types).
- Must include examples of each document type present in the software.
- The simulator validates field-level formatting, arithmetic relationships,
  and structural integrity (record matching, ordering).

## VAT Rate

Israel standard VAT rate is **18%** (0.18). In D110 field 1268 (VAT rate),
format as `9(2)v99`: `1800` represents 18.00%.

The app stores the tax rate as a decimal (e.g., `0.18`) in settings.
When passing to D110 builder as `globalTaxRate`, convert to percentage: `18`.

## INI.TXT Structure

Line 1: A000 record (466 chars)
Subsequent lines: record type (4 chars) + count (15 digits, right-justified, leading zeros)

```
A000[...466 chars total...]
A100000000000000001
B110000000000000001
C100000000000000500
D110000000000001000
D120000000000000500
M100000000000000020
Z900000000000000001
```

## Debugging Tips

1. **Use Python to inspect byte positions** — don't trust string indexing alone.
   Read the file as bytes in ISO-8859-8 and slice by 0-indexed positions.
2. **Check record lengths first** — if a record is off by even 1 character,
   all subsequent fields shift and produce cascading errors.
3. **Run the mock script** (`npm run mock:openformat`) to isolate formatting
   issues from database/Electron complexity.
4. **Compare mock output byte-for-byte** against spec column positions.

## Refund Handling

- Refund transactions use document type **330** (credit note).
- D110 fields 1256/1257 should contain the original document type and number
  (base document reference).
- Field 1228 in C100 = `'1'` for cancelled documents, `'0'` otherwise.

## Common Pitfalls (ordered by frequency of occurrence)

1. Sign at END instead of BEGINNING for `X9` fields
2. Using document type 400 when D110 records are present (must use 320)
3. Field 1219 including VAT (must be excl VAT)
4. Off-by-one column alignment due to extra spacers or wrong field lengths
5. Link fields (1234/1273/1323) not matching between C100 and D110/D120
6. Mixing gross (incl VAT) and net (excl VAT) amounts in the same calculation
7. Wrong VAT rate (8% vs 18%) in D110 field 1268
