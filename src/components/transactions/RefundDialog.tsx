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
import { useProductStore } from '@/stores/useProductStore';
import { useBusinessStore } from '@/stores/useBusinessStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { formatCurrency } from '@/lib/utils';
import { buildReceiptPrintPayload } from '@/utils/receiptPrint';
import { printReceiptForTransaction } from '@/utils/printReceipt';
import {
  computeRemainingRefundTotal,
  getRemainingQtyByOriginalItem,
} from '@/utils/refundHelpers';
import type { Transaction } from '@/types/index';

interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  onSuccess?: (refundTx?: Transaction) => void;
}

export function RefundDialog({ open, onOpenChange, transaction, onSuccess }: RefundDialogProps) {
  const { t } = useI18n();
  const createRefundTransaction = useTransactionStore((s) => s.createRefundTransaction);
  const loadRefundsForOriginal = useTransactionStore((s) => s.loadRefundsForOriginal);
  const { categories } = useProductStore();
  const { businessInfo } = useBusinessStore();
  const { globalTaxRate, language } = useSettingsStore();
  const [fullRefund, setFullRefund] = useState(true);
  const [partialQuantities, setPartialQuantities] = useState<Record<string, number>>({});
  const [remainingQty, setRemainingQty] = useState<Record<string, number>>({});
  const [amountReturned, setAmountReturned] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !transaction) return;

    let cancelled = false;
    void (async () => {
      const priorRefunds = await loadRefundsForOriginal(transaction.id);
      if (cancelled) return;
      const remaining = getRemainingQtyByOriginalItem(transaction, priorRefunds);
      setRemainingQty(remaining);
      setFullRefund(true);
      const totalRemaining = computeRemainingRefundTotal(transaction, remaining);
      setAmountReturned(totalRemaining.toFixed(2));
      const initial: Record<string, number> = {};
      transaction.cart.items.forEach((item) => {
        initial[item.id] = remaining[item.id] ?? 0;
      });
      setPartialQuantities(initial);
      setError(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, transaction, loadRefundsForOriginal]);

  const handlePartialQtyChange = (itemId: string, maxQty: number, value: string) => {
    const num = Math.max(0, Math.min(maxQty, parseInt(value, 10) || 0));
    setPartialQuantities((prev) => {
      const next = { ...prev, [itemId]: num };
      if (transaction && !fullRefund) {
        const total = transaction.cart.items.reduce((sum, item) => {
          const qty = next[item.id] ?? 0;
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
      const qty = fullRefund ? (remainingQty[item.id] ?? 0) : (partialQuantities[item.id] ?? 0);
      const ratio = item.quantity > 0 ? qty / item.quantity : 0;
      const lineTotal = item.unitPrice * qty - (item.lineDiscount || 0) * ratio;
      return sum + lineTotal;
    }, 0);
  };

  const printRefundReceipt = async (refundTx: Transaction, original: Transaction) => {
    if (!window.electronAPI?.printReceipt || !businessInfo) return;
    const payload = buildReceiptPrintPayload(
      refundTx,
      businessInfo,
      globalTaxRate,
      language,
      categories,
      { originalDocNumber: original.transactionNumber },
    );
    const { receiptError, drawerWarning } = await printReceiptForTransaction(payload, refundTx, t);
    if (receiptError) {
      console.error('Refund receipt print failed:', receiptError);
    }
    if (drawerWarning) {
      console.warn('Refund drawer warning:', drawerWarning);
      setError(drawerWarning);
    }
  };

  const handleSubmit = async () => {
    if (!transaction) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const amount = parseFloat(amountReturned);
      let refundTx: Transaction;
      if (fullRefund) {
        refundTx = await createRefundTransaction(transaction, {
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
          setError(t('refund.selectAtLeastOne'));
          setIsSubmitting(false);
          return;
        }
        refundTx = await createRefundTransaction(transaction, {
          fullRefund: false,
          partialItems,
          amountReturned: isNaN(amount) ? undefined : amount,
        });
      }
      try {
        await printRefundReceipt(refundTx, transaction);
      } catch (printErr) {
        console.error('Refund receipt print failed:', printErr);
      }
      onSuccess?.(refundTx);
      onOpenChange(false);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : 'Refund failed';
      const translated =
        raw === 'refund.cross-day-not-supported'
          ? t('refund.crossDayNotSupported')
          : raw === 'refund.nothing-remaining'
            ? t('refund.nothingRemaining')
            : raw === 'refund.card-missing-original-txn'
              ? t('refund.cardMissingOriginalTxn')
              : raw === 'refund.card-not-configured'
                ? t('refund.cardNotConfigured')
                : raw === 'refund.card-declined' || raw.includes('Declined')
                  ? t('refund.cardDeclined')
                  : raw;
      setError(translated);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!transaction) return null;

  const canRefund =
    !transaction.refundOfTransactionId &&
    (transaction.status === 'completed' || transaction.status === 'partial_refund');

  const hasAnyRemaining = Object.values(remainingQty).some((q) => q > 0);
  const showRefundForm = canRefund && hasAnyRemaining;

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
            {transaction.paymentMethod === 'card' ? ` · ${t('transactions.card')}` : ''}
          </DialogDescription>
        </DialogHeader>

        {!showRefundForm ? (
          <p className="text-sm text-muted-foreground">
            {transaction.status === 'refunded' || !hasAnyRemaining
              ? t('transactions.refunded')
              : t('transactions.refund')}
          </p>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex gap-4">
              <Button
                type="button"
                variant={fullRefund ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setFullRefund(true);
                  setAmountReturned(getPartialTotal().toFixed(2));
                }}
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
                {transaction.cart.items.map((item) => {
                  const maxQty = remainingQty[item.id] ?? 0;
                  if (maxQty <= 0) return null;
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate flex-1">{item.product.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          max={maxQty}
                          className="w-16 h-8 text-center"
                          value={partialQuantities[item.id] ?? 0}
                          onChange={(e) => handlePartialQtyChange(item.id, maxQty, e.target.value)}
                        />
                        <span className="text-muted-foreground">/ {maxQty}</span>
                      </div>
                    </div>
                  );
                })}
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
                {formatCurrency(getPartialTotal())} (
                {fullRefund ? t('transactions.refundFull') : t('transactions.refundPartial')})
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {showRefundForm && (
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
