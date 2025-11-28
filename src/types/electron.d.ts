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

interface TaxReportOptions {
  transactions: any[];
  businessInfo: any;
  softwareInfo: any;
  taxReportConfig: any;
  dateRange: { start: Date; end: Date } | { year: number };
  drive: string;
  useCustomPath?: boolean;
}

interface TaxReportResult {
  success: boolean;
  filePath?: string;
  recordCounts?: Record<string, number>;
  error?: string;
}

interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  showMessageBox: (options: any) => Promise<any>;
  
  // Printer functions
  getPrinters: () => Promise<Printer[]>;
  printTest: (printerName: string) => Promise<PrintResult>;
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
  dbSaveTransaction: (transaction: any) => Promise<{ success: boolean; error?: string }>;
  dbGetBusinessInfo: () => Promise<any | null>;
  dbSaveBusinessInfo: (info: any) => Promise<{ success: boolean; error?: string }>;
  dbGetSoftwareInfo: () => Promise<any | null>;
  dbSaveSoftwareInfo: (info: any) => Promise<{ success: boolean; error?: string }>;
  
  onMenuNewSale: (callback: () => void) => void;
  onMainProcessMessage: (callback: (message: string) => void) => void;
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
