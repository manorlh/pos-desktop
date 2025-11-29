import { 
  ShoppingCart, 
  Receipt, 
  Package, 
  FolderTree,
  Settings, 
  Store,
  TestTube,
  FileText,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { useI18n } from '@/i18n';
import type { ViewType } from '@/types/layout';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ currentView, onViewChange, isOpen = true, onClose }: SidebarProps) {
  const { t } = useI18n();
  
  const navigation = [
    { id: 'pos' as ViewType, name: t('nav.pos'), icon: ShoppingCart },
    { id: 'transactions' as ViewType, name: t('nav.transactions'), icon: Receipt },
    { id: 'products' as ViewType, name: t('nav.products'), icon: Package },
    { id: 'categories' as ViewType, name: t('nav.categories'), icon: FolderTree },
    { id: 'reports' as ViewType, name: t('nav.reports'), icon: FileText },
    { id: 'test' as ViewType, name: t('nav.test'), icon: TestTube },
    { id: 'settings' as ViewType, name: t('nav.settings'), icon: Settings },
  ];
  return (
    <aside
      className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 bg-card border-r border-border flex flex-col transform transition-transform duration-300 ease-in-out",
        "w-64",
        // On mobile/tablet: slide in/out, on desktop: always visible
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">POS Desktop</h1>
              <p className="text-sm text-muted-foreground">{t('pos.title')}</p>
            </div>
          </div>
          {/* Close button for mobile/tablet */}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
      
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-2">
          {navigation.map((item) => (
            <Button
              key={item.id}
              variant={currentView === item.id ? "default" : "ghost"}
              className={cn(
                "w-full justify-start",
                currentView === item.id && "bg-primary text-primary-foreground"
              )}
              onClick={() => onViewChange(item.id)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span className="lg:inline">{item.name}</span>
            </Button>
          ))}
        </div>
      </nav>
      
      <div className="p-4 border-t border-border">
        <div className="text-sm text-muted-foreground">
          <p>{t('header.cashier')}: John Doe</p>
          <p>{t('header.store')} #001</p>
        </div>
      </div>
    </aside>
  );
}
