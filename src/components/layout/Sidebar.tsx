import { 
  ShoppingCart, 
  Receipt, 
  Package, 
  Settings, 
  Store 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import type { ViewType } from '@/types/layout';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const navigation = [
  { id: 'pos' as ViewType, name: 'Point of Sale', icon: ShoppingCart },
  { id: 'transactions' as ViewType, name: 'Transactions', icon: Receipt },
  { id: 'products' as ViewType, name: 'Products', icon: Package },
  { id: 'settings' as ViewType, name: 'Settings', icon: Settings },
];

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <div className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <Store className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-xl font-bold">POS Desktop</h1>
            <p className="text-sm text-muted-foreground">Point of Sale System</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4">
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
              {item.name}
            </Button>
          ))}
        </div>
      </nav>
      
      <div className="p-4 border-t border-border">
        <div className="text-sm text-muted-foreground">
          <p>Cashier: John Doe</p>
          <p>Store #001</p>
        </div>
      </div>
    </div>
  );
}
