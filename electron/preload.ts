const { contextBridge, ipcRenderer } = require('electron');

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args));
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  showMessageBox: (options: any) => ipcRenderer.invoke('show-message-box', options),
  
  // Printer functions
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printTest: (printerName: string) => ipcRenderer.invoke('print-test', printerName),
  showPrintPreview: (printerName: string) => ipcRenderer.invoke('show-print-preview', printerName),
  
  // Tax Report functions
  getAvailableDrives: () => ipcRenderer.invoke('get-available-drives'),
  selectExportDirectory: () => ipcRenderer.invoke('select-export-directory'),
  generateTaxReport: (options: any) => ipcRenderer.invoke('generate-tax-report', options),
  printReportSummary: (summary: any) => ipcRenderer.invoke('print-report-summary', summary),
  
  // Database functions
  getDatabasePath: () => ipcRenderer.invoke('get-database-path'),
  setDatabasePath: (path: string) => ipcRenderer.invoke('set-database-path', path),
  initializeDatabase: (path: string) => ipcRenderer.invoke('initialize-database', path),
  databaseExists: (path: string) => ipcRenderer.invoke('database-exists', path),
  backupDatabase: (path: string) => ipcRenderer.invoke('backup-database', path),
  selectDatabasePath: () => ipcRenderer.invoke('select-database-path'),
  
  // Database operations
  dbGetProducts: () => ipcRenderer.invoke('db-get-products'),
  dbSaveProduct: (product: any) => ipcRenderer.invoke('db-save-product', product),
  dbGetCategories: () => ipcRenderer.invoke('db-get-categories'),
  dbSaveCategory: (category: any) => ipcRenderer.invoke('db-save-category', category),
  dbGetUsers: () => ipcRenderer.invoke('db-get-users'),
  dbSaveUser: (user: any) => ipcRenderer.invoke('db-save-user', user),
  dbGetTodaysTransactions: () => ipcRenderer.invoke('db-get-todays-transactions'),
  dbGetTransactionsByDateRange: (startDate: string, endDate: string) => ipcRenderer.invoke('db-get-transactions-by-date-range', startDate, endDate),
  dbGetTransactionsPage: (options: any) => ipcRenderer.invoke('db-get-transactions-page', options),
  dbSaveTransaction: (transaction: any) => ipcRenderer.invoke('db-save-transaction', transaction),
  dbGetBusinessInfo: () => ipcRenderer.invoke('db-get-business-info'),
  dbSaveBusinessInfo: (info: any) => ipcRenderer.invoke('db-save-business-info', info),
  dbGetSoftwareInfo: () => ipcRenderer.invoke('db-get-software-info'),
  dbSaveSoftwareInfo: (info: any) => ipcRenderer.invoke('db-save-software-info', info),
  dbGetSetting: (key: string) => ipcRenderer.invoke('db-get-setting', key),
  dbSaveSetting: (key: string, value: string) => ipcRenderer.invoke('db-save-setting', key, value),
  
  // Trading day operations
  dbGetCurrentTradingDay: () => ipcRenderer.invoke('db-get-current-trading-day'),
  dbGetTradingDayByDate: (date: string) => ipcRenderer.invoke('db-get-trading-day-by-date', date),
  dbGetTradingDaysByDateRange: (startDate: string, endDate: string) => ipcRenderer.invoke('db-get-trading-days-by-date-range', startDate, endDate),
  dbOpenTradingDay: (data: any) => ipcRenderer.invoke('db-open-trading-day', data),
  dbCloseTradingDay: (id: string, data: any) => ipcRenderer.invoke('db-close-trading-day', id, data),
  
  onMenuNewSale: (callback: () => void) => {
    ipcRenderer.on('menu-new-sale', callback);
  },
  onMainProcessMessage: (callback: (message: string) => void) => {
    ipcRenderer.on('main-process-message', (event, message) => callback(message));
  },
});

// Remove listeners on window unload
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector: string, text: string) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency] || '');
  }
});
