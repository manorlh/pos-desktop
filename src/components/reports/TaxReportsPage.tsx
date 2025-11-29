import { useState, useEffect } from 'react';
import { FileText, Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useBusinessStore } from '@/stores/useBusinessStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface ExportResult {
  success: boolean;
  filePath?: string;
  recordCounts?: Record<string, number>;
  dateRange?: { start: Date; end: Date } | { year: number };
  error?: string;
}

export function TaxReportsPage() {
  const { transactions, getTransactionsByDateRange } = useTransactionStore();
  const { businessInfo, softwareInfo, taxReportConfig } = useBusinessStore();
  const { globalTaxRate } = useSettingsStore();
  
  const [exportMode, setExportMode] = useState<'date-range' | 'year'>('date-range');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [taxYear, setTaxYear] = useState(new Date().getFullYear().toString());
  const [selectedDrive, setSelectedDrive] = useState<string>('');
  const [customPath, setCustomPath] = useState<string>('');
  const [useCustomPath, setUseCustomPath] = useState<boolean>(false);
  const [availableDrives, setAvailableDrives] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDrives, setIsLoadingDrives] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  // Load available drives on mount
  useEffect(() => {
    loadDrives();
  }, []);

  const loadDrives = async () => {
    setIsLoadingDrives(true);
    try {
      // This will be implemented in Electron IPC
      if (window.electronAPI?.getAvailableDrives) {
        const drives = await window.electronAPI.getAvailableDrives();
        setAvailableDrives(drives);
        if (drives.length > 0) {
          setSelectedDrive(drives[0]);
        }
      } else {
        // Fallback for development
        setAvailableDrives(['C:', 'D:', 'E:', 'F:']);
        setSelectedDrive('C:');
      }
    } catch (error) {
      console.error('Error loading drives:', error);
    } finally {
      setIsLoadingDrives(false);
    }
  };

  const handleExport = async () => {
    const exportPath = useCustomPath ? customPath : selectedDrive;
    
    if (!exportPath) {
      setExportResult({
        success: false,
        error: useCustomPath ? 'Please select a custom path' : 'Please select a drive',
      });
      return;
    }

    let dateRange: { start: Date; end: Date } | { year: number };
    let filteredTransactions;

    if (exportMode === 'date-range') {
      if (!startDate || !endDate) {
        setExportResult({
          success: false,
          error: 'Please select both start and end dates',
        });
        return;
      }

      // Parse DDMMYYYY format
      const start = parseDateDDMMYYYY(startDate);
      const end = parseDateDDMMYYYY(endDate);

      if (!start || !end) {
        setExportResult({
          success: false,
          error: 'Invalid date format. Please use DDMMYYYY format',
        });
        return;
      }

      if (start > end) {
        setExportResult({
          success: false,
          error: 'Start date must be before end date',
        });
        return;
      }

      dateRange = { start, end };
      // Query database directly via IPC (memory efficient - doesn't load all into memory)
      filteredTransactions = await getTransactionsByDateRange(start, end);
    } else {
      const year = parseInt(taxYear);
      if (isNaN(year) || year < 2000 || year > 2100) {
        setExportResult({
          success: false,
          error: 'Please enter a valid year (2000-2100)',
        });
        return;
      }

      dateRange = { year };
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);
      // Query database directly via IPC (memory efficient - doesn't load all into memory)
      filteredTransactions = await getTransactionsByDateRange(yearStart, yearEnd);
    }

    if (filteredTransactions.length === 0) {
      setExportResult({
        success: false,
        error: 'No transactions found for the selected date range',
      });
      return;
    }

    setIsLoading(true);
    setExportResult(null);

    try {
      // This will be implemented in Electron IPC
      if (window.electronAPI?.generateTaxReport) {
        // Convert globalTaxRate from decimal to percentage (e.g., 0.08 -> 8)
        const taxRatePercent = globalTaxRate ? globalTaxRate * 100 : 8;
        const result = await window.electronAPI.generateTaxReport({
          transactions: filteredTransactions,
          businessInfo,
          softwareInfo,
          taxReportConfig,
          dateRange,
          drive: exportPath,
          useCustomPath: useCustomPath,
          globalTaxRate: taxRatePercent, // Pass as percentage
        });

        setExportResult({
          success: true,
          filePath: result.filePath,
          recordCounts: result.recordCounts,
          dateRange,
        });
      } else {
        // Fallback for development/testing
        throw new Error('Tax report generation not yet implemented in Electron');
      }
    } catch (error: any) {
      setExportResult({
        success: false,
        error: error.message || 'Failed to generate tax report',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const parseDateDDMMYYYY = (dateStr: string): Date | null => {
    if (dateStr.length !== 8) return null;
    
    const day = parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4)) - 1; // Month is 0-indexed
    const year = parseInt(dateStr.substring(4, 8));

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (day < 1 || day > 31 || month < 0 || month > 11) return null;

    return new Date(year, month, day);
  };

  const formatDateDDMMYYYY = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}${month}${year}`;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-8 w-8" />
          Tax Authority Reports
        </h1>
        <p className="text-muted-foreground mt-2">
          Generate Israel Tax Authority compliant OPEN FORMAT files (INI.TXT and BKMVDATA.TXT)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export Configuration</CardTitle>
          <CardDescription>
            Configure the export parameters for tax authority compliance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Export Location Selection */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Export Location</label>
              <Select 
                value={useCustomPath ? 'custom' : 'drive'} 
                onValueChange={(value) => {
                  setUseCustomPath(value === 'custom');
                  if (value === 'custom') {
                    setSelectedDrive('');
                  } else {
                    setCustomPath('');
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="drive">Select Drive (Standard Structure)</SelectItem>
                  <SelectItem value="custom">Choose Custom Path</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {useCustomPath ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Custom Export Path</label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Select or enter path..."
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      if (window.electronAPI?.selectExportDirectory) {
                        const path = await window.electronAPI.selectExportDirectory();
                        if (path) {
                          setCustomPath(path);
                        }
                      }
                    }}
                  >
                    Browse...
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Files will be saved to: <span className="font-mono">{customPath || 'Not selected'}/OPENFRMT/...</span>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Output Drive</label>
                {isLoadingDrives ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading available drives...</span>
                  </div>
                ) : (
                  <Select value={selectedDrive} onValueChange={setSelectedDrive}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select drive" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDrives.map((drive) => (
                        <SelectItem key={drive} value={drive}>
                          {drive}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  Files will be saved to: <span className="font-mono">{selectedDrive || 'Not selected'}/OPENFRMT/...</span>
                </p>
              </div>
            )}
          </div>

          {/* Export Mode Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Export Mode</label>
            <Select value={exportMode} onValueChange={(value: 'date-range' | 'year') => setExportMode(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-range">Date Range (Multi-Year)</SelectItem>
                <SelectItem value="year">Tax Year (Single-Year)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range or Year Input */}
          {exportMode === 'date-range' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date (DDMMYYYY)</label>
                <Input
                  type="text"
                  placeholder="DDMMYYYY"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  maxLength={8}
                />
                {startDate && startDate.length === 8 && (
                  <p className="text-xs text-muted-foreground">
                    {formatDateDDMMYYYY(parseDateDDMMYYYY(startDate) || new Date())}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date (DDMMYYYY)</label>
                <Input
                  type="text"
                  placeholder="DDMMYYYY"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  maxLength={8}
                />
                {endDate && endDate.length === 8 && (
                  <p className="text-xs text-muted-foreground">
                    {formatDateDDMMYYYY(parseDateDDMMYYYY(endDate) || new Date())}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Tax Year (YYYY)</label>
              <Input
                type="text"
                placeholder="YYYY"
                value={taxYear}
                onChange={(e) => setTaxYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
              />
            </div>
          )}

          {/* Business Info Display */}
          <div className="border-t pt-4 space-y-2">
            <h3 className="font-semibold">Business Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">VAT Number:</span>
                <span className="ml-2 font-medium">{businessInfo.vatNumber}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Company:</span>
                <span className="ml-2 font-medium">{businessInfo.companyName}</span>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <Button
            onClick={handleExport}
            disabled={isLoading || (!selectedDrive && !customPath)}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Generate Tax Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Export Results */}
      {exportResult && (
        <Alert variant={exportResult.success ? 'default' : 'destructive'}>
          {exportResult.success ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertTitle>{exportResult.success ? 'Export Successful' : 'Export Failed'}</AlertTitle>
          <AlertDescription>
            {exportResult.success ? (
              <div className="space-y-2 mt-2">
                <p>
                  <strong>File Path:</strong> {exportResult.filePath}
                </p>
                {exportResult.dateRange && (
                  <p>
                    <strong>Date Range:</strong>{' '}
                    {'year' in exportResult.dateRange
                      ? `Year ${exportResult.dateRange.year}`
                      : `${formatDateDDMMYYYY(exportResult.dateRange.start)} to ${formatDateDDMMYYYY(exportResult.dateRange.end)}`}
                  </p>
                )}
                {exportResult.recordCounts && (
                  <div className="mt-2">
                    <strong>Record Counts:</strong>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      {Object.entries(exportResult.recordCounts).map(([type, count]) => (
                        <li key={type}>
                          {type}: {count}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                  Files have been generated and compressed according to tax authority specifications.
                </p>
              </div>
            ) : (
              <p>{exportResult.error}</p>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

