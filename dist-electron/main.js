"use strict";
const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const iconv = require("iconv-lite");
const __dirname$1 = path.dirname(__filename);
process.env.DIST = path.join(__dirname$1, "../dist");
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, "../public");
let win;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"] || process.env["VITE_DEV_SERVER_HOST"] || "http://localhost:5173";
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1e3,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: "default",
    show: false
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (process.env.IS_DEV === "true" || !app.isPackaged) {
    console.log("Development mode detected");
    console.log("VITE_DEV_SERVER_URL:", VITE_DEV_SERVER_URL);
    console.log("IS_DEV:", process.env.IS_DEV);
    console.log("app.isPackaged:", app.isPackaged);
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    console.log("Production mode - loading from file");
    win.loadFile(path.join(process.env.DIST, "index.html"));
  }
  win.once("ready-to-show", () => {
    win == null ? void 0 : win.show();
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  createWindow();
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "New Sale",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            win == null ? void 0 : win.webContents.send("menu-new-sale");
          }
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
});
ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});
ipcMain.handle("show-message-box", async (event, options) => {
  const { dialog: dialog2 } = require("electron");
  const result = await dialog2.showMessageBox(win, options);
  return result;
});
ipcMain.handle("get-printers", async () => {
  try {
    const printers = win.webContents.getPrintersAsync ? await win.webContents.getPrintersAsync() : win.webContents.getPrinters();
    console.log("Available printers:", printers.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault })));
    return printers;
  } catch (error) {
    console.error("Error getting printers:", error);
    return [];
  }
});
ipcMain.handle("show-print-preview", async (event, printerName) => {
  try {
    const testContent = `
      <html>
        <head>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
              text-align: center;
            }
            .test-content {
              border: 2px solid #333;
              padding: 20px;
              margin: 20px auto;
              max-width: 300px;
            }
          </style>
        </head>
        <body>
          <div class="test-content">
            <h2>Print Preview</h2>
            <p><strong>Hello World!</strong></p>
            <p>Printer: ${printerName || "Default"}</p>
            <p>Date: ${(/* @__PURE__ */ new Date()).toLocaleString()}</p>
            <p>POS Desktop Application</p>
            <p>This is what will be printed</p>
          </div>
        </body>
      </html>
    `;
    const previewWindow = new BrowserWindow({
      width: 400,
      height: 500,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testContent)}`);
    return { success: true };
  } catch (error) {
    console.error("Error showing preview:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("print-test", async (event, printerName) => {
  try {
    console.log("Print test requested for printer:", printerName);
    const testContent = `
      <html>
        <head>
          <style>
            @media print {
              body { 
                font-family: Arial, sans-serif; 
                padding: 10px; 
                margin: 0;
                font-size: 12pt;
              }
              .test-content {
                border: 2px solid #000;
                padding: 15px;
                margin: 0;
                text-align: center;
              }
              h2 { margin-top: 0; }
            }
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
              text-align: center;
            }
            .test-content {
              border: 2px solid #333;
              padding: 20px;
              margin: 20px auto;
              max-width: 300px;
            }
          </style>
        </head>
        <body>
          <div class="test-content">
            <h2>Test Print</h2>
            <p><strong>Hello World!</strong></p>
            <p>Printer: ${printerName || "Default"}</p>
            <p>Date: ${(/* @__PURE__ */ new Date()).toLocaleString()}</p>
            <p>POS Desktop Application</p>
            <p>Test successful!</p>
          </div>
        </body>
      </html>
    `;
    const printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    console.log("Loading content into print window...");
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testContent)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const printOptions = {
      silent: true,
      // Changed to true to avoid print dialog
      printBackground: true,
      color: false,
      margin: {
        marginType: "minimum"
      },
      landscape: false,
      pagesPerSheet: 1,
      collate: false,
      copies: 1
    };
    if (printerName && printerName !== "default") {
      printOptions.deviceName = printerName;
      console.log("Using specific printer:", printerName);
    } else {
      console.log("Using default printer");
    }
    console.log("Sending to printer with options:", printOptions);
    return new Promise((resolve) => {
      printWindow.webContents.print(printOptions, (success, failureReason) => {
        console.log("Print result - Success:", success, "Reason:", failureReason);
        printWindow.close();
        if (success) {
          resolve({ success: true, printed: true });
        } else {
          resolve({ success: false, error: failureReason || "Print failed" });
        }
      });
    });
  } catch (error) {
    console.error("Error printing:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("get-available-drives", async () => {
  try {
    const drives = [];
    if (process.platform === "win32") {
      const { execSync } = require("child_process");
      try {
        const output = execSync("wmic logicaldisk get name", { encoding: "utf-8" });
        const lines = output.split("\n").filter((line) => line.trim() && line.trim() !== "Name");
        drives.push(...lines.map((line) => line.trim()).filter(Boolean));
      } catch (error) {
        console.error("Error getting Windows drives:", error);
        drives.push("C:", "D:", "E:", "F:");
      }
    } else {
      drives.push("/");
    }
    return drives.length > 0 ? drives : ["C:"];
  } catch (error) {
    console.error("Error getting drives:", error);
    return ["C:"];
  }
});
ipcMain.handle("select-export-directory", async () => {
  try {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Select Export Directory"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  } catch (error) {
    console.error("Error selecting directory:", error);
    return null;
  }
});
ipcMain.handle("generate-tax-report", async (event, options) => {
  try {
    const { transactions, businessInfo, softwareInfo, taxReportConfig, dateRange, drive, useCustomPath } = options;
    const vat8 = businessInfo.vatNumber.substring(0, 8).padStart(8, "0");
    const year = "year" in dateRange ? String(dateRange.year).slice(-2) : String(dateRange.start.getFullYear()).slice(-2);
    const now = /* @__PURE__ */ new Date();
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const DD = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const baseDir = useCustomPath ? path.join(drive, "OPENFRMT") : path.join(drive, "OPENFRMT");
    const businessDir = path.join(baseDir, `${vat8}.${year}`);
    const timestampDir = path.join(businessDir, `${MM}${DD}${hh}${mm}`);
    let finalDir = timestampDir;
    let counter = 0;
    while (fs.existsSync(finalDir) && counter < 60) {
      const newMinute = (parseInt(mm) + counter + 1) % 60;
      const newMinuteStr = String(newMinute).padStart(2, "0");
      finalDir = path.join(businessDir, `${MM}${DD}${hh}${newMinuteStr}`);
      counter++;
    }
    fs.mkdirSync(finalDir, { recursive: true });
    const generateUniqueId = () => {
      const timestamp = Date.now().toString();
      const random = Math.floor(Math.random() * 1e3).toString();
      return (timestamp + random).slice(-15).padStart(15, "0");
    };
    const uniqueId = generateUniqueId();
    const padRight = (str, len, pad = " ") => {
      return (str || "").padEnd(len, pad).substring(0, len);
    };
    const padLeft = (str, len, pad = "0") => {
      return (str || "").padStart(len, pad).substring(0, len);
    };
    const formatAmount = (value, len = 15) => {
      const absValue = Math.abs(value);
      const integerPart = Math.floor(absValue);
      const decimalPart = Math.round((absValue - integerPart) * 100);
      const integerStr = padLeft(integerPart.toString(), 12, "0");
      const decimalStr = padLeft(decimalPart.toString(), 2, "0");
      const sign = value < 0 ? "-" : "+";
      return integerStr + decimalStr + sign;
    };
    const formatDate = (date) => {
      const year2 = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year2}${month}${day}`;
    };
    const formatTime = (date) => {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${hours}${minutes}`;
    };
    const bkmvLines = [];
    let recordNumber = 1;
    const recordCounts = {
      A100: 0,
      C100: 0,
      D110: 0,
      D120: 0,
      Z900: 0
    };
    let a100 = "A100";
    a100 += padLeft(recordNumber.toString(), 9, "0");
    a100 += padLeft(businessInfo.vatNumber, 9, "0");
    a100 += padLeft(uniqueId, 15, "0");
    a100 += "&OF1.31&";
    a100 += padRight("", 50);
    bkmvLines.push(a100);
    recordCounts.A100 = 1;
    recordNumber++;
    for (const transaction of transactions) {
      let c100 = "C100";
      c100 += padLeft(recordNumber.toString(), 9, "0");
      c100 += padLeft(businessInfo.vatNumber, 9, "0");
      c100 += padRight("", 9);
      c100 += padLeft(transaction.documentType.toString(), 3, "0");
      c100 += padRight(transaction.transactionNumber, 20);
      c100 += formatDate(transaction.documentProductionDate);
      c100 += padRight("", 250);
      c100 += transaction.documentDiscount ? formatAmount(-Math.abs(transaction.documentDiscount), 15) : padRight("", 15);
      c100 += padRight("", 45);
      c100 += transaction.whtDeduction ? formatAmount(Math.abs(transaction.whtDeduction), 12) : padRight("", 12);
      c100 += padRight("", 26);
      c100 += formatDate(transaction.createdAt);
      c100 += transaction.branchId ? padRight(transaction.branchId, 7) : padRight("", 7);
      c100 += padRight("", 444 - c100.length);
      bkmvLines.push(c100);
      recordCounts.C100++;
      recordNumber++;
      let lineNum = 1;
      for (const item of transaction.cart.items) {
        let d110 = "D110";
        d110 += padLeft(recordNumber.toString(), 9, "0");
        d110 += padLeft(businessInfo.vatNumber, 9, "0");
        d110 += padRight("", 9);
        d110 += padLeft(transaction.documentType.toString(), 3, "0");
        d110 += padRight(transaction.transactionNumber, 20);
        d110 += padLeft(lineNum.toString(), 4, "0");
        d110 += padRight("", 3);
        d110 += padRight("", 20);
        d110 += String(item.transactionType || 2);
        d110 += padRight(item.product.sku || "", 20);
        d110 += padRight(item.product.name, 30);
        d110 += padRight("", 50);
        d110 += padRight("", 30);
        d110 += padRight("", 20);
        const qtyInteger = Math.floor(item.quantity);
        const qtyDecimal = Math.round((item.quantity - qtyInteger) * 1e4);
        d110 += padLeft(qtyInteger.toString(), 12, "0") + padLeft(qtyDecimal.toString(), 4, "0") + "+";
        d110 += formatAmount(item.unitPrice, 15);
        d110 += item.lineDiscount ? formatAmount(-Math.abs(item.lineDiscount), 15) : padRight("", 15);
        d110 += formatAmount(item.totalPrice, 15);
        const vatPercent = item.product.taxRate ? Math.round(item.product.taxRate * 100) : 0;
        d110 += padLeft(vatPercent.toString(), 2, "0");
        d110 += transaction.branchId ? padRight(transaction.branchId, 7) : padRight("", 7);
        d110 += formatDate(transaction.createdAt);
        d110 += padRight("", 339 - d110.length);
        bkmvLines.push(d110);
        recordCounts.D110++;
        recordNumber++;
        lineNum++;
      }
      const paymentTypeMap = {
        "cash": 1,
        "check": 2,
        "card": 3,
        "digital": 4,
        "gift_card": 9
      };
      const paymentType = paymentTypeMap[transaction.paymentDetails.method.type] || 9;
      let d120 = "D120";
      d120 += padLeft(recordNumber.toString(), 9, "0");
      d120 += padLeft(businessInfo.vatNumber, 9, "0");
      d120 += padRight("", 9);
      d120 += padLeft(transaction.documentType.toString(), 3, "0");
      d120 += padRight(transaction.transactionNumber, 20);
      d120 += padLeft("1", 4, "0");
      d120 += String(paymentType);
      d120 += transaction.paymentDetails.method.type === "check" && transaction.paymentDetails.bankNumber ? padLeft(transaction.paymentDetails.bankNumber, 10, "0") : padRight("", 10);
      d120 += padRight("", 10);
      d120 += padRight("", 15);
      d120 += padRight("", 10);
      d120 += padRight("", 8);
      d120 += formatAmount(transaction.paymentDetails.amount, 15);
      d120 += padRight("", 1);
      d120 += padRight("", 20);
      d120 += transaction.paymentDetails.method.type === "card" && transaction.paymentDetails.creditTransactionType ? String(transaction.paymentDetails.creditTransactionType) : padRight("", 1);
      d120 += transaction.branchId ? padRight(transaction.branchId, 7) : padRight("", 7);
      d120 += formatDate(transaction.createdAt);
      d120 += padRight("", 7);
      d120 += padRight("", 222 - d120.length);
      bkmvLines.push(d120);
      recordCounts.D120++;
      recordNumber++;
    }
    const totalRecords = recordNumber;
    let z900 = "Z900";
    z900 += padLeft(recordNumber.toString(), 9, "0");
    z900 += padLeft(businessInfo.vatNumber, 9, "0");
    z900 += padLeft(uniqueId, 15, "0");
    z900 += "&OF1.31&";
    z900 += padLeft(totalRecords.toString(), 15, "0");
    z900 += padRight("", 50);
    bkmvLines.push(z900);
    recordCounts.Z900 = 1;
    const bkmvPath = path.join(finalDir, "BKMVDATA.TXT");
    const bkmvContent = bkmvLines.join("\r\n") + "\r\n";
    const bkmvBuffer = iconv.encode(bkmvContent, "iso88598");
    fs.writeFileSync(bkmvPath, bkmvBuffer);
    const zipPath = path.join(finalDir, "BKMVDATA.zip");
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", () => resolve(void 0));
      archive.on("error", reject);
      archive.pipe(output);
      archive.file(bkmvPath, { name: "BKMVDATA.TXT" });
      archive.finalize();
    });
    const processDate = /* @__PURE__ */ new Date();
    const iniLines = [];
    let a000 = "A000";
    a000 += padRight("", 5);
    a000 += padLeft(totalRecords.toString(), 15, "0");
    a000 += padLeft(businessInfo.vatNumber, 9, "0");
    a000 += padLeft(uniqueId, 15, "0");
    a000 += padRight(taxReportConfig.systemCode, 8);
    a000 += padLeft(softwareInfo.registrationNumber, 8, "0");
    a000 += padRight(softwareInfo.name, 20);
    a000 += padRight(softwareInfo.version, 20);
    a000 += padLeft(softwareInfo.manufacturerId, 9, "0");
    a000 += padRight(softwareInfo.manufacturerName, 20);
    a000 += softwareInfo.softwareType === "single-year" ? "1" : "2";
    a000 += padRight(path.join(businessDir, path.basename(finalDir)), 50);
    a000 += taxReportConfig.accountingType;
    a000 += taxReportConfig.balancingRequired ? "1" : "0";
    a000 += padLeft(businessInfo.vatNumber, 9, "0");
    a000 += padLeft(businessInfo.companyRegNumber || "000000001", 9, "0");
    a000 += padRight(businessInfo.companyName, 50);
    a000 += padRight(businessInfo.companyAddress, 50);
    a000 += padRight(businessInfo.companyAddressNumber, 10);
    a000 += padRight(businessInfo.companyCity, 30);
    a000 += padRight(businessInfo.companyZip, 8);
    if ("year" in dateRange) {
      a000 += String(dateRange.year);
      a000 += String(dateRange.year) + "0101";
      a000 += String(dateRange.year) + "1231";
    } else {
      a000 += String(dateRange.start.getFullYear());
      a000 += formatDate(dateRange.start);
      a000 += formatDate(dateRange.end);
    }
    a000 += formatDate(processDate);
    a000 += formatTime(processDate);
    a000 += taxReportConfig.languageCode;
    a000 += taxReportConfig.charset;
    a000 += padRight(taxReportConfig.compressionSoftware, 20);
    a000 += taxReportConfig.defaultCurrency;
    a000 += businessInfo.hasBranches ? "1" : "0";
    a000 += padRight("", 466 - a000.length);
    iniLines.push(a000);
    for (const [recordType, count] of Object.entries(recordCounts)) {
      if (count > 0) {
        iniLines.push(recordType + padLeft(count.toString(), 15, "0"));
      }
    }
    const iniPath = path.join(finalDir, "INI.TXT");
    const iniContent = iniLines.join("\r\n") + "\r\n";
    const iniBuffer = iconv.encode(iniContent, "iso88598");
    fs.writeFileSync(iniPath, iniBuffer);
    return {
      success: true,
      filePath: finalDir,
      recordCounts
    };
  } catch (error) {
    console.error("Error generating tax report:", error);
    return {
      success: false,
      error: error.message || "Failed to generate tax report"
    };
  }
});
ipcMain.handle("print-report-summary", async (event, summary) => {
  try {
    const summaryContent = `
      <html>
        <head>
          <style>
            @media print {
              body { 
                font-family: Arial, sans-serif; 
                padding: 20px; 
                margin: 0;
                font-size: 12pt;
              }
            }
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
            }
            h1 { margin-top: 0; }
            .summary-item { margin: 10px 0; }
            .record-counts { margin-left: 20px; }
          </style>
        </head>
        <body>
          <h1>Tax Report Summary</h1>
          <div class="summary-item">
            <strong>Status:</strong> ${summary.success ? "Success" : "Failed"}
          </div>
          ${summary.filePath ? `<div class="summary-item"><strong>File Path:</strong> ${summary.filePath}</div>` : ""}
          ${summary.recordCounts ? `
            <div class="summary-item">
              <strong>Record Counts:</strong>
              <ul class="record-counts">
                ${Object.entries(summary.recordCounts).map(([type, count]) => `<li>${type}: ${count}</li>`).join("")}
              </ul>
            </div>
          ` : ""}
          <div class="summary-item">
            <strong>Generated:</strong> ${(/* @__PURE__ */ new Date()).toLocaleString()}
          </div>
        </body>
      </html>
    `;
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(summaryContent)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return new Promise((resolve) => {
      printWindow.webContents.print({ silent: true }, (success) => {
        printWindow.close();
        resolve({ success, printed: success });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});
