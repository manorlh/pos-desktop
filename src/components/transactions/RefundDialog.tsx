import { useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useI18n } from '@/i18n';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { formatCurrency } from '@/lib/utils';
import type { Transaction } from '@/types/index';

interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  onSuccess?: () => void;
}

export function RefundDialog({ open, onOpenChange, transaction, onSuccess }: RefundDialogProps) {
  const { t } = useI18n();
  const createRefundTransaction = useTransactionStore((s) => s.createRefundTransaction);
  const [fullRefund, setFullRefund] = useState(true);
  const [partialQuantities, setPartialQuantities] = useState<Record<string, number>>({});
  const [amountReturned, setAmountReturned] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && transaction) {
      setFullRefund(true);
      setAmountReturned(transaction.cart.totalAmount.toFixed(2));
      const initial: Record<string, number> = {};
      transaction.cart.items.forEach((item) => {
        initial[item.id] = item.quantity;
      });
      setPartialQuantities(initial);
      setError(null);
    }
  }, [open, transaction]);

  const handlePartialQtyChange = (itemId: string, maxQty: number, value: string) => {
    const num = Math.max(0, Math.min(maxQty, parseInt(value, 10) || 0));
    setPartialQuantities((prev) => {
      const next = { ...prev, [itemId]: num };
      if (transaction && !fullRefund) {
        const total = transaction.cart.items.reduce((sum, item) => {
          const qty = next[item.id] ?? item.quantity;
          const ratio = item.quantity > 0 ? qty / item.quantity : 0;
          const lineTotal = item.unitPrice * qty - (item.lineDiscount || 0) * ratio;
          return sum + lineTotal;
        }, 0);
        setAmountReturned(total.toFixed(2));
      }
      return next;
    });
  };

  const getPartialTotal = () => {
    if (!transaction) return 0;
    return transaction.cart.items.reduce((sum, item) => {
      const qty = fullRefund ? item.quantity : (partialQuantities[item.id] ?? 0);
      const ratio = item.quantity > 0 ? qty / item.quantity : 0;
      const lineTotal = item.unitPrice * qty - (item.lineDiscount || 0) * ratio;
      return sum + lineTotal;
    }, 0);
  };

  const handleSubmit = async () => {
    if (!transaction) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const amount = parseFloat(amountReturned);
      if (fullRefund) {
        await createRefundTransaction(transaction, {
          fullRefund: true,
          amountReturned: isNaN(amount) ? undefined : amount,
        });
      } else {
        const partialItems = transaction.cart.items
          .map((item) => ({
            itemId: item.id,
            quantity: partialQuantities[item.id] ?? 0,
          }))
          .filter((p) => p.quantity > 0);
        if (partialItems.length === 0) {
          setError('Select at least one item to refund');
          setIsSubmitting(false);
          return;
        }
        await createRefundTransaction(transaction, {
          fullRefund: false,
          partialItems,
          amountReturned: isNaN(amount) ? undefined : amount,
        });
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'Refund failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!transaction) return null;

  const canRefund = !transaction.refundOfTransactionId && transaction.status === 'completed';
  const isAlreadyRefunded = transaction.status === 'refunded' || transaction.status === 'partial_refund';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            {t('transactions.refund')}
          </DialogTitle>
          <DialogDescription>
            {t('transactions.selectItemsToRefund')} #{transaction.transactionNumber}
          </DialogDescription>
        </DialogHeader>

        {!canRefund && isAlreadyRefunded ? (
          <p className="text-sm text-muted-foreground">
            {t('transactions.refunded')}
          </p>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex gap-4">
              <Button
                type="button"
                variant={fullRefund ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFullRefund(true)}
              >
                {t('transactions.refundFull')}
              </Button>
              <Button
                type="button"
                variant={!fullRefund ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFullRefund(false)}
              >
                {t('transactions.refundPartial')}
              </Button>
            </div>

            {!fullRefund && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                <Label>{t('transactions.items')}</Label>
                {transaction.cart.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate flex-1">{item.product.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number"
                        min={0}
                        max={item.quantity}
                        className="w-16 h-8 text-center"
                        value={partialQuantities[item.id] ?? item.quantity}
                        onChange={(e) => handlePartialQtyChange(item.id, item.quantity, e.target.value)}
                      />
                      <span className="text-muted-foreground">/ {item.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount-returned">{t('transactions.amountReturned')}</Label>
              <Input
                id="amount-returned"
                type="number"
                step="0.01"
                min="0"
                value={amountReturned}
                onChange={(e) => setAmountReturned(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {formatCurrency(fullRefund ? transaction.cart.totalAmount : getPartialTotal())} (
                {fullRefund ? t('transactions.refundFull') : t('transactions.refundPartial')})
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        {canRefund && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? t('common.loading') : t('transactions.refund')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
