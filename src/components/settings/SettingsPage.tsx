import { useState, useEffect } from 'react';
import { Settings, Database, FolderOpen, CheckCircle, AlertCircle, Download, Keyboard, Percent, Languages, CreditCard, FileText, Trash2 } from 'lucide-react';
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
  const { filterProducts } = useProductStore();
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
  const deleteAllTransactions = useTransactionStore((s) => s.deleteAllTransactions);

  useEffect(() => {
    loadDatabasePath();
    loadSettings();
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
              disabled={isDeletingTransactions || !dbPath}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {isDeletingTransactions ? t('settings.resetTransactionsDeleting') : t('settings.resetTransactionsButton')}
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

