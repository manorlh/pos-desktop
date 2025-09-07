import { create } from 'zustand';
import type { Product, Category } from '../types/index';

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
    const { products, selectedCategory, searchQuery } = get();
    
    let filtered = [...products];

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(product => product.categoryId === selectedCategory);
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

    // Only show in-stock products
    filtered = filtered.filter(product => product.inStock && product.stockQuantity > 0);

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
}));
