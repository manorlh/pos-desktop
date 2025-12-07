import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { useI18n } from '@/i18n';
import { formatCurrency } from '@/lib/utils';
import type { TradingDay } from '@/types/index';

interface ZReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradingDay: TradingDay | null;
}

export function ZReportDialog({ open, onOpenChange, tradingDay }: ZReportDialogProps) {
  const { t, locale } = useI18n();

  // Show dialog even if zReportData is missing (for debugging)
  if (!tradingDay) {
    return null;
  }

  // If zReportData is missing, show a message
  if (!tradingDay.zReportData) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('tradingDay.zReportTitle')}</DialogTitle>
            <DialogDescription>
              {tradingDay.dayDate ? new Date(tradingDay.dayDate).toLocaleDateString(locale) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground">
              Z-Report data is not available for this trading day.
            </p>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => onOpenChange(false)}>
                {t('common.close')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const zReport = tradingDay.zReportData;
  const discrepancy = zReport.discrepancy || 0;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('tradingDay.zReportTitle')}</DialogTitle>
          <DialogDescription>
            {formatDate(tradingDay.dayDate)}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Header Information */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t('tradingDay.openedAt')}:</span>
              <div className="font-medium">
                {formatDate(tradingDay.openedAt)} {formatTime(tradingDay.openedAt)}
              </div>
            </div>
            {tradingDay.closedAt && (
              <div>
                <span className="text-muted-foreground">{t('tradingDay.closedAt')}:</span>
                <div className="font-medium">
                  {formatDate(tradingDay.closedAt)} {formatTime(tradingDay.closedAt)}
                </div>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">{t('tradingDay.openedBy')}:</span>
              <div className="font-medium">{tradingDay.openedBy.name}</div>
            </div>
            {tradingDay.closedBy && (
              <div>
                <span className="text-muted-foreground">{t('tradingDay.closedBy')}:</span>
                <div className="font-medium">{tradingDay.closedBy.name}</div>
              </div>
            )}
          </div>

          {/* Sales Summary */}
          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold text-lg">{t('tradingDay.zReport')}</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>{t('tradingDay.totalTransactions')}:</span>
                <span className="font-semibold">{zReport.totalTransactions}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('tradingDay.totalItems')}:</span>
                <span className="font-semibold">{zReport.totalItems}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('tradingDay.totalSales')}:</span>
                <span className="font-semibold">{formatCurrency(zReport.totalSales, locale)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('tradingDay.cashSales')}:</span>
                <span className="font-semibold">{formatCurrency(zReport.cashSales, locale)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('tradingDay.taxCollected')}:</span>
                <span className="font-semibold">{formatCurrency(zReport.taxCollected, locale)}</span>
              </div>
            </div>
          </div>

          {/* Cash Reconciliation */}
          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold text-lg">{t('tradingDay.zReport')} - {t('tradingDay.cashSales')}</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>{t('tradingDay.openingCash')}:</span>
                <span className="font-semibold">{formatCurrency(zReport.openingCash, locale)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('tradingDay.cashSales')}:</span>
                <span className="font-semibold">+{formatCurrency(zReport.cashSales, locale)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span>{t('tradingDay.expectedCash')}:</span>
                <span className="font-semibold">{formatCurrency(zReport.expectedCash, locale)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('tradingDay.actualCash')}:</span>
                <span className="font-semibold">{formatCurrency(zReport.actualCash, locale)}</span>
              </div>
              <div className={`flex justify-between border-t pt-2 font-bold text-lg ${discrepancy >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                <span>{t('tradingDay.discrepancy')}:</span>
                <span>
                  {discrepancy >= 0 ? '+' : ''}{formatCurrency(discrepancy, locale)}
                  {discrepancy > 0 && ` (${t('tradingDay.overage')})`}
                  {discrepancy < 0 && ` (${t('tradingDay.shortage')})`}
                  {discrepancy === 0 && ' (✓)'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={() => onOpenChange(false)}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

