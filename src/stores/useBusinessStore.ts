import { create } from 'zustand';
import taxReportConfig from '../config/tax-report-config.json';

export interface BusinessInfo {
  vatNumber: string; // 9 digits
  companyName: string;
  companyAddress: string;
  companyAddressNumber: string;
  companyCity: string;
  companyZip: string;
  companyRegNumber?: string; // Company registry number
  hasBranches: boolean;
  branchId?: string; // 7 characters, if hasBranches is true
}

export interface SoftwareInfo {
  registrationNumber: string; // 8 digits
  name: string; // 20 chars
  version: string; // 20 chars
  manufacturerId: string; // 9 digits (developer VAT)
  manufacturerName: string; // 20 chars
  softwareType: 'single-year' | 'multi-year'; // 1=single, 2=multi
}

export interface TaxReportConfig {
  accountingType: string; // '0', '1', '2', etc.
  balancingRequired: boolean; // true/false
  languageCode: '0' | '1' | '2'; // 0=Hebrew, 1=Arabic, 2=Other
  charset: '0' | '1' | '2'; // Encoding type per spec
  defaultCurrency: string; // 'ILS' (or other if needed)
  compressionSoftware: string; // 'zip', 'rar', 'arj', etc.
  systemCode: string; // '&OF1.31&' (usually fixed)
}

interface BusinessStore {
  businessInfo: BusinessInfo;
  softwareInfo: SoftwareInfo;
  taxReportConfig: TaxReportConfig;
  setBusinessInfo: (info: Partial<BusinessInfo>) => void;
  setSoftwareInfo: (info: Partial<SoftwareInfo>) => void;
  setTaxReportConfig: (config: Partial<TaxReportConfig>) => void;
}

// Load defaults from JSON config file
const defaultBusinessInfo: BusinessInfo = {
  vatNumber: taxReportConfig.businessInfo.vatNumber,
  companyName: taxReportConfig.businessInfo.companyName,
  companyAddress: taxReportConfig.businessInfo.companyAddress,
  companyAddressNumber: taxReportConfig.businessInfo.companyAddressNumber,
  companyCity: taxReportConfig.businessInfo.companyCity,
  companyZip: taxReportConfig.businessInfo.companyZip,
  companyRegNumber: taxReportConfig.businessInfo.companyRegNumber || undefined,
  hasBranches: taxReportConfig.businessInfo.hasBranches,
  branchId: taxReportConfig.businessInfo.branchId || undefined,
};

const defaultSoftwareInfo: SoftwareInfo = {
  registrationNumber: taxReportConfig.softwareInfo.registrationNumber,
  name: taxReportConfig.softwareInfo.name,
  version: taxReportConfig.softwareInfo.version,
  manufacturerId: taxReportConfig.softwareInfo.manufacturerId,
  manufacturerName: taxReportConfig.softwareInfo.manufacturerName,
  softwareType: taxReportConfig.softwareInfo.softwareType as 'single-year' | 'multi-year',
};

const defaultTaxReportConfig: TaxReportConfig = {
  accountingType: taxReportConfig.taxReportConfig.accountingType,
  balancingRequired: taxReportConfig.taxReportConfig.balancingRequired,
  languageCode: taxReportConfig.taxReportConfig.languageCode as '0' | '1' | '2',
  charset: taxReportConfig.taxReportConfig.charset as '0' | '1' | '2',
  defaultCurrency: taxReportConfig.taxReportConfig.defaultCurrency,
  compressionSoftware: taxReportConfig.taxReportConfig.compressionSoftware,
  systemCode: taxReportConfig.taxReportConfig.systemCode,
};

export const useBusinessStore = create<BusinessStore>((set) => ({
  businessInfo: defaultBusinessInfo,
  softwareInfo: defaultSoftwareInfo,
  taxReportConfig: defaultTaxReportConfig,
  
  setBusinessInfo: (info) => {
    set((state) => ({
      businessInfo: { ...state.businessInfo, ...info }
    }));
  },
  
  setSoftwareInfo: (info) => {
    set((state) => ({
      softwareInfo: { ...state.softwareInfo, ...info }
    }));
  },
  
  setTaxReportConfig: (config) => {
    set((state) => ({
      taxReportConfig: { ...state.taxReportConfig, ...config }
    }));
  },
}));

