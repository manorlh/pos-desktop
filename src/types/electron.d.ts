export interface Printer {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
  options?: any;
}

interface PrintResult {
  success: boolean;
  printed?: boolean;
  error?: string;
}

interface ReceiptPrintPayload {
  transaction: unknown;
  businessInfo: unknown;
  globalTaxRate: number;
  language?: 'he' | 'en';
  categoryNames?: Record<string, string>;
  printedAt?: string;
}

interface TaxReportOptions {
  transactions: any[];
  businessInfo: any;
  softwareInfo: any;
  taxReportConfig: any;
  dateRange: { start: Date; end: Date } | { year: number };
  drive: string;
  useCustomPath?: boolean;
  globalTaxRate?: number; // Tax rate as percentage (e.g., 8 for 8%)
}

interface TaxReportResult {
  success: boolean;
  filePath?: string;
  recordCounts?: Record<string, number>;
  error?: string;
}

type NayaxTestConnectionResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string; code?: number; data?: unknown };

type NayaxDoTransactionOutcome =
  | 'approved'
  | 'partial'
  | 'declined'
  | 'cancelled'
  | 'rpc_error'
  | 'network_error'
  | 'unknown';

type NayaxDoTransactionResult =
  | {
      approved: true;
      outcome: 'approved' | 'partial';
      vuid: string;
      result?: unknown;
      statusCode?: number;
      statusMessage?: string;
      message?: string;
    }
  | {
      approved: false;
      outcome: NayaxDoTransactionOutcome;
      vuid: string;
      error?: string;
      result?: unknown;
      statusCode?: number;
      statusMessage?: string;
    };

/** Abort is optimistic: IPC returns immediately; JSON-RPC runs in the main-process background. */
type NayaxAbortTransactionResult =
  | { ok: true; dispatched: true }
  | { ok: false; error: string; statusCode?: number };

interface IntegrationLogRow {
  id: string;
  type: string;
  method: string;
  requestJson: string;
  responseJson: string | null;
  outcome: string;
  createdAt: string;
}

interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  showMessageBox: (options: any) => Promise<any>;
  
  // Printer functions
  getPrinters: () => Promise<Printer[]>;
  printTest: (printerName: string) => Promise<PrintResult>;
  printReceipt: (payload: ReceiptPrintPayload) => Promise<PrintResult>;
  showPrintPreview: (printerName: string) => Promise<PrintResult>;
  
  // Tax Report functions
  getAvailableDrives: () => Promise<string[]>;
  selectExportDirectory: () => Promise<string | null>;
  generateTaxReport: (options: TaxReportOptions) => Promise<TaxReportResult>;
  printReportSummary: (summary: any) => Promise<PrintResult>;
  
  // Database functions
  getDatabasePath: () => Promise<string>;
  setDatabasePath: (path: string) => Promise<{ success: boolean; error?: string }>;
  initializeDatabase: (path: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  databaseExists: (path: string) => Promise<boolean>;
  backupDatabase: (path: string) => Promise<{ success: boolean; backupPath?: string; error?: string }>;
  resetDatabase: (path?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  selectDatabasePath: () => Promise<string | null>;
  
  // Database operations
  dbGetProducts: () => Promise<any[]>;
  dbSaveProduct: (product: any) => Promise<{ success: boolean; error?: string }>;
  dbGetCategories: () => Promise<any[]>;
  dbSaveCategory: (category: any) => Promise<{ success: boolean; error?: string }>;
  dbGetUsers: () => Promise<any[]>;
  dbSaveUser: (user: any) => Promise<{ success: boolean; error?: string }>;
  dbGetTodaysTransactions: () => Promise<any[]>;
  dbGetTransactionsByDateRange: (startDate: string, endDate: string) => Promise<any[]>;
  dbGetTransactionsPage: (options: { startDate?: string; endDate?: string; limit?: number; offset?: number; status?: string }) => Promise<{ transactions: any[]; total: number }>;
  dbDeleteAllTransactions: () => Promise<{ success: boolean; deleted?: number; error?: string }>;
  dbSaveTransaction: (transaction: any) => Promise<{ success: boolean; error?: string }>;
  dbUpdateTransactionStatus: (transactionId: string, status: string) => Promise<{ success: boolean; error?: string }>;
  dbGetBusinessInfo: () => Promise<any | null>;
  dbSaveBusinessInfo: (info: any) => Promise<{ success: boolean; error?: string }>;
  dbGetSoftwareInfo: () => Promise<any | null>;
  dbSaveSoftwareInfo: (info: any) => Promise<{ success: boolean; error?: string }>;
  dbGetSetting: (key: string) => Promise<string | null>;
  dbSaveSetting: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;

  nayaxTestConnection: () => Promise<NayaxTestConnectionResult>;
  nayaxDoTransaction: (payload: { amountAgorot: number; vuid: string }) => Promise<NayaxDoTransactionResult>;
  nayaxAbortTransaction: (payload: { vuid: string }) => Promise<NayaxAbortTransactionResult>;

  dbGetIntegrationLogs: (options: {
    type?: string;
    limit?: number;
    offset?: number;
  }) => Promise<{ logs: IntegrationLogRow[]; total: number }>;
  dbClearIntegrationLogs: (type?: string) => Promise<{ success: boolean; error?: string }>;
  
  // Trading day operations
  dbGetCurrentTradingDay: () => Promise<any | null>;
  dbGetTradingDayByDate: (date: string) => Promise<any | null>;
  dbGetTradingDayById: (id: string) => Promise<any | null>;
  dbGetTradingDaysByDateRange: (startDate: string, endDate: string) => Promise<any[]>;
  dbOpenTradingDay: (data: any) => Promise<{ success: boolean; error?: string }>;
  dbCloseTradingDay: (id: string, data: any) => Promise<{ success: boolean; error?: string }>;
  
  onMenuNewSale: (callback: () => void) => void;
  onMainProcessMessage: (callback: (message: string) => void) => void;
  /** Subscribe to main-process catalog sync updates. Returns an unsubscribe function. */
  onCatalogUpdated: (
    callback: (info: { syncType: string; products: number; categories: number }) => void,
  ) => () => void;

  cloudPairingValidate: (payload: {
    apiBaseUrl: string;
    code: string;
    machineName?: string;
  }) => Promise<
    | {
        success: true;
        apiBaseUrl: string;
        machineId: string;
        merchantId: string;
        shopId: string;
        accessToken: string;
        mqttClientId: string;
        mqttUsername: string;
        mqttPassword: string;
        machineCode: string;
        mqttHost: string;
        mqttPort: number;
      }
    | { success: false; error: string; statusCode?: number }
  >;
  syncConnect: (config: {
    apiBaseUrl: string;
    accessToken: string;
    machineId: string;
    merchantId?: string;
    machineCode?: string;
    host: string;
    port: number;
    clientId?: string;
    username?: string;
    password?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  syncDisconnect: () => Promise<{ success: boolean; error?: string }>;
  /** Hard reset of cloud pairing: disconnects MQTT, wipes cloud_* settings, and clears local pos_users. */
  cloudUnpair: () => Promise<{ success: boolean; error?: string }>;
  syncGetStatus: () => Promise<
    { success: true; status: { enabled: boolean; connected: boolean; pendingCount: number; lastSyncedAt: string | null } } | { success: false; error?: string }
  >;
  syncPullCatalog: () => Promise<{
    success: boolean;
    status?: unknown;
    error?: string;
    products?: number;
    categories?: number;
  }>;
  syncRefreshMachineContext: () => Promise<
    { success: true; merchantId: string | null; shopId: string | null } | { success: false; error?: string }
  >;
  syncEnqueue: (data: unknown) => Promise<{ success: boolean; error?: string }>;
  syncFlushQueue: () => Promise<{ success: boolean; error?: string }>;

  // Cloud transaction sync (real-time push + Z-close hard barrier)
  cloudSyncStats: () => Promise<{
    success: boolean;
    pending?: number;
    syncing?: number;
    failed?: number;
    failedRows?: Array<{
      id: string;
      transactionId: string | null;
      lastError: string | null;
      attempts: number;
      updatedAt: string;
    }>;
    error?: string;
  }>;
  cloudSyncFlush: () => Promise<{ success: boolean; flushed?: number; error?: string }>;
  cloudSyncOnlineHint: () => Promise<{ success: boolean; error?: string }>;
  cloudZClose: (zPayload: Record<string, unknown>) => Promise<
    | { success: true; status: 'accepted' | 'duplicate' }
    | { success: false; error: string; missingIds?: string[]; httpStatus?: number }
  >;
  cloudPurgeClosedDay: (
    tradingDayId: string,
  ) => Promise<{ success: boolean; deleted?: number; error?: string }>;

  // POS users (per-shop cashier roster)
  posUsersSyncNow: () => Promise<{ ok: boolean; error?: string; users?: number }>;
  posUserListForShop: () => Promise<{
    success: boolean;
    error?: string;
    users: Array<{
      id: string;
      shopId: string;
      username: string;
      firstName: string | null;
      lastName: string | null;
      workerNumber: string | null;
      role: string;
      isActive: boolean;
    }>;
  }>;
  posUserLogin: (pin: string) => Promise<
    | {
        ok: true;
        user: {
          id: string;
          shopId: string;
          username: string;
          firstName: string | null;
          lastName: string | null;
          workerNumber: string | null;
          role: string;
          isActive: boolean;
        };
      }
    | { ok: false; reason: 'invalid_pin' | 'no_users' | 'invalid_format'; error?: string }
  >;
  posUsersHasAny: () => Promise<{ success: boolean; hasAny: boolean; error?: string }>;
  onPosUsersUpdated: (callback: (info: { count: number }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    ipcRenderer: {
      on: (...args: any[]) => void;
      off: (...args: any[]) => void;
      send: (...args: any[]) => void;
      invoke: (...args: any[]) => Promise<any>;
    };
  }
}
