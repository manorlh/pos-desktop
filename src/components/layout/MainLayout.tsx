import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { POSView } from '../pos/POSView';
import { TransactionHistory } from '../transactions/TransactionHistory';
import type { ViewType } from '@/types/layout';

export function MainLayout() {
  const [currentView, setCurrentView] = useState<ViewType>('pos');

  const renderView = () => {
    switch (currentView) {
      case 'pos':
        return <POSView />;
      case 'transactions':
        return <TransactionHistory />;
      case 'products':
        return <div className="p-6">Products Management (Coming Soon)</div>;
      case 'settings':
        return <div className="p-6">Settings (Coming Soon)</div>;
      default:
        return <POSView />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 overflow-hidden">
          {renderView()}
        </main>
      </div>
    </div>
  );
}
