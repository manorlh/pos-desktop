import { useState, useEffect } from 'react';
import { Plus, Edit, Folder } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { CategoryFormDialog } from './CategoryFormDialog';
import { useProductStore } from '@/stores/useProductStore';
import { useI18n } from '@/i18n';
import type { Category } from '@/types/index';

export function CategoriesPage() {
  const { categories, loadCategories } = useProductStore();
  const { t } = useI18n();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleCreate = () => {
    setEditingCategory(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setIsDialogOpen(true);
  };

  const handleToggleActive = async (category: Category) => {
    const updatedCategory: Category = {
      ...category,
      isActive: !category.isActive,
      updatedAt: new Date(),
    };
    await useProductStore.getState().updateCategory(updatedCategory);
  };

  const getParentName = (parentId?: string) => {
    if (!parentId) return null;
    return categories.find((c) => c.id === parentId)?.name;
  };

  // Sort categories by sortOrder, then by name
  const sortedCategories = [...categories].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{t('categories.title')}</h1>
          <p className="text-muted-foreground">{t('categories.description')}</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('categories.createCategory')}
        </Button>
      </div>

      {/* Categories Grid */}
      <div className="flex-1 overflow-auto">
        {sortedCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Folder className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('common.noResults')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('categories.description')}
            </p>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t('categories.createCategory')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedCategories.map((category) => {
              const parentName = getParentName(category.parentId);
              return (
                <Card key={category.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1">
                        {category.color && (
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: category.color }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                            {category.name}
                          </h3>
                          {parentName && (
                            <p className="text-xs text-muted-foreground">
                              {t('categories.parentCategory')}: {parentName}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(category)}
                        className="h-8 w-8"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>

                    {category.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {category.description}
                      </p>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Sort Order</span>
                        <Badge variant="outline" className="text-xs">
                          {category.sortOrder}
                        </Badge>
                      </div>

                      {category.color && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{t('categories.color')}</span>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-6 h-6 rounded border"
                              style={{ backgroundColor: category.color }}
                            />
                            <span className="text-xs font-mono">{category.color}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm font-medium">{t('categories.active')}</span>
                        <Switch
                          checked={category.isActive}
                          onCheckedChange={() => handleToggleActive(category)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <CategoryFormDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingCategory(null);
          }
        }}
        category={editingCategory}
      />
    </div>
  );
}

