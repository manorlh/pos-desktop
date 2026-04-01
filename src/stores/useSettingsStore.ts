import { create } from 'zustand';

type Language = 'he' | 'en';

interface SettingsStore {
  virtualKeyboardEnabled: boolean;
  globalTaxRate: number; // Tax rate as decimal (e.g., 0.18 for 18%)
  hideOutOfStockProducts: boolean;
  language: Language;
  nayaxEnabled: boolean;
  nayaxDeviceHost: string;
  nayaxDevicePort: string;
  nayaxSpicyPath: string;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  setVirtualKeyboardEnabled: (enabled: boolean) => Promise<void>;
  setGlobalTaxRate: (rate: number) => Promise<void>;
  setHideOutOfStockProducts: (hide: boolean) => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  setNayaxEnabled: (enabled: boolean) => Promise<void>;
  setNayaxDeviceHost: (host: string) => Promise<void>;
  setNayaxDevicePort: (port: string) => Promise<void>;
  setNayaxSpicyPath: (spicyPath: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  virtualKeyboardEnabled: true, // Default to enabled
  globalTaxRate: 0.18, // Israel standard VAT 18%
  hideOutOfStockProducts: true, // Default to hiding out of stock products
  language: 'he', // Default to Hebrew
  nayaxEnabled: false,
  nayaxDeviceHost: '',
  nayaxDevicePort: '8080',
  nayaxSpicyPath: '/SPICy',
  isLoading: true,

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
        
        set({
          virtualKeyboardEnabled: enabled === null ? true : enabled === 'true',
          globalTaxRate: taxRateStr === null ? 0.18 : parseFloat(taxRateStr) / 100, // Convert percentage to decimal
          hideOutOfStockProducts: hideOutOfStock === null ? true : hideOutOfStock === 'true',
          language: (language === 'en' || language === 'he') ? language : 'he',
          nayaxEnabled: nayaxEnabled === 'true',
          nayaxDeviceHost: nayaxDeviceHost ?? '',
          nayaxDevicePort: nayaxDevicePort ?? '8080',
          nayaxSpicyPath: nayaxSpicyPath ?? '/SPICy',
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
        // Fallback for development without electron
        set({ virtualKeyboardEnabled: enabled });
      }
    } catch (error) {
      console.error('Failed to save virtual keyboard setting:', error);
    }
  },

  setGlobalTaxRate: async (rate: number) => {
    try {
      if (window.electronAPI) {
        // Store as percentage (e.g., 8 for 8%)
        const result = await window.electronAPI.dbSaveSetting('globalTaxRate', String(rate));
        if (result.success) {
          set({ globalTaxRate: rate / 100 }); // Convert percentage to decimal for internal use
        }
      } else {
        // Fallback for development without electron
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
        // Fallback for development without electron
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
        // Fallback for development without electron
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
}));

