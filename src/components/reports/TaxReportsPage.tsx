import { useState, useEffect } from 'react';
import { FileText, Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useBusinessStore } from '@/stores/useBusinessStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useI18n } from '@/i18n';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface ExportResult {
  success: boolean;
  filePath?: string;
  recordCounts?: Record<string, number>;
  dateRange?: { start: Date; end: Date } | { year: number };
  error?: string;
}

export function TaxReportsPage() {
  const { t } = useI18n();
  const { transactions, getTransactionsByDateRange } = useTransactionStore();
  const { businessInfo, softwareInfo, taxReportConfig, setBusinessInfo, saveToDatabase } = useBusinessStore();
  const { globalTaxRate } = useSettingsStore();
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
        error: useCustomPath ? t('reports.pleaseSelectCustomPath') : t('reports.pleaseSelectDrive'),
      });
      return;
    }

    let dateRange: { start: Date; end: Date } | { year: number };
    let filteredTransactions;

    if (exportMode === 'date-range') {
      if (!startDate || !endDate) {
        setExportResult({
          success: false,
          error: t('reports.pleaseSelectBothDates'),
        });
        return;
      }

      // Parse DDMMYYYY format
      const start = parseDateDDMMYYYY(startDate);
      const end = parseDateDDMMYYYY(endDate);

      if (!start || !end) {
        setExportResult({
          success: false,
          error: t('reports.invalidDateFormat'),
        });
        return;
      }

      if (start > end) {
        setExportResult({
          success: false,
          error: t('reports.startBeforeEnd'),
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
          error: t('reports.validYear'),
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
        error: t('reports.noTransactionsForRange'),
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
        throw new Error(t('reports.reportNotImplemented'));
      }
    } catch (error: any) {
      setExportResult({
        success: false,
        error: error.message || t('reports.reportFailed'),
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
          {t('reports.taxAuthorityTitle')}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t('reports.taxAuthorityDescription')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('reports.exportConfig')}</CardTitle>
          <CardDescription>
            {t('reports.exportConfigDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('reports.exportLocation')}</label>
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
                  <SelectItem value="drive">{t('reports.selectDrive')}</SelectItem>
                  <SelectItem value="custom">{t('reports.chooseCustomPath')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {useCustomPath ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('reports.customExportPath')}</label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder={t('reports.selectOrEnterPath')}
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
                    {t('settings.browseButton')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('reports.filesSavedTo')} <span className="font-mono">{customPath || t('reports.notSelected')}/OPENFRMT/...</span>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('reports.outputDrive')}</label>
                {isLoadingDrives ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('reports.loadingDrives')}</span>
                  </div>
                ) : (
                  <Select value={selectedDrive} onValueChange={setSelectedDrive}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('reports.selectDrivePlaceholder')} />
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
                  {t('reports.filesSavedTo')} <span className="font-mono">{selectedDrive || t('reports.notSelected')}/OPENFRMT/...</span>
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('reports.exportMode')}</label>
            <Select value={exportMode} onValueChange={(value: 'date-range' | 'year') => setExportMode(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-range">{t('reports.dateRangeMultiYear')}</SelectItem>
                <SelectItem value="year">{t('reports.taxYearSingleYear')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {exportMode === 'date-range' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('reports.startDateDDMMYYYY')}</label>
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
                <label className="text-sm font-medium">{t('reports.endDateDDMMYYYY')}</label>
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
              <label className="text-sm font-medium">{t('reports.taxYearYYYY')}</label>
              <Input
                type="text"
                placeholder="YYYY"
                value={taxYear}
                onChange={(e) => setTaxYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
              />
            </div>
          )}

          <div className="border-t pt-4 space-y-4">
            <h3 className="font-semibold">{t('reports.businessInfo')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="business-vat">{t('reports.vatNumber')}</Label>
                <Input
                  id="business-vat"
                  value={businessInfo.vatNumber}
                  onChange={(e) => setBusinessInfo({ vatNumber: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                  maxLength={9}
                  placeholder={t('reports.vatNumberHint')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-company">{t('reports.companyName')}</Label>
                <Input
                  id="business-company"
                  value={businessInfo.companyName}
                  onChange={(e) => setBusinessInfo({ companyName: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="business-address">{t('reports.companyAddress')}</Label>
                <Input
                  id="business-address"
                  value={businessInfo.companyAddress}
                  onChange={(e) => setBusinessInfo({ companyAddress: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-addr-no">{t('reports.companyAddressNumber')}</Label>
                <Input
                  id="business-addr-no"
                  value={businessInfo.companyAddressNumber}
                  onChange={(e) => setBusinessInfo({ companyAddressNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-city">{t('reports.companyCity')}</Label>
                <Input
                  id="business-city"
                  value={businessInfo.companyCity}
                  onChange={(e) => setBusinessInfo({ companyCity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-zip">{t('reports.companyZip')}</Label>
                <Input
                  id="business-zip"
                  value={businessInfo.companyZip}
                  onChange={(e) => setBusinessInfo({ companyZip: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-reg">{t('reports.companyRegNumber')}</Label>
                <Input
                  id="business-reg"
                  value={businessInfo.companyRegNumber ?? ''}
                  onChange={(e) => setBusinessInfo({ companyRegNumber: e.target.value || undefined })}
                />
              </div>
              <div className="space-y-2 flex items-end pb-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="business-branches"
                    checked={businessInfo.hasBranches}
                    onCheckedChange={(checked) => setBusinessInfo({ hasBranches: checked })}
                  />
                  <Label htmlFor="business-branches">{t('reports.hasBranches')}</Label>
                </div>
              </div>
              {businessInfo.hasBranches && (
                <div className="space-y-2">
                  <Label htmlFor="business-branch-id">{t('reports.branchId')}</Label>
                  <Input
                    id="business-branch-id"
                    value={businessInfo.branchId ?? ''}
                    onChange={(e) => setBusinessInfo({ branchId: e.target.value.slice(0, 7) || undefined })}
                    maxLength={7}
                    placeholder={t('reports.branchIdHint')}
                  />
                </div>
              )}
            </div>
            {saveMessage && (
              <p className={saveMessage.type === 'success' ? 'text-sm text-green-600 dark:text-green-400' : 'text-sm text-destructive'}>
                {saveMessage.text}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                setSaveMessage(null);
                try {
                  await saveToDatabase();
                  setSaveMessage({ type: 'success', text: t('reports.saveBusinessInfoSuccess') });
                } catch {
                  setSaveMessage({ type: 'error', text: t('reports.saveBusinessInfoFailed') });
                }
              }}
            >
              {t('reports.saveBusinessInfo')}
            </Button>
          </div>

          <Button
            onClick={handleExport}
            disabled={isLoading || (!selectedDrive && !customPath)}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('reports.generatingReport')}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t('reports.generateTaxReport')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {exportResult && (
        <Alert variant={exportResult.success ? 'default' : 'destructive'}>
          {exportResult.success ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertTitle>{exportResult.success ? t('reports.exportSuccess') : t('reports.exportFailed')}</AlertTitle>
          <AlertDescription>
            {exportResult.success ? (
              <div className="space-y-2 mt-2">
                <p>
                  <strong>{t('reports.filePath')}</strong> {exportResult.filePath}
                </p>
                {exportResult.dateRange && (
                  <p>
                    <strong>{t('reports.dateRange')}</strong>{' '}
                    {'year' in exportResult.dateRange
                      ? `${t('reports.yearLabel')} ${exportResult.dateRange.year}`
                      : `${formatDateDDMMYYYY(exportResult.dateRange.start)} ${t('transactions.to')} ${formatDateDDMMYYYY(exportResult.dateRange.end)}`}
                  </p>
                )}
                {exportResult.recordCounts && (
                  <div className="mt-2">
                    <strong>{t('reports.recordCounts')}</strong>
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
                  {t('reports.filesGeneratedNote')}
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

