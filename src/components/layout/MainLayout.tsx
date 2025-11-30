import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { POSView } from '../pos/POSView';
import { TransactionHistory } from '../transactions/TransactionHistory';
import { PrinterTest } from '../test/PrinterTest';
import { TaxReportsPage } from '../reports/TaxReportsPage';
import { SettingsPage } from '../settings/SettingsPage';
import { ProductsPage } from '../products/ProductsPage';
import { CategoriesPage } from '../categories/CategoriesPage';
import { useVirtualKeyboard } from '@/contexts/VirtualKeyboardContext';
import type { ViewType } from '@/types/layout';

export function MainLayout() {
  const [currentView, setCurrentView] = useState<ViewType>('pos');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isOpen: isKeyboardOpen } = useVirtualKeyboard();

  const renderView = () => {
    switch (currentView) {
      case 'pos':
        return <POSView />;
      case 'transactions':
        return <TransactionHistory />;
      case 'products':
        return <ProductsPage />;
      case 'categories':
        return <CategoriesPage />;
      case 'reports':
        return <TaxReportsPage />;
      case 'test':
        return <PrinterTest />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <POSView />;
    }
  };

  const handleViewChange = (view: ViewType) => {
    setCurrentView(view);
    // Close sidebar after selecting a view
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      <div 
        className="flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out" 
        style={{
          marginRight: sidebarOpen ? '16rem' : '0',
          paddingBottom: isKeyboardOpen ? 'var(--keyboard-height, 400px)' : '0px',
          transition: 'margin-right 0.3s ease-out, padding-bottom 0.3s ease-out',
        }}
      >
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto">
          {renderView()}
        </main>
      </div>
      
      <Sidebar 
        currentView={currentView} 
        onViewChange={handleViewChange}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
    </div>
  );
}
