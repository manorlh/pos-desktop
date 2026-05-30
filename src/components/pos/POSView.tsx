import { useState, useEffect } from 'react';
import { ProductCatalog } from './ProductCatalog';
import { Cart } from './Cart';
import { Button } from '../ui/button';
import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/stores/useCartStore';

export function POSView() {
  const [cartOpen, setCartOpen] = useState(false);
  const { cart } = useCartStore();

  // Side cart only on xl+ (1280px). At 1024×768 use drawer so catalog keeps full width.
  useEffect(() => {
    const checkScreenSize = () => {
      if (window.innerWidth >= 1280) {
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
      <div className="flex-1 p-2 sm:p-3 till:p-4 xl:p-6 min-w-0">
        <ProductCatalog />
      </div>
      
      {/* Overlay when cart drawer is open (below xl) */}
      {cartOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 xl:hidden"
          onClick={() => setCartOpen(false)}
        />
      )}
      
      {/* Cart - drawer below xl; side panel on xl+ */}
      <div 
        className={`
          fixed xl:static inset-y-0 z-50
          w-full sm:w-80 xl:w-96
          border-l border-border bg-card
          transform transition-transform duration-300 ease-in-out
          ${cartOpen ? 'translate-x-0 right-0' : 'translate-x-full right-0 xl:translate-x-0 xl:right-auto'}
        `}
        style={{ 
          top: '3.5rem',
          height: 'calc(100vh - 3.5rem)',
        }}
      >
        <Cart onClose={() => setCartOpen(false)} />
      </div>

      {/* Cart Toggle Button - visible on mobile/tablet when cart is closed */}
      {!cartOpen && (
        <Button
          className="fixed bottom-4 right-4 z-40 xl:hidden rounded-full h-14 w-14 shadow-lg"
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
