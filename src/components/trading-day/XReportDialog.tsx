import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { useI18n } from '@/i18n';
import { formatCurrency } from '@/lib/utils';
import { useTradingDayStore } from '@/stores/useTradingDayStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { generateZReport } from '@/utils/zReportGenerator';

interface XReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * X-Report: a read-only mid-shift snapshot of the currently open trading day.
 * Reuses the Z-report math but has NO side effects — the day stays open, nothing
 * is synced or purged, and totals are not reset (unlike the Z-close flow).
 */
export function XReportDialog({ open, onOpenChange }: XReportDialogProps) {
  const { t, locale } = useI18n();
  const { currentTradingDay, isDayOpen } = useTradingDayStore();
  const transactions = useTransactionStore((s) => s.transactions);

  const report = useMemo(() => {
    if (!currentTradingDay || !isDayOpen) return null;
    return generateZReport(transactions, currentTradingDay.openingCash);
  }, [currentTradingDay, isDayOpen, transactions]);

  const formatDateTime = (date: Date) =>
    `${date.toLocaleDateString(locale)} ${date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    })}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('tradingDay.xReportTitle')}</DialogTitle>
          <DialogDescription>{t('tradingDay.xReportSubtitle')}</DialogDescription>
        </DialogHeader>

        {!report || !currentTradingDay ? (
          <div className="py-6">
            <p className="text-muted-foreground">{t('tradingDay.xReportNoDayOpen')}</p>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Header */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">{t('tradingDay.openedAt')}:</span>
                <div className="font-medium">{formatDateTime(currentTradingDay.openedAt)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('tradingDay.openedBy')}:</span>
                <div className="font-medium">{currentTradingDay.openedBy.name}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('tradingDay.generatedAt')}:</span>
                <div className="font-medium">{formatDateTime(new Date())}</div>
              </div>
            </div>

            {/* Sales Summary */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="font-semibold text-lg">{t('tradingDay.xReport')}</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>{t('tradingDay.totalTransactions')}:</span>
                  <span className="font-semibold">{report.totalTransactions}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('tradingDay.totalItems')}:</span>
                  <span className="font-semibold">{report.totalItems}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('tradingDay.totalSales')}:</span>
                  <span className="font-semibold">{formatCurrency(report.totalSales, locale)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('tradingDay.cashSales')}:</span>
                  <span className="font-semibold">{formatCurrency(report.cashSales, locale)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('tradingDay.taxCollected')}:</span>
                  <span className="font-semibold">{formatCurrency(report.taxCollected, locale)}</span>
                </div>
                {report.totalTips > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span>{t('tradingDay.totalTips')}:</span>
                      <span className="font-semibold">{formatCurrency(report.totalTips, locale)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t('tradingDay.cashTips')}:</span>
                      <span>{formatCurrency(report.cashTips, locale)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t('tradingDay.cardTips')}:</span>
                      <span>{formatCurrency(report.cardTips, locale)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Cash position (no reconciliation — read-only) */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="font-semibold text-lg">{t('tradingDay.zReport')} - {t('tradingDay.cashSales')}</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>{t('tradingDay.openingCash')}:</span>
                  <span className="font-semibold">{formatCurrency(report.openingCash, locale)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('tradingDay.cashSales')}:</span>
                  <span className="font-semibold">+{formatCurrency(report.cashSales, locale)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>{t('tradingDay.currentExpectedCash')}:</span>
                  <span>{formatCurrency(report.expectedCash, locale)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
