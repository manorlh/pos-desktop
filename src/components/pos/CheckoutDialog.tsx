import { useState } from 'react';
import { CreditCard, DollarSign, Smartphone, Check } from 'lucide-react';
import { useCartStore } from '@/stores/useCartStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
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
import type { PaymentMethod, PaymentDetails } from '@/types/index';

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckoutDialog({ open, onOpenChange }: CheckoutDialogProps) {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [amountTendered, setAmountTendered] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  const { cart, clearCart } = useCartStore();
  const { paymentMethods, addTransaction } = useTransactionStore();

  const changeAmount = selectedPaymentMethod?.type === 'cash' 
    ? Math.max(0, parseFloat(amountTendered || '0') - cart.totalAmount)
    : 0;

  const canComplete = selectedPaymentMethod && 
    (selectedPaymentMethod.type !== 'cash' || parseFloat(amountTendered || '0') >= cart.totalAmount);

  const handlePaymentMethodSelect = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method);
    if (method.type !== 'cash') {
      setAmountTendered(cart.totalAmount.toString());
    }
  };

  const handleCompleteTransaction = async () => {
    if (!selectedPaymentMethod || !canComplete) return;

    setIsProcessing(true);
    
    try {
      const paymentDetails: PaymentDetails = {
        method: selectedPaymentMethod,
        amount: cart.totalAmount,
        amountTendered: selectedPaymentMethod.type === 'cash' ? parseFloat(amountTendered) : cart.totalAmount,
        changeAmount: changeAmount,
        transactionId: crypto.randomUUID(),
      };

      await addTransaction(cart, paymentDetails);
      setIsComplete(true);
      
      // Simulate processing time
      setTimeout(() => {
        clearCart();
        setIsComplete(false);
        setSelectedPaymentMethod(null);
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
    setSelectedPaymentMethod(null);
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
            <DialogTitle className="text-xl mb-2">Transaction Complete!</DialogTitle>
            <DialogDescription>
              Payment processed successfully.
              {changeAmount > 0 && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <div className="text-lg font-bold">
                    Change Due: {formatCurrency(changeAmount)}
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Checkout</DialogTitle>
          <DialogDescription>
            Complete the sale by selecting a payment method
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          {/* Order Summary */}
          <div>
            <h3 className="font-semibold mb-4">Order Summary</h3>
            <div className="space-y-2 mb-4">
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.product.name} × {item.quantity}</span>
                  <span>{formatCurrency(item.totalPrice)}</span>
                </div>
              ))}
            </div>
            
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatCurrency(cart.subtotal)}</span>
              </div>
              {cart.discountAmount > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>Discount:</span>
                  <span>-{formatCurrency(cart.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Tax:</span>
                <span>{formatCurrency(cart.taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg">
                <span>Total:</span>
                <span>{formatCurrency(cart.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div>
            <h3 className="font-semibold mb-4">Payment Method</h3>
            <div className="space-y-3 mb-4">
              {paymentMethods.map((method) => {
                const Icon = method.type === 'cash' ? DollarSign : 
                           method.type === 'card' ? CreditCard : Smartphone;
                
                return (
                  <Card 
                    key={method.id}
                    className={`cursor-pointer transition-colors ${
                      selectedPaymentMethod?.id === method.id 
                        ? 'ring-2 ring-primary bg-primary/5' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => handlePaymentMethodSelect(method)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5" />
                        <span className="font-medium">{method.name}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Cash Payment Input */}
            {selectedPaymentMethod?.type === 'cash' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Amount Tendered</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    placeholder="0.00"
                    className="mt-1"
                  />
                </div>
                {changeAmount > 0 && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Change Due</div>
                    <div className="text-lg font-bold">{formatCurrency(changeAmount)}</div>
                  </div>
                )}
              </div>
            )}

            <Button 
              className="w-full mt-6" 
              size="lg"
              disabled={!canComplete || isProcessing}
              onClick={handleCompleteTransaction}
            >
              {isProcessing ? 'Processing...' : `Complete Sale - ${formatCurrency(cart.totalAmount)}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
