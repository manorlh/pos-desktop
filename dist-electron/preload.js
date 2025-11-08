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
