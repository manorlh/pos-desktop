import { useCallback, useEffect, useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { LoginScreen } from './components/auth/LoginScreen';
import { OnboardingScreen } from './components/onboarding/OnboardingScreen';
import { VirtualKeyboardProvider } from './contexts/VirtualKeyboardContext';
import { I18nProvider, useI18n } from './i18n';
import { useProductStore } from './stores/useProductStore';
import { useTransactionStore } from './stores/useTransactionStore';
import { useBusinessStore } from './stores/useBusinessStore';
import { useDatabaseStore } from './stores/useDatabaseStore';
import { useSettingsStore } from './stores/useSettingsStore';
import { useTradingDayStore } from './stores/useTradingDayStore';
import { useAuthStore } from './stores/useAuthStore';
import { Button } from './components/ui/button';
import './globals.css';

function InitErrorScreen({
  error,
  onRetry,
  onRestart,
  retrying,
}: {
  error: string;
  onRetry: () => void;
  onRestart: () => void;
  retrying: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <div className="text-destructive text-lg font-semibold mb-2">{t('app.initErrorTitle')}</div>
        <p className="text-muted-foreground mb-3">{error}</p>
        <p className="text-sm text-muted-foreground mb-6">{t('app.initErrorHint')}</p>
        <div className="flex flex-wrap gap-2 justify-center mb-4">
          <Button type="button" onClick={onRetry} disabled={retrying}>
            {retrying ? t('common.loading') : t('app.initRetry')}
          </Button>
          <Button type="button" variant="outline" onClick={onRestart} disabled={retrying}>
            {t('app.initRestart')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('app.initSettingsHint')}</p>
      </div>
    </div>
  );
}

async function reloadAppDataFromDatabase(): Promise<void> {
  const { loadProducts, loadCategories } = useProductStore.getState();
  await loadProducts();
  await loadCategories();
  const { loadFromDatabase } = useBusinessStore.getState();
  await loadFromDatabase();
  const { loadTodaysTransactions } = useTransactionStore.getState();
  await loadTodaysTransactions();
  const { loadCurrentTradingDay } = useTradingDayStore.getState();
  await loadCurrentTradingDay();
  const { loadSettings } = useSettingsStore.getState();
  await loadSettings();
}

function AppShell() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [paired, setPaired] = useState(false);
  const [hasUsers, setHasUsers] = useState(false);

  const posUser = useAuthStore((s) => s.posUser);
  const setDbPath = useDatabaseStore((s) => s.setDbPath);
  const { t } = useI18n();

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

  const initializeApp = useCallback(async (opts?: { showSpinner?: boolean }) => {
    const showSpinner = opts?.showSpinner !== false;
    if (showSpinner) {
      setInitError(null);
      setIsInitializing(true);
    }
    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      const dbPath = await window.electronAPI.getDatabasePath();
      setDbPath(dbPath);

      const initResult = await window.electronAPI.initializeDatabase(dbPath);
      if (!initResult.success) {
        throw new Error(initResult.error || 'Failed to initialize database');
      }

      const existingProducts = await window.electronAPI.dbGetProducts();
      const existingCategories = await window.electronAPI.dbGetCategories();

      const { businessInfo, softwareInfo } = useBusinessStore.getState();
      if (existingProducts.length === 0 && existingCategories.length === 0) {
        await window.electronAPI.dbSaveBusinessInfo(businessInfo);
        await window.electronAPI.dbSaveSoftwareInfo(softwareInfo);
      }

      await reloadAppDataFromDatabase();
      await refreshOnboardingState();

      const currentLanguage = useSettingsStore.getState().language;
      setLanguage(currentLanguage);

      if (showSpinner) {
        setIsInitializing(false);
      }
      setInitError(null);
    } catch (error: unknown) {
      console.error('Failed to initialize app:', error);
      const message = error instanceof Error ? error.message : 'Failed to initialize application';
      setInitError(message);
      setIsInitializing(false);
    }
  }, [refreshOnboardingState, setDbPath]);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    const unsubResume = window.electronAPI?.onDatabaseResumed?.(() => {
      void (async () => {
        try {
          await reloadAppDataFromDatabase();
          await refreshOnboardingState();
          setInitError(null);
          setIsInitializing(false);
        } catch (error: unknown) {
          console.error('[App] refresh after DB resume failed:', error);
          const message = error instanceof Error ? error.message : 'Failed to refresh after wake';
          setInitError(message);
          setIsInitializing(false);
        }
      })();
    });
    const unsubFailed = window.electronAPI?.onDatabaseResumeFailed?.(() => {
      setInitError((prev) => prev ?? 'Unable to reopen database after sleep');
      setIsInitializing(false);
    });
    return () => {
      unsubResume?.();
      unsubFailed?.();
    };
  }, [refreshOnboardingState]);

  useEffect(() => {
    const unsubscribe = useSettingsStore.subscribe(
      (state) => state.language,
      (newLanguage) => {
        setLanguage(newLanguage);
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onCatalogUpdated) return;
    const unsubscribe = window.electronAPI.onCatalogUpdated(() => {
      const { loadProducts, loadCategories } = useProductStore.getState();
      void loadProducts();
      void loadCategories();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onCatalogImagesUpdated) return;
    const unsubscribe = window.electronAPI.onCatalogImagesUpdated(() => {
      const { loadProducts, loadCategories } = useProductStore.getState();
      void loadProducts();
      void loadCategories();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onPosUsersUpdated) return;
    const unsubscribe = window.electronAPI.onPosUsersUpdated(() => {
      void refreshOnboardingState();
    });
    return unsubscribe;
  }, [refreshOnboardingState]);

  useEffect(() => {
    if (!window.electronAPI?.cloudSyncOnlineHint) return;
    const handler = () => {
      void window.electronAPI.cloudSyncOnlineHint();
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, []);

  const handleRetryInit = async () => {
    setRetrying(true);
    try {
      await initializeApp();
    } finally {
      setRetrying(false);
    }
  };

  const handleRestartApp = () => {
    void window.electronAPI?.appRestart?.();
  };

  if (isInitializing) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{t('app.initializing')}</p>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <InitErrorScreen
        error={initError}
        onRetry={() => void handleRetryInit()}
        onRestart={handleRestartApp}
        retrying={retrying}
      />
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

function App() {
  return (
    <I18nProvider defaultLanguage="he">
      <AppShell />
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
  return (
    <VirtualKeyboardProvider>
      {!paired || !hasUsers ? (
        <OnboardingScreen
          paired={paired}
          hasUsers={hasUsers}
          onPaired={onPaired}
          onRefresh={refreshOnboarding}
        />
      ) : !loggedIn ? (
        <LoginScreen refreshOnboarding={refreshOnboarding} />
      ) : (
        <div className="h-screen bg-background">
          <MainLayout />
        </div>
      )}
    </VirtualKeyboardProvider>
  );
}

export default App;
