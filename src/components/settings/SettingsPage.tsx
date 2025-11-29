import { useState, useEffect } from 'react';
import { Settings, Database, FolderOpen, CheckCircle, AlertCircle, Download, Keyboard, Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Alert, AlertDescription } from '../ui/alert';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useProductStore } from '@/stores/useProductStore';

export function SettingsPage() {
  const [dbPath, setDbPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const { virtualKeyboardEnabled, globalTaxRate, hideOutOfStockProducts, loadSettings, setVirtualKeyboardEnabled, setGlobalTaxRate, setHideOutOfStockProducts } = useSettingsStore();
  const { filterProducts } = useProductStore();
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
      setTestResult({ success: false, message: 'Tax rate must be a number between 0 and 100' });
      return;
    }
    await setGlobalTaxRate(rate);
    setTestResult({ success: true, message: 'Tax rate saved successfully!' });
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
      setTestResult({ success: false, message: 'Please enter a database path' });
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
          setTestResult({ success: true, message: 'Database connection successful!' });
        } else {
          setTestResult({ success: false, message: result.error || 'Failed to connect to database' });
        }
      } else {
        // Try to create new database
        const result = await window.electronAPI.initializeDatabase(dbPath);
        if (result.success) {
          setTestResult({ success: true, message: 'New database created successfully!' });
        } else {
          setTestResult({ success: false, message: result.error || 'Failed to create database' });
        }
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSavePath = async () => {
    if (!dbPath) {
      setTestResult({ success: false, message: 'Please enter a database path' });
      return;
    }

    try {
      const result = await window.electronAPI.setDatabasePath(dbPath);
      if (result.success) {
        setTestResult({ success: true, message: 'Database path saved successfully!' });
      } else {
        setTestResult({ success: false, message: result.error || 'Failed to save database path' });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Failed to save database path' });
    }
  };

  const handleBackup = async () => {
    if (!dbPath) {
      setTestResult({ success: false, message: 'No database path specified' });
      return;
    }

    setIsBackingUp(true);
    try {
      const result = await window.electronAPI.backupDatabase(dbPath);
      if (result.success) {
        setTestResult({ success: true, message: `Backup created successfully at: ${result.backupPath}` });
      } else {
        setTestResult({ success: false, message: result.error || 'Failed to create backup' });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Failed to create backup' });
    } finally {
      setIsBackingUp(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure database and application settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Configuration
          </CardTitle>
          <CardDescription>
            Configure the SQLite database location for storing all POS data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Database Path</label>
            <div className="flex gap-2">
              <Input
                value={dbPath}
                onChange={(e) => setDbPath(e.target.value)}
                placeholder="C:\Users\...\pos.db"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleBrowsePath}
                className="flex items-center gap-2"
              >
                <FolderOpen className="h-4 w-4" />
                Browse...
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The database file will be created at this location if it doesn't exist
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
              {isTesting ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              onClick={handleSavePath}
              disabled={!dbPath}
            >
              Save Path
            </Button>
            <Button
              onClick={handleBackup}
              disabled={isBackingUp || !dbPath}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isBackingUp ? 'Backing up...' : 'Backup Database'}
            </Button>
          </div>

          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">Important Notes:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Changing the database path will require restarting the application</li>
              <li>Always backup your database before changing the path</li>
              <li>The database file contains all your products, transactions, and settings</li>
              <li>Ensure the selected path has write permissions</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Tax Settings
          </CardTitle>
          <CardDescription>
            Configure global tax rate for all products
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tax-rate">Global Tax Rate (%)</Label>
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
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              All product prices include tax. This rate is used to calculate tax breakdown in receipts.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Interface Settings
          </CardTitle>
          <CardDescription>
            Configure interface and input settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="virtual-keyboard" className="text-base">
                Virtual Keyboard
              </Label>
              <p className="text-sm text-muted-foreground">
                Enable or disable the virtual keyboard for touch input
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
                Hide Out of Stock Products
              </Label>
              <p className="text-sm text-muted-foreground">
                Hide products with zero stock from the product catalog
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
        </CardContent>
      </Card>
    </div>
  );
}

