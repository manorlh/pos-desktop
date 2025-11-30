import { useState, useRef, useEffect } from 'react';
import { DollarSign, Check, X, ArrowLeft, Delete } from 'lucide-react';
import { useCartStore } from '@/stores/useCartStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useProductStore } from '@/stores/useProductStore';
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
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/i18n';

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckoutDialog({ open, onOpenChange }: CheckoutDialogProps) {
  const [amountTendered, setAmountTendered] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { cart, clearCart } = useCartStore();
  const { addTransaction } = useTransactionStore();
  const { loadProducts } = useProductStore();
  const { t, locale } = useI18n();

  const changeAmount = Math.max(0, parseFloat(amountTendered || '0') - cart.totalAmount);
  const canComplete = parseFloat(amountTendered || '0') >= cart.totalAmount;

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

  const handleCompleteTransaction = async () => {
    if (!canComplete) return;

    setIsProcessing(true);
    
    try {
      const amountTenderedNum = parseFloat(amountTendered);
      
      await addTransaction(cart, {
        amountTendered: amountTenderedNum,
        changeAmount: changeAmount,
      });
      
      // Reload products to reflect updated stock quantities
      await loadProducts();
      
      setIsComplete(true);
      
      // Simulate processing time
      setTimeout(() => {
        clearCart();
        setIsComplete(false);
        setAmountTendered('');
        onOpenChange(false);
      }, 2000);
    } catch (error) {
      console.error('Transaction failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetDialog = () => {
    setAmountTendered('');
    setIsComplete(false);
    setIsProcessing(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
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
              {changeAmount > 0 && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <div className="text-lg font-bold">
                    {t('checkout.changeDue')}: {formatCurrency(changeAmount, locale)}
                  </div>
                </div>
              )}
            </DialogDescription>
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
          {/* <DialogDescription className="text-base">
            {t('checkout.cashPayment')}
          </DialogDescription> */}
        </DialogHeader>

        <div className="grid grid-cols-[1.2fr_1fr] gap-6 p-6 flex-1 min-h-0 overflow-hidden">
          {/* Left Side - Order Summary */}
          <div className="flex flex-col min-h-0">
            <Card className="flex-1 flex flex-col min-h-0">
              <CardContent className="p-4 flex flex-col flex-1 min-h-0">
                <h3 className="font-semibold text-lg mb-4 flex-shrink-0">{t('pos.currentSale')}</h3>
                <div className="space-y-2 mb-4 flex-1 overflow-y-auto min-h-0">
                  {cart.items.map((item) => (
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
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 flex-shrink-0">
                  <DollarSign className="h-5 w-5 text-primary" />
                  {t('checkout.cashPayment')}
                </h3>
                
                {/* Total Amount Display */}
                <div className="mb-4 p-4 bg-primary/10 rounded-lg border border-primary/20 flex-shrink-0">
                  <div className="text-sm text-muted-foreground mb-1">{t('pos.total')}</div>
                  <div className="text-2xl font-bold text-primary">{formatCurrency(cart.totalAmount, locale)}</div>
                </div>

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
                    
                    {/* Insufficient Amount Warning */}
                    {parseFloat(amountTendered || '0') < cart.totalAmount && parseFloat(amountTendered || '0') > 0 && (
                      <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20 flex-shrink-0">
                        {t('checkout.insufficientAmount')} {formatCurrency(cart.totalAmount - parseFloat(amountTendered || '0'), locale)} {t('checkout.more')}.
                      </div>
                    )}

                    {/* Complete Button */}
                    <Button 
                      className="w-full h-14 text-lg font-bold flex-shrink-0 mt-auto" 
                      size="lg"
                      disabled={!canComplete || isProcessing}
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
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
