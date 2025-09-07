import { useState, useEffect } from 'react';
import { Printer, RefreshCw, TestTube, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import type { Printer as PrinterType } from '../../types/electron';

export function PrinterTest() {
  const [printers, setPrinters] = useState<PrinterType[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadPrinters = async () => {
    setIsRefreshing(true);
    try {
      const printerList = await window.electronAPI.getPrinters();
      setPrinters(printerList);
      
      // Auto-select default printer if available
      const defaultPrinter = printerList.find(p => p.isDefault);
      if (defaultPrinter) {
        setSelectedPrinter(defaultPrinter.name);
      }
      
      setTestResult(null);
    } catch (error) {
      console.error('Error loading printers:', error);
      setTestResult({
        success: false,
        message: 'Failed to load printers. Make sure the application has proper permissions.'
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTestPrint = async () => {
    if (!selectedPrinter) {
      setTestResult({
        success: false,
        message: 'Please select a printer first.'
      });
      return;
    }

    setIsLoading(true);
    setTestResult(null);

    try {
      console.log('Sending test print to:', selectedPrinter);
      const result = await window.electronAPI.printTest(selectedPrinter);
      console.log('Print result:', result);
      
      if (result.success) {
        setTestResult({
          success: true,
          message: 'Test print sent successfully! Check your printer for output.'
        });
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Print test failed. Please check your printer connection and try again.'
        });
      }
    } catch (error) {
      console.error('Error testing print:', error);
      setTestResult({
        success: false,
        message: 'An error occurred while testing the printer.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowPreview = async () => {
    if (!selectedPrinter) {
      setTestResult({
        success: false,
        message: 'Please select a printer first.'
      });
      return;
    }

    try {
      await window.electronAPI.showPrintPreview(selectedPrinter);
      setTestResult({
        success: true,
        message: 'Print preview opened. This shows what will be printed.'
      });
    } catch (error) {
      console.error('Error showing preview:', error);
      setTestResult({
        success: false,
        message: 'Error showing print preview.'
      });
    }
  };

  useEffect(() => {
    loadPrinters();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <TestTube className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Printer Test</h1>
          <p className="text-muted-foreground">Test your printer connection and functionality</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Available Printers
          </CardTitle>
          <CardDescription>
            Select a printer and test its functionality by printing "Hello World"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Refresh Button */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Found {printers.length} printer{printers.length !== 1 ? 's' : ''}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadPrinters}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Printer Selection */}
          <div className="space-y-2">
            <label htmlFor="printer-select" className="text-sm font-medium">
              Select Printer:
            </label>
            <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a printer..." />
              </SelectTrigger>
              <SelectContent>
                {printers.map((printer) => (
                  <SelectItem key={printer.name} value={printer.name}>
                    <div className="flex items-center gap-2">
                      <Printer className="h-4 w-4" />
                      <div>
                        <div className="font-medium">
                          {printer.displayName || printer.name}
                          {printer.isDefault && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                              Default
                            </span>
                          )}
                        </div>
                        {printer.description && (
                          <div className="text-xs text-muted-foreground">
                            {printer.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Printer Details */}
          {selectedPrinter && (
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Selected Printer Details:</h4>
              {(() => {
                const printer = printers.find(p => p.name === selectedPrinter);
                if (!printer) return null;
                
                return (
                  <div className="space-y-1 text-sm">
                    <div><strong>Name:</strong> {printer.displayName || printer.name}</div>
                    <div><strong>System Name:</strong> {printer.name}</div>
                    {printer.description && (
                      <div><strong>Description:</strong> {printer.description}</div>
                    )}
                    <div><strong>Status:</strong> {printer.status === 0 ? 'Ready' : `Status: ${printer.status}`}</div>
                    <div><strong>Default:</strong> {printer.isDefault ? 'Yes' : 'No'}</div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Test Buttons */}
          <div className="flex gap-4">
            <Button
              onClick={handleTestPrint}
              disabled={!selectedPrinter || isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Print "Hello World"
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleShowPreview}
              disabled={!selectedPrinter}
            >
              Preview
            </Button>
          </div>

          {/* Test Result */}
          {testResult && (
            <Alert className={testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
              {testResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={testResult.success ? 'text-green-800' : 'text-red-800'}>
                {testResult.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Instructions */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2">Test Instructions:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Make sure your printer is connected and powered on</li>
              <li>• Select a printer from the dropdown above</li>
              <li>• Click "Test Print" to send a "Hello World" test page</li>
              <li>• Check your printer for the test output</li>
              <li>• If the test fails, check printer connections and try again</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
