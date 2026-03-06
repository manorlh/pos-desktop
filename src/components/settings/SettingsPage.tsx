import { useState, useEffect } from 'react';
import { Settings, Database, FolderOpen, CheckCircle, AlertCircle, Download, Keyboard, Percent, Languages } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Alert, AlertDescription } from '../ui/alert';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useProductStore } from '@/stores/useProductStore';
import { useI18n } from '@/i18n';

export function SettingsPage() {
  const [dbPath, setDbPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const { virtualKeyboardEnabled, globalTaxRate, hideOutOfStockProducts, language, loadSettings, setVirtualKeyboardEnabled, setGlobalTaxRate, setHideOutOfStockProducts, setLanguage } = useSettingsStore();
  const { filterProducts } = useProductStore();
  const { t, setLanguage: setI18nLanguage } = useI18n();
  const [taxRateInput, setTaxRateInput] = useState<string>('');

  useEffect(() => {
    loadDatabasePath();
    loadSettings();
  }, []);

  useEffect(() => {
    // Update tax rate input when globalTaxRate changes
    if (globalTaxRate !== undefined) {
      setTaxRateInput((globalTaxRate * 100).toFixed(2));
    }
  }, [globalTaxRate]);

  const handleTaxRateChange = (value: string) => {
    setTaxRateInput(value);
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

