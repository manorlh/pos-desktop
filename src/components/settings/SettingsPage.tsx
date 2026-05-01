import { useState, useEffect } from 'react';
import { Settings, Database, FolderOpen, CheckCircle, AlertCircle, Download, Keyboard, Percent, Languages, CreditCard, FileText, Trash2, Cloud } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Alert, AlertDescription } from '../ui/alert';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useProductStore } from '@/stores/useProductStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useI18n } from '@/i18n';

const NAYAX_INTEGRATION_LOG_TYPE = 'nayax_card_integration';

type CloudPairSession = {
  apiBaseUrl: string;
  accessToken: string;
  machineId: string;
  merchantId: string;
  shopId: string;
  mqttHost: string;
  mqttPort: number;
  mqttClientId: string;
  mqttUsername: string;
  mqttPassword: string;
  machineCode: string;
};

export function SettingsPage() {
  const [dbPath, setDbPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const {
    virtualKeyboardEnabled,
    globalTaxRate,
    hideOutOfStockProducts,
    language,
    nayaxEnabled,
    nayaxDeviceHost,
    nayaxDevicePort,
    nayaxSpicyPath,
    loadSettings,
    setVirtualKeyboardEnabled,
    setGlobalTaxRate,
    setHideOutOfStockProducts,
    setLanguage,
    setNayaxEnabled,
    setNayaxDeviceHost,
    setNayaxDevicePort,
    setNayaxSpicyPath,
  } = useSettingsStore();
  const { filterProducts, loadProducts, loadCategories } = useProductStore();
  const { t, setLanguage: setI18nLanguage, locale } = useI18n();
  const [taxRateInput, setTaxRateInput] = useState<string>('');
  const [nayaxHostInput, setNayaxHostInput] = useState('');
  const [nayaxPortInput, setNayaxPortInput] = useState('');
  const [nayaxPathInput, setNayaxPathInput] = useState('');
  const [isTestingNayax, setIsTestingNayax] = useState(false);
  const [nayaxResult, setNayaxResult] = useState<{ success: boolean; message: string } | null>(null);
  const [integrationLogs, setIntegrationLogs] = useState<
    Array<{
      id: string;
      type: string;
      method: string;
      requestJson: string;
      responseJson: string | null;
      outcome: string;
      createdAt: string;
    }>
  >([]);
  const [integrationLogsTotal, setIntegrationLogsTotal] = useState(0);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isDeletingTransactions, setIsDeletingTransactions] = useState(false);
  const [isCleaningDatabase, setIsCleaningDatabase] = useState(false);
  const deleteAllTransactions = useTransactionStore((s) => s.deleteAllTransactions);

  const [cloudApiBase, setCloudApiBase] = useState('');
  const [cloudPairingCode, setCloudPairingCode] = useState('');
  const [cloudMachineName, setCloudMachineName] = useState('');
  const [cloudSession, setCloudSession] = useState<CloudPairSession | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    enabled: boolean;
    connected: boolean;
    lastSyncedAt: string | null;
  } | null>(null);

  const refreshSyncStatus = async () => {
    if (!window.electronAPI?.syncGetStatus) return;
    const r = await window.electronAPI.syncGetStatus();
    if (r.success && 'status' in r) {
      setSyncStatus({
        enabled: r.status.enabled,
        connected: r.status.connected,
        lastSyncedAt: r.status.lastSyncedAt,
      });
    }
  };

  const applyCloudConnect = async (session: CloudPairSession) => {
    return window.electronAPI!.syncConnect({
      apiBaseUrl: session.apiBaseUrl,
      accessToken: session.accessToken,
      machineId: session.machineId,
      merchantId: session.merchantId || '',
      host: session.mqttHost,
      port: session.mqttPort,
      clientId: session.mqttClientId,
      username: session.mqttUsername,
      password: session.mqttPassword,
    });
  };

  useEffect(() => {
    loadDatabasePath();
    loadSettings();
  }, []);

  useEffect(() => {
    void (async () => {
      const base = await window.electronAPI?.dbGetSetting('cloud_api_base');
      if (base) setCloudApiBase(base);
      await refreshSyncStatus();
    })();
  }, []);

  const loadIntegrationLogs = async () => {
    if (!window.electronAPI?.dbGetIntegrationLogs) return;
    setIsLoadingLogs(true);
    try {
      const r = await window.electronAPI.dbGetIntegrationLogs({
        type: NAYAX_INTEGRATION_LOG_TYPE,
        limit: 100,
      });
      setIntegrationLogs(r.logs);
      setIntegrationLogsTotal(r.total);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    void loadIntegrationLogs();
  }, []);

  useEffect(() => {
    // Update tax rate input when globalTaxRate changes
    if (globalTaxRate !== undefined) {
      setTaxRateInput((globalTaxRate * 100).toFixed(2));
    }
  }, [globalTaxRate]);

  useEffect(() => {
    setNayaxHostInput(nayaxDeviceHost);
    setNayaxPortInput(nayaxDevicePort);
    setNayaxPathInput(nayaxSpicyPath);
  }, [nayaxDeviceHost, nayaxDevicePort, nayaxSpicyPath]);

  const handleTaxRateChange = (value: string) => {
    setTaxRateInput(value);
  };

  const persistNayaxConnection = async () => {
    await setNayaxDeviceHost(nayaxHostInput.trim());
    await setNayaxDevicePort(nayaxPortInput.trim() || '8080');
    await setNayaxSpicyPath(nayaxPathInput.trim() || '/SPICy');
  };

  const handleSaveNayaxConnection = async () => {
    setNayaxResult(null);
    await persistNayaxConnection();
    setNayaxResult({ success: true, message: t('settings.saved') });
  };

  const handleNayaxTest = async () => {
    setNayaxResult(null);
    setIsTestingNayax(true);
    try {
      await persistNayaxConnection();
      if (!window.electronAPI?.nayaxTestConnection) {
        setNayaxResult({ success: false, message: t('settings.nayaxTestFailed') });
        return;
      }
      const res = await window.electronAPI.nayaxTestConnection();
      if (res.ok) {
        setNayaxResult({ success: true, message: t('settings.nayaxTestOk') });
      } else {
        setNayaxResult({
          success: false,
          message: `${t('settings.nayaxTestFailed')} ${'error' in res ? res.error : ''}`.trim(),
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setNayaxResult({ success: false, message: msg });
    } finally {
      setIsTestingNayax(false);
    }
  };

  const handleSaveTaxRate = async () => {
    const rate = parseFloat(taxRateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      setTestResult({ success: false, message: t('settings.taxRateInvalid') });
      return;
    }
    await setGlobalTaxRate(rate);
    setTestResult({ success: true, message: t('settings.taxRateSavedSuccess') });
  };

  const loadDatabasePath = async () => {
    try {
      const path = await window.electronAPI.getDatabasePath();
      setDbPath(path);
    } catch (error) {
      console.error('Failed to load database path:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBrowsePath = async () => {
    try {
      const selectedPath = await window.electronAPI.selectDatabasePath();
      if (selectedPath) {
        setDbPath(selectedPath);
      }
    } catch (error) {
      console.error('Failed to select database path:', error);
    }
  };

  const handleTestConnection = async () => {
    if (!dbPath) {
      setTestResult({ success: false, message: t('settings.pleaseEnterDbPath') });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const exists = await window.electronAPI.databaseExists(dbPath);
      if (exists) {
        // Try to initialize
        const result = await window.electronAPI.initializeDatabase(dbPath);
        if (result.success) {
          setTestResult({ success: true, message: t('settings.testSuccess') });
        } else {
          setTestResult({ success: false, message: result.error || t('settings.failedToConnect') });
        }
      } else {
        // Try to create new database
        const result = await window.electronAPI.initializeDatabase(dbPath);
        if (result.success) {
          setTestResult({ success: true, message: t('settings.newDatabaseCreated') });
        } else {
          setTestResult({ success: false, message: result.error || t('settings.failedToCreateDb') });
        }
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || t('settings.testFailed') });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSavePath = async () => {
    if (!dbPath) {
      setTestResult({ success: false, message: t('settings.pleaseEnterDbPath') });
      return;
    }

    try {
      const result = await window.electronAPI.setDatabasePath(dbPath);
      if (result.success) {
        setTestResult({ success: true, message: t('settings.dbPathSavedSuccess') });
      } else {
        setTestResult({ success: false, message: result.error || t('settings.failedToSavePath') });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || t('settings.failedToSavePath') });
    }
  };

  const handleBackup = async () => {
    if (!dbPath) {
      setTestResult({ success: false, message: t('settings.noDbPathSpecified') });
      return;
    }

    setIsBackingUp(true);
    try {
      const result = await window.electronAPI.backupDatabase(dbPath);
      if (result.success) {
        setTestResult({ success: true, message: t('settings.backupCreatedAt', { path: String(result.backupPath) }) });
      } else {
        setTestResult({ success: false, message: result.error || t('settings.failedToCreateBackup') });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || t('settings.failedToCreateBackup') });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleCloudPairAndConnect = async () => {
    setCloudMessage(null);
    if (!window.electronAPI?.cloudPairingValidate) {
      setCloudMessage({ type: 'err', text: t('settings.cloudNotElectron') });
      return;
    }
    if (!cloudApiBase.trim() || !cloudPairingCode.trim()) {
      setCloudMessage({ type: 'err', text: t('errors.required') });
      return;
    }
    setCloudBusy(true);
    try {
      const res = await window.electronAPI.cloudPairingValidate({
        apiBaseUrl: cloudApiBase.trim(),
        code: cloudPairingCode.trim(),
        machineName: cloudMachineName.trim() || undefined,
      });
      if (!res.success) {
        setCloudMessage({ type: 'err', text: res.error || t('settings.cloudPairingFailed') });
        return;
      }
      const session: CloudPairSession = {
        apiBaseUrl: res.apiBaseUrl,
        accessToken: res.accessToken,
        machineId: res.machineId,
        merchantId: res.merchantId,
        shopId: res.shopId,
        mqttHost: res.mqttHost,
        mqttPort: res.mqttPort,
        mqttClientId: res.mqttClientId,
        mqttUsername: res.mqttUsername,
        mqttPassword: res.mqttPassword,
        machineCode: res.machineCode,
      };
      setCloudSession(session);
      const conn = await applyCloudConnect(session);
      if (!conn.success) {
        setCloudMessage({ type: 'err', text: conn.error || t('settings.cloudPairingFailed') });
        return;
      }
      setCloudPairingCode('');
      setCloudMessage({ type: 'ok', text: t('settings.cloudConnectOk') });
      await loadProducts();
      await loadCategories();
      await refreshSyncStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCloudMessage({ type: 'err', text: msg });
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCloudRefreshMerchant = async () => {
    if (!window.electronAPI?.syncRefreshMachineContext || !cloudSession) return;
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const r = await window.electronAPI.syncRefreshMachineContext();
      if (!r.success) {
        setCloudMessage({ type: 'err', text: r.error ?? t('settings.cloudPairingFailed') });
        return;
      }
      const next: CloudPairSession = {
        ...cloudSession,
        merchantId: r.merchantId || cloudSession.merchantId,
        shopId: r.shopId || cloudSession.shopId,
      };
      setCloudSession(next);
      const conn = await applyCloudConnect(next);
      if (!conn.success) {
        setCloudMessage({ type: 'err', text: conn.error || t('settings.cloudPairingFailed') });
        return;
      }
      setCloudMessage({ type: 'ok', text: t('settings.cloudConnectOk') });
      await refreshSyncStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCloudMessage({ type: 'err', text: msg });
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCloudPullCatalog = async () => {
    if (!window.electronAPI?.syncPullCatalog) return;
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const r = await window.electronAPI.syncPullCatalog();
      if (!r.success) {
        setCloudMessage({ type: 'err', text: r.error || t('settings.cloudPullFailed') });
        return;
      }
      await loadProducts();
      await loadCategories();
      await refreshSyncStatus();
      setCloudMessage({
        type: 'ok',
        text: t('settings.cloudPullOk', {
          products: r.products ?? 0,
          categories: r.categories ?? 0,
        }),
      });
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCloudDisconnect = async () => {
    if (!window.electronAPI?.syncDisconnect) return;
    setCloudBusy(true);
    try {
      await window.electronAPI.syncDisconnect();
      setCloudSession(null);
      setCloudMessage({ type: 'ok', text: t('settings.cloudDisconnectOk') });
      await refreshSyncStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCloudMessage({ type: 'err', text: msg });
    } finally {
      setCloudBusy(false);
    }
  };

  const handleDeleteAllTransactions = async () => {
    if (!window.electronAPI?.showMessageBox || !window.electronAPI?.dbDeleteAllTransactions) {
      setTestResult({ success: false, message: t('settings.resetTransactionsFailed') });
      return;
    }
    const confirm = await window.electronAPI.showMessageBox({
      type: 'warning',
      title: t('settings.resetTransactionsTitle'),
      message: t('settings.resetTransactionsMessage'),
      buttons: [t('common.cancel'), t('settings.resetTransactionsConfirm')],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirm.response !== 1) {
      return;
    }
    setIsDeletingTransactions(true);
    setTestResult(null);
    try {
      const result = await deleteAllTransactions();
      if (result.success) {
        setTestResult({ success: true, message: t('settings.resetTransactionsSuccess') });
      } else {
        setTestResult({
          success: false,
          message: result.error || t('settings.resetTransactionsFailed'),
        });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setTestResult({ success: false, message: msg || t('settings.resetTransactionsFailed') });
    } finally {
      setIsDeletingTransactions(false);
    }
  };

  const handleCleanDatabase = async () => {
    if (!window.electronAPI?.resetDatabase) {
      return;
    }
    if (!dbPath) {
      setTestResult({ success: false, message: t('settings.pleaseEnterDbPath') });
      return;
    }
    const confirm = await window.electronAPI.showMessageBox({
      type: 'warning',
      title: t('settings.cleanDatabaseTitle'),
      message: t('settings.cleanDatabaseMessage'),
      buttons: [t('common.cancel'), t('settings.cleanDatabaseConfirm')],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirm.response !== 1) {
      return;
    }
    setIsCleaningDatabase(true);
    setTestResult(null);
    try {
      const result = await window.electronAPI.resetDatabase(dbPath);
      if (result.success) {
        setTestResult({ success: true, message: t('settings.cleanDatabaseSuccess') });
        setCloudSession(null);
        setCloudApiBase('');
        setCloudPairingCode('');
        setCloudMachineName('');
        setCloudMessage(null);
        await loadProducts();
        await loadCategories();
        await loadSettings();
        await refreshSyncStatus();
        setIntegrationLogs([]);
        setIntegrationLogsTotal(0);
      } else {
        setTestResult({
          success: false,
          message: result.error || t('settings.cleanDatabaseFailed'),
        });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setTestResult({ success: false, message: msg || t('settings.cleanDatabaseFailed') });
    } finally {
      setIsCleaningDatabase(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">{t('settings.loading')}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          {t('settings.title')}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t('settings.configureDescription')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {t('settings.databaseConfigTitle')}
          </CardTitle>
          <CardDescription>
            {t('settings.databaseConfigDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.databasePath')}</label>
            <div className="flex gap-2">
              <Input
                value={dbPath}
                onChange={(e) => setDbPath(e.target.value)}
                placeholder={t('settings.databasePathPlaceholder')}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleBrowsePath}
                className="flex items-center gap-2"
              >
                <FolderOpen className="h-4 w-4" />
                {t('settings.browseButton')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.dbFileCreatedNote')}
            </p>
          </div>

          {testResult && (
            <Alert variant={testResult.success ? 'default' : 'destructive'}>
              {testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{testResult.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleTestConnection}
              disabled={isTesting || !dbPath}
              variant="outline"
            >
              {isTesting ? t('settings.testing') : t('settings.testConnection')}
            </Button>
            <Button
              onClick={handleSavePath}
              disabled={!dbPath}
            >
              {t('settings.savePath')}
            </Button>
            <Button
              onClick={handleBackup}
              disabled={isBackingUp || !dbPath}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isBackingUp ? t('settings.backingUp') : t('settings.backupDatabase')}
            </Button>
          </div>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <div>
              <h4 className="font-semibold flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                {t('settings.resetTransactionsSection')}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">{t('settings.resetTransactionsDesc')}</p>
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteAllTransactions}
              disabled={isDeletingTransactions || isCleaningDatabase || !dbPath}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {isDeletingTransactions ? t('settings.resetTransactionsDeleting') : t('settings.resetTransactionsButton')}
            </Button>
          </div>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <div>
              <h4 className="font-semibold flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                {t('settings.cleanDatabaseSection')}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">{t('settings.cleanDatabaseDesc')}</p>
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCleanDatabase}
              disabled={
                isCleaningDatabase ||
                isDeletingTransactions ||
                !dbPath ||
                !window.electronAPI?.resetDatabase
              }
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {isCleaningDatabase ? t('settings.cleanDatabaseWorking') : t('settings.cleanDatabaseButton')}
            </Button>
          </div>

          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">{t('settings.importantNotes')}</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>{t('settings.dbPathChangeNote')}</li>
              <li>{t('settings.backupBeforeChange')}</li>
              <li>{t('settings.dbContainsAll')}</li>
              <li>{t('settings.ensureWritePermissions')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            {t('settings.cloudSyncTitle')}
          </CardTitle>
          <CardDescription>{t('settings.cloudSyncDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!window.electronAPI?.cloudPairingValidate ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{t('settings.cloudNotElectron')}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="cloud-api-base">{t('settings.cloudApiBase')}</Label>
            <Input
              id="cloud-api-base"
              value={cloudApiBase}
              onChange={(e) => setCloudApiBase(e.target.value)}
              placeholder={t('settings.cloudApiBasePlaceholder')}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">{t('settings.cloudApiBaseHint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cloud-pair-code">{t('settings.cloudPairingCode')}</Label>
            <Input
              id="cloud-pair-code"
              value={cloudPairingCode}
              onChange={(e) => setCloudPairingCode(e.target.value)}
              placeholder={t('settings.cloudPairingCodePlaceholder')}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cloud-machine-name">{t('settings.cloudMachineName')}</Label>
            <Input
              id="cloud-machine-name"
              value={cloudMachineName}
              onChange={(e) => setCloudMachineName(e.target.value)}
              placeholder={t('settings.cloudMachineNamePlaceholder')}
              autoComplete="off"
            />
          </div>

          {cloudMessage ? (
            <Alert variant={cloudMessage.type === 'ok' ? 'default' : 'destructive'}>
              {cloudMessage.type === 'ok' ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{cloudMessage.text}</AlertDescription>
            </Alert>
          ) : null}

          {cloudSession ? (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">{t('settings.cloudSessionMachine')}: </span>
                <span className="font-mono">{cloudSession.machineCode}</span>
              </p>
              <p>
                <span className="text-muted-foreground">{t('settings.cloudSessionMerchant')}: </span>
                <span className="font-mono">{cloudSession.merchantId || '—'}</span>
              </p>
              {!cloudSession.merchantId ? (
                <p className="text-amber-700 dark:text-amber-500 text-xs pt-1">
                  {t('settings.cloudSessionMissingMerchant')}
                </p>
              ) : null}
            </div>
          ) : null}

          {syncStatus ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                {t('settings.cloudStatus')}: {syncStatus.enabled ? t('settings.cloudStatusEnabled') : '—'} ·{' '}
                {t('settings.cloudStatusMqtt')}{' '}
                {syncStatus.connected
                  ? t('settings.cloudStatusConnected')
                  : t('settings.cloudStatusDisconnected')}
              </p>
              <p>
                {t('settings.cloudLastSync')}:{' '}
                {syncStatus.lastSyncedAt
                  ? new Date(syncStatus.lastSyncedAt).toLocaleString(locale)
                  : t('settings.cloudNever')}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleCloudPairAndConnect()}
              disabled={
                cloudBusy ||
                !window.electronAPI?.cloudPairingValidate ||
                !cloudApiBase.trim() ||
                !cloudPairingCode.trim()
              }
            >
              {cloudBusy ? t('settings.cloudValidating') : t('settings.cloudValidateConnect')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCloudRefreshMerchant()}
              disabled={cloudBusy || !cloudSession || !window.electronAPI?.syncRefreshMachineContext}
            >
              {t('settings.cloudRefreshMerchant')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCloudPullCatalog()}
              disabled={cloudBusy || !window.electronAPI?.syncPullCatalog}
            >
              {t('settings.cloudPullCatalog')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCloudDisconnect()}
              disabled={cloudBusy || !window.electronAPI?.syncDisconnect}
            >
              {t('settings.cloudDisconnect')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('settings.cloudRefreshMerchantHint')}</p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            {t('settings.taxSettings')}
          </CardTitle>
          <CardDescription>
            {t('settings.taxConfigDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tax-rate">{t('settings.taxRate')}</Label>
            <div className="flex gap-2">
              <Input
                id="tax-rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={taxRateInput}
                onChange={(e) => handleTaxRateChange(e.target.value)}
                placeholder="8.00"
                className="flex-1"
              />
              <Button onClick={handleSaveTaxRate}>
                {t('settings.save')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.taxIncludeNote')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t('settings.nayaxTitle')}
          </CardTitle>
          <CardDescription>{t('settings.nayaxDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="nayax-enabled" className="text-base">
                {t('settings.nayaxEnable')}
              </Label>
            </div>
            <Switch
              id="nayax-enabled"
              checked={nayaxEnabled}
              onCheckedChange={setNayaxEnabled}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nayax-host">{t('settings.nayaxHost')}</Label>
              <Input
                id="nayax-host"
                value={nayaxHostInput}
                onChange={(e) => setNayaxHostInput(e.target.value)}
                placeholder={t('settings.nayaxHostPlaceholder')}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nayax-port">{t('settings.nayaxPort')}</Label>
              <Input
                id="nayax-port"
                value={nayaxPortInput}
                onChange={(e) => setNayaxPortInput(e.target.value)}
                placeholder="8080"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nayax-path">{t('settings.nayaxPath')}</Label>
              <Input
                id="nayax-path"
                value={nayaxPathInput}
                onChange={(e) => setNayaxPathInput(e.target.value)}
                placeholder={t('settings.nayaxPathPlaceholder')}
                autoComplete="off"
              />
            </div>
          </div>

          {nayaxResult && (
            <Alert variant={nayaxResult.success ? 'default' : 'destructive'}>
              {nayaxResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{nayaxResult.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleSaveNayaxConnection}>
              {t('settings.nayaxSaveConnection')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleNayaxTest}
              disabled={isTestingNayax || !nayaxHostInput.trim()}
            >
              {isTestingNayax ? t('settings.nayaxTesting') : t('settings.nayaxTestDevice')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('settings.integrationLogsTitle')}
          </CardTitle>
          <CardDescription>{t('settings.integrationLogsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadIntegrationLogs()}
              disabled={isLoadingLogs}
            >
              {isLoadingLogs ? '…' : t('settings.integrationLogsRefresh')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!window.confirm(t('settings.integrationLogsClear') + '?')) return;
                const r = await window.electronAPI?.dbClearIntegrationLogs(NAYAX_INTEGRATION_LOG_TYPE);
                if (r?.success) await loadIntegrationLogs();
              }}
            >
              {t('settings.integrationLogsClear')}
            </Button>
          </div>
          {integrationLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('settings.integrationLogsEmpty')}</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto space-y-2 border rounded-md p-2">
              {integrationLogs.map((log) => (
                <details key={log.id} className="border-b border-border/60 pb-2 last:border-0">
                  <summary className="cursor-pointer text-sm font-medium list-none flex flex-wrap gap-x-3 gap-y-1">
                    <span className="text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString(locale)}
                    </span>
                    <span>{log.method}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{log.outcome}</span>
                  </summary>
                  <div className="mt-2 space-y-2 text-xs">
                    <div>
                      <div className="font-semibold mb-0.5">{t('settings.integrationLogsRequest')}</div>
                      <pre className="whitespace-pre-wrap break-all rounded bg-muted/50 p-2 max-h-40 overflow-y-auto">
                        {log.requestJson}
                      </pre>
                    </div>
                    <div>
                      <div className="font-semibold mb-0.5">{t('settings.integrationLogsResponse')}</div>
                      <pre className="whitespace-pre-wrap break-all rounded bg-muted/50 p-2 max-h-48 overflow-y-auto">
                        {log.responseJson ?? '—'}
                      </pre>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
          {integrationLogsTotal > integrationLogs.length ? (
            <p className="text-xs text-muted-foreground">
              {integrationLogs.length} / {integrationLogsTotal}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            {t('settings.interfaceSettings')}
          </CardTitle>
          <CardDescription>
            {t('settings.interfaceConfigDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="virtual-keyboard" className="text-base">
                {t('settings.virtualKeyboard')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.virtualKeyboardTouchDesc')}
              </p>
            </div>
            <Switch
              id="virtual-keyboard"
              checked={virtualKeyboardEnabled}
              onCheckedChange={setVirtualKeyboardEnabled}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="hide-out-of-stock" className="text-base">
                {t('settings.hideOutOfStock')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.hideOutOfStockDesc')}
              </p>
            </div>
            <Switch
              id="hide-out-of-stock"
              checked={hideOutOfStockProducts}
              onCheckedChange={async (checked) => {
                await setHideOutOfStockProducts(checked);
                // Re-filter products to reflect the setting change
                filterProducts();
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="language" className="text-base">
              {t('settings.language')}
            </Label>
            <Select
              value={language}
              onValueChange={async (value: 'he' | 'en') => {
                setI18nLanguage(value);
                await setLanguage(value);
              }}
            >
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="he">{t('settings.languageHebrew')}</SelectItem>
                <SelectItem value="en">{t('settings.languageEnglish')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('settings.languageDesc')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

