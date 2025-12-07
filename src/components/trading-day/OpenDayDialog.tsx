import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useTradingDayStore } from '@/stores/useTradingDayStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useI18n } from '@/i18n';
import { formatCurrency } from '@/lib/utils';

interface OpenDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OpenDayDialog({ open, onOpenChange }: OpenDayDialogProps) {
  const { t, locale } = useI18n();
  const { openDay, isDayOpen } = useTradingDayStore();
  const { currentUser } = useTransactionStore();
  const [openingCash, setOpeningCash] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    setError(null);
    
    if (!openingCash || parseFloat(openingCash) < 0) {
      setError(t('tradingDay.invalidCashAmount'));
      return;
    }

    if (!currentUser) {
      setError('No user logged in');
      return;
    }

    if (isDayOpen) {
      setError(t('tradingDay.dayAlreadyOpen'));
      return;
    }

    setIsLoading(true);
    try {
      await openDay(parseFloat(openingCash), currentUser.id);
      setOpeningCash('');
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Failed to open trading day');
    } finally {
      setIsLoading(false);
    }
  };

  const currentDate = new Date().toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('tradingDay.openDay')}</DialogTitle>
          <DialogDescription>
            {t('tradingDay.confirmOpen')} - {currentDate}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="openingCash">{t('tradingDay.openingCash')}</Label>
            <Input
              id="openingCash"
              type="number"
              step="0.01"
              min="0"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="0.00"
              disabled={isLoading}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {t('tradingDay.openingCash')}: {openingCash ? formatCurrency(parseFloat(openingCash) || 0, locale) : formatCurrency(0, locale)}
            </p>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpeningCash('');
                setError(null);
                onOpenChange(false);
              }}
              disabled={isLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleOpen}
              disabled={isLoading || !openingCash}
            >
              {isLoading ? t('common.loading') : t('tradingDay.confirmOpen')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

