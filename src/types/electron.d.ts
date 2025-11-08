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
