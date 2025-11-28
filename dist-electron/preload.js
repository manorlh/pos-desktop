"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  }
});
contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  showMessageBox: (options) => ipcRenderer.invoke("show-message-box", options),
  // Printer functions
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  printTest: (printerName) => ipcRenderer.invoke("print-test", printerName),
  showPrintPreview: (printerName) => ipcRenderer.invoke("show-print-preview", printerName),
  // Tax Report functions
  getAvailableDrives: () => ipcRenderer.invoke("get-available-drives"),
  selectExportDirectory: () => ipcRenderer.invoke("select-export-directory"),
  generateTaxReport: (options) => ipcRenderer.invoke("generate-tax-report", options),
  printReportSummary: (summary) => ipcRenderer.invoke("print-report-summary", summary),
  // Database functions
  getDatabasePath: () => ipcRenderer.invoke("get-database-path"),
  setDatabasePath: (path) => ipcRenderer.invoke("set-database-path", path),
  initializeDatabase: (path) => ipcRenderer.invoke("initialize-database", path),
  databaseExists: (path) => ipcRenderer.invoke("database-exists", path),
  backupDatabase: (path) => ipcRenderer.invoke("backup-database", path),
  selectDatabasePath: () => ipcRenderer.invoke("select-database-path"),
  // Database operations
  dbGetProducts: () => ipcRenderer.invoke("db-get-products"),
  dbSaveProduct: (product) => ipcRenderer.invoke("db-save-product", product),
  dbGetCategories: () => ipcRenderer.invoke("db-get-categories"),
  dbSaveCategory: (category) => ipcRenderer.invoke("db-save-category", category),
  dbGetUsers: () => ipcRenderer.invoke("db-get-users"),
  dbSaveUser: (user) => ipcRenderer.invoke("db-save-user", user),
  dbGetTodaysTransactions: () => ipcRenderer.invoke("db-get-todays-transactions"),
  dbGetTransactionsByDateRange: (startDate, endDate) => ipcRenderer.invoke("db-get-transactions-by-date-range", startDate, endDate),
  dbGetTransactionsPage: (options) => ipcRenderer.invoke("db-get-transactions-page", options),
  dbSaveTransaction: (transaction) => ipcRenderer.invoke("db-save-transaction", transaction),
  dbGetBusinessInfo: () => ipcRenderer.invoke("db-get-business-info"),
  dbSaveBusinessInfo: (info) => ipcRenderer.invoke("db-save-business-info", info),
  dbGetSoftwareInfo: () => ipcRenderer.invoke("db-get-software-info"),
  dbSaveSoftwareInfo: (info) => ipcRenderer.invoke("db-save-software-info", info),
  onMenuNewSale: (callback) => {
    ipcRenderer.on("menu-new-sale", callback);
  },
  onMainProcessMessage: (callback) => {
    ipcRenderer.on("main-process-message", (event, message) => callback(message));
  }
});
window.addEventListener("DOMContentLoaded", () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };
  for (const dependency of ["chrome", "node", "electron"]) {
    replaceText(`${dependency}-version`, process.versions[dependency] || "");
  }
});
