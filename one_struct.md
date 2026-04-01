This specification outlines the technical requirements for generating the **INI.TXT** and **BKMVDATA.TXT** files according to the Israel Tax Authority **"OPEN FORMAT" (ממשק פתוח)** standard.

# Technical Specification: Israel Tax Authority OPEN FORMAT

## 1. File Structure and Location
The software must generate two primary files for every data extraction:
*   **INI.TXT:** An **uncompressed** central header file containing business data and record summaries.
*   **BKMVDATA.TXT:** A **compressed** transactional data file containing all business movements.

### Directory Pathing
Files must be saved in the following mandatory structure on the user-selected drive:
`[Drive]:\OPENFRMT\[Dealer_ID_8_Digits].[Year_2_Digits]\[MMDDhhmm]\`
*   **Example:** `F:\OPENFRMT\00223344.08\09111025`.
*   If two extractions occur in the same minute, the second must use the next minute for a unique path.

## 2. Core Technical Formatting Rules
All records are **fixed-length text records** and must adhere to these "gears" of the mechanism:

| Data Type | Rule | Format Code |
| :--- | :--- | :--- |
| **Numeric** | **Right-justified** with **leading zeros**. Digits only. | `9(n)` |
| **Alphanumeric** | **Left-justified** with **trailing spaces**. | `X(n)` |
| **Decimal** | No physical decimal point in file. `V` indicates implied position. | `9(n)V99` |
| **Dates** | 8 characters: `YYYYMMDD`. | `9(8)` |
| **Times** | 4 characters: `hhmm` (24-hour format). | `9(4)` |
| **Sign** | Discounts must be **negative (-)**. Withholding tax must be **positive (+)**. | `X9(n)` |
| **Termination** | Every record must end with **CR (ASCII 13)** and **LF (ASCII 10)**. These 2 characters are **not** part of the defined record length. | `CR+LF` |

### Character Set
*   **Windows:** ISO-8859-8-i (Logical Hebrew).
*   **DOS:** CP-862.

## 3. INI.TXT Layout
The `INI.TXT` file consists of one `A000` header and multiple `1050` summary records.

### A000 Record (Header)
**Length: 466 characters**.
*   **1003:** Authorized Dealer Number (9 digits).
*   **1004:** **Unique 15-digit random numeric ID** generated for this extraction.
*   **1005:** System Constant: **`&OF1.31&`**.
*   **1006:** Software Registration Number.
*   **1011:** Software Type (1=Single-year, 2=Multi-year).
*   **1013:** Bookkeeping Type (1=Single-entry, 2=Double-entry).
*   **1026/1027:** Extraction Start Date and Time.
*   **1029:** Character Set Code (1=ISO, 2=CP-862).
*   **1034:** Branch Flag (1=Has branches, 0=No branches).

### 1050 Record (Summary)
**Length: 19 characters**.
One record must exist for **every type** of record present in `BKMVDATA.TXT`.
*   **1050:** Record Code (e.g., "C100").
*   **1051:** Total count of that record type in `BKMVDATA.TXT`.

## 4. BKMVDATA.TXT Layout
This file follows a strict sequence: `A100` -> Transactional Records -> `Z900`.

### A100 (Opening Record)
**Length: 95 characters**.
Must include the same **15-digit random ID** from Field 1004 and the constant `&OF1.31&`.

### C100 (Document Header)
**Length: 444 characters**.
*   **1203:** Document Type (e.g., 305=Tax Invoice, 330=Credit, 400=Receipt).
*   **1204:** Document Number.
*   **1205:** System-generated production date.
*   **1228:** Cancellation Flag (1=Cancelled).
*   **1230:** Document Date.
*   **1234:** **Linking Field:** Internal ID used to link this header to its detail lines.

### D110 (Document Details/Lines)
**Length: 339 characters**.
*   **1258:** Transaction Type (1=Service, 2=Sale, 3=Both).
*   **1264:** Quantity.
*   **1267:** Total Line Amount.
*   **1273:** **Linking Field:** Must match the `1234` field in the corresponding `C100`.

### D120 (Receipt/Payment Details)
**Length: 222 characters**.
*   **1306:** Payment Type (1=Cash, 2=Check, 3=Credit Card, etc.).
*   **1312:** Amount of this specific payment line.
*   **1323:** **Linking Field:** Must match the `1234` field in the corresponding `C100`.

### Z900 (Closing Record)
**Length: 110 characters**.
*   **1153:** Same **15-digit random ID**.
*   **1155:** Total count of **all** records in the file, including `A100` and `Z900`.

## 5. Post-Extraction Requirements
*   **Compression:** `BKMVDATA.TXT` must be compressed into an archive named **BKMVDATA** (e.g., .zip, .rar).
*   **Printed Output:** The system must produce a printed summary confirming success, the save path, date range, and a tally of all record types produced.