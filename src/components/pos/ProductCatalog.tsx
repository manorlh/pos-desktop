import { useState, useEffect } from 'react';
import { Search, Grid, List } from 'lucide-react';
import { useProductStore } from '@/stores/useProductStore';
import { useCartStore } from '@/stores/useCartStore';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { formatCurrency, cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { ProductImage } from './ProductImage';

function productImageSrc(product: { displayImageSrc?: string; imageUrl?: string }) {
  return product.displayImageSrc ?? product.imageUrl;
}

export function ProductCatalog() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [onHandMap, setOnHandMap] = useState<Record<string, number>>({});
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

  useEffect(() => {
    if (!window.electronAPI?.dbGetEffectiveOnHand) return;
    const tracked = filteredProducts.filter((p) => p.trackStock);
    if (tracked.length === 0) {
      setOnHandMap({});
      return;
    }
    void Promise.all(
      tracked.map(async (p) => {
        const res = await window.electronAPI!.dbGetEffectiveOnHand(p.id);
        return [p.id, res.onHand] as const;
      }),
    ).then((rows) => {
      const map: Record<string, number> = {};
      for (const [id, qty] of rows) {
        if (qty != null) map[id] = qty;
      }
      setOnHandMap(map);
    });
  }, [filteredProducts]);

  const canSellProduct = (p: typeof filteredProducts[number]) => p.isAvailable !== false;

  const handleAddToCart = async (productId: string) => {
    const product = filteredProducts.find((p) => p.id === productId);
    if (!product || !canSellProduct(product)) return;

    if (product.trackStock && window.electronAPI?.dbCheckStockForAdd) {
      const check = await window.electronAPI.dbCheckStockForAdd(productId, 1);
      if (!check.allowed) {
        await window.electronAPI.showMessageBox?.({
          type: 'warning',
          title: t('pos.outOfStock'),
          message: t('pos.stockBlockMessage'),
        });
        return;
      }
      if (check.warn) {
        const res = await window.electronAPI.showMessageBox?.({
          type: 'question',
          buttons: [t('common.cancel'), t('common.continue')],
          defaultId: 1,
          cancelId: 0,
          title: t('pos.outOfStock'),
          message: t('pos.stockWarnMessage', { onHand: String(check.onHand ?? 0) }),
        });
        if (!res || res.response !== 1) return;
      }
    }

    addItem(product);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search and Filters */}
      <div className="mb-4 till:mb-4 xl:mb-6">
        <div className="flex gap-2 till:gap-3 mb-3 till:mb-3">
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
      <div className="flex-1 overflow-auto p-0.5">
        {viewMode === 'grid' ? (
          <div 
            className="grid gap-3 lg:gap-4"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(132px, 100%), 1fr))',
            }}
          >
            {filteredProducts.map((product) => {
              const canSell = canSellProduct(product);
              return (
              <Card 
                key={product.id} 
                className={cn(
                  'transition-shadow',
                  canSell ? 'cursor-pointer hover:shadow-md' : 'opacity-55 cursor-not-allowed',
                )}
                onClick={() => handleAddToCart(product.id)}
              >
                <CardContent className="p-2 sm:p-3 md:p-4">
                  <ProductImage
                    src={productImageSrc(product)}
                    alt={product.name}
                    className="aspect-square rounded-lg mb-2 sm:mb-3 w-full"
                    iconClassName="h-6 w-6 sm:h-8 sm:w-8"
                  />
                  <h3 className="font-medium text-xs sm:text-sm mb-1 line-clamp-2">{product.name}</h3>
                  <p className="text-xs text-muted-foreground mb-1 sm:mb-2 line-clamp-1 hidden sm:block">
                    {product.description}
                  </p>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {!canSell ? (
                      <Badge variant="destructive" className="text-xs">
                        {t('pos.notForSale')}
                      </Badge>
                    ) : !product.inStock ? (
                      <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">
                        {t('pos.outOfStockShort')}
                      </Badge>
                    ) : product.trackStock && onHandMap[product.id] !== undefined ? (
                      <Badge variant="outline" className="text-xs">
                        {t('pos.stockOnHand', { qty: String(onHandMap[product.id]) })}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-primary text-xs sm:text-sm">
                      {formatCurrency(product.price, locale)}
                    </span>
                  </div>
                  <div className="mt-1 sm:mt-2">
                    <Badge variant="outline" className="text-xs">
                      {categories.find(c => c.id === product.categoryId)?.name}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );})}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((product) => {
              const canSell = canSellProduct(product);
              return (
              <Card 
                key={product.id} 
                className={cn(
                  'transition-shadow',
                  canSell ? 'cursor-pointer hover:shadow-md' : 'opacity-55 cursor-not-allowed',
                )}
                onClick={() => handleAddToCart(product.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <ProductImage
                      src={productImageSrc(product)}
                      alt={product.name}
                      className="w-16 h-16 rounded-lg shrink-0"
                      iconClassName="h-5 w-5"
                    />
                    <div className="flex-1">
                      <h3 className="font-medium mb-1">{product.name}</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {product.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {categories.find(c => c.id === product.categoryId)?.name}
                        </Badge>
                        {!canSell ? (
                          <Badge variant="destructive" className="text-xs">
                            {t('pos.notForSale')}
                          </Badge>
                        ) : !product.inStock ? (
                          <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">
                            {t('pos.outOfStockShort')}
                          </Badge>
                        ) : product.trackStock && onHandMap[product.id] !== undefined ? (
                          <Badge variant="outline" className="text-xs">
                            {t('pos.stockOnHand', { qty: String(onHandMap[product.id]) })}
                          </Badge>
                        ) : null}
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
            );})}
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
