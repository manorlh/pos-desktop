import { create } from 'zustand';
import type { Product, Category } from '../types/index';
import { useSettingsStore } from './useSettingsStore';
// Database operations will be added via IPC later
// import { 
//   getDatabase,
//   getAllProducts, 
//   getAllCategories,
//   saveProduct,
//   saveCategory 
// } from '../database/database';

interface ProductStore {
  products: Product[];
  categories: Category[];
  filteredProducts: Product[];
  selectedCategory: string | null;
  searchQuery: string;
  setProducts: (products: Product[]) => void;
  setCategories: (categories: Category[]) => void;
  setSelectedCategory: (categoryId: string | null) => void;
  setSearchQuery: (query: string) => void;
  filterProducts: () => void;
  getProductById: (id: string) => Product | undefined;
  getCategoryById: (id: string) => Category | undefined;
  getProductsByCategory: (categoryId: string) => Product[];
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  addCategory: (category: Category) => void;
  updateCategory: (category: Category) => void;
  loadProducts: () => Promise<void>;
  loadCategories: () => Promise<void>;
}

export const useProductStore = create<ProductStore>((set, get) => ({
  products: [],
  categories: [],
  filteredProducts: [],
  selectedCategory: null,
  searchQuery: '',

  setProducts: (products: Product[]) => {
    set({ products });
    get().filterProducts();
  },

  setCategories: (categories: Category[]) => {
    set({ categories });
  },

  setSelectedCategory: (categoryId: string | null) => {
    set({ selectedCategory: categoryId });
    get().filterProducts();
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    get().filterProducts();
  },

  filterProducts: () => {
    const { products, selectedCategory, searchQuery, categories } = get();
    
    // Get the setting from useSettingsStore
    const hideOutOfStock = useSettingsStore.getState().hideOutOfStockProducts;
    
    // Get active category IDs (only if categories are loaded)
    const activeCategoryIds = categories.length > 0
      ? new Set(categories.filter(cat => cat.isActive).map(cat => cat.id))
      : null;
    
    // Clear selected category if it's inactive
    let currentSelectedCategory = selectedCategory;
    if (activeCategoryIds && selectedCategory && !activeCategoryIds.has(selectedCategory)) {
      currentSelectedCategory = null;
      set({ selectedCategory: null });
    }
    
    let filtered = [...products];

    // Filter out products from inactive categories (only if categories are loaded)
    if (activeCategoryIds) {
      filtered = filtered.filter(product => activeCategoryIds.has(product.categoryId));
    }

    // Filter by category
    if (currentSelectedCategory) {
      filtered = filtered.filter(product => product.categoryId === currentSelectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(product => 
        product.name.toLowerCase().includes(query) ||
        product.description?.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        product.barcode?.toLowerCase().includes(query)
      );
    }

    // Filter out-of-stock products only if setting is enabled
    if (hideOutOfStock) {
      filtered = filtered.filter(product => product.inStock && product.stockQuantity > 0);
    }

    set({ filteredProducts: filtered });
  },

  getProductById: (id: string) => {
    const { products } = get();
    return products.find(product => product.id === id);
  },

  getCategoryById: (id: string) => {
    const { categories } = get();
    return categories.find(category => category.id === id);
  },

  getProductsByCategory: (categoryId: string) => {
    const { products } = get();
    return products.filter(product => product.categoryId === categoryId);
  },

  addProduct: async (product: Product) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.dbSaveProduct({
          ...product,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        });
      }
      set((state) => ({
        products: [...state.products, product]
      }));
      get().filterProducts();
    } catch (error) {
      console.error('Failed to save product:', error);
      // Still add to memory
      set((state) => ({
        products: [...state.products, product]
      }));
      get().filterProducts();
    }
  },

  updateProduct: async (product: Product) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.dbSaveProduct({
          ...product,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        });
      }
      set((state) => ({
        products: state.products.map(p => p.id === product.id ? product : p)
      }));
      get().filterProducts();
    } catch (error) {
      console.error('Failed to update product:', error);
      // Still update in memory
      set((state) => ({
        products: state.products.map(p => p.id === product.id ? product : p)
      }));
      get().filterProducts();
    }
  },

  addCategory: async (category: Category) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.dbSaveCategory({
          ...category,
          createdAt: category.createdAt.toISOString(),
          updatedAt: category.updatedAt.toISOString(),
        });
      }
      set((state) => ({
        categories: [...state.categories, category]
      }));
    } catch (error) {
      console.error('Failed to save category:', error);
      // Still add to memory
      set((state) => ({
        categories: [...state.categories, category]
      }));
    }
  },

  updateCategory: async (category: Category) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.dbSaveCategory({
          ...category,
          createdAt: category.createdAt.toISOString(),
          updatedAt: category.updatedAt.toISOString(),
        });
      }
      set((state) => ({
        categories: state.categories.map(c => c.id === category.id ? category : c)
      }));
    } catch (error) {
      console.error('Failed to update category:', error);
      // Still update in memory
      set((state) => ({
        categories: state.categories.map(c => c.id === category.id ? category : c)
      }));
    }
  },

  loadProducts: async () => {
    try {
      if (window.electronAPI) {
        const products = await window.electronAPI.dbGetProducts();
        const productsWithDates = products.map((p: any) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        }));
        set({ products: productsWithDates });
        get().filterProducts();
      }
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  },

  loadCategories: async () => {
    try {
      if (window.electronAPI) {
        const categories = await window.electronAPI.dbGetCategories();
        const categoriesWithDates = categories.map((c: any) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt),
        }));
        set({ categories: categoriesWithDates });
        // Re-filter products after categories are loaded
        get().filterProducts();
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  },
}));
