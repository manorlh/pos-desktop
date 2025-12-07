import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useTradingDayStore } from '@/stores/useTradingDayStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useI18n } from '@/i18n';
import { formatCurrency } from '@/lib/utils';
import type { TradingDay } from '@/types/index';
import { generateZReport } from '@/utils/zReportGenerator';

interface CloseDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: (closedDay: TradingDay) => void;
}

export function CloseDayDialog({ open, onOpenChange, onClose }: CloseDayDialogProps) {
  const { t, locale } = useI18n();
  const { currentTradingDay, closeDay, isDayOpen } = useTradingDayStore();
  const { currentUser, transactions } = useTransactionStore();
  const [closingCash, setClosingCash] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expectedCash, setExpectedCash] = useState<number>(0);
  const [discrepancy, setDiscrepancy] = useState<number>(0);

  useEffect(() => {
    if (open && currentTradingDay) {
      // Calculate expected cash from today's transactions
      const zReport = generateZReport(transactions, currentTradingDay.openingCash);
      setExpectedCash(zReport.expectedCash);
      
      // Update discrepancy when closing cash changes
      if (closingCash) {
        const actual = parseFloat(closingCash) || 0;
        setDiscrepancy(actual - zReport.expectedCash);
      } else {
        setDiscrepancy(0);
      }
    }
  }, [open, currentTradingDay, closingCash, transactions]);

  const handleClose = async () => {
    setError(null);
    
    if (!closingCash || parseFloat(closingCash) < 0) {
      setError(t('tradingDay.invalidCashAmount'));
      return;
    }

    if (!currentUser) {
      setError('No user logged in');
      return;
    }

    if (!isDayOpen || !currentTradingDay) {
      setError(t('tradingDay.noDayOpen'));
      return;
    }

    setIsLoading(true);
    try {
      // closeDay will fetch transactions internally, so we don't need to pass them
      const closedDay = await closeDay(parseFloat(closingCash), currentUser.id);
      setClosingCash('');
      // Close this dialog first
      onOpenChange(false);
      // Small delay to ensure dialog closes before opening Z-Report
      setTimeout(() => {
        onClose(closedDay);
      }, 100);
    } catch (err: any) {
      setError(err.message || 'Failed to close trading day');
      setIsLoading(false);
    }
  };

  if (!currentTradingDay) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('tradingDay.closeDay')}</DialogTitle>
          <DialogDescription>
            {t('tradingDay.confirmClose')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('tradingDay.openingCash')}</Label>
            <div className="text-lg font-semibold">
              {formatCurrency(currentTradingDay.openingCash, locale)}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('tradingDay.expectedCash')}</Label>
            <div className="text-lg font-semibold">
              {formatCurrency(expectedCash, locale)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('tradingDay.openingCash')} + {t('tradingDay.cashSales')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="closingCash">{t('tradingDay.declareCash')}</Label>
            <Input
              id="closingCash"
              type="number"
              step="0.01"
              min="0"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              placeholder="0.00"
              disabled={isLoading}
              autoFocus
            />
          </div>

          {closingCash && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <div className="flex justify-between">
                <span>{t('tradingDay.expectedCash')}:</span>
                <span className="font-semibold">{formatCurrency(expectedCash, locale)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('tradingDay.actualCash')}:</span>
                <span className="font-semibold">{formatCurrency(parseFloat(closingCash) || 0, locale)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span>{t('tradingDay.discrepancy')}:</span>
                <span className={`font-bold ${discrepancy >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {discrepancy >= 0 ? '+' : ''}{formatCurrency(discrepancy, locale)}
                  {discrepancy > 0 && ` (${t('tradingDay.overage')})`}
                  {discrepancy < 0 && ` (${t('tradingDay.shortage')})`}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setClosingCash('');
                setError(null);
                onOpenChange(false);
              }}
              disabled={isLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleClose}
              disabled={isLoading || !closingCash}
            >
              {isLoading ? t('common.loading') : t('tradingDay.confirmClose')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

