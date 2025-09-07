import { ProductCatalog } from './ProductCatalog';
import { Cart } from './Cart';

export function POSView() {
  return (
    <div className="flex h-full">
      <div className="flex-1 p-6">
        <ProductCatalog />
      </div>
      <div className="w-96 border-l border-border">
        <Cart />
      </div>
    </div>
  );
}
