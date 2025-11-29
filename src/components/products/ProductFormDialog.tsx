import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { useProductStore } from '@/stores/useProductStore';
import { useVirtualKeyboard } from '@/contexts/VirtualKeyboardContext';
import { useI18n } from '@/i18n';
import type { Product } from '@/types/index';
import { generateUUID } from '@/utils/uuid';

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
}

export function ProductFormDialog({ open, onOpenChange, product }: ProductFormDialogProps) {
  const { categories, addProduct, updateProduct } = useProductStore();
  const { isOpen: isKeyboardOpen } = useVirtualKeyboard();
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    sku: '',
    categoryId: '',
    stockQuantity: '0',
    barcode: '',
    imageUrl: '',
    inStock: true,
  });

  // Don't close keyboard when dialog opens - let it work inside dialogs

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        description: product.description || '',
        price: product.price.toString(),
        sku: product.sku,
        categoryId: product.categoryId,
        stockQuantity: product.stockQuantity.toString(),
        barcode: product.barcode || '',
        imageUrl: product.imageUrl || '',
        inStock: product.inStock,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        price: '',
        sku: '',
        categoryId: '',
        stockQuantity: '0',
        barcode: '',
        imageUrl: '',
        inStock: true,
      });
    }
    setErrors({});
  }, [product, open]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('products.nameRequired');
    }

    if (!formData.price.trim()) {
      newErrors.price = t('products.priceRequired');
    } else if (isNaN(parseFloat(formData.price)) || parseFloat(formData.price) < 0) {
      newErrors.price = t('products.priceInvalid');
    }

    if (!formData.sku.trim()) {
      newErrors.sku = t('products.skuRequired');
    }

    if (!formData.categoryId) {
      newErrors.categoryId = t('products.categoryRequired');
    }

    if (formData.stockQuantity && (isNaN(parseInt(formData.stockQuantity)) || parseInt(formData.stockQuantity) < 0)) {
      newErrors.stockQuantity = t('products.stockInvalid');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsLoading(true);

    try {
      const now = new Date();
      const productData: Product = {
        id: product?.id || generateUUID(),
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        price: parseFloat(formData.price),
        sku: formData.sku.trim(),
        categoryId: formData.categoryId,
        stockQuantity: parseInt(formData.stockQuantity) || 0,
        barcode: formData.barcode.trim() || undefined,
        taxRate: undefined, // Tax rate is now global, not per-product
        imageUrl: formData.imageUrl.trim() || undefined,
        inStock: formData.inStock,
        createdAt: product?.createdAt || now,
        updatedAt: now,
      };

      if (product) {
        await updateProduct(productData);
      } else {
        await addProduct(productData);
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save product:', error);
      setErrors({ submit: t('errors.generic') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    // Prevent closing when keyboard is open - user should close keyboard first
    if (!newOpen && isKeyboardOpen) {
      return;
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog modal={true} open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? t('products.editProduct') : t('products.createProduct')}</DialogTitle>
          <DialogDescription>
            {product ? t('products.description') : t('products.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t('products.productName')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('products.productName')}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">{t('products.productDescription')}</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('products.productDescription')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="price">{t('products.price')} *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                  className={errors.price ? 'border-destructive' : ''}
                />
                {errors.price && <p className="text-sm text-destructive">{errors.price}</p>}
                <p className="text-xs text-muted-foreground">{t('products.price')}</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sku">{t('products.sku')} *</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder={t('products.sku')}
                  className={errors.sku ? 'border-destructive' : ''}
                />
                {errors.sku && <p className="text-sm text-destructive">{errors.sku}</p>}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="categoryId">{t('products.category')} *</Label>
              <Select
                value={formData.categoryId}
                onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
              >
                <SelectTrigger className={errors.categoryId ? 'border-destructive' : ''}>
                  <SelectValue placeholder={t('products.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category: any) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="stockQuantity">{t('products.stockQuantity')}</Label>
                <Input
                  id="stockQuantity"
                  type="number"
                  value={formData.stockQuantity}
                  onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                  placeholder="0"
                  className={errors.stockQuantity ? 'border-destructive' : ''}
                />
                {errors.stockQuantity && <p className="text-sm text-destructive">{errors.stockQuantity}</p>}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="barcode">{t('products.barcode')}</Label>
              <Input
                id="barcode"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                placeholder={t('products.barcode')}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                placeholder="Image URL"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="inStock"
                checked={formData.inStock}
                onCheckedChange={(checked) => setFormData({ ...formData, inStock: checked })}
              />
              <Label htmlFor="inStock" className="cursor-pointer">
                {t('products.available')}
              </Label>
            </div>

            {errors.submit && <p className="text-sm text-destructive">{errors.submit}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t('common.loading') : product ? t('products.editProduct') : t('products.createProduct')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

