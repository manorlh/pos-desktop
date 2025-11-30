import { useState } from 'react';
import { Search, Grid, List } from 'lucide-react';
import { useProductStore } from '@/stores/useProductStore';
import { useCartStore } from '@/stores/useCartStore';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { formatCurrency, cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

export function ProductCatalog() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { 
    filteredProducts, 
    categories, 
    selectedCategory, 
    searchQuery,
    setSelectedCategory, 
    setSearchQuery 
  } = useProductStore();
  const { addItem } = useCartStore();
  const { t, locale } = useI18n();

  const handleAddToCart = (productId: string) => {
    const product = filteredProducts.find(p => p.id === productId);
    if (product) {
      addItem(product);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search and Filters */}
      <div className="mb-6">
        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('common.search') + '...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={selectedCategory === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            {t('common.all')} {t('nav.categories')}
          </Button>
          {categories.filter(category => category.isActive).map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category.id)}
              style={{ 
                backgroundColor: selectedCategory === category.id ? category.color : undefined,
                borderColor: category.color 
              }}
            >
              {category.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Products Grid/List */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'grid' ? (
          <div 
            className="grid gap-2 sm:gap-3 md:gap-4"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))'
            }}
          >
            {filteredProducts.map((product) => (
              <Card 
                key={product.id} 
                className="cursor-pointer hover:shadow-md transition-shadow min-w-[120px]"
                onClick={() => handleAddToCart(product.id)}
              >
                <CardContent className="p-2 sm:p-3 md:p-4">
                  <div className="aspect-square bg-muted rounded-lg mb-2 sm:mb-3 flex items-center justify-center">
                    <span className="text-xl sm:text-2xl">📦</span>
                  </div>
                  <h3 className="font-medium text-xs sm:text-sm mb-1 line-clamp-2">{product.name}</h3>
                  <p className="text-xs text-muted-foreground mb-1 sm:mb-2 line-clamp-1 hidden sm:block">
                    {product.description}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-primary text-xs sm:text-sm">
                      {formatCurrency(product.price, locale)}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {product.stockQuantity}
                    </Badge>
                  </div>
                  <div className="mt-1 sm:mt-2">
                    <Badge variant="outline" className="text-xs">
                      {categories.find(c => c.id === product.categoryId)?.name}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredProducts.map((product) => (
              <Card 
                key={product.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleAddToCart(product.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                      <span className="text-xl">📦</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium mb-1">{product.name}</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {product.description}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {categories.find(c => c.id === product.categoryId)?.name}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {t('pos.stock')}: {product.stockQuantity}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg text-primary">
                        {formatCurrency(product.price, locale)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        SKU: {product.sku}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t('common.noResults')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
