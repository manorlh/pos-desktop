import { useEffect, useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { VirtualKeyboardProvider } from './contexts/VirtualKeyboardContext';
import { I18nProvider } from './i18n';
import { useProductStore } from './stores/useProductStore';
import { useTransactionStore } from './stores/useTransactionStore';
import { useBusinessStore } from './stores/useBusinessStore';
import { useDatabaseStore } from './stores/useDatabaseStore';
import { useSettingsStore } from './stores/useSettingsStore';
import { useTradingDayStore } from './stores/useTradingDayStore';
import './globals.css';

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  
  const { setCurrentUser } = useTransactionStore();
  const { setDbPath } = useDatabaseStore();
  const { businessInfo, softwareInfo } = useBusinessStore();

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Check if Electron API is available
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      // Get database path and initialize
      const dbPath = await window.electronAPI.getDatabasePath();
      setDbPath(dbPath);
      
      // Initialize database
      const initResult = await window.electronAPI.initializeDatabase(dbPath);
      if (!initResult.success) {
        throw new Error(initResult.error || 'Failed to initialize database');
      }

      // Check if database is empty (first run)
      const existingProducts = await window.electronAPI.dbGetProducts();
      const existingCategories = await window.electronAPI.dbGetCategories();

      // First run: persist bundled business config when catalog is still empty
      if (existingProducts.length === 0 && existingCategories.length === 0) {
        await window.electronAPI.dbSaveBusinessInfo(businessInfo);
        await window.electronAPI.dbSaveSoftwareInfo(softwareInfo);
      }
      
      // Load data into stores
      const { loadProducts, loadCategories } = useProductStore.getState();
      await loadProducts();
      await loadCategories();
      
      const usersRaw = await window.electronAPI.dbGetUsers();
      const users = usersRaw.map((u: any) => ({
        ...u,
        createdAt: new Date(u.createdAt),
        updatedAt: new Date(u.updatedAt),
      }));
      setCurrentUser(users[0] ?? null);
      
      // Load business info
      const { loadFromDatabase } = useBusinessStore.getState();
      await loadFromDatabase();
      
      // Load today's transactions
      const { loadTodaysTransactions } = useTransactionStore.getState();
      await loadTodaysTransactions();
      
      // Load current trading day status
      const { loadCurrentTradingDay } = useTradingDayStore.getState();
      await loadCurrentTradingDay();
      
      // Load settings and set language
      const { loadSettings, language: settingsLanguage } = useSettingsStore.getState();
      await loadSettings();
      const currentLanguage = useSettingsStore.getState().language;
      setLanguage(currentLanguage);
      
      setIsInitializing(false);
    } catch (error: any) {
      console.error('Failed to initialize app:', error);
      setInitError(error.message || 'Failed to initialize application');
      setIsInitializing(false);
    }
  };

  // Subscribe to language changes
  useEffect(() => {
    const unsubscribe = useSettingsStore.subscribe(
      (state) => state.language,
      (newLanguage) => {
        setLanguage(newLanguage);
      }
    );
    return unsubscribe;
  }, []);

  // Refresh product/category stores when the main process applies a cloud catalog pull,
  // so price/name edits from the cloud show up without a manual page refresh.
  useEffect(() => {
    if (!window.electronAPI?.onCatalogUpdated) return;
    const unsubscribe = window.electronAPI.onCatalogUpdated(() => {
      const { loadProducts, loadCategories } = useProductStore.getState();
      void loadProducts();
      void loadCategories();
    });
    return unsubscribe;
  }, []);

  if (isInitializing) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Initializing application...</p>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-destructive text-lg font-semibold mb-2">Initialization Error</div>
          <p className="text-muted-foreground mb-4">{initError}</p>
          <p className="text-sm text-muted-foreground">
            The application will continue with limited functionality. Please check your database settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <I18nProvider defaultLanguage={language}>
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  return (
    <VirtualKeyboardProvider>
      <div className="h-screen bg-background">
        <MainLayout />
      </div>
    </VirtualKeyboardProvider>
  );
}

export default App;
