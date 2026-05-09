import { useCallback, useEffect, useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { LoginScreen } from './components/auth/LoginScreen';
import { OnboardingScreen } from './components/onboarding/OnboardingScreen';
import { VirtualKeyboardProvider } from './contexts/VirtualKeyboardContext';
import { I18nProvider } from './i18n';
import { useProductStore } from './stores/useProductStore';
import { useTransactionStore } from './stores/useTransactionStore';
import { useBusinessStore } from './stores/useBusinessStore';
import { useDatabaseStore } from './stores/useDatabaseStore';
import { useSettingsStore } from './stores/useSettingsStore';
import { useTradingDayStore } from './stores/useTradingDayStore';
import { useAuthStore } from './stores/useAuthStore';
import './globals.css';

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [paired, setPaired] = useState(false);
  const [hasUsers, setHasUsers] = useState(false);

  const posUser = useAuthStore((s) => s.posUser);
  const { setDbPath } = useDatabaseStore();
  const { businessInfo, softwareInfo } = useBusinessStore();

  const refreshOnboardingState = useCallback(async () => {
    try {
      const machineId = await window.electronAPI?.dbGetSetting?.('cloud_machine_id');
      setPaired(!!(machineId && String(machineId).trim()));
    } catch (e) {
      console.error('[App] failed to read cloud_machine_id:', e);
      setPaired(false);
    }
    try {
      const r = await window.electronAPI?.posUsersHasAny?.();
      setHasUsers(!!r?.hasAny);
    } catch (e) {
      console.error('[App] failed to check pos_users:', e);
      setHasUsers(false);
    }
  }, []);

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
      
      // Pos users (cashier identities) come from cloud sync (see electron/posUserSync.ts);
      // login is handled by useAuthStore + LoginScreen below.
      await refreshOnboardingState();

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

  // Refresh hasUsers gate when the main process applies a pos_users pull.
  useEffect(() => {
    if (!window.electronAPI?.onPosUsersUpdated) return;
    const unsubscribe = window.electronAPI.onPosUsersUpdated(() => {
      void refreshOnboardingState();
    });
    return unsubscribe;
  }, [refreshOnboardingState]);

  // When the OS reports the network came back, nudge the main-process tx outbox to drain.
  useEffect(() => {
    if (!window.electronAPI?.cloudSyncOnlineHint) return;
    const handler = () => {
      void window.electronAPI.cloudSyncOnlineHint();
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
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
      <AppContent
        paired={paired}
        hasUsers={hasUsers}
        loggedIn={!!posUser}
        onPaired={() => setPaired(true)}
        refreshOnboarding={refreshOnboardingState}
      />
    </I18nProvider>
  );
}

interface AppContentProps {
  paired: boolean;
  hasUsers: boolean;
  loggedIn: boolean;
  onPaired: () => void;
  refreshOnboarding: () => Promise<void>;
}

function AppContent({ paired, hasUsers, loggedIn, onPaired, refreshOnboarding }: AppContentProps) {
  // VirtualKeyboardProvider must wrap every screen that may render shared `Input` /
  // `Dialog` components — including OnboardingScreen and LoginScreen — because those
  // components call `useVirtualKeyboard` internally.
  return (
    <VirtualKeyboardProvider>
      {/* Hard gate: onboarding → login → till. Enforced once at the top so per-page guards aren't needed. */}
      {!paired || !hasUsers ? (
        <OnboardingScreen
          paired={paired}
          hasUsers={hasUsers}
          onPaired={onPaired}
          onRefresh={refreshOnboarding}
        />
      ) : !loggedIn ? (
        <LoginScreen />
      ) : (
        <div className="h-screen bg-background">
          <MainLayout />
        </div>
      )}
    </VirtualKeyboardProvider>
  );
}

export default App;
