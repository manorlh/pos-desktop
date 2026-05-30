import { useState, useRef, useEffect, useCallback } from 'react';
import { DollarSign, Check, X, Delete, CreditCard, AlertCircle } from 'lucide-react';
import { useCartStore } from '@/stores/useCartStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useProductStore } from '@/stores/useProductStore';
import { useTradingDayStore } from '@/stores/useTradingDayStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useBusinessStore } from '@/stores/useBusinessStore';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { buildReceiptPrintPayload } from '@/utils/receiptPrint';
import type { CartItem, Transaction } from '@/types';

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckoutDialog({ open, onOpenChange }: CheckoutDialogProps) {
  const [amountTendered, setAmountTendered] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'card'>('cash');
  const [lastChangeAmount, setLastChangeAmount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Pending card sale id (transaction id = Nayax vuid); cleared after complete/cancel */
  const pendingCardTransactionIdRef = useRef<string | null>(null);
  
  const { cart, clearCart } = useCartStore();
  const {
    addTransaction,
    createPendingCardTransaction,
    completePendingCardTransaction,
    cancelPendingTransaction,
  } = useTransactionStore();
  const { loadProducts, categories } = useProductStore();
  const { isDayOpen } = useTradingDayStore();
  const { loadSettings, globalTaxRate, language } = useSettingsStore();
  const { businessInfo } = useBusinessStore();
  const { t, locale } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  /** Set after pending row exists; used for Nayax abort + cancel button visibility */
  const [activeCardVuid, setActiveCardVuid] = useState<string | null>(null);

  const canUseCardPayment =
    typeof window !== 'undefined' &&
    Boolean(window.electronAPI?.nayaxDoTransaction);
  const canAbortCardPayment =
    typeof window !== 'undefined' &&
    Boolean(window.electronAPI?.nayaxAbortTransaction);

  const changeAmount = Math.max(0, parseFloat(amountTendered || '0') - cart.totalAmount);
  const canCompleteCash = parseFloat(amountTendered || '0') >= cart.totalAmount;
  const amountAgorot = Math.round(cart.totalAmount * 100);
  const canCompleteCard =
    isDayOpen && amountAgorot >= 1 && cart.totalAmount > 0;

  useEffect(() => {
    if (!canUseCardPayment && paymentMode === 'card') {
      setPaymentMode('cash');
    }
  }, [canUseCardPayment, paymentMode]);

  useEffect(() => {
    if (open) {
      void loadSettings();
    }
  }, [open, loadSettings]);

  // Auto-open keyboard when dialog opens
  useEffect(() => {
    if (open) {
      setShowKeyboard(true);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setShowKeyboard(false);
    }
  }, [open]);

  const handleKeyPress = (key: string) => {
    if (key === 'backspace') {
      setAmountTendered(prev => prev.slice(0, -1));
    } else if (key === 'clear') {
      setAmountTendered('');
    } else if (key === '.') {
      if (!amountTendered.includes('.')) {
        setAmountTendered(prev => prev + '.');
      }
    } else if (key >= '0' && key <= '9') {
      setAmountTendered(prev => prev + key);
    }
  };

  const handleQuickAmount = (amount: number) => {
    const quickAmount = (parseFloat(amountTendered || '0') + amount).toFixed(2);
    setAmountTendered(quickAmount);
  };

  // Compact numeric keyboard layout
  const numericKeys = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['.', '0', 'backspace']
  ];

  const printReceiptAfterSale = useCallback(
    async (tx: Transaction): Promise<string | null> => {
      if (!window.electronAPI?.printReceipt) {
        return t('receipt.printFailed');
      }
      try {
        const payload = buildReceiptPrintPayload(
          tx,
          businessInfo,
          globalTaxRate,
          language,
          categories,
        );
        const result = await window.electronAPI.printReceipt(payload);
        if (!result.success) {
          return result.error || t('receipt.printFailed');
        }
        return null;
      } catch (e: unknown) {
        return e instanceof Error ? e.message : t('receipt.printFailed');
      }
    },
    [businessInfo, categories, globalTaxRate, language, t],
  );

  const finishSuccessfulCheckout = useCallback(
    (receiptPrintError: string | null) => {
      setPrintError(receiptPrintError);
      setIsComplete(true);

      const closeDelayMs = receiptPrintError ? 5000 : 2000;
      setTimeout(() => {
        clearCart();
        setIsComplete(false);
        setAmountTendered('');
        setError(null);
        setPrintError(null);
        setPaymentMode('cash');
        setLastChangeAmount(0);
        onOpenChange(false);
      }, closeDelayMs);
    },
    [clearCart, onOpenChange],
  );

  const handleCompleteTransaction = async () => {
    if (!canCompleteCash) return;

    if (!isDayOpen) {
      setError(t('tradingDay.cannotProcessTransaction'));
      return;
    }

    setIsProcessing(true);
    setError(null);
    
    try {
      const amountTenderedNum = parseFloat(amountTendered);
      
      setLastChangeAmount(changeAmount);
      const tx = await addTransaction(cart, {
        mode: 'cash',
        amountTendered: amountTenderedNum,
        changeAmount: changeAmount,
      });

      await loadProducts();

      const receiptPrintError = await printReceiptAfterSale(tx);
      finishSuccessfulCheckout(receiptPrintError);
    } catch (error: unknown) {
      console.error('Transaction failed:', error);
      const msg = error instanceof Error ? error.message : t('tradingDay.cannotProcessTransaction');
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const cancelPendingCardIfAny = async () => {
    const id = pendingCardTransactionIdRef.current;
    if (!id) return;
    pendingCardTransactionIdRef.current = null;
    try {
      await cancelPendingTransaction(id);
    } catch (e) {
      console.error('cancelPendingCardIfAny:', e);
    }
  };

  const handleAbortCardPayment = () => {
    const vuid = activeCardVuid || pendingCardTransactionIdRef.current;
    if (!vuid || !window.electronAPI?.nayaxAbortTransaction) return;
    void window.electronAPI.nayaxAbortTransaction({ vuid }).catch((e) => {
      console.error('nayaxAbortTransaction:', e);
    });
  };

  const handleCompleteCard = async () => {
    if (!canCompleteCard) return;

    if (!window.electronAPI?.nayaxDoTransaction) {
      setError(t('checkout.nayaxNotConfigured'));
      return;
    }

    setIsProcessing(true);
    setError(null);

    let pendingId: string | null = null;
    let approvalSucceeded = false;

    try {
      const pending = await createPendingCardTransaction(cart);
      pendingId = pending.id;
      pendingCardTransactionIdRef.current = pending.id;
      setActiveCardVuid(pending.id);

      const res = await window.electronAPI.nayaxDoTransaction({
        amountAgorot,
        vuid: pending.id,
      });

      if (!res.approved) {
        pendingCardTransactionIdRef.current = null;
        await cancelPendingTransaction(pending.id);
        pendingId = null;

        let msg = res.statusMessage || res.error || t('checkout.nayaxDeclined');
        if (res.outcome === 'cancelled') {
          msg = res.statusMessage || res.error || t('checkout.nayaxCancelled');
        } else if (res.outcome === 'network_error') {
          msg = res.error || t('checkout.nayaxNetworkError');
        }
        setError(msg);
        return;
      }

      approvalSucceeded = true;

      const nayaxMeta = JSON.stringify({
        vuid: res.vuid,
        result: res.result,
        outcome: res.outcome,
        statusCode: res.statusCode,
      });
      setLastChangeAmount(0);
      const tx = await completePendingCardTransaction(pending.id, nayaxMeta);

      pendingCardTransactionIdRef.current = null;
      pendingId = null;

      await loadProducts();

      const receiptPrintError = await printReceiptAfterSale(tx);
      finishSuccessfulCheckout(receiptPrintError);
    } catch (error: unknown) {
      console.error('Card transaction failed:', error);
      if (pendingId && !approvalSucceeded) {
        pendingCardTransactionIdRef.current = null;
        try {
          await cancelPendingTransaction(pendingId);
        } catch {
          /* ignore */
        }
      } else {
        pendingCardTransactionIdRef.current = null;
      }
      const msg = error instanceof Error ? error.message : t('checkout.nayaxDeclined');
      setError(msg);
    } finally {
      setIsProcessing(false);
      setActiveCardVuid(null);
    }
  };

  const resetDialog = () => {
    setAmountTendered('');
    setIsComplete(false);
    setIsProcessing(false);
    setError(null);
    setPaymentMode('cash');
    setLastChangeAmount(0);
    setActiveCardVuid(null);
    setPrintError(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      void cancelPendingCardIfAny();
      resetDialog();
    }
    onOpenChange(open);
  };

  if (isComplete) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <DialogTitle className="text-xl mb-2">{t('checkout.transactionComplete')}</DialogTitle>
            <DialogDescription>
              {t('checkout.processing')}
              {lastChangeAmount > 0 && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <div className="text-lg font-bold">
                    {t('checkout.changeDue')}: {formatCurrency(lastChangeAmount, locale)}
                  </div>
                </div>
              )}
            </DialogDescription>

            {printError && (
              <Alert variant="destructive" className="mt-4 text-right">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t('receipt.printFailedTitle')}</AlertTitle>
                <AlertDescription>
                  <p>{t('receipt.printFailed')}</p>
                  <p className="text-xs mt-1 opacity-90">
                    {t('receipt.printFailedDetail', { reason: printError })}
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-3 py-2 lg:px-4 lg:py-3 border-b flex-shrink-0">
          <DialogTitle className="text-lg lg:text-xl">{t('checkout.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-2 lg:gap-4 p-3 lg:p-4 flex-1 min-h-0 overflow-hidden">
          {/* Order summary — item list scrolls when needed */}
          <Card className="flex flex-col min-h-0 overflow-hidden shrink-0 lg:shrink lg:h-full">
            <CardContent className="p-2 lg:p-3 flex flex-col min-h-0 overflow-hidden h-full">
              <h3 className="font-semibold text-sm mb-1 flex-shrink-0">{t('pos.currentSale')}</h3>
              <div className="space-y-0.5 overflow-y-auto min-h-0 max-h-16 lg:max-h-none lg:flex-1">
                {cart.items.map((item: CartItem) => (
                  <div key={item.id} className="flex justify-between items-center text-sm py-0.5 border-b border-border/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{item.product.name}</span>
                      <span className="text-muted-foreground ml-2">× {item.quantity}</span>
                    </div>
                    <span className="font-semibold shrink-0 ms-2">{formatCurrency(item.totalPrice, locale)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t pt-1.5 mt-1.5 space-y-0.5 flex-shrink-0">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t('pos.subtotal')}:</span>
                  <span>{formatCurrency(cart.subtotal, locale)}</span>
                </div>
                {cart.discountAmount > 0 && (
                  <div className="flex justify-between text-xs text-destructive">
                    <span>{t('pos.discount')}:</span>
                    <span>-{formatCurrency(cart.discountAmount, locale)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t('pos.tax')}:</span>
                  <span>{formatCurrency(cart.taxAmount, locale)}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t">
                  <span className="text-sm font-bold">{t('pos.total')}:</span>
                  <span className="text-base lg:text-lg font-bold text-primary">{formatCurrency(cart.totalAmount, locale)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment section — keypad fills middle; complete button lives in footer */}
          <Card className="flex flex-col min-h-0 overflow-hidden lg:h-full">
            <CardContent className="p-2 lg:p-3 flex flex-col min-h-0 overflow-hidden h-full gap-1.5 lg:gap-2">
              <h3 className="font-semibold text-sm flex items-center gap-2 flex-shrink-0">
                {paymentMode === 'card' ? (
                  <CreditCard className="h-4 w-4 text-primary" />
                ) : (
                  <DollarSign className="h-4 w-4 text-primary" />
                )}
                {t('checkout.paymentMethod')}: {paymentMode === 'card' ? t('checkout.card') : t('checkout.cash')}
              </h3>

              {canUseCardPayment && (
                <div className="flex gap-2 flex-shrink-0" role="tablist" aria-label={t('checkout.paymentMethod')}>
                  <Button
                    type="button"
                    variant={paymentMode === 'cash' ? 'default' : 'outline'}
                    className="flex-1 h-8 lg:h-9 text-sm"
                    onClick={() => {
                      setPaymentMode('cash');
                      setError(null);
                    }}
                  >
                    <DollarSign className="mr-1.5 h-4 w-4 shrink-0" />
                    {t('checkout.cash')}
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMode === 'card' ? 'default' : 'outline'}
                    className="flex-1 h-8 lg:h-9 text-sm"
                    onClick={() => {
                      setPaymentMode('card');
                      setError(null);
                    }}
                  >
                    <CreditCard className="mr-1.5 h-4 w-4 shrink-0" />
                    {t('checkout.card')}
                  </Button>
                </div>
              )}

              {paymentMode === 'cash' && (
                <>
                  <div className="flex-shrink-0 flex flex-wrap items-end gap-2">
                    <div className="w-auto max-w-[8.5rem]">
                      <label className="text-xs font-medium mb-0.5 block">{t('checkout.amountTendered')}</label>
                      <div className="relative">
                        <Input
                          ref={inputRef}
                          type="number"
                          step="0.01"
                          value={amountTendered}
                          onChange={(e) => setAmountTendered(e.target.value)}
                          placeholder="0.00"
                          className="text-sm font-semibold h-8 text-center pr-7"
                          autoFocus
                          showVirtualKeyboard={false}
                        />
                        {amountTendered && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6"
                            onClick={() => setAmountTendered('')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-1 gap-1 min-w-0">
                      {[20, 50, 100, 200].map((amount) => (
                        <Button
                          key={amount}
                          variant="outline"
                          size="sm"
                          onClick={() => handleQuickAmount(amount)}
                          className="text-xs h-8 flex-1 px-1"
                        >
                          +{amount}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {(changeAmount > 0 ||
                    (parseFloat(amountTendered || '0') > 0 &&
                      parseFloat(amountTendered || '0') < cart.totalAmount)) && (
                    <div className="flex-shrink-0">
                      {changeAmount > 0 ? (
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-green-500/10 rounded-md border border-green-500/20">
                          <span className="text-xs font-medium text-green-800 dark:text-green-400">
                            {t('checkout.changeDue')}
                          </span>
                          <span className="text-sm font-bold text-green-600 shrink-0">
                            {formatCurrency(changeAmount, locale)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-destructive/10 rounded-md border border-destructive/20">
                          <span className="text-xs font-medium text-destructive">
                            {t('checkout.insufficientAmount')}
                          </span>
                          <span className="text-xs font-bold text-destructive shrink-0">
                            {formatCurrency(
                              cart.totalAmount - parseFloat(amountTendered || '0'),
                              locale,
                            )}{' '}
                            {t('checkout.more')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {showKeyboard && (
                    <div className="flex-1 min-h-0 flex flex-col">
                      <div className="grid grid-rows-4 flex-1 min-h-0 gap-1 bg-muted/50 p-1.5 rounded-lg">
                        {numericKeys.map((row, rowIndex) => (
                          <div key={rowIndex} className="grid grid-cols-3 gap-1 min-h-0">
                            {row.map((key) => (
                              <Button
                                key={key}
                                variant={key === 'backspace' ? 'destructive' : 'secondary'}
                                size="lg"
                                className="h-full min-h-[2rem] max-h-12 lg:max-h-14 w-full p-0 text-base lg:text-lg font-semibold"
                                onClick={() => handleKeyPress(key)}
                              >
                                {key === 'backspace' ? (
                                  <Delete className="h-4 w-4 lg:h-5 lg:w-5" />
                                ) : (
                                  key
                                )}
                              </Button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {paymentMode === 'card' && (
                <div className="flex flex-col flex-1 min-h-0">
                  <p className="text-xs text-muted-foreground flex-shrink-0">
                    {t('checkout.cardPaymentHint')}
                  </p>
                  {amountAgorot < 1 && (
                    <div className="mt-2 p-2 bg-destructive/10 text-destructive rounded-lg text-xs border border-destructive/20">
                      {t('errors.invalidNumber')}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pinned footer — always visible */}
        <div className="flex-shrink-0 border-t px-3 py-2 lg:px-4 lg:py-3 bg-background space-y-2">
          {error && (
            <div className="p-2 bg-destructive/10 text-destructive rounded-lg text-xs border border-destructive/20">
              {error}
            </div>
          )}

          {!isDayOpen && (
            <div className="p-2 bg-destructive/10 text-destructive rounded-lg text-xs border border-destructive/20">
              {t('tradingDay.cannotProcessTransaction')}
            </div>
          )}

          {paymentMode === 'cash' && (
            <Button
              className="w-full h-10 lg:h-11 text-sm lg:text-base font-bold"
              size="lg"
              disabled={!canCompleteCash || isProcessing}
              onClick={handleCompleteTransaction}
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  {t('checkout.processing')}
                </div>
              ) : (
                <>
                  <Check className="mr-2 h-5 w-5" />
                  {t('checkout.completeSale')}
                </>
              )}
            </Button>
          )}

          {paymentMode === 'card' && (
            <div className="flex flex-col gap-2">
              <Button
                className="w-full h-10 lg:h-11 text-sm lg:text-base font-bold"
                size="lg"
                disabled={!canCompleteCard || isProcessing}
                onClick={handleCompleteCard}
              >
                {isProcessing ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    {t('checkout.waitingForCard')}
                  </div>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-5 w-5" />
                    {t('checkout.payWithCard')}
                  </>
                )}
              </Button>
              {canAbortCardPayment &&
                isProcessing &&
                activeCardVuid &&
                canCompleteCard && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-9 text-sm border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={handleAbortCardPayment}
                  >
                    {t('checkout.cancelCardPayment')}
                  </Button>
                )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
