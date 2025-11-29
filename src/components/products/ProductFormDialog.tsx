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
      newErrors.name = 'Product name is required';
    }

    if (!formData.price.trim()) {
      newErrors.price = 'Price is required';
    } else if (isNaN(parseFloat(formData.price)) || parseFloat(formData.price) < 0) {
      newErrors.price = 'Price must be a valid positive number';
    }

    if (!formData.sku.trim()) {
      newErrors.sku = 'SKU is required';
    }

    if (!formData.categoryId) {
      newErrors.categoryId = 'Category is required';
    }

    if (formData.stockQuantity && (isNaN(parseInt(formData.stockQuantity)) || parseInt(formData.stockQuantity) < 0)) {
      newErrors.stockQuantity = 'Stock quantity must be a valid non-negative number';
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
      setErrors({ submit: 'Failed to save product. Please try again.' });
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
          <DialogTitle>{product ? 'Edit Product' : 'Create New Product'}</DialogTitle>
          <DialogDescription>
            {product ? 'Update product information below.' : 'Fill in the product details below.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter product name"
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter product description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="price">Price (including tax) *</Label>
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
                <p className="text-xs text-muted-foreground">Price includes tax</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sku">SKU *</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="Enter SKU"
                  className={errors.sku ? 'border-destructive' : ''}
                />
                {errors.sku && <p className="text-sm text-destructive">{errors.sku}</p>}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="categoryId">Category *</Label>
              <Select
                value={formData.categoryId}
                onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
              >
                <SelectTrigger className={errors.categoryId ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
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
                <Label htmlFor="stockQuantity">Stock Quantity</Label>
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
              <Label htmlFor="barcode">Barcode</Label>
              <Input
                id="barcode"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                placeholder="Enter barcode"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                placeholder="Enter image URL"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="inStock"
                checked={formData.inStock}
                onCheckedChange={(checked) => setFormData({ ...formData, inStock: checked })}
              />
              <Label htmlFor="inStock" className="cursor-pointer">
                Product is available
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
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : product ? 'Update Product' : 'Create Product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

