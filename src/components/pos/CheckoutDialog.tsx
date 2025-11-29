import { useState } from 'react';
import { DollarSign, Check } from 'lucide-react';
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
import { formatCurrency } from '@/lib/utils';

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckoutDialog({ open, onOpenChange }: CheckoutDialogProps) {
  const [amountTendered, setAmountTendered] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  const { cart, clearCart } = useCartStore();
  const { addTransaction } = useTransactionStore();
  const { loadProducts } = useProductStore();

  const changeAmount = Math.max(0, parseFloat(amountTendered || '0') - cart.totalAmount);
  const canComplete = parseFloat(amountTendered || '0') >= cart.totalAmount;

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
            Complete the sale with cash payment
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

          {/* Cash Payment */}
          <div>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Cash Payment
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Amount Tendered</label>
                <Input
                  type="number"
                  step="0.01"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 text-lg"
                  autoFocus
                />
              </div>
              
              {changeAmount > 0 && (
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Change Due</div>
                  <div className="text-2xl font-bold">{formatCurrency(changeAmount)}</div>
                </div>
              )}
              
              {parseFloat(amountTendered || '0') < cart.totalAmount && parseFloat(amountTendered || '0') > 0 && (
                <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  Insufficient amount. Need {formatCurrency(cart.totalAmount - parseFloat(amountTendered || '0'))} more.
                </div>
              )}
            </div>

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
