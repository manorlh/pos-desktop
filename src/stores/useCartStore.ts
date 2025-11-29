import { create } from 'zustand';
import type { Cart, CartItem, Product } from '../types/index';
import { generateUUID } from '../utils/uuid';
import { useSettingsStore } from './useSettingsStore';

interface CartStore {
  cart: Cart;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (itemId: string) => void;
  updateItemQuantity: (itemId: string, quantity: number) => void;
  applyDiscount: (itemId: string, discount: number, discountType: 'percentage' | 'fixed') => void;
  clearCart: () => void;
  calculateTotals: () => void;
}

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
    const taxRate = useSettingsStore.getState().globalTaxRate || 0.08; // Default to 8% if not loaded
    
    // All product prices are tax-inclusive
    // We need to extract the tax amount from the prices
    let totalWithTax = 0;
    let totalDiscount = 0;

    cart.items.forEach(item => {
      // item.unitPrice is tax-inclusive
      const itemTotalWithTax = item.quantity * item.unitPrice;
      totalWithTax += itemTotalWithTax;

      if (item.discount && item.discountType) {
        if (item.discountType === 'percentage') {
          totalDiscount += itemTotalWithTax * (item.discount / 100);
        } else {
          totalDiscount += item.discount;
        }
      }
    });

    // Apply discounts to tax-inclusive total
    const discountedTotalWithTax = totalWithTax - totalDiscount;
    
    // Extract tax from tax-inclusive price
    // If price includes tax: price = subtotal * (1 + taxRate)
    // So: subtotal = price / (1 + taxRate)
    // And: taxAmount = price - subtotal = price - (price / (1 + taxRate))
    const subtotal = discountedTotalWithTax / (1 + taxRate);
    const taxAmount = discountedTotalWithTax - subtotal;
    const totalAmount = discountedTotalWithTax; // Total is already tax-inclusive

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
