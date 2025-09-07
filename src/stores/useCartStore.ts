import { create } from 'zustand';
import type { Cart, CartItem, Product } from '../types/index';
import { generateUUID } from '../utils/uuid';

interface CartStore {
  cart: Cart;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (itemId: string) => void;
  updateItemQuantity: (itemId: string, quantity: number) => void;
  applyDiscount: (itemId: string, discount: number, discountType: 'percentage' | 'fixed') => void;
  clearCart: () => void;
  calculateTotals: () => void;
}

const TAX_RATE = 0.08; // 8% tax rate

const createEmptyCart = (): Cart => ({
  id: generateUUID(),
  items: [],
  subtotal: 0,
  taxAmount: 0,
  discountAmount: 0,
  totalAmount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

export const useCartStore = create<CartStore>((set, get) => ({
  cart: createEmptyCart(),

  addItem: (product: Product, quantity = 1) => {
    const { cart, calculateTotals } = get();
    const existingItemIndex = cart.items.findIndex(item => item.productId === product.id);

    if (existingItemIndex >= 0) {
      // Update existing item quantity
      const updatedItems = [...cart.items];
      const existingItem = updatedItems[existingItemIndex];
      const newQuantity = existingItem.quantity + quantity;
      
      updatedItems[existingItemIndex] = {
        ...existingItem,
        quantity: newQuantity,
        totalPrice: newQuantity * existingItem.unitPrice,
      };

      set({
        cart: {
          ...cart,
          items: updatedItems,
          updatedAt: new Date(),
        }
      });
    } else {
      // Add new item
      const newItem: CartItem = {
        id: generateUUID(),
        productId: product.id,
        product,
        quantity,
        unitPrice: product.price,
        totalPrice: product.price * quantity,
      };

      set({
        cart: {
          ...cart,
          items: [...cart.items, newItem],
          updatedAt: new Date(),
        }
      });
    }

    calculateTotals();
  },

  removeItem: (itemId: string) => {
    const { cart, calculateTotals } = get();
    const updatedItems = cart.items.filter(item => item.id !== itemId);
    
    set({
      cart: {
        ...cart,
        items: updatedItems,
        updatedAt: new Date(),
      }
    });

    calculateTotals();
  },

  updateItemQuantity: (itemId: string, quantity: number) => {
    const { cart, calculateTotals } = get();
    
    if (quantity <= 0) {
      get().removeItem(itemId);
      return;
    }

    const updatedItems = cart.items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          quantity,
          totalPrice: quantity * item.unitPrice,
        };
      }
      return item;
    });

    set({
      cart: {
        ...cart,
        items: updatedItems,
        updatedAt: new Date(),
      }
    });

    calculateTotals();
  },

  applyDiscount: (itemId: string, discount: number, discountType: 'percentage' | 'fixed') => {
    const { cart, calculateTotals } = get();
    
    const updatedItems = cart.items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          discount,
          discountType,
        };
      }
      return item;
    });

    set({
      cart: {
        ...cart,
        items: updatedItems,
        updatedAt: new Date(),
      }
    });

    calculateTotals();
  },

  clearCart: () => {
    set({ cart: createEmptyCart() });
  },

  calculateTotals: () => {
    const { cart } = get();
    
    let subtotal = 0;
    let totalDiscount = 0;

    cart.items.forEach(item => {
      const itemTotal = item.quantity * item.unitPrice;
      subtotal += itemTotal;

      if (item.discount && item.discountType) {
        if (item.discountType === 'percentage') {
          totalDiscount += itemTotal * (item.discount / 100);
        } else {
          totalDiscount += item.discount;
        }
      }
    });

    const discountedSubtotal = subtotal - totalDiscount;
    const taxAmount = discountedSubtotal * TAX_RATE;
    const totalAmount = discountedSubtotal + taxAmount;

    set({
      cart: {
        ...cart,
        subtotal,
        discountAmount: totalDiscount,
        taxAmount,
        totalAmount,
        updatedAt: new Date(),
      }
    });
  },
}));
