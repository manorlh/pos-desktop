import { useEffect } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { useProductStore } from './stores/useProductStore';
import { useTransactionStore } from './stores/useTransactionStore';
import { mockProducts, mockCategories, mockPaymentMethods, mockUser } from './data/mockData';
import './globals.css';

function App() {
  const { setProducts, setCategories } = useProductStore();
  const { setPaymentMethods, setCurrentUser } = useTransactionStore();

  useEffect(() => {
    // Initialize mock data
    setProducts(mockProducts);
    setCategories(mockCategories);
    setPaymentMethods(mockPaymentMethods);
    setCurrentUser(mockUser);
  }, [setProducts, setCategories, setPaymentMethods, setCurrentUser]);

  return (
    <div className="h-screen bg-background">
      <MainLayout />
    </div>
  );
}

export default App;