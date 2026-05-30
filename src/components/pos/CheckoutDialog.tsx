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
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 !overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <DialogTitle className="text-2xl">{t('checkout.title')}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[1.2fr_1fr] gap-6 p-6 flex-1 min-h-0 overflow-hidden">
          {/* Left Side - Order Summary */}
          <div className="flex flex-col min-h-0">
            <Card className="flex-1 flex flex-col min-h-0">
              <CardContent className="p-4 flex flex-col flex-1 min-h-0">
                <h3 className="font-semibold text-lg mb-4 flex-shrink-0">{t('pos.currentSale')}</h3>
                <div className="space-y-2 mb-4 flex-1 overflow-y-auto min-h-0">
                  {cart.items.map((item: CartItem) => (
                    <div key={item.id} className="flex justify-between items-center text-sm py-1 border-b border-border/50 last:border-0 flex-shrink-0">
                      <div className="flex-1">
                        <span className="font-medium">{item.product.name}</span>
                        <span className="text-muted-foreground ml-2">× {item.quantity}</span>
                      </div>
                      <span className="font-semibold">{formatCurrency(item.totalPrice, locale)}</span>
                    </div>
                  ))}
                </div>
                
                <div className="border-t pt-4 space-y-2 flex-shrink-0">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('pos.subtotal')}:</span>
                    <span>{formatCurrency(cart.subtotal, locale)}</span>
                  </div>
                  {cart.discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>{t('pos.discount')}:</span>
                      <span>-{formatCurrency(cart.discountAmount, locale)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('pos.tax')}:</span>
                    <span>{formatCurrency(cart.taxAmount, locale)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-lg font-bold">{t('pos.total')}:</span>
                    <span className="text-2xl font-bold text-primary">{formatCurrency(cart.totalAmount, locale)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Side - Payment Section */}
          <div className="flex flex-col min-h-0">
            <Card className="flex-1 flex flex-col min-h-0">
              <CardContent className="p-4 flex flex-col flex-1 min-h-0">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2 flex-shrink-0">
                  {paymentMode === 'card' ? (
                    <CreditCard className="h-5 w-5 text-primary" />
                  ) : (
                    <DollarSign className="h-5 w-5 text-primary" />
                  )}
                  {t('checkout.paymentMethod')}: {paymentMode === 'card' ? t('checkout.card') : t('checkout.cash')}
                </h3>

                {canUseCardPayment && (
                  <div className="flex gap-2 mb-4 flex-shrink-0" role="tablist" aria-label={t('checkout.paymentMethod')}>
                    <Button
                      type="button"
                      variant={paymentMode === 'cash' ? 'default' : 'outline'}
                      className="flex-1 h-12 text-base"
                      onClick={() => {
                        setPaymentMode('cash');
                        setError(null);
                      }}
                    >
                      <DollarSign className="mr-2 h-5 w-5 shrink-0" />
                      {t('checkout.cash')}
                    </Button>
                    <Button
                      type="button"
                      variant={paymentMode === 'card' ? 'default' : 'outline'}
                      className="flex-1 h-12 text-base"
                      onClick={() => {
                        setPaymentMode('card');
                        setError(null);
                      }}
                    >
                      <CreditCard className="mr-2 h-5 w-5 shrink-0" />
                      {t('checkout.card')}
                    </Button>
                  </div>
                )}
                
                {/* Total Amount Display */}
                <div className="mb-4 p-4 bg-primary/10 rounded-lg border border-primary/20 flex-shrink-0">
                  <div className="text-sm text-muted-foreground mb-1">{t('pos.total')}</div>
                  <div className="text-2xl font-bold text-primary">{formatCurrency(cart.totalAmount, locale)}</div>
                </div>

                {paymentMode === 'cash' && (
                  <>
                {/* Amount Input and Quick Buttons Row */}
                <div className="mb-4 flex-shrink-0">
                  <label className="text-sm font-medium mb-2 block">{t('checkout.amountTendered')}</label>
                  <div className="relative mb-3">
                    <Input
                      ref={inputRef}
                      type="number"
                      step="0.01"
                      value={amountTendered}
                      onChange={(e) => setAmountTendered(e.target.value)}
                      placeholder="0.00"
                      className="text-2xl font-bold h-14 text-center pr-12"
                      autoFocus
                      showVirtualKeyboard={false}
                    />
                    {amountTendered && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                        onClick={() => setAmountTendered('')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  {/* Quick Amount Buttons */}
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Quick Amount</div>
                    <div className="grid grid-cols-4 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickAmount(20)}
                        className="text-xs"
                      >
                        +20
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickAmount(50)}
                        className="text-xs"
                      >
                        +50
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickAmount(100)}
                        className="text-xs"
                      >
                        +100
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickAmount(200)}
                        className="text-xs"
                      >
                        +200
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Keyboard and Payment Info Row */}
                <div className="flex gap-4 flex-1 min-h-0">
                  {/* Compact Numeric Keyboard - Left */}
                  {showKeyboard && (
                    <div className="flex-shrink-0">
                      <div className="flex flex-col gap-1.5 bg-muted/50 p-3 rounded-lg">
                        {numericKeys.map((row, rowIndex) => (
                          <div key={rowIndex} className="flex gap-1.5">
                            {row.map((key) => (
                              <Button
                                key={key}
                                variant={key === 'backspace' ? 'destructive' : 'secondary'}
                                size="sm"
                                className="h-10 w-10 p-0 text-sm font-semibold hover:scale-105 transition-transform active:scale-95"
                                onClick={() => handleKeyPress(key)}
                              >
                                {key === 'backspace' ? (
                                  <Delete className="h-4 w-4" />
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

                  {/* Payment Info - Right */}
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Change Display */}
                    {changeAmount > 0 && (
                      <div className="mb-4 p-4 bg-green-500/10 rounded-lg border border-green-500/20 flex-shrink-0">
                        <div className="text-sm text-muted-foreground mb-1">{t('checkout.changeDue')}</div>
                        <div className="text-2xl font-bold text-green-600">{formatCurrency(changeAmount, locale)}</div>
                      </div>
                    )}
                    
                    {error && (
                      <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20 flex-shrink-0">
                        {error}
                      </div>
                    )}
                    
                    {!isDayOpen && (
                      <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20 flex-shrink-0">
                        {t('tradingDay.cannotProcessTransaction')}
                      </div>
                    )}

                    {parseFloat(amountTendered || '0') < cart.totalAmount && parseFloat(amountTendered || '0') > 0 && (
                      <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20 flex-shrink-0">
                        {t('checkout.insufficientAmount')} {formatCurrency(cart.totalAmount - parseFloat(amountTendered || '0'), locale)} {t('checkout.more')}.
                      </div>
                    )}

                    <Button 
                      className="w-full h-14 text-lg font-bold flex-shrink-0 mt-auto" 
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
                  </div>
                </div>
                  </>
                )}

                {paymentMode === 'card' && (
                  <div className="flex flex-col flex-1 min-h-0">
                    <p className="text-sm text-muted-foreground mb-4 flex-shrink-0">
                      {t('checkout.cardPaymentHint')}
                    </p>
                    {amountAgorot < 1 && (
                      <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20">
                        {t('errors.invalidNumber')}
                      </div>
                    )}
                    {error && (
                      <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20 flex-shrink-0">
                        {error}
                      </div>
                    )}
                    {!isDayOpen && (
                      <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20 flex-shrink-0">
                        {t('tradingDay.cannotProcessTransaction')}
                      </div>
                    )}
                    <div className="flex flex-col gap-3 mt-auto w-full flex-shrink-0">
                      <Button
                        className="w-full h-14 text-lg font-bold"
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
                            className="w-full h-12 text-base border-destructive/50 text-destructive hover:bg-destructive/10"
                            onClick={handleAbortCardPayment}
                          >
                            {t('checkout.cancelCardPayment')}
                          </Button>
                        )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
