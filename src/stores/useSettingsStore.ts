import { create } from 'zustand';
import { resolveEffectivePrinters } from '@/utils/printerRouting';

type Language = 'he' | 'en';
type OutOfStockPolicy = 'block' | 'warn' | 'allow';
type TipDistribution = 'direct' | 'equal_pool' | 'by_sales';

interface SettingsStore {
  virtualKeyboardEnabled: boolean;
  globalTaxRate: number; // Tax rate as decimal (e.g., 0.18 for 18%)
  hideOutOfStockProducts: boolean;
  outOfStockPolicy: OutOfStockPolicy;
  tipsEnabled: boolean;
  cashTipsEnabled: boolean;
  tipPresets: number[];
  tipDistribution: TipDistribution;
  language: Language;
  nayaxEnabled: boolean;
  nayaxDeviceHost: string;
  nayaxDevicePort: string;
  nayaxSpicyPath: string;
  /** Cloud-synced default receipt printer name (e.g. BB). */
  receiptPrinterName: string;
  /** Cloud-synced drawer printer name (e.g. BBILL). */
  drawerPrinterName: string;
  /** Device-local override for receipt printer; empty = use cloud. */
  localReceiptPrinterName: string;
  /** Device-local override for drawer printer; empty = use cloud. */
  localDrawerPrinterName: string;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  getEffectivePrinters: () => { receiptPrinterName: string | undefined; drawerPrinterName: string | undefined };
  setVirtualKeyboardEnabled: (enabled: boolean) => Promise<void>;
  setGlobalTaxRate: (rate: number) => Promise<void>;
  setHideOutOfStockProducts: (hide: boolean) => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  setNayaxEnabled: (enabled: boolean) => Promise<void>;
  setNayaxDeviceHost: (host: string) => Promise<void>;
  setNayaxDevicePort: (port: string) => Promise<void>;
  setNayaxSpicyPath: (spicyPath: string) => Promise<void>;
  setLocalReceiptPrinterName: (name: string) => Promise<void>;
  setLocalDrawerPrinterName: (name: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  virtualKeyboardEnabled: true,
  globalTaxRate: 0.18,
  hideOutOfStockProducts: false,
  outOfStockPolicy: 'allow' as OutOfStockPolicy,
  tipsEnabled: false,
  cashTipsEnabled: false,
  tipPresets: [10, 12, 15],
  tipDistribution: 'direct' as TipDistribution,
  language: 'he',
  nayaxEnabled: false,
  nayaxDeviceHost: '',
  nayaxDevicePort: '8080',
  nayaxSpicyPath: '/SPICy',
  receiptPrinterName: '',
  drawerPrinterName: '',
  localReceiptPrinterName: '',
  localDrawerPrinterName: '',
  isLoading: true,

  getEffectivePrinters: () =>
    resolveEffectivePrinters({
      receiptPrinterName: get().receiptPrinterName,
      drawerPrinterName: get().drawerPrinterName,
      localReceiptPrinterName: get().localReceiptPrinterName,
      localDrawerPrinterName: get().localDrawerPrinterName,
    }),

  loadSettings: async () => {
    try {
      if (window.electronAPI) {
        const enabled = await window.electronAPI.dbGetSetting('virtualKeyboardEnabled');
        const taxRateStr = await window.electronAPI.dbGetSetting('globalTaxRate');
        const hideOutOfStock = await window.electronAPI.dbGetSetting('hideOutOfStockProducts');
        const language = await window.electronAPI.dbGetSetting('language');
        const nayaxEnabled = await window.electronAPI.dbGetSetting('nayaxEnabled');
        const nayaxDeviceHost = await window.electronAPI.dbGetSetting('nayaxDeviceHost');
        const nayaxDevicePort = await window.electronAPI.dbGetSetting('nayaxDevicePort');
        const nayaxSpicyPath = await window.electronAPI.dbGetSetting('nayaxSpicyPath');
        const outOfStockPolicy = await window.electronAPI.dbGetSetting('outOfStockPolicy');
        const tipsEnabled = await window.electronAPI.dbGetSetting('tipsEnabled');
        const cashTipsEnabled = await window.electronAPI.dbGetSetting('cashTipsEnabled');
        const tipPresetsRaw = await window.electronAPI.dbGetSetting('tipPresets');
        const tipDistribution = await window.electronAPI.dbGetSetting('tipDistribution');
        const receiptPrinterName = await window.electronAPI.dbGetSetting('receiptPrinterName');
        const drawerPrinterName = await window.electronAPI.dbGetSetting('drawerPrinterName');
        const localReceiptPrinterName = await window.electronAPI.dbGetSetting('localReceiptPrinterName');
        const localDrawerPrinterName = await window.electronAPI.dbGetSetting('localDrawerPrinterName');

        let tipPresets = [10, 12, 15];
        if (tipPresetsRaw) {
          try {
            const parsed = JSON.parse(tipPresetsRaw) as unknown;
            if (Array.isArray(parsed) && parsed.every((n) => typeof n === 'number')) {
              tipPresets = parsed as number[];
            }
          } catch {
            /* keep default */
          }
        }

        set({
          virtualKeyboardEnabled: enabled === null ? true : enabled === 'true',
          globalTaxRate: taxRateStr === null ? 0.18 : parseFloat(taxRateStr) / 100,
          hideOutOfStockProducts: hideOutOfStock === null ? false : hideOutOfStock === 'true',
          outOfStockPolicy:
            outOfStockPolicy === 'block' || outOfStockPolicy === 'warn' || outOfStockPolicy === 'allow'
              ? outOfStockPolicy
              : 'allow',
          tipsEnabled: tipsEnabled === 'true',
          cashTipsEnabled: cashTipsEnabled === 'true',
          tipPresets,
          tipDistribution:
            tipDistribution === 'equal_pool' || tipDistribution === 'by_sales' || tipDistribution === 'direct'
              ? tipDistribution
              : 'direct',
          language: language === 'en' || language === 'he' ? language : 'he',
          nayaxEnabled: nayaxEnabled === 'true',
          nayaxDeviceHost: nayaxDeviceHost ?? '',
          nayaxDevicePort: nayaxDevicePort ?? '8080',
          nayaxSpicyPath: nayaxSpicyPath ?? '/SPICy',
          receiptPrinterName: receiptPrinterName ?? '',
          drawerPrinterName: drawerPrinterName ?? '',
          localReceiptPrinterName: localReceiptPrinterName ?? '',
          localDrawerPrinterName: localDrawerPrinterName ?? '',
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoading: false });
    }
  },

  setVirtualKeyboardEnabled: async (enabled: boolean) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbSaveSetting('virtualKeyboardEnabled', String(enabled));
        if (result.success) {
          set({ virtualKeyboardEnabled: enabled });
        }
      } else {
        set({ virtualKeyboardEnabled: enabled });
      }
    } catch (error) {
      console.error('Failed to save virtual keyboard setting:', error);
    }
  },

  setGlobalTaxRate: async (rate: number) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbSaveSetting('globalTaxRate', String(rate));
        if (result.success) {
          set({ globalTaxRate: rate / 100 });
        }
      } else {
        set({ globalTaxRate: rate / 100 });
      }
    } catch (error) {
      console.error('Failed to save global tax rate:', error);
    }
  },

  setHideOutOfStockProducts: async (hide: boolean) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbSaveSetting('hideOutOfStockProducts', String(hide));
        if (result.success) {
          set({ hideOutOfStockProducts: hide });
        }
      } else {
        set({ hideOutOfStockProducts: hide });
      }
    } catch (error) {
      console.error('Failed to save hide out of stock products setting:', error);
    }
  },

  setLanguage: async (language: Language) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbSaveSetting('language', language);
        if (result.success) {
          set({ language });
        }
      } else {
        set({ language });
      }
    } catch (error) {
      console.error('Failed to save language setting:', error);
    }
  },

  setNayaxEnabled: async (enabled: boolean) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbSaveSetting('nayaxEnabled', String(enabled));
        if (result.success) set({ nayaxEnabled: enabled });
      } else {
        set({ nayaxEnabled: enabled });
      }
    } catch (error) {
      console.error('Failed to save nayaxEnabled:', error);
    }
  },

  setNayaxDeviceHost: async (host: string) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbSaveSetting('nayaxDeviceHost', host);
        if (result.success) set({ nayaxDeviceHost: host });
      } else {
        set({ nayaxDeviceHost: host });
      }
    } catch (error) {
      console.error('Failed to save nayaxDeviceHost:', error);
    }
  },

  setNayaxDevicePort: async (port: string) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbSaveSetting('nayaxDevicePort', port);
        if (result.success) set({ nayaxDevicePort: port });
      } else {
        set({ nayaxDevicePort: port });
      }
    } catch (error) {
      console.error('Failed to save nayaxDevicePort:', error);
    }
  },

  setNayaxSpicyPath: async (spicyPath: string) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbSaveSetting('nayaxSpicyPath', spicyPath);
        if (result.success) set({ nayaxSpicyPath: spicyPath });
      } else {
        set({ nayaxSpicyPath: spicyPath });
      }
    } catch (error) {
      console.error('Failed to save nayaxSpicyPath:', error);
    }
  },

  setLocalReceiptPrinterName: async (name: string) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbSaveSetting('localReceiptPrinterName', name);
        if (result.success) set({ localReceiptPrinterName: name });
      } else {
        set({ localReceiptPrinterName: name });
      }
    } catch (error) {
      console.error('Failed to save localReceiptPrinterName:', error);
    }
  },

  setLocalDrawerPrinterName: async (name: string) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbSaveSetting('localDrawerPrinterName', name);
        if (result.success) set({ localDrawerPrinterName: name });
      } else {
        set({ localDrawerPrinterName: name });
      }
    } catch (error) {
      console.error('Failed to save localDrawerPrinterName:', error);
    }
  },
}));
