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
  appRestart: () => ipcRenderer.invoke('app-restart'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  getHeeboFontCss: () => ipcRenderer.invoke('get-heebo-font-css'),
  showMessageBox: (options: any) => ipcRenderer.invoke('show-message-box', options),
  
  // Printer functions
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printTest: (printerName: string) => ipcRenderer.invoke('print-test', printerName),
  printReceipt: (payload: unknown) => ipcRenderer.invoke('print-receipt', payload),
  printVoucher: (payload: unknown) => ipcRenderer.invoke('print-voucher', payload),
  openCashDrawer: (payload: { printerName?: string; cashierName: string; language?: 'he' | 'en' }) =>
    ipcRenderer.invoke('open-cash-drawer', payload),
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
  /** Erase SQLite at path (or default from settings) and recreate empty schema. */
  resetDatabase: (path?: string) => ipcRenderer.invoke('reset-database', path),
  selectDatabasePath: () => ipcRenderer.invoke('select-database-path'),
  
  // Database operations
  dbGetProducts: () => ipcRenderer.invoke('db-get-products'),
  dbGetVoucher: (voucherId: string) => ipcRenderer.invoke('db-get-voucher', voucherId),
  dbCheckStockForAdd: (productId: string, quantity: number) =>
    ipcRenderer.invoke('db-check-stock-for-add', productId, quantity),
  dbGetEffectiveOnHand: (productId: string) =>
    ipcRenderer.invoke('db-get-effective-on-hand', productId),
  dbSaveIssuedVouchers: (transactionId: string, issued: unknown[]) =>
    ipcRenderer.invoke('db-save-issued-vouchers', transactionId, issued),
  incrementIssuedVoucherReprint: (issuedId: string) =>
    ipcRenderer.invoke('increment-issued-voucher-reprint', issuedId),
  dbSaveProduct: (product: any) => ipcRenderer.invoke('db-save-product', product),
  dbGetCategories: () => ipcRenderer.invoke('db-get-categories'),
  dbSaveCategory: (category: any) => ipcRenderer.invoke('db-save-category', category),
  dbGetUsers: () => ipcRenderer.invoke('db-get-users'),
  dbSaveUser: (user: any) => ipcRenderer.invoke('db-save-user', user),
  dbGetTodaysTransactions: () => ipcRenderer.invoke('db-get-todays-transactions'),
  dbGetTransactionsByDateRange: (startDate: string, endDate: string) => ipcRenderer.invoke('db-get-transactions-by-date-range', startDate, endDate),
  dbGetTransactionsPage: (options: any) => ipcRenderer.invoke('db-get-transactions-page', options),
  dbGetRefundsForOriginal: (originalTransactionId: string) =>
    ipcRenderer.invoke('db-get-refunds-for-original', originalTransactionId),
  dbDeleteAllTransactions: () => ipcRenderer.invoke('db-delete-all-transactions'),
  dbSaveTransaction: (transaction: any) => ipcRenderer.invoke('db-save-transaction', transaction),
  dbUpdateTransactionStatus: (transactionId: string, status: string) => ipcRenderer.invoke('db-update-transaction-status', transactionId, status),
  dbGetBusinessInfo: () => ipcRenderer.invoke('db-get-business-info'),
  dbSaveBusinessInfo: (info: any) => ipcRenderer.invoke('db-save-business-info', info),
  dbGetSoftwareInfo: () => ipcRenderer.invoke('db-get-software-info'),
  dbSaveSoftwareInfo: (info: any) => ipcRenderer.invoke('db-save-software-info', info),
  dbGetSetting: (key: string) => ipcRenderer.invoke('db-get-setting', key),
  dbSaveSetting: (key: string, value: string) => ipcRenderer.invoke('db-save-setting', key, value),

  nayaxTestConnection: () => ipcRenderer.invoke('nayax-test-connection'),
  nayaxDoTransaction: (payload: { amountAgorot: number; vuid: string }) =>
    ipcRenderer.invoke('nayax-do-transaction', payload),
  nayaxDoRefund: (payload: { amountAgorot: number; vuid: string; originalTransactionId: string }) =>
    ipcRenderer.invoke('nayax-do-refund', payload),
  nayaxAbortTransaction: (payload: { vuid: string }) =>
    ipcRenderer.invoke('nayax-abort-transaction', payload),

  dbGetIntegrationLogs: (options: { type?: string; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('db-get-integration-logs', options),
  dbClearIntegrationLogs: (type?: string) => ipcRenderer.invoke('db-clear-integration-logs', type),
  
  // Trading day operations
  dbGetCurrentTradingDay: () => ipcRenderer.invoke('db-get-current-trading-day'),
  dbGetTradingDayByDate: (date: string) => ipcRenderer.invoke('db-get-trading-day-by-date', date),
  dbGetTradingDayById: (id: string) => ipcRenderer.invoke('db-get-trading-day-by-id', id),
  dbGetTradingDaysByDateRange: (startDate: string, endDate: string) => ipcRenderer.invoke('db-get-trading-days-by-date-range', startDate, endDate),
  dbOpenTradingDay: (data: any) => ipcRenderer.invoke('db-open-trading-day', data),
  dbCloseTradingDay: (id: string, data: any) => ipcRenderer.invoke('db-close-trading-day', id, data),
  
  onMenuNewSale: (callback: () => void) => {
    ipcRenderer.on('menu-new-sale', callback);
  },
  onMainProcessMessage: (callback: (message: string) => void) => {
    ipcRenderer.on('main-process-message', (event, message) => callback(message));
  },
  /** Fires after main-process sync writes cloud catalog changes to SQLite. Returns an unsubscribe. */
  onCatalogUpdated: (
    callback: (info: { syncType: string; products: number; categories: number }) => void,
  ) => {
    const handler = (_event: unknown, info: { syncType: string; products: number; categories: number }) =>
      callback(info);
    ipcRenderer.on('catalog-updated', handler);
    return () => ipcRenderer.off('catalog-updated', handler);
  },
  onCatalogImagesUpdated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('catalog-images-updated', handler);
    return () => ipcRenderer.off('catalog-images-updated', handler);
  },
  onDatabaseResumed: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('database-resumed', handler);
    return () => ipcRenderer.off('database-resumed', handler);
  },
  onDatabaseResumeFailed: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('database-resume-failed', handler);
    return () => ipcRenderer.off('database-resume-failed', handler);
  },

  // Cloud sync
  cloudPairingValidate: (payload: { apiBaseUrl: string; code: string; machineName?: string }) =>
    ipcRenderer.invoke('cloud-pairing-validate', payload),
  cloudDeviceRegister: (payload: { apiBaseUrl: string; machineName?: string }) =>
    ipcRenderer.invoke('cloud-device-register', payload),
  cloudDevicePollStatus: (payload: { apiBaseUrl: string; deviceNonce: string }) =>
    ipcRenderer.invoke('cloud-device-poll-status', payload),
  syncConnect: (config: any) => ipcRenderer.invoke('sync-connect', config),
  syncDisconnect: () => ipcRenderer.invoke('sync-disconnect'),
  cloudUnpair: () => ipcRenderer.invoke('cloud-unpair'),
  syncGetStatus: () => ipcRenderer.invoke('sync-get-status'),
  syncPullCatalog: () => ipcRenderer.invoke('sync-pull-catalog'),
  syncRefreshMachineContext: () => ipcRenderer.invoke('sync-refresh-machine-context'),
  syncEnqueue: (data: any) => ipcRenderer.invoke('sync-enqueue', data),
  syncFlushQueue: () => ipcRenderer.invoke('sync-flush-queue'),

  // Cloud transaction sync (real-time push + Z-close hard barrier)
  cloudSyncStats: () => ipcRenderer.invoke('cloud-sync-stats'),
  cloudSyncFlush: () => ipcRenderer.invoke('cloud-sync-flush'),
  cloudSyncOnlineHint: () => ipcRenderer.invoke('cloud-sync-online-hint'),
  cloudZClose: (zPayload: any) => ipcRenderer.invoke('cloud-z-close', zPayload),
  cloudCloseDayAck: (payload: {
    requestId: string;
    phase: 'received' | 'completed' | 'failed';
    zReportId?: string;
    errorCode?: string;
    errorMessage?: string;
  }) => ipcRenderer.invoke('cloud-close-day-ack', payload),
  cloudPurgeClosedDay: (tradingDayId: string) =>
    ipcRenderer.invoke('cloud-purge-closed-day', tradingDayId),

  // POS users (per-shop cashier identities synced from cloud)
  posUsersSyncNow: () => ipcRenderer.invoke('pos-users-sync-now'),
  posUserListForShop: () => ipcRenderer.invoke('pos-users-list-for-shop'),
  posUserLogin: (pin: string) => ipcRenderer.invoke('pos-user-login', pin),
  posUsersHasAny: () => ipcRenderer.invoke('pos-users-has-any'),
  /** Fired after main-process pulls pos_users from cloud. Returns unsubscribe. */
  onPosUsersUpdated: (callback: (info: { count: number }) => void) => {
    const handler = (_event: unknown, info: { count: number }) => callback(info);
    ipcRenderer.on('pos-users-updated', handler);
    return () => ipcRenderer.off('pos-users-updated', handler);
  },

  settingsSyncNow: () => ipcRenderer.invoke('settings-sync-now'),
  onSettingsUpdated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('settings-updated', handler);
    return () => ipcRenderer.off('settings-updated', handler);
  },
  onCloseDayRequested: (
    callback: (payload: { requestId?: string; initiatedBy?: string; message?: string }) => void,
  ) => {
    const handler = (_event: unknown, payload: { requestId?: string; initiatedBy?: string; message?: string }) =>
      callback(payload);
    ipcRenderer.on('close-day-requested', handler);
    return () => ipcRenderer.off('close-day-requested', handler);
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
