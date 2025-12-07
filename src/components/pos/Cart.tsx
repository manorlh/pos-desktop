import { useState } from 'react';
import { Trash2, Plus, Minus, CreditCard, X } from 'lucide-react';
import { useCartStore } from '@/stores/useCartStore';
import { useTradingDayStore } from '@/stores/useTradingDayStore';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { formatCurrency } from '@/lib/utils';
import { CheckoutDialog } from './CheckoutDialog';
import { useI18n } from '@/i18n';

interface CartProps {
  onClose?: () => void;
}

export function Cart({ onClose }: CartProps) {
  const [showCheckout, setShowCheckout] = useState(false);
  const { cart, removeItem, updateItemQuantity, clearCart } = useCartStore();
  const { isDayOpen } = useTradingDayStore();
  const { t, locale } = useI18n();

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItem(itemId);
    } else {
      updateItemQuantity(itemId, newQuantity);
    }
  };

  const canCheckout = cart.items.length > 0 && isDayOpen;

  return (
    <div className="flex flex-col h-full bg-card">
      <CardHeader className="border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{t('pos.currentSale')}</CardTitle>
          <div className="flex items-center gap-2">
            {cart.items.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={clearCart}
                className="hidden sm:inline-flex"
              >
                {t('pos.clearAll')}
              </Button>
            )}
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <div className="flex-1 overflow-auto">
        {cart.items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <div className="text-4xl mb-2">🛒</div>
              <p>{t('pos.noItems')}</p>
              <p className="text-sm">{t('pos.addProducts')}</p>
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
                        {formatCurrency(item.unitPrice, locale)} {t('pos.each')}
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
                      {formatCurrency(item.totalPrice, locale)}
                    </div>
                  </div>
                  
                  {item.discount && (
                    <div className="mt-2">
                      <Badge variant="destructive" className="text-xs">
                        {item.discountType === 'percentage' 
                          ? `${item.discount}% ${t('common.off')}` 
                          : `${formatCurrency(item.discount, locale)} ${t('common.off')}`
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
            <span>{t('pos.subtotal')}:</span>
            <span>{formatCurrency(cart.subtotal, locale)}</span>
          </div>
          {cart.discountAmount > 0 && (
            <div className="flex justify-between text-destructive">
              <span>{t('pos.discount')}:</span>
              <span>-{formatCurrency(cart.discountAmount, locale)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{t('pos.tax')}:</span>
            <span>{formatCurrency(cart.taxAmount, locale)}</span>
          </div>
          <div className="flex justify-between font-bold text-lg border-t border-border pt-2">
            <span>{t('pos.total')}:</span>
            <span>{formatCurrency(cart.totalAmount, locale)}</span>
          </div>
        </div>

        {!isDayOpen && (
          <div className="text-sm text-destructive bg-destructive/10 p-2 rounded mb-2">
            {t('tradingDay.cannotProcessTransaction')}
          </div>
        )}
        <Button 
          className="w-full" 
          size="lg"
          disabled={!canCheckout}
          onClick={() => setShowCheckout(true)}
        >
          <CreditCard className="mr-2 h-4 w-4" />
          {t('pos.checkout')} {cart.items.length > 0 && `(${cart.items.length} ${t('pos.items')})`}
        </Button>
      </div>

      <CheckoutDialog 
        open={showCheckout}
        onOpenChange={setShowCheckout}
      />
    </div>
  );
}
