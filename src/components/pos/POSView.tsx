import { useState, useEffect } from 'react';
import { ProductCatalog } from './ProductCatalog';
import { Cart } from './Cart';
import { Button } from '../ui/button';
import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/stores/useCartStore';

export function POSView() {
  const [cartOpen, setCartOpen] = useState(false);
  const { cart } = useCartStore();

  // Auto-open cart on desktop, keep closed on mobile/tablet
  useEffect(() => {
    const checkScreenSize = () => {
      if (window.innerWidth >= 1024) {
        setCartOpen(true);
      } else {
        setCartOpen(false);
      }
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  return (
    <div className="flex h-full relative">
      {/* Product Catalog - takes full width on mobile, flex-1 on larger screens */}
      <div className="flex-1 p-3 sm:p-4 lg:p-6">
        <ProductCatalog />
      </div>
      
      {/* Overlay for mobile/tablet when cart is open */}
      {cartOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setCartOpen(false)}
        />
      )}
      
      {/* Cart - responsive width and positioning */}
      <div 
        className={`
          fixed lg:static inset-y-0 right-0 z-30
          w-full sm:w-80 lg:w-80 xl:w-96
          border-l border-border bg-card
          transform transition-transform duration-300 ease-in-out
          ${cartOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
        style={{ 
          top: '4rem', // Below header
          height: 'calc(100vh - 4rem)'
        }}
      >
        <Cart onClose={() => setCartOpen(false)} />
      </div>

      {/* Cart Toggle Button - visible on mobile/tablet when cart is closed */}
      {!cartOpen && (
        <Button
          className="fixed bottom-4 right-4 z-40 lg:hidden rounded-full h-14 w-14 shadow-lg"
          size="icon"
          onClick={() => setCartOpen(true)}
        >
          <ShoppingCart className="h-6 w-6" />
          {cart.items.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
              {cart.items.length}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
