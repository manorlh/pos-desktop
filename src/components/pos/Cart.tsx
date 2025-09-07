import { useState } from 'react';
import { Trash2, Plus, Minus, CreditCard } from 'lucide-react';
import { useCartStore } from '@/stores/useCartStore';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { formatCurrency } from '@/lib/utils';
import { CheckoutDialog } from './CheckoutDialog';

export function Cart() {
  const [showCheckout, setShowCheckout] = useState(false);
  const { cart, removeItem, updateItemQuantity, clearCart } = useCartStore();

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItem(itemId);
    } else {
      updateItemQuantity(itemId, newQuantity);
    }
  };

  const canCheckout = cart.items.length > 0;

  return (
    <div className="flex flex-col h-full bg-card">
      <CardHeader className="border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Current Sale</CardTitle>
          {cart.items.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={clearCart}
            >
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>

      <div className="flex-1 overflow-auto">
        {cart.items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <div className="text-4xl mb-2">🛒</div>
              <p>No items in cart</p>
              <p className="text-sm">Add products to start a sale</p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {cart.items.map((item) => (
              <Card key={item.id} className="relative">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{item.product.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.unitPrice)} each
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="font-bold text-sm">
                      {formatCurrency(item.totalPrice)}
                    </div>
                  </div>
                  
                  {item.discount && (
                    <div className="mt-2">
                      <Badge variant="destructive" className="text-xs">
                        {item.discountType === 'percentage' 
                          ? `${item.discount}% off` 
                          : `${formatCurrency(item.discount)} off`
                        }
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Cart Summary */}
      <div className="border-t border-border p-4 space-y-3">
        <div className="space-y-2 text-sm">
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
          <div className="flex justify-between font-bold text-lg border-t border-border pt-2">
            <span>Total:</span>
            <span>{formatCurrency(cart.totalAmount)}</span>
          </div>
        </div>

        <Button 
          className="w-full" 
          size="lg"
          disabled={!canCheckout}
          onClick={() => setShowCheckout(true)}
        >
          <CreditCard className="mr-2 h-4 w-4" />
          Checkout {canCheckout && `(${cart.items.length} items)`}
        </Button>
      </div>

      <CheckoutDialog 
        open={showCheckout}
        onOpenChange={setShowCheckout}
      />
    </div>
  );
}
