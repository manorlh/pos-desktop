import { create } from 'zustand';

type Language = 'he' | 'en';

interface SettingsStore {
  virtualKeyboardEnabled: boolean;
  globalTaxRate: number; // Tax rate as decimal (e.g., 0.08 for 8%)
  hideOutOfStockProducts: boolean;
  language: Language;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  setVirtualKeyboardEnabled: (enabled: boolean) => Promise<void>;
  setGlobalTaxRate: (rate: number) => Promise<void>;
  setHideOutOfStockProducts: (hide: boolean) => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  virtualKeyboardEnabled: true, // Default to enabled
  globalTaxRate: 0.08, // Default 8% tax rate
  hideOutOfStockProducts: true, // Default to hiding out of stock products
  language: 'he', // Default to Hebrew
  isLoading: true,

  loadSettings: async () => {
    try {
      if (window.electronAPI) {
        const enabled = await window.electronAPI.dbGetSetting('virtualKeyboardEnabled');
        const taxRateStr = await window.electronAPI.dbGetSetting('globalTaxRate');
        const hideOutOfStock = await window.electronAPI.dbGetSetting('hideOutOfStockProducts');
        const language = await window.electronAPI.dbGetSetting('language');
        
        set({
          virtualKeyboardEnabled: enabled === null ? true : enabled === 'true',
          globalTaxRate: taxRateStr === null ? 0.08 : parseFloat(taxRateStr) / 100, // Convert percentage to decimal
          hideOutOfStockProducts: hideOutOfStock === null ? true : hideOutOfStock === 'true',
          language: (language === 'en' || language === 'he') ? language : 'he',
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
}));

