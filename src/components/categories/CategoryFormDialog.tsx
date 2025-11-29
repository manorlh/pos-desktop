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
import type { Category } from '@/types/index';
import { generateUUID } from '@/utils/uuid';

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
}

export function CategoryFormDialog({ open, onOpenChange, category }: CategoryFormDialogProps) {
  const { categories, addCategory, updateCategory } = useProductStore();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
    imageUrl: '',
    parentId: '__none__', // Use special value instead of empty string
    sortOrder: '0',
    isActive: true,
  });

  // Don't close keyboard when dialog opens - let it work inside dialogs

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        description: category.description || '',
        color: category.color || '#3b82f6',
        imageUrl: category.imageUrl || '',
        parentId: category.parentId || '__none__',
        sortOrder: category.sortOrder.toString(),
        isActive: category.isActive,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        color: '#3b82f6',
        imageUrl: '',
        parentId: '__none__',
        sortOrder: '0',
        isActive: true,
      });
    }
    setErrors({});
  }, [category, open]);

  // Filter out the current category from parent options to prevent circular references
  const availableParents = categories.filter((c) => c.id !== category?.id);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Category name is required';
    }

    if (formData.sortOrder && (isNaN(parseInt(formData.sortOrder)))) {
      newErrors.sortOrder = 'Sort order must be a valid number';
    }

    // Validate color format (hex color)
    if (formData.color && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(formData.color)) {
      newErrors.color = 'Color must be a valid hex color (e.g., #3b82f6)';
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
      const categoryData: Category = {
        id: category?.id || generateUUID(),
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        color: formData.color || undefined,
        imageUrl: formData.imageUrl.trim() || undefined,
        parentId: formData.parentId === '__none__' ? undefined : formData.parentId || undefined,
        sortOrder: parseInt(formData.sortOrder) || 0,
        isActive: formData.isActive,
        createdAt: category?.createdAt || now,
        updatedAt: now,
      };

      if (category) {
        await updateCategory(categoryData);
      } else {
        await addCategory(categoryData);
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save category:', error);
      setErrors({ submit: 'Failed to save category. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit Category' : 'Create New Category'}</DialogTitle>
          <DialogDescription>
            {category ? 'Update category information below.' : 'Fill in the category details below.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Category Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter category name"
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
                placeholder="Enter category description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="color">Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="h-10 w-20 p-1"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#3b82f6"
                    className={errors.color ? 'border-destructive' : ''}
                  />
                </div>
                {errors.color && <p className="text-sm text-destructive">{errors.color}</p>}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sortOrder">Sort Order</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                  placeholder="0"
                  className={errors.sortOrder ? 'border-destructive' : ''}
                />
                {errors.sortOrder && <p className="text-sm text-destructive">{errors.sortOrder}</p>}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="parentId">Parent Category (Optional)</Label>
              <Select
                value={formData.parentId}
                onValueChange={(value) => setFormData({ ...formData, parentId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a parent category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (Top-level category)</SelectItem>
                  {availableParents.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Category is active
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
              {isLoading ? 'Saving...' : category ? 'Update Category' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

